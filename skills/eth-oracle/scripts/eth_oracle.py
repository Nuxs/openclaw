#!/usr/bin/env python3
"""
ETH Oracle — Multi-Factor Decision Engine

Gathers data from free APIs, scores 6 dimensions, computes a composite signal,
and outputs an actionable recommendation with position sizing.

Usage:
    python3 eth_oracle.py --full              # Full analysis (all dimensions)
    python3 eth_oracle.py --dimension onchain  # Single dimension
    python3 eth_oracle.py --dimension technical
    python3 eth_oracle.py --dimension macro
    python3 eth_oracle.py --dimension sentiment
    python3 eth_oracle.py --dimension defi
    python3 eth_oracle.py --score-only        # Just the composite score (machine-readable)
    python3 eth_oracle.py --json              # Full output as JSON

Environment variables (optional, for higher rate limits):
    ETHERSCAN_KEY   — etherscan.io free API key
    FRED_KEY        — FRED API key (fred.stlouisfed.org)
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Any

# ── Constants ──

WEIGHTS = {
    "onchain": 0.20,
    "technical": 0.25,
    "macro": 0.20,
    "sentiment": 0.15,
    "behavioral": 0.10,
    "defi": 0.10,
}

# Tiered Confidence Multipliers
TIER_WEIGHTS = {
    1: 1.0,  # Ground Truth (Official/On-chain)
    2: 0.8,  # High Confidence (Aggregators/Authority)
    3: 0.3,  # Speculative/Narrative
}

def _read_env_int(name: str, default: int, *, min_v: int, max_v: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        v = int(raw)
        return max(min_v, min(max_v, v))
    except Exception:
        return default


def _read_env_float(name: str, default: float, *, min_v: float, max_v: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        v = float(raw)
        return max(min_v, min(max_v, v))
    except Exception:
        return default


def _read_env_str(name: str, default: str) -> str:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw)


# Tuning knobs (safe defaults). These are intentionally env-driven so the OpenClaw agent
# can switch risk profiles without patching code.
TRADE_THRESHOLD = _read_env_int("ETH_ORACLE_TRADE_THRESHOLD", 10, min_v=3, max_v=30)
MAX_POSITION_PCT = _read_env_float("ETH_ORACLE_MAX_POSITION_PCT", 25.0, min_v=0.0, max_v=100.0)
SIZING_EXP = _read_env_float("ETH_ORACLE_SIZING_EXP", 1.0, min_v=0.2, max_v=3.0)

# Optional regime filter to improve directional hit rate by avoiding counter-trend trades.
# Supported values: "" (disabled), "ma99".
REGIME_FILTER = _read_env_str("ETH_ORACLE_REGIME_FILTER", "").strip().lower() or None


def _build_signal_thresholds(trade_threshold: int) -> list[tuple[int, str, str]]:
    # Keep the original semantics, but parameterize the neutral/lean-buy boundary.
    t = int(trade_threshold)
    return [
        (60, "STRONG BUY", "Deploy 80-100% of allocated capital"),
        (30, "BUY", "Deploy 40-60% (DCA in)"),
        (t, "LEAN BUY", "Deploy 20-30%, tight stops"),
        (-(t - 1), "NEUTRAL / HOLD", "No new positions, maintain existing"),
        (-(t + 19), "LEAN SELL", "Reduce 20-30%, raise stops"),
        (-(t + 49), "SELL", "Reduce 50-70%, hedge with puts"),
        (-100, "STRONG SELL", "Exit 80%+, consider short hedge"),
    ]


SIGNAL_THRESHOLDS = _build_signal_thresholds(TRADE_THRESHOLD)


# ── HTTP Helpers ──

def fetch_json(url: str, timeout: int = 15) -> dict | list | None:
    """Fetch JSON from URL, return None on failure."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ETH-Oracle/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"  [WARN] Failed to fetch {url[:80]}...: {e}", file=sys.stderr)
        return None


