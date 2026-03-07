#!/usr/bin/env python3
"""ETH Oracle — Historical backtest harness (10y, 100-sample spot check).

Design goals:
- Reuse the SAME scoring logic as `eth_oracle.py` (import pure scorers)
- Pull free, reproducible historical data (Binance public endpoints)
- Be deterministic by default (seeded sampling)
- Produce a concise, decision-useful summary (bucket stats + vs buy&hold)

Notes / limitations:
- Uses dimensions that can be reconstructed historically from free endpoints:
  - technical (spot OHLCV)
  - behavioral (spot OHLCV)
  - sentiment (futures funding + global long/short ratio)
  - onchain proxy (price vs ATH + 30d momentum)
- Macro/DeFi are excluded in the backtest because their *historical* free data is not reliably available.
  The composite score is computed with dynamic weights (only included dims contribute).

Usage:
  python3 skills/eth-oracle/scripts/eth_oracle_backtest.py --years 10 --samples 100
  python3 skills/eth-oracle/scripts/eth_oracle_backtest.py --years 8 --samples 200 --seed 42
  python3 skills/eth-oracle/scripts/eth_oracle_backtest.py --from 2018-01-01 --to 2026-03-01 --samples 100
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# Import the model's pure scorers and composite engine from the shared package.
from oracle_engine import (
    TRADE_THRESHOLD,
    WEIGHTS,
    _score_behavioral_from_klines,
    _score_onchain_price_signals,
    _score_sentiment_from_components,
    _score_technical_from_klines,
    compute_composite,
    fetch_json,
)


BINANCE_SPOT = "https://api.binance.com"
BINANCE_FAPI = "https://fapi.binance.com"


@dataclass(frozen=True)
class DayBar:
    ts_ms: int
    open: float
    high: float
    low: float
    close: float
    volume: float

    @property
    def date_utc(self) -> str:
        return datetime.fromtimestamp(self.ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def _utc_midnight_ms(dt: datetime) -> int:
    dt0 = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    return int(dt0.timestamp() * 1000)


def _parse_ymd(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)


def _cache_dir() -> Path:
    # Keep cache out of repo; safe for "industrial" repeatability.
    base = Path(os.environ.get("XDG_CACHE_HOME", str(Path.home() / ".cache")))
    return base / "eth-oracle"


def _load_cache(path: Path, *, max_age_hours: float | None) -> Any | None:
    if not path.exists():
        return None
    if max_age_hours is not None:
        age_s = time.time() - path.stat().st_mtime
        if age_s > max_age_hours * 3600:
            return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_cache(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _fetch_with_cache(url: str, *, cache_name: str, max_age_hours: float | None) -> Any:
    cache_path = _cache_dir() / cache_name
    cached = _load_cache(cache_path, max_age_hours=max_age_hours)
    if cached is not None:
        return cached

    # Retry with backoff (public endpoints can 429)
    last_err: Exception | None = None
    for attempt in range(5):
        try:
            data = fetch_json(url, timeout=20)
            if data is None:
                raise RuntimeError("fetch returned None")
            _save_cache(cache_path, data)
            return data
        except Exception as e:
            last_err = e
            time.sleep(0.6 * (attempt + 1))

    raise RuntimeError(f"Failed to fetch after retries: {url} ({last_err})")


def fetch_spot_klines_1d(symbol: str, start_ms: int, end_ms: int) -> list[list]:
    """Fetch Binance spot daily klines with pagination (limit=1000)."""
    out: list[list] = []
    cur = start_ms
    while True:
        url = (
            f"{BINANCE_SPOT}/api/v3/klines?symbol={symbol}&interval=1d"
            f"&startTime={cur}&endTime={end_ms}&limit=1000"
        )
        data = fetch_json(url, timeout=20)
        if not data:
            break
        out.extend(data)
        # next page starts at last openTime + 1ms
        last_open = int(data[-1][0])
        nxt = last_open + 1
        if nxt <= cur:
            break
        cur = nxt
        if len(data) < 1000:
            break
        time.sleep(0.2)

    # Dedup by openTime
    seen: set[int] = set()
    dedup: list[list] = []
    for k in out:
        ot = int(k[0])
        if ot in seen:
            continue
        seen.add(ot)
        dedup.append(k)

    dedup.sort(key=lambda x: int(x[0]))
    return dedup


def fetch_funding_rates(symbol: str, start_ms: int, end_ms: int) -> list[dict]:
    """Fetch futures funding rate history (8h granularity)."""
    out: list[dict] = []
    cur = start_ms
    while True:
        url = (
            f"{BINANCE_FAPI}/fapi/v1/fundingRate?symbol={symbol}"
            f"&startTime={cur}&endTime={end_ms}&limit=1000"
        )
        data = fetch_json(url, timeout=20)
        if not data:
            break
        out.extend(data)
        last_time = int(data[-1].get("fundingTime", 0))
        nxt = last_time + 1
        if nxt <= cur:
            break
        cur = nxt
        if len(data) < 1000:
            break
        time.sleep(0.2)

    out.sort(key=lambda x: int(x.get("fundingTime", 0)))
    return out


def fetch_global_long_short_ratio(symbol: str, start_ms: int, end_ms: int) -> list[dict]:
    """Fetch futures global long/short account ratio (daily)."""
    out: list[dict] = []
    cur = start_ms
    # endpoint max limit is 500
    while True:
        url = (
            f"{BINANCE_FAPI}/futures/data/globalLongShortAccountRatio?symbol={symbol}"
            f"&period=1d&startTime={cur}&endTime={end_ms}&limit=500"
        )
        data = fetch_json(url, timeout=20)
        if not data:
            break
        out.extend(data)
        last_ts = int(data[-1].get("timestamp", 0))
        nxt = last_ts + 1
        if nxt <= cur:
            break
        cur = nxt
        if len(data) < 500:
            break
        time.sleep(0.2)

    out.sort(key=lambda x: int(x.get("timestamp", 0)))
    return out


def _daily_avg_funding(funding: list[dict]) -> dict[str, float]:
    by_day: dict[str, list[float]] = {}
    for f in funding:
        ts = int(f.get("fundingTime", 0))
        day = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        by_day.setdefault(day, []).append(float(f.get("fundingRate", 0)))
    return {d: (sum(v) / len(v)) for d, v in by_day.items() if v}


def _ls_ratio_by_day(ls: list[dict]) -> dict[str, float]:
    out: dict[str, float] = {}
    for row in ls:
        ts = int(row.get("timestamp", 0))
        day = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        out[day] = float(row.get("longShortRatio", 1))
    return out


def _as_day_bars(klines: list[list]) -> list[DayBar]:
    bars: list[DayBar] = []
    for k in klines:
        bars.append(
            DayBar(
                ts_ms=int(k[0]),
                open=float(k[1]),
                high=float(k[2]),
                low=float(k[3]),
                close=float(k[4]),
                volume=float(k[5]),
            )
        )
    return bars


def _market_slice_to_klines(bars: list[DayBar]) -> list[list]:
    """Convert our DayBar slice back to Binance kline-like arrays.

    We only need indices [1..5] and [0] to match the model's expectations.
    """
    out: list[list] = []
    for b in bars:
        out.append([b.ts_ms, b.open, b.high, b.low, b.close, b.volume])
    return out


def _compute_onchain_proxy_from_closes(closes: list[float]) -> dict:
    price = closes[-1]
    ath = max(closes)
    ath_change_pct = ((price - ath) / ath * 100) if ath > 0 else 0
    if len(closes) >= 31:
        price_30d_ago = closes[-31]
        price_change_30d_pct = ((price - price_30d_ago) / price_30d_ago * 100) if price_30d_ago > 0 else 0
    else:
        price_change_30d_pct = 0

    details = {
        "price_usd": price,
        "ath_usd": ath,
        "ath_change_pct": ath_change_pct,
        "price_change_30d_pct": price_change_30d_pct,
    }
    signals = _score_onchain_price_signals(
        ath_change_pct=ath_change_pct,
        price_change_30d_pct=price_change_30d_pct,
    )
    score = int(sum(signals) / max(len(signals), 1)) if signals else 0
    score = max(-100, min(100, score))
    return {
        "dimension": "onchain",
        "score": score,
        "weight": WEIGHTS["onchain"],
        "details": details,
        "signal_count": len(signals),
    }


def _sentiment_from_history(
    *,
    day: str,
    daily_avg_funding: dict[str, float],
    ls_ratio_daily: dict[str, float],
) -> dict:
    # Match the live model's structure: supply 10 most recent daily funding avg as a fake "funding" list.
    # (The scorer only needs fundingRate values.)
    funding_days = sorted(daily_avg_funding.keys())
    idx = funding_days.index(day) if day in funding_days else None
    funding_list = None
    if idx is not None:
        last10 = funding_days[max(0, idx - 9) : idx + 1]
        funding_list = [{"fundingRate": daily_avg_funding[d]} for d in last10]

    ls_list = None
    if day in ls_ratio_daily:
        ls_list = [{"longShortRatio": ls_ratio_daily[day]}]

    if not funding_list and not ls_list:
        # Do not dilute composite for historical windows where futures signals are unavailable.
        return {
            "dimension": "sentiment",
            "score": 0,
            "weight": 0,
            "details": {"error": "No sentiment history for this date"},
            "signal_count": 0,
        }

    # No historical Fear&Greed in free tier here.
    return _score_sentiment_from_components(
        fng_value=None,
        fng_class=None,
        funding=funding_list,
        open_interest_eth=None,
        ls_ratio=ls_list,
    )


def _dynamic_weights(dims: list[dict]) -> list[dict]:
    """Zero-out weights for missing/errored dimensions and keep the rest.

    This keeps `compute_composite()` unchanged while ensuring we don't dilute the score.
    """
    out: list[dict] = []
    for d in dims:
        dd = dict(d)
        if dd.get("details", {}).get("error"):
            dd["weight"] = 0
        out.append(dd)

    # If everything got zeroed, keep original weights.
    if sum(float(x.get("weight", 0)) for x in out) <= 0:
        return dims
    return out


def _future_return(bars: list[DayBar], idx: int, horizon_days: int) -> float | None:
    if idx + horizon_days >= len(bars):
        return None
    p0 = bars[idx].close
    p1 = bars[idx + horizon_days].close
    if p0 <= 0:
        return None
    return (p1 - p0) / p0


def _bucket(score: int) -> str:
    if score >= 60:
        return "STRONG BUY"
    if score >= 30:
        return "BUY"
    if score >= 10:
        return "LEAN BUY"
    if score >= -9:
        return "NEUTRAL"
    if score >= -29:
        return "LEAN SELL"
    if score >= -59:
        return "SELL"
    return "STRONG SELL"


def _sign(x: float) -> int:
    return 1 if x > 0 else -1 if x < 0 else 0


def main() -> None:
    ap = argparse.ArgumentParser(description="ETH Oracle backtest (spot-check)")
    ap.add_argument("--symbol", default="ETHUSDT")
    ap.add_argument("--years", type=int, default=10)
    ap.add_argument("--from", dest="from_ymd", type=str, default=None)
    ap.add_argument("--to", dest="to_ymd", type=str, default=None)
    ap.add_argument("--samples", type=int, default=100, help="Random sample count; use 0 to evaluate all")
    ap.add_argument("--all", action="store_true", help="Evaluate all eligible dates (overrides --samples)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--horizon", type=int, default=30, help="Forward return horizon in days")
    ap.add_argument("--cache-hours", type=float, default=72)
    ap.add_argument("--show", type=int, default=12, help="Show N sampled rows")
    ap.add_argument("--no-json", action="store_true", help="Suppress full JSON rows output (recommended with --all)")
    ap.add_argument("--acc-threshold", type=int, default=None, help="Threshold for directional accuracy (defaults to model trade threshold)")
    ap.add_argument("--optimize", action="store_true", help="Grid-search sizing/threshold params")
    ap.add_argument(
        "--objective",
        choices=["return", "accuracy"],
        default="return",
        help="Optimization objective for --optimize (return|accuracy)",
    )
    ap.add_argument("--min-trades", type=int, default=50, help="For accuracy objective: require at least N tradable samples")
    args = ap.parse_args()

    if args.from_ymd:
        start = _parse_ymd(args.from_ymd)
    else:
        start = datetime.now(timezone.utc) - timedelta(days=int(args.years * 365.25))

    if args.to_ymd:
        end = _parse_ymd(args.to_ymd)
    else:
        end = datetime.now(timezone.utc)

    start_ms = _utc_midnight_ms(start)
    end_ms = _utc_midnight_ms(end)

    # Pull historical data.
    # Spot OHLCV (technical + behavioral + onchain proxy)
    kl_cache = f"spot-klines-{args.symbol}-1d-{start.strftime('%Y%m%d')}-{end.strftime('%Y%m%d')}.json"
    klines = _fetch_with_cache(
        f"{BINANCE_SPOT}/api/v3/klines?symbol={args.symbol}&interval=1d&startTime={start_ms}&endTime={end_ms}&limit=1000",
        cache_name=kl_cache,
        max_age_hours=args.cache_hours,
    )

    # If cache was a single page (limit 1000), it may not cover the full range; fall back to paginated fetch.
    if isinstance(klines, list) and len(klines) >= 1000:
        klines = fetch_spot_klines_1d(args.symbol, start_ms, end_ms)
        _save_cache(_cache_dir() / kl_cache, klines)

    if not isinstance(klines, list) or len(klines) < 200:
        raise SystemExit(f"Not enough kline data for backtest: got {len(klines) if isinstance(klines, list) else 'N/A'}")

    bars = _as_day_bars(klines)

    # Futures-derived sentiment components
    fund_cache = f"fapi-funding-{args.symbol}-{start.strftime('%Y%m%d')}-{end.strftime('%Y%m%d')}.json"
    funding = _fetch_with_cache(
        f"{BINANCE_FAPI}/fapi/v1/fundingRate?symbol={args.symbol}&startTime={start_ms}&endTime={end_ms}&limit=1000",
        cache_name=fund_cache,
        max_age_hours=args.cache_hours,
    )
    if isinstance(funding, list) and len(funding) >= 1000:
        funding = fetch_funding_rates(args.symbol, start_ms, end_ms)
        _save_cache(_cache_dir() / fund_cache, funding)

    # NOTE: Binance currently returns HTTP 400 when startTime/endTime are provided for this endpoint.
    # We therefore fetch only the latest 500 daily points; older sample dates will simply have no LS signal.
    ls_cache = f"fapi-ls-{args.symbol}-latest500.json"
    ls_ratio = _fetch_with_cache(
        f"{BINANCE_FAPI}/futures/data/globalLongShortAccountRatio?symbol={args.symbol}&period=1d&limit=500",
        cache_name=ls_cache,
        max_age_hours=args.cache_hours,
    )

    daily_avg_funding = _daily_avg_funding(funding if isinstance(funding, list) else [])
    ls_ratio_daily = _ls_ratio_by_day(ls_ratio if isinstance(ls_ratio, list) else [])

    # Build eligible indices (need lookback for indicators)
    min_lookback = 110  # 100 for technical + cushion
    eligible = list(range(min_lookback, len(bars) - max(args.horizon, 1)))
    if not eligible:
        raise SystemExit("No eligible bars for sampling (range too short)")

    if args.all or int(args.samples) <= 0:
        sample_idx = eligible
    else:
        rnd = random.Random(args.seed)
        sample_idx = sorted(rnd.sample(eligible, k=min(args.samples, len(eligible))))

    rows: list[dict[str, Any]] = []

    for idx in sample_idx:
        day = bars[idx].date_utc

        tech_slice = _market_slice_to_klines(bars[idx - 99 : idx + 1])
        beh_slice = _market_slice_to_klines(bars[idx - 29 : idx + 1])
        closes = [b.close for b in bars[: idx + 1]]

        dims = [
            _compute_onchain_proxy_from_closes(closes[-4000:]),  # cap for perf
            _score_technical_from_klines(tech_slice),
            _sentiment_from_history(day=day, daily_avg_funding=daily_avg_funding, ls_ratio_daily=ls_ratio_daily),
            _score_behavioral_from_klines(beh_slice),
        ]
        dims = _dynamic_weights(dims)
        comp = compute_composite(dims)

        r = _future_return(bars, idx, args.horizon)
        if r is None:
            continue

        # Strategy: use the model's suggested position size (in percent of portfolio), directionally.
        exposure = comp["position_size_pct"] / 100.0
        if comp["direction"] == "SHORT":
            exposure = -exposure
        elif comp["direction"] == "FLAT":
            exposure = 0.0

        strat_ret = exposure * r

        # Baseline predictors (industry-standard building blocks) for hit-rate benchmarking.
        def sma(xs: list[float], n: int) -> float | None:
            if len(xs) < n:
                return None
            return sum(xs[-n:]) / n

        price = float(closes[-1])
        ma200 = sma(closes, 200)
        pred_ma200 = _sign(price - ma200) if ma200 else 0

        # Time-series momentum vote: 3m/6m/12m lookbacks (classic CTA-style mix)
        mom_votes: list[int] = []
        for lb in [63, 126, 252]:
            if len(closes) >= lb + 1:
                p0 = float(closes[-(lb + 1)])
                if p0 > 0:
                    mom_votes.append(_sign((price - p0) / p0))
        mom_votes = [v for v in mom_votes if v != 0]
        pred_tsmom = 0
        if mom_votes:
            s = sum(mom_votes)
            pred_tsmom = 1 if s > 0 else -1 if s < 0 else 0

        pred_oracle_score_sign = _sign(float(comp["composite_score"]))

        rows.append(
            {
                "date": day,
                "score": int(comp["composite_score"]),
                "bucket": _bucket(int(comp["composite_score"])),
                "direction": comp["direction"],
                "confidence": comp["confidence"],
                "pos_pct": float(comp["position_size_pct"]),
                "fwd_ret": r,
                "strat_ret": strat_ret,
                "pred_ma200": pred_ma200,
                "pred_tsmom": pred_tsmom,
                "pred_oracle_score": pred_oracle_score_sign,
            }
        )

    if not rows:
        raise SystemExit("No rows produced")

    # Aggregate stats
    def mean(xs: list[float]) -> float:
        return sum(xs) / len(xs) if xs else 0.0

    by_bucket: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_bucket.setdefault(row["bucket"], []).append(row)

    overall_fwd = [float(r["fwd_ret"]) for r in rows]
    overall_strat = [float(r["strat_ret"]) for r in rows]

    # Print summary
    print("\n═══════════════════════════════════════════════════════")
    print(f"ETH Oracle Backtest — {len(rows)} samples, horizon={args.horizon}d")
    print(f"Range: {bars[0].date_utc} → {bars[-1].date_utc}  (seed={args.seed})")
    print("Dimensions: onchain(proxy)+technical+sentiment+behavioral")
    print("═══════════════════════════════════════════════════════\n")

    print(f"Overall mean forward return: {mean(overall_fwd)*100:+.2f}%")
    print(f"Overall mean strategy return: {mean(overall_strat)*100:+.2f}% (size-weighted)")

    if args.optimize:
        print("\nOptimization (grid-search):")
        if args.objective == "accuracy":
            print("  Objective: maximize directional accuracy on tradable signals")
        else:
            print("  Objective: maximize mean strategy return (size-weighted), using model score + confidence")

        conf_mult_map = {"HIGH": 1.0, "MEDIUM": 0.7, "LOW": 0.4}

        def strat_return_for(row: dict[str, Any], *, thr: int, max_pos_pct: float, exp: float) -> float:
            s = int(row["score"])
            if s >= thr:
                direction = 1
            elif s <= -thr:
                direction = -1
            else:
                return 0.0

            conf = str(row.get("confidence", "LOW"))
            conf_mult = conf_mult_map.get(conf, 0.4)
            size = ((abs(s) / 100.0) ** exp) * (max_pos_pct / 100.0) * conf_mult
            return direction * size * float(row["fwd_ret"])

        def accuracy_for(row: dict[str, Any], *, thr: int) -> tuple[int, int] | None:
            """Return (correct, total) for this row under threshold trading; None if not tradable."""
            s = int(row["score"])
            if s >= thr:
                p = 1
            elif s <= -thr:
                p = -1
            else:
                return None

            y = 1 if float(row["fwd_ret"]) > 0 else -1 if float(row["fwd_ret"]) < 0 else 0
            return (1, 1) if p == y else (0, 1)

        def wilson_lower_bound(k: int, n: int, *, z: float = 1.96) -> float:
            """Conservative accuracy estimate (95% Wilson lower bound)."""
            if n <= 0:
                return 0.0
            phat = k / n
            denom = 1.0 + (z * z) / n
            centre = phat + (z * z) / (2 * n)
            adj = z * (((phat * (1 - phat) + (z * z) / (4 * n)) / n) ** 0.5)
            return max(0.0, (centre - adj) / denom)

        candidates: list[dict[str, Any]] = []
        for thr in [5, 8, 10, 12, 15, 20]:
            for max_pos in [10, 25, 40, 60]:
                for exp in [0.5, 0.8, 1.0, 1.2]:
                    if args.objective == "accuracy":
                        parts = [accuracy_for(r, thr=thr) for r in rows]
                        usable = [p for p in parts if p is not None]
                        correct = sum(int(p[0]) for p in usable)
                        total = sum(int(p[1]) for p in usable)
                        if total < int(args.min_trades):
                            continue
                        acc = (correct / total) if total else 0.0
                        lb = wilson_lower_bound(int(correct), int(total))
                        candidates.append({"thr": thr, "max_pos": max_pos, "exp": exp, "acc": acc, "lb": lb, "n": total})
                    else:
                        rets = [strat_return_for(r, thr=thr, max_pos_pct=max_pos, exp=exp) for r in rows]
                        candidates.append(
                            {
                                "thr": thr,
                                "max_pos": max_pos,
                                "exp": exp,
                                "mean_strat": mean([float(x) for x in rets]),
                            }
                        )

        if not candidates:
            print(f"  No candidates met min-trades={int(args.min_trades)}. Try lowering --min-trades.")
        else:
            if args.objective == "accuracy":
                candidates.sort(
                    key=lambda x: (float(x.get("lb", 0.0)), float(x.get("acc", 0.0)), int(x.get("n", 0))),
                    reverse=True,
                )
                top = candidates[:5]
                for i, c in enumerate(top, 1):
                    print(
                        f"  #{i} thr={c['thr']:<2d}  max_pos={c['max_pos']:<2d}%  exp={c['exp']:<3}  "
                        f"acc={c['acc']*100:>5.1f}%  lb95={c['lb']*100:>5.1f}% (n={c['n']})"
                    )
            else:
                candidates.sort(key=lambda x: x["mean_strat"], reverse=True)
                top = candidates[:5]
                for i, c in enumerate(top, 1):
                    print(
                        f"  #{i} thr={c['thr']:<2d}  max_pos={c['max_pos']:<2d}%  exp={c['exp']:<3}  "
                        f"mean_strat={c['mean_strat']*100:+.3f}%"
                    )

            best = top[0]
            print(
                f"\n  Recommended (practical): score threshold |score|>={best['thr']}, "
                f"max position {best['max_pos']}%, sizing exponent {best['exp']}.\n"
                f"  Suggested env for OpenClaw:\n"
                f"    export ETH_ORACLE_TRADE_THRESHOLD={best['thr']}\n"
                f"    export ETH_ORACLE_MAX_POSITION_PCT={best['max_pos']}\n"
                f"    export ETH_ORACLE_SIZING_EXP={best['exp']}"
            )

    # Directional accuracy
    acc_thr = int(args.acc_threshold) if args.acc_threshold is not None else int(TRADE_THRESHOLD)

    # 1) Accuracy using the model's own direction output (LONG/SHORT/FLAT)
    preds_dir: list[tuple[int, int]] = []
    for r in rows:
        d = str(r.get("direction", "FLAT"))
        if d == "LONG":
            p = 1
        elif d == "SHORT":
            p = -1
        else:
            p = 0
        preds_dir.append((p, _sign(float(r["fwd_ret"]))))

    tradable_dir = [p for p in preds_dir if p[0] != 0]
    correct_dir = [p for p in tradable_dir if p[0] == p[1]]
    acc_dir = (len(correct_dir) / len(tradable_dir)) if tradable_dir else 0.0
    print(f"Directional accuracy (model direction): {acc_dir*100:.1f}% ({len(correct_dir)}/{len(tradable_dir)})")

    # 2) Accuracy using a score threshold (useful when comparing to other baselines)
    preds_thr: list[tuple[int, int]] = []
    for r in rows:
        s = int(r["score"])
        if s >= acc_thr:
            p = 1
        elif s <= -acc_thr:
            p = -1
        else:
            p = 0
        preds_thr.append((p, _sign(float(r["fwd_ret"]))))

    tradable_thr = [p for p in preds_thr if p[0] != 0]
    correct_thr = [p for p in tradable_thr if p[0] == p[1]]
    acc_thr_score = (len(correct_thr) / len(tradable_thr)) if tradable_thr else 0.0
    print(f"Directional accuracy (|score|>={acc_thr}): {acc_thr_score*100:.1f}% ({len(correct_thr)}/{len(tradable_thr)})")

    # Keep `acc` for JSON output backward-compat; prefer the model-direction view.
    acc = float(acc_dir)

    def _acc_for_pred(get_pred) -> tuple[float, int]:
        pairs: list[tuple[int, int]] = []
        for rr in rows:
            p = int(get_pred(rr))
            y = _sign(float(rr["fwd_ret"]))
            if p == 0 or y == 0:
                continue
            pairs.append((p, y))
        if not pairs:
            return (0.0, 0)
        correct = sum(1 for p, y in pairs if p == y)
        return (correct / len(pairs), len(pairs))

    # Baseline hit-rate benchmarks (these are not "better", but give us a sanity baseline)
    acc_ma200, n_ma200 = _acc_for_pred(lambda rr: rr.get("pred_ma200", 0))
    acc_tsmom, n_tsmom = _acc_for_pred(lambda rr: rr.get("pred_tsmom", 0))

    def oracle_score_thr(rr: dict[str, Any]) -> int:
        s = int(rr.get("score", 0))
        if abs(s) < acc_thr:
            return 0
        return int(rr.get("pred_oracle_score", 0))

    acc_oracle_score, n_oracle_score = _acc_for_pred(oracle_score_thr)

    def ensemble(rr: dict[str, Any]) -> int:
        votes = [
            int(rr.get("pred_ma200", 0)),
            int(rr.get("pred_tsmom", 0)),
            oracle_score_thr(rr),
        ]
        votes = [v for v in votes if v != 0]
        if not votes:
            return 0
        s = sum(votes)
        return 1 if s > 0 else -1 if s < 0 else 0

    acc_ens, n_ens = _acc_for_pred(ensemble)

    print("\nBaseline directional accuracy (non-zero preds):")
    print(f"  MA200 trend:   {acc_ma200*100:5.1f}% (n={n_ma200})")
    print(f"  TSMOM 3/6/12m: {acc_tsmom*100:5.1f}% (n={n_tsmom})")
    print(f"  Oracle score@thr: {acc_oracle_score*100:5.1f}% (n={n_oracle_score})")
    print(f"  Ensemble(3):   {acc_ens*100:5.1f}% (n={n_ens})")

    print("\nBucket breakdown:")
    print(f"  {'Bucket':<12} {'N':>4}  {'AvgFwd':>8}  {'AvgStrat':>9}")
    print(f"  {'─'*12} {'─'*4}  {'─'*8}  {'─'*9}")
    for b in ["STRONG BUY", "BUY", "LEAN BUY", "NEUTRAL", "LEAN SELL", "SELL", "STRONG SELL"]:
        xs = by_bucket.get(b, [])
        if not xs:
            continue
        avg_fwd = mean([float(x["fwd_ret"]) for x in xs]) * 100
        avg_str = mean([float(x["strat_ret"]) for x in xs]) * 100
        print(f"  {b:<12} {len(xs):>4}  {avg_fwd:+7.2f}%  {avg_str:+8.2f}%")

    # Show sampled rows (spot check)
    show_n = max(0, int(args.show))
    if show_n:
        print("\nSample rows:")
        print(f"  {'Date':<10} {'Score':>6}  {'Bucket':<12} {'Dir':<5} {'Pos%':>5}  {'FwdRet':>8}  {'StratRet':>9}")
        print(f"  {'─'*10} {'─'*6}  {'─'*12} {'─'*5} {'─'*5}  {'─'*8}  {'─'*9}")
        for r in rows[:show_n]:
            print(
                f"  {r['date']:<10} {int(r['score']):>+5d}  {r['bucket']:<12} {r['direction']:<5} {str(r.get('confidence','')):<6}"
                f" {r['pos_pct']:>5.1f}  {float(r['fwd_ret'])*100:+7.2f}%  {float(r['strat_ret'])*100:+8.2f}%"
            )

    # JSON on stderr (for automation)
    if not bool(args.no_json):
        out = {
            "meta": {
                "samples": len(rows),
                "horizon_days": int(args.horizon),
                "seed": int(args.seed),
                "range": {"from": bars[0].date_utc, "to": bars[-1].date_utc},
            },
            "overall": {
                "mean_forward_return": mean(overall_fwd),
                "mean_strategy_return": mean(overall_strat),
                "directional_accuracy": acc,
                "directional_n": len(tradable_dir),
                "directional_accuracy_score_threshold": acc_thr_score,
                "directional_n_score_threshold": len(tradable_thr),
            },
            "buckets": {
                b: {
                    "n": len(xs),
                    "avg_forward_return": mean([float(x["fwd_ret"]) for x in xs]),
                    "avg_strategy_return": mean([float(x["strat_ret"]) for x in xs]),
                }
                for b, xs in by_bucket.items()
            },
            "rows": rows,
        }
        print("\n[JSON output on stderr]", file=sys.stderr)
        print(json.dumps(out, indent=2, ensure_ascii=False), file=sys.stderr)
    else:
        print("\n[JSON output suppressed: pass --no-json=false to enable]", file=sys.stderr)


if __name__ == "__main__":
    main()