def fetch_text(url: str, timeout: int = 15) -> str | None:
    """Fetch raw text from URL."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ETH-Oracle/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode()
    except Exception:
        return None


# ── Dimension Scorers ──

def _score_onchain_price_signals(*, ath_change_pct: float | int, price_change_30d_pct: float | int) -> list[float]:
    """On-chain proxy signals derived purely from price context.

    This is deliberately reused in backtests where full on-chain data is unavailable.
    """
    signals: list[float] = []

    # Price relative to ATH
    if ath_change_pct and ath_change_pct < -70:
        signals.append(40)  # Deep discount
    elif ath_change_pct and ath_change_pct < -50:
        signals.append(20)
    elif ath_change_pct and ath_change_pct > -20:
        signals.append(-20)  # Near ATH, risky

    # 30d momentum
    if price_change_30d_pct:
        if price_change_30d_pct < -25:
            signals.append(-40)  # Capitulation
        elif price_change_30d_pct < -10:
            signals.append(-20)
        elif price_change_30d_pct > 20:
            signals.append(20)
        else:
            signals.append(0)

    return signals


def score_onchain() -> dict:
    """Score on-chain metrics. Returns {score, details}."""
    details = {}
    signals = []

    # 1. Gas price (Etherscan)
    etherscan_key = os.environ.get("ETHERSCAN_KEY", "")
    if etherscan_key:
        gas_data = fetch_json(
            f"https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey={etherscan_key}"
        )
        if gas_data and gas_data.get("status") == "1":
            avg_gas = float(gas_data["result"].get("ProposeGasPrice", 0))
            details["avg_gas_gwei"] = avg_gas
            if avg_gas > 30:
                signals.append(30)  # High demand
            elif avg_gas > 10:
                signals.append(0)
            else:
                signals.append(-30)  # Dead chain

    # 2. ETH price & market data (CoinGecko)
    cg_data = fetch_json(
        "https://api.coingecko.com/api/v3/coins/ethereum?"
        "localization=false&tickers=false&community_data=false&developer_data=false"
    )
    if cg_data and "market_data" in cg_data:
        md = cg_data["market_data"]
        price = md.get("current_price", {}).get("usd", 0)
        ath = md.get("ath", {}).get("usd", 0)
        ath_pct = md.get("ath_change_percentage", {}).get("usd", 0)
        price_change_30d = md.get("price_change_percentage_30d", 0)
        total_supply = md.get("total_supply", 0)

        details["price_usd"] = price
        details["ath_usd"] = ath
        details["ath_change_pct"] = ath_pct
        details["price_change_30d_pct"] = price_change_30d

        signals.extend(_score_onchain_price_signals(ath_change_pct=ath_pct, price_change_30d_pct=price_change_30d))

    # 3. Exchange balance tracking (top Binance wallet)
    if etherscan_key:
        binance_hot = "0x28C6c06298d514Db089934071355E5743bf21d60"
        bal_data = fetch_json(
            f"https://api.etherscan.io/api?module=account&action=balance"
            f"&address={binance_hot}&apikey={etherscan_key}"
        )
        if bal_data and bal_data.get("status") == "1":
            balance_eth = int(bal_data["result"]) / 1e18
            details["binance_hot_wallet_eth"] = round(balance_eth, 2)
            # Note: need historical comparison for signal; single snapshot is reference only

    score = int(sum(signals) / max(len(signals), 1)) if signals else 0
    score = max(-100, min(100, score))

    return {
        "dimension": "onchain",
        "score": score,
        "weight": WEIGHTS["onchain"],
        "details": details,
        "signal_count": len(signals),
    }


def score_technical() -> dict:
    """Score technical analysis using Binance public API."""
    details = {}
    signals = []

    # Fetch daily klines (100 days)
    klines = fetch_json(
        "https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1d&limit=100"
    )

    if not klines:
        return {"dimension": "technical", "score": 0, "weight": WEIGHTS["technical"],
                "details": {"error": "Failed to fetch kline data"}, "signal_count": 0}

    closes = [float(k[4]) for k in klines]
    highs = [float(k[2]) for k in klines]
    lows = [float(k[3]) for k in klines]
    volumes = [float(k[5]) for k in klines]
    current_price = closes[-1]

    details["current_price"] = current_price

    # Moving averages
    def ma(data, period):
        if len(data) < period:
            return None
        return sum(data[-period:]) / period

    ma7 = ma(closes, 7)
    ma25 = ma(closes, 25)
    ma99 = ma(closes, 99)

    details["MA7"] = round(ma7, 2) if ma7 else None
    details["MA25"] = round(ma25, 2) if ma25 else None
    details["MA99"] = round(ma99, 2) if ma99 else None

    # Price vs MAs
    above_count = 0
    if ma7 and current_price > ma7:
        above_count += 1
    if ma25 and current_price > ma25:
        above_count += 1
    if ma99 and current_price > ma99:
        above_count += 1

    ma_signal = (above_count - 1.5) * 30  # -45 to +45
    signals.append(ma_signal)
    details["price_vs_ma"] = f"Above {above_count}/3 MAs"

    # RSI(14)
    if len(closes) >= 15:
        gains, losses = [], []
        for i in range(-14, 0):
            delta = closes[i] - closes[i - 1]
            gains.append(max(delta, 0))
            losses.append(max(-delta, 0))
        avg_gain = sum(gains) / 14
        avg_loss = sum(losses) / 14
        if avg_loss == 0:
            rsi = 100
        else:
            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))

        details["RSI14"] = round(rsi, 2)

        if rsi < 25:
            signals.append(50)  # Extremely oversold
        elif rsi < 35:
            signals.append(30)  # Oversold
        elif rsi < 45:
            signals.append(10)  # Approaching oversold
        elif rsi > 80:
            signals.append(-50)  # Extremely overbought
        elif rsi > 70:
            signals.append(-30)  # Overbought
        else:
            signals.append(0)

    # Volume analysis (current vs 20-day average)
    if len(volumes) >= 20:
        vol_avg = sum(volumes[-20:]) / 20
        vol_ratio = volumes[-1] / vol_avg if vol_avg > 0 else 1
        details["volume_ratio"] = round(vol_ratio, 2)

        # High volume on down day = bearish; high volume on up day = bullish
        daily_change = closes[-1] - closes[-2] if len(closes) >= 2 else 0
        if vol_ratio > 2 and daily_change < 0:
            signals.append(-40)  # Heavy selling
        elif vol_ratio > 2 and daily_change > 0:
            signals.append(40)  # Heavy buying
        elif vol_ratio > 1.5 and daily_change < 0:
            signals.append(-20)
        elif vol_ratio > 1.5 and daily_change > 0:
            signals.append(20)
        else:
            signals.append(0)

    # Bollinger Bands (20-period, 2 std dev)
    if len(closes) >= 20:
        sma20 = sum(closes[-20:]) / 20
        std20 = (sum((c - sma20) ** 2 for c in closes[-20:]) / 20) ** 0.5
        upper_bb = sma20 + 2 * std20
        lower_bb = sma20 - 2 * std20
        details["BB_upper"] = round(upper_bb, 2)
        details["BB_lower"] = round(lower_bb, 2)
        details["BB_middle"] = round(sma20, 2)

        bb_position = (current_price - lower_bb) / (upper_bb - lower_bb) if (upper_bb - lower_bb) > 0 else 0.5
        details["BB_position"] = round(bb_position, 2)

        if bb_position < 0.1:
            signals.append(35)  # Near lower band
        elif bb_position > 0.9:
            signals.append(-35)  # Near upper band
        else:
            signals.append(0)

    # Weekly structure (higher highs / lower lows over 4 weeks)
    if len(closes) >= 28:
        week_closes = [closes[-28 + i * 7] for i in range(4)] + [closes[-1]]
        higher_highs = all(week_closes[i] > week_closes[i - 1] for i in range(1, len(week_closes)))
        lower_lows = all(week_closes[i] < week_closes[i - 1] for i in range(1, len(week_closes)))

        if higher_highs:
            signals.append(30)
            details["weekly_structure"] = "Higher highs"
        elif lower_lows:
            signals.append(-30)
            details["weekly_structure"] = "Lower lows"
        else:
            signals.append(0)
            details["weekly_structure"] = "Mixed/Range"

    score = int(sum(signals) / max(len(signals), 1)) if signals else 0
    score = max(-100, min(100, score))

    return {
        "dimension": "technical",
        "score": score,
        "weight": WEIGHTS["technical"],
        "details": details,
        "signal_count": len(signals),
    }


def _score_technical_from_klines(klines: list) -> dict:
    """Pure technical scorer, reusable for backtests (expects Binance kline schema)."""
    details: dict[str, Any] = {}
    signals: list[float] = []

    closes = [float(k[4]) for k in klines]
    highs = [float(k[2]) for k in klines]
    lows = [float(k[3]) for k in klines]
    volumes = [float(k[5]) for k in klines]
    current_price = closes[-1]

    details["current_price"] = current_price

    # Moving averages
    def ma(data, period):
        if len(data) < period:
            return None
        return sum(data[-period:]) / period

    ma7 = ma(closes, 7)
    ma25 = ma(closes, 25)
    ma99 = ma(closes, 99)

    details["MA7"] = round(ma7, 2) if ma7 else None
    details["MA25"] = round(ma25, 2) if ma25 else None
    details["MA99"] = round(ma99, 2) if ma99 else None

    # Price vs MAs
    above_count = 0
    if ma7 and current_price > ma7:
        above_count += 1
    if ma25 and current_price > ma25:
        above_count += 1
    if ma99 and current_price > ma99:
        above_count += 1

    ma_signal = (above_count - 1.5) * 30  # -45 to +45
    signals.append(ma_signal)
    details["price_vs_ma"] = f"Above {above_count}/3 MAs"

    # RSI(14)
    if len(closes) >= 15:
        gains, losses = [], []
        for i in range(-14, 0):
            delta = closes[i] - closes[i - 1]
            gains.append(max(delta, 0))
            losses.append(max(-delta, 0))
        avg_gain = sum(gains) / 14
        avg_loss = sum(losses) / 14
        if avg_loss == 0:
            rsi = 100
        else:
            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))

        details["RSI14"] = round(rsi, 2)

        if rsi < 25:
            signals.append(50)  # Extremely oversold
        elif rsi < 35:
            signals.append(30)  # Oversold
        elif rsi < 45:
            signals.append(10)  # Approaching oversold
        elif rsi > 80:
            signals.append(-50)  # Extremely overbought
        elif rsi > 70:
            signals.append(-30)  # Overbought
        else:
            signals.append(0)

    # Volume analysis (current vs 20-day average)
    if len(volumes) >= 20:
        vol_avg = sum(volumes[-20:]) / 20
        vol_ratio = volumes[-1] / vol_avg if vol_avg > 0 else 1
        details["volume_ratio"] = round(vol_ratio, 2)

        # High volume on down day = bearish; high volume on up day = bullish
        daily_change = closes[-1] - closes[-2] if len(closes) >= 2 else 0
        if vol_ratio > 2 and daily_change < 0:
            signals.append(-40)  # Heavy selling
        elif vol_ratio > 2 and daily_change > 0:
            signals.append(40)  # Heavy buying
        elif vol_ratio > 1.5 and daily_change < 0:
            signals.append(-20)
        elif vol_ratio > 1.5 and daily_change > 0:
            signals.append(20)
        else:
            signals.append(0)

    # Bollinger Bands (20-period, 2 std dev)
    if len(closes) >= 20:
        sma20 = sum(closes[-20:]) / 20
        std20 = (sum((c - sma20) ** 2 for c in closes[-20:]) / 20) ** 0.5
        upper_bb = sma20 + 2 * std20
        lower_bb = sma20 - 2 * std20
        details["BB_upper"] = round(upper_bb, 2)
        details["BB_lower"] = round(lower_bb, 2)
        details["BB_middle"] = round(sma20, 2)

        bb_position = (current_price - lower_bb) / (upper_bb - lower_bb) if (upper_bb - lower_bb) > 0 else 0.5
        details["BB_position"] = round(bb_position, 2)

        if bb_position < 0.1:
            signals.append(35)  # Near lower band
        elif bb_position > 0.9:
            signals.append(-35)  # Near upper band
        else:
            signals.append(0)

    # Weekly structure (higher highs / lower lows over 4 weeks)
    if len(closes) >= 28:
        week_closes = [closes[-28 + i * 7] for i in range(4)] + [closes[-1]]
        higher_highs = all(week_closes[i] > week_closes[i - 1] for i in range(1, len(week_closes)))
        lower_lows = all(week_closes[i] < week_closes[i - 1] for i in range(1, len(week_closes)))

        if higher_highs:
            signals.append(30)
            details["weekly_structure"] = "Higher highs"
        elif lower_lows:
            signals.append(-30)
            details["weekly_structure"] = "Lower lows"
        else:
            signals.append(0)
            details["weekly_structure"] = "Mixed/Range"

    score = int(sum(signals) / max(len(signals), 1)) if signals else 0
    score = max(-100, min(100, score))

    return {
        "dimension": "technical",
        "score": score,
        "weight": WEIGHTS["technical"],
        "details": details,
        "signal_count": len(signals),
    }


def score_sentiment() -> dict:
    """Score market sentiment."""
    # Fear & Greed Index
    fng_value = None
    fng_class = None
    fng = fetch_json("https://api.alternative.me/fng/?limit=1")
    if fng and "data" in fng and len(fng["data"]) > 0:
        fng_value = int(fng["data"][0]["value"])
        fng_class = fng["data"][0]["value_classification"]

    # Funding rate (Binance)
    funding = fetch_json("https://fapi.binance.com/fapi/v1/fundingRate?symbol=ETHUSDT&limit=10")

    # Open Interest
    oi = fetch_json("https://fapi.binance.com/fapi/v1/openInterest?symbol=ETHUSDT")
    open_interest = float(oi.get("openInterest", 0)) if oi else None

    # Long/Short ratio (moved from /fapi/v1/ to /futures/data/ in 2025)
    ls_ratio = fetch_json(
        "https://fapi.binance.com/futures/data/globalLongShortAccountRatio?"
        "symbol=ETHUSDT&period=1d&limit=7"
    )

    return _score_sentiment_from_components(
        fng_value=fng_value,
        fng_class=fng_class,
        funding=funding,
        open_interest_eth=open_interest,
        ls_ratio=ls_ratio,
    )


def _score_sentiment_from_components(
    *,
    fng_value: int | None,
    fng_class: str | None,
    funding: list | None,
    open_interest_eth: float | None,
    ls_ratio: list | None,
) -> dict:
    """Pure sentiment scorer, reusable for backtests.

    All inputs are optional; missing components are simply skipped.
    - funding: Binance futures fundingRate array
    - ls_ratio: Binance futures globalLongShortAccountRatio array
    """
    details: dict[str, Any] = {}
    signals: list[float] = []

    if fng_value is not None:
        details["fear_greed_index"] = int(fng_value)
        if fng_class is not None:
            details["fear_greed_class"] = str(fng_class)

        # Contrarian scoring
        if fng_value < 10:
            signals.append(60)  # Extreme fear = strong contrarian buy
        elif fng_value < 20:
            signals.append(40)
        elif fng_value < 30:
            signals.append(20)
        elif fng_value < 50:
            signals.append(0)
        elif fng_value < 70:
            signals.append(-10)
        elif fng_value < 85:
            signals.append(-30)
        else:
            signals.append(-50)  # Extreme greed = contrarian sell

    if funding and len(funding) > 0:
        latest_rate = float(funding[-1].get("fundingRate", 0))
        avg_rate = sum(float(f.get("fundingRate", 0)) for f in funding) / len(funding)
        details["latest_funding_rate"] = round(latest_rate, 6)
        details["avg_funding_rate_10"] = round(avg_rate, 6)

        if avg_rate < -0.001:
            signals.append(40)  # Shorts paying longs heavily = squeeze incoming
        elif avg_rate < 0:
            signals.append(20)  # Slightly negative = mild bearish positioning
        elif avg_rate < 0.0005:
            signals.append(0)
        elif avg_rate < 0.001:
            signals.append(-20)
        else:
            signals.append(-40)  # Heavily leveraged longs = pullback risk

    if open_interest_eth is not None:
        details["open_interest_eth"] = float(open_interest_eth)

    if ls_ratio and len(ls_ratio) > 0:
        latest_ls = float(ls_ratio[-1].get("longShortRatio", 1))
        details["long_short_ratio"] = round(latest_ls, 4)

        if latest_ls < 0.8:
            signals.append(30)  # More shorts than longs = contrarian buy
        elif latest_ls > 2.0:
            signals.append(-30)  # Too many longs = contrarian sell
        else:
            signals.append(0)

    score = int(sum(signals) / max(len(signals), 1)) if signals else 0
    score = max(-100, min(100, score))

    return {
        "dimension": "sentiment",
        "score": score,
        "weight": WEIGHTS["sentiment"],
        "details": details,
        "signal_count": len(signals),
    }


def score_macro() -> dict:
    """Score macro-geopolitical factors. Uses FRED API if available, otherwise estimates."""
    details = {}
    signals = []

    fred_key = os.environ.get("FRED_KEY", "")

    if fred_key:
        # 10-Year Treasury Yield
        t10y = fetch_json(
            f"https://api.stlouisfed.org/fred/series/observations?"
            f"series_id=DGS10&api_key={fred_key}&file_type=json&sort_order=desc&limit=5"
        )
        if t10y and "observations" in t10y:
            for obs in t10y["observations"]:
                if obs["value"] != ".":
                    yield_10y = float(obs["value"])
                    details["treasury_10y"] = yield_10y
                    if yield_10y > 4.5:
                        signals.append(-35)
                    elif yield_10y > 4.0:
                        signals.append(-15)
                    elif yield_10y < 3.5:
                        signals.append(25)
                    else:
                        signals.append(0)
                    break

        # Fed Funds Rate
        ffr = fetch_json(
            f"https://api.stlouisfed.org/fred/series/observations?"
            f"series_id=FEDFUNDS&api_key={fred_key}&file_type=json&sort_order=desc&limit=3"
        )
        if ffr and "observations" in ffr:
            for obs in ffr["observations"]:
                if obs["value"] != ".":
                    rate = float(obs["value"])
                    details["fed_funds_rate"] = rate
                    if rate > 5.0:
                        signals.append(-40)
                    elif rate > 4.0:
                        signals.append(-20)
                    elif rate < 2.0:
                        signals.append(30)
                    else:
                        signals.append(-10)
                    break

        # Dollar Index proxy (DTWEXBGS)
        dxy = fetch_json(
            f"https://api.stlouisfed.org/fred/series/observations?"
            f"series_id=DTWEXBGS&api_key={fred_key}&file_type=json&sort_order=desc&limit=5"
        )
        if dxy and "observations" in dxy:
            for obs in dxy["observations"]:
                if obs["value"] != ".":
                    dxy_val = float(obs["value"])
                    details["dollar_index_proxy"] = dxy_val
                    # Higher DXY = bearish for crypto
                    if dxy_val > 130:
                        signals.append(-40)
                    elif dxy_val > 120:
                        signals.append(-20)
                    elif dxy_val < 110:
                        signals.append(20)
                    else:
                        signals.append(0)
                    break
    else:
        details["note"] = "No FRED_KEY set. Macro scoring limited. Set FRED_KEY env var for full analysis."
        # Default mild bearish assumption for current regime
        signals.append(-15)

    # BTC dominance (proxy for risk-on/off within crypto)
    global_data = fetch_json("https://api.coingecko.com/api/v3/global")
    if global_data and "data" in global_data:
        btc_dom = global_data["data"].get("market_cap_percentage", {}).get("btc", 0)
        eth_dom = global_data["data"].get("market_cap_percentage", {}).get("eth", 0)
        total_mcap = global_data["data"].get("total_market_cap", {}).get("usd", 0)
        mcap_change = global_data["data"].get("market_cap_change_percentage_24h_usd", 0)

        details["btc_dominance"] = round(btc_dom, 2)
        details["eth_dominance"] = round(eth_dom, 2)
        details["total_market_cap_usd"] = total_mcap
        details["market_cap_change_24h_pct"] = round(mcap_change, 2)

        # Rising BTC dominance = risk-off (bearish for ETH specifically)
        if btc_dom > 60:
            signals.append(-25)
        elif btc_dom > 55:
            signals.append(-10)
        elif btc_dom < 45:
            signals.append(20)
        else:
            signals.append(0)

    score = int(sum(signals) / max(len(signals), 1)) if signals else 0
    score = max(-100, min(100, score))

    return {
        "dimension": "macro",
        "score": score,
        "weight": WEIGHTS["macro"],
        "details": details,
        "signal_count": len(signals),
    }


def score_defi() -> dict:
    """Score DeFi & ecosystem health."""
    details = {}
    signals = []

    # TVL via DeFi Llama
    chains = fetch_json("https://api.llama.fi/v2/chains")
    if chains:
        eth_chain = next((c for c in chains if c.get("name") == "Ethereum"), None)
        if eth_chain:
            tvl = eth_chain.get("tvl", 0)
            details["ethereum_tvl_usd"] = round(tvl, 0)

    # Historical TVL for trend
    tvl_history = fetch_json("https://api.llama.fi/v2/historicalChainTvl/Ethereum")
    if tvl_history and len(tvl_history) >= 30:
        recent = tvl_history[-1].get("tvl", 0) if tvl_history[-1] else 0
        month_ago = tvl_history[-30].get("tvl", 0) if len(tvl_history) >= 30 else recent

        if month_ago > 0:
            tvl_change = ((recent - month_ago) / month_ago) * 100
            details["tvl_change_30d_pct"] = round(tvl_change, 2)

            if tvl_change > 15:
                signals.append(40)
            elif tvl_change > 5:
                signals.append(20)
            elif tvl_change > -5:
                signals.append(0)
            elif tvl_change > -15:
                signals.append(-20)
            else:
                signals.append(-40)

    # Stablecoin market (proxy for capital availability)
    stables = fetch_json("https://stablecoins.llama.fi/stablecoinchains")
    if stables:
        eth_stables = next((s for s in stables if s.get("name") == "Ethereum"), None)
        if eth_stables:
            stable_mcap = eth_stables.get("totalCirculatingUSD", {})
            if isinstance(stable_mcap, dict):
                total = stable_mcap.get("peggedUSD", 0)
            else:
                total = stable_mcap
            details["eth_stablecoin_mcap"] = total

    # DEX volumes
    dex_data = fetch_json("https://api.llama.fi/overview/dexs/ethereum?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true")
    if dex_data:
        total_24h = dex_data.get("total24h", 0)
        total_7d = dex_data.get("total7d", 0)
        change_1d = dex_data.get("change_1d", 0)
        details["dex_volume_24h"] = total_24h
        details["dex_volume_change_1d"] = change_1d

        if change_1d and change_1d > 30:
            # High DEX volume spike might indicate panic or FOMO
            signals.append(-10)  # Ambiguous, slight negative
        elif change_1d and change_1d > 10:
            signals.append(10)  # Healthy activity
        elif change_1d and change_1d < -30:
            signals.append(-15)  # Activity dying
        else:
            signals.append(0)

    # GitHub developer activity
    gh_data = fetch_json(
        "https://api.github.com/repos/ethereum/go-ethereum/stats/commit_activity"
    )
    if gh_data and len(gh_data) >= 4:
        recent_commits = sum(w.get("total", 0) for w in gh_data[-4:])
        older_commits = sum(w.get("total", 0) for w in gh_data[-8:-4]) if len(gh_data) >= 8 else recent_commits
        details["github_commits_4w"] = recent_commits
        details["github_commits_prev_4w"] = older_commits

        if older_commits > 0:
            dev_trend = ((recent_commits - older_commits) / older_commits) * 100
            details["dev_activity_change_pct"] = round(dev_trend, 2)
            if dev_trend > 20:
                signals.append(20)
            elif dev_trend < -20:
                signals.append(-15)
            else:
                signals.append(5)  # Stable dev activity is mildly positive

    score = int(sum(signals) / max(len(signals), 1)) if signals else 0
    score = max(-100, min(100, score))

    return {
        "dimension": "defi",
        "score": score,
        "weight": WEIGHTS["defi"],
        "details": details,
        "signal_count": len(signals),
    }


def score_behavioral() -> dict:
    """Score behavioral finance signals (derived from price action patterns)."""
    # Fetch recent klines for pattern detection
    klines = fetch_json(
        "https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1d&limit=30"
    )

    if not klines or len(klines) < 7:
        return {
            "dimension": "behavioral",
            "score": 0,
            "weight": WEIGHTS["behavioral"],
            "details": {"error": "Insufficient data"},
            "signal_count": 0,
        }

    return _score_behavioral_from_klines(klines)


def _score_behavioral_from_klines(klines: list) -> dict:
    """Pure behavioral scorer, reusable for backtests (expects Binance kline schema)."""
    details: dict[str, Any] = {}
    signals: list[float] = []

    opens = [float(k[1]) for k in klines]
    highs = [float(k[2]) for k in klines]
    lows = [float(k[3]) for k in klines]
    closes = [float(k[4]) for k in klines]
    volumes = [float(k[5]) for k in klines]

    avg_volume = sum(volumes) / len(volumes)

    # 1. Capitulation candle detection (last 7 days)
    capitulation_detected = False
    for i in range(-7, 0):
        body = abs(closes[i] - opens[i])
        lower_wick = min(opens[i], closes[i]) - lows[i]
        vol_ratio = volumes[i] / avg_volume if avg_volume > 0 else 1

        # Capitulation: high volume + long lower wick + closes green
        if vol_ratio > 2.0 and lower_wick > body * 1.5 and closes[i] > opens[i]:
            capitulation_detected = True
            details["capitulation_candle"] = f"Detected at index {len(klines) + i}"

    if capitulation_detected:
        signals.append(35)  # Bullish reversal signal
    else:
        details["capitulation_candle"] = "None detected (last 7 days)"

    # 2. Disposition effect (price near prior breakdown level)
    recent_high = max(highs[-30:])
    current = closes[-1]
    breakdown_pct = (current - recent_high) / recent_high * 100

    details["pct_from_30d_high"] = round(breakdown_pct, 2)

    if -5 < breakdown_pct < 0:
        signals.append(-20)  # Near breakdown = selling pressure from trapped longs
        details["disposition_effect"] = "Price near prior high — expect selling"
    elif breakdown_pct < -25:
        signals.append(15)  # Far from high = selling exhausted
        details["disposition_effect"] = "Deep drawdown — panic selling may be exhausted"
    else:
        signals.append(0)

    # 3. Anchoring to round numbers
    round_levels = [1000, 1500, 2000, 2500, 3000, 3500, 4000]
    nearest_round = min(round_levels, key=lambda x: abs(current - x))
    distance_pct = abs(current - nearest_round) / current * 100

    details["nearest_round_number"] = nearest_round
    details["distance_to_round_pct"] = round(distance_pct, 2)

    if distance_pct < 3:
        signals.append(-10)  # Near round number = potential resistance/support battle
        details["anchoring"] = f"Near ${nearest_round} — expect volatility"

    # 4. Recency bias detection (extrapolation of recent trend)
    if len(closes) >= 14:
        first_half_return = (closes[-8] - closes[-14]) / closes[-14] * 100
        second_half_return = (closes[-1] - closes[-8]) / closes[-8] * 100

        if first_half_return < -10 and second_half_return < -10:
            signals.append(20)  # Extended decline = likely oversold
            details["recency_bias"] = "Sustained decline — contrarian opportunity"
        elif first_half_return > 10 and second_half_return > 10:
            signals.append(-20)  # Extended rally = likely overbought
            details["recency_bias"] = "Sustained rally — caution"
        else:
            details["recency_bias"] = "Mixed"

    # 5. Volume trend (declining volume in trend = exhaustion)
    if len(volumes) >= 14:
        vol_first = sum(volumes[-14:-7]) / 7
        vol_second = sum(volumes[-7:]) / 7
        vol_trend = ((vol_second - vol_first) / vol_first * 100) if vol_first > 0 else 0

        details["volume_trend_7d_pct"] = round(vol_trend, 2)

        price_trend = closes[-1] - closes[-14]
        if price_trend < 0 and vol_trend < -20:
            signals.append(25)  # Declining volume in downtrend = selling exhaustion
            details["volume_signal"] = "Declining volume in downtrend — exhaustion"
        elif price_trend > 0 and vol_trend > 20:
            signals.append(20)  # Rising volume in uptrend = healthy
            details["volume_signal"] = "Rising volume in uptrend — healthy"
        elif price_trend > 0 and vol_trend < -20:
            signals.append(-15)  # Rising price on declining volume = weak
            details["volume_signal"] = "Rising price on declining volume — weak rally"
        else:
            details["volume_signal"] = "Normal"

    score = int(sum(signals) / max(len(signals), 1)) if signals else 0
    score = max(-100, min(100, score))

    return {
        "dimension": "behavioral",
        "score": score,
        "weight": WEIGHTS["behavioral"],
        "details": details,
        "signal_count": len(signals),
    }


# ── Composite Engine ──

def check_tier1_veto(dimensions: list[dict]) -> tuple[bool, str]:
    """Check for Tier 1 critical risks that trigger an immediate veto.
    
    Returns (is_vetoed, reason).
    """
    # 1. Stablecoin De-peg (Tier 1)
    # 2. Regulatory Ban (Tier 1) - placeholder for future API signal
    # 3. Exchange flows/hack (Tier 1)
    
    for dim in dimensions:
        details = dim.get("details", {})
        
        # Example: Stablecoin de-peg check (if we had specific stablecoin data here)
        # For now, we use a heuristic: if composite sentiment or onchain is extremely negative 
        # and explicitly mentions de-peg in details.
        if dim["dimension"] == "onchain":
            if details.get("ath_change_pct", 0) < -90: # Extreme crash proxy
                return True, "Extreme Tier 1 On-chain Deviation (>90% crash)"
                
    return False, ""

def compute_composite(dimensions: list[dict]) -> dict:
    """Compute weighted composite score and generate signal with Tier 1 Veto logic."""
    weighted_sum = 0
    total_weight = 0
    agreement_bullish = 0
    agreement_bearish = 0

    # Apply Tier 1 Veto check first
    is_vetoed, veto_reason = check_tier1_veto(dimensions)

    for dim in dimensions:
        weighted_sum += dim["score"] * dim["weight"]
        total_weight += dim["weight"]
        # Use the same neutral band as trade decisioning so confidence aligns with what we actually trade.
        if dim["score"] >= TRADE_THRESHOLD:
            agreement_bullish += 1
        elif dim["score"] <= -TRADE_THRESHOLD:
            agreement_bearish += 1

    composite = int(weighted_sum / total_weight) if total_weight > 0 else 0
    
    # If vetoed, override score and signal
    if is_vetoed:
        composite = -100
        signal = "STRONG SELL"
        action = f"VETO TRIGGERED: {veto_reason}. Exit all positions immediately."
    else:
        composite = max(-100, min(100, composite))
        # Determine signal
        signal = "UNKNOWN"
        action = ""
        for threshold, sig, act in SIGNAL_THRESHOLDS:
            if composite >= threshold:
                signal = sig
                action = act
                break

    # Confidence based on agreement (scale to any number of dimensions)
    total_dims = len(dimensions)
    max_agreement = max(agreement_bullish, agreement_bearish)
    agreement_ratio = (max_agreement / total_dims) if total_dims > 0 else 0

    if total_dims >= 3 and agreement_ratio >= 0.8:
        confidence = "HIGH"
    elif total_dims >= 2 and agreement_ratio >= 0.5:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    # Direction & position sizing (respect neutral band)
    if composite >= TRADE_THRESHOLD:
        direction = "LONG"
    elif composite <= -TRADE_THRESHOLD:
        direction = "SHORT"
    else:
        direction = "FLAT"

    # Optional regime filter (keeps default behavior unchanged when disabled)
    if REGIME_FILTER == "ma99":
        # We can only use what's already in the technical dimension details.
        tech = next((d for d in dimensions if d.get("dimension") == "technical"), None)
        ma99 = None
        try:
            ma99 = float((tech or {}).get("details", {}).get("MA99"))
        except Exception:
            ma99 = None

        if ma99 and "current_price" in (tech or {}).get("details", {}):
            price = float((tech or {}).get("details", {}).get("current_price", 0))
            if direction == "LONG" and price < ma99:
                direction = "FLAT"
            elif direction == "SHORT" and price > ma99:
                direction = "FLAT"

    if direction == "FLAT":
        position_pct = 0.0
    else:
        abs_score = abs(composite)
        # Nonlinear sizing curve: exp<1 boosts medium signals, exp>1 is more conservative.
        base_pct = ((abs_score / 100) ** SIZING_EXP) * MAX_POSITION_PCT
        conf_mult = {"HIGH": 1.0, "MEDIUM": 0.7, "LOW": 0.4}[confidence]
        position_pct = round(base_pct * conf_mult, 1)

    # Hard cap on position size
    position_pct = min(position_pct, MAX_POSITION_PCT)

    return {
        "composite_score": composite,
        "signal": signal,
        "action": action,
        "confidence": confidence,
        "agreement": f"{max_agreement}/{total_dims} dimensions agree",
        "position_size_pct": position_pct,
        "direction": direction,
        "veto": veto_reason if is_vetoed else "None",
    }


def format_report(dimensions: list[dict], composite: dict) -> str:
    """Format the full report as a readable string."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = []

    lines.append("═" * 55)
    lines.append(f"  ETH Oracle Report — {now}")
    lines.append("═" * 55)
    lines.append("")
    lines.append(f"  Composite Score:  {composite['composite_score']:+d}/100")
    lines.append(f"  Signal:           {composite['signal']}")
    lines.append(f"  Confidence:       {composite['confidence']} ({composite['agreement']})")
    lines.append(f"  Position Size:    {composite['position_size_pct']}% of portfolio")
    lines.append("")
    lines.append(f"  {'Dimension':<14} {'Score':>6}  {'Key Factor'}")
    lines.append(f"  {'─' * 14} {'─' * 6}  {'─' * 32}")

    for dim in dimensions:
        # Pick most interesting detail
        key_factor = _pick_key_factor(dim)
        lines.append(f"  {dim['dimension']:<14} {dim['score']:>+5d}   {key_factor}")

    lines.append("")
    lines.append(f"  Action: {composite['action']}")
    lines.append("")

    # Risk alerts
    lines.append("  Risk Alerts:")
    if abs(composite['composite_score']) > 70:
        lines.append("    ⚠ Extreme signal — verify with manual cross-check")
    if composite['confidence'] == "LOW":
        lines.append("    ⚠ Low confidence — dimensions disagree, reduce size")

    # Check for high volatility
    for dim in dimensions:
        if dim["dimension"] == "technical":
            vol_ratio = dim["details"].get("volume_ratio", 1)
            if vol_ratio > 2:
                lines.append(f"    ⚠ High volume ({vol_ratio:.1f}x avg) — elevated volatility")

    lines.append("")
    lines.append("  ⚠ DISCLAIMER: This is a decision support tool, not financial advice.")
    lines.append("    Always apply your own judgment and risk management.")
    lines.append("═" * 55)

    return "\n".join(lines)


def _pick_key_factor(dim: dict) -> str:
    """Pick the most relevant detail from a dimension result."""
    d = dim["details"]
    name = dim["dimension"]

    if name == "onchain":
        if "price_change_30d_pct" in d:
            return f"30d change: {d['price_change_30d_pct']:.1f}%"
        return f"Gas: {d.get('avg_gas_gwei', 'N/A')} gwei"

    if name == "technical":
        rsi = d.get("RSI14", "N/A")
        ma_pos = d.get("price_vs_ma", "N/A")
        return f"RSI={rsi}, {ma_pos}"

    if name == "macro":
        if "treasury_10y" in d:
            return f"10Y={d['treasury_10y']}%, BTC.D={d.get('btc_dominance', 'N/A')}%"
        return f"BTC.D={d.get('btc_dominance', 'N/A')}%"

    if name == "sentiment":
        fng = d.get("fear_greed_index", "N/A")
        cls = d.get("fear_greed_class", "")
        fr = d.get("latest_funding_rate", "N/A")
        return f"F&G={fng} ({cls}), FR={fr}"

    if name == "behavioral":
        cap = d.get("capitulation_candle", "None")
        rec = d.get("recency_bias", "N/A")
        return f"Capit: {cap[:20]}, Bias: {rec}"

    if name == "defi":
        tvl_change = d.get("tvl_change_30d_pct", "N/A")
        return f"TVL 30d: {tvl_change}%"

    return str(list(d.values())[:1])


# ── Main ──

def main():
    parser = argparse.ArgumentParser(description="ETH Oracle — Multi-Factor Decision Engine")
    parser.add_argument("--full", action="store_true", help="Run full analysis (all dimensions)")
    parser.add_argument("--dimension", type=str, choices=["onchain", "technical", "macro", "sentiment", "defi", "behavioral"],
                        help="Run single dimension")
    parser.add_argument("--score-only", action="store_true", help="Output only composite score (integer)")
    parser.add_argument("--json", action="store_true", help="Output full result as JSON")
    args = parser.parse_args()

    if not args.full and not args.dimension:
        args.full = True  # Default to full analysis

    scorers = {
        "onchain": score_onchain,
        "technical": score_technical,
        "macro": score_macro,
        "sentiment": score_sentiment,
        "behavioral": score_behavioral,
        "defi": score_defi,
    }

    if args.dimension:
        result = scorers[args.dimension]()
        if args.json:
            print(json.dumps(result, indent=2, default=str))
        else:
            print(f"\n{result['dimension'].upper()} Score: {result['score']:+d}")
            print(f"Weight: {result['weight']}")
            print(f"Details:")
            for k, v in result["details"].items():
                print(f"  {k}: {v}")
        return

    # Full analysis
    print("\n🔮 ETH Oracle — Gathering signals...\n", file=sys.stderr)
    dimensions = []

    for name, scorer in scorers.items():
        print(f"  Scoring {name}...", file=sys.stderr)
        try:
            result = scorer()
            dimensions.append(result)
            print(f"  ✓ {name}: {result['score']:+d}", file=sys.stderr)
        except Exception as e:
            print(f"  ✗ {name}: Error — {e}", file=sys.stderr)
            dimensions.append({
                "dimension": name,
                "score": 0,
                "weight": WEIGHTS[name],
                "details": {"error": str(e)},
                "signal_count": 0,
            })
        time.sleep(0.3)  # Rate limit courtesy

    composite = compute_composite(dimensions)

    if args.score_only:
        print(composite["composite_score"])
    elif args.json:
        output = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "dimensions": dimensions,
            "composite": composite,
        }
        print(json.dumps(output, indent=2, default=str))
    else:
        report = format_report(dimensions, composite)
        print(report)

        # Also dump JSON to stderr for machine consumption
        output = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "dimensions": dimensions,
            "composite": composite,
        }
        print(f"\n[JSON output on stderr for programmatic use]", file=sys.stderr)
        print(json.dumps(output, indent=2, default=str), file=sys.stderr)


if __name__ == "__main__":
    main()
