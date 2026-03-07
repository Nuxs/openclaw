from typing import Any

from ..config import WEIGHTS
from ..http import fetch_json



def _moving_average(data: list[float], period: int) -> float | None:
    if len(data) < period:
        return None
    return sum(data[-period:]) / period



def _score_technical_from_klines(klines: list) -> dict:
    details: dict[str, Any] = {}
    signals: list[float] = []

    closes = [float(k[4]) for k in klines]
    highs = [float(k[2]) for k in klines]
    lows = [float(k[3]) for k in klines]
    volumes = [float(k[5]) for k in klines]
    current_price = closes[-1]

    details["current_price"] = current_price

    ma7 = _moving_average(closes, 7)
    ma25 = _moving_average(closes, 25)
    ma99 = _moving_average(closes, 99)

    details["MA7"] = round(ma7, 2) if ma7 else None
    details["MA25"] = round(ma25, 2) if ma25 else None
    details["MA99"] = round(ma99, 2) if ma99 else None

    above_count = 0
    if ma7 and current_price > ma7:
        above_count += 1
    if ma25 and current_price > ma25:
        above_count += 1
    if ma99 and current_price > ma99:
        above_count += 1

    signals.append((above_count - 1.5) * 30)
    details["price_vs_ma"] = f"Above {above_count}/3 MAs"

    if len(closes) >= 15:
        gains: list[float] = []
        losses: list[float] = []
        for index in range(-14, 0):
            delta = closes[index] - closes[index - 1]
            gains.append(max(delta, 0))
            losses.append(max(-delta, 0))
        avg_gain = sum(gains) / 14
        avg_loss = sum(losses) / 14
        rsi = 100 if avg_loss == 0 else 100 - (100 / (1 + (avg_gain / avg_loss)))

        details["RSI14"] = round(rsi, 2)
        if rsi < 25:
            signals.append(50)
        elif rsi < 35:
            signals.append(30)
        elif rsi < 45:
            signals.append(10)
        elif rsi > 80:
            signals.append(-50)
        elif rsi > 70:
            signals.append(-30)
        else:
            signals.append(0)

    if len(volumes) >= 20:
        volume_average = sum(volumes[-20:]) / 20
        volume_ratio = volumes[-1] / volume_average if volume_average > 0 else 1
        details["volume_ratio"] = round(volume_ratio, 2)

        daily_change = closes[-1] - closes[-2] if len(closes) >= 2 else 0
        if volume_ratio > 2 and daily_change < 0:
            signals.append(-40)
        elif volume_ratio > 2 and daily_change > 0:
            signals.append(40)
        elif volume_ratio > 1.5 and daily_change < 0:
            signals.append(-20)
        elif volume_ratio > 1.5 and daily_change > 0:
            signals.append(20)
        else:
            signals.append(0)

    if len(closes) >= 20:
        sma20 = sum(closes[-20:]) / 20
        std20 = (sum((close - sma20) ** 2 for close in closes[-20:]) / 20) ** 0.5
        upper_bb = sma20 + 2 * std20
        lower_bb = sma20 - 2 * std20
        details["BB_upper"] = round(upper_bb, 2)
        details["BB_lower"] = round(lower_bb, 2)
        details["BB_middle"] = round(sma20, 2)

        band_width = upper_bb - lower_bb
        bb_position = (current_price - lower_bb) / band_width if band_width > 0 else 0.5
        details["BB_position"] = round(bb_position, 2)

        if bb_position < 0.1:
            signals.append(35)
        elif bb_position > 0.9:
            signals.append(-35)
        else:
            signals.append(0)

    if len(closes) >= 28:
        week_closes = [closes[-28 + index * 7] for index in range(4)] + [closes[-1]]
        higher_highs = all(week_closes[index] > week_closes[index - 1] for index in range(1, len(week_closes)))
        lower_lows = all(week_closes[index] < week_closes[index - 1] for index in range(1, len(week_closes)))

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



def score_technical() -> dict:
    klines = fetch_json("https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1d&limit=100")
    if not klines:
        return {
            "dimension": "technical",
            "score": 0,
            "weight": WEIGHTS["technical"],
            "details": {"error": "Failed to fetch kline data"},
            "signal_count": 0,
        }
    return _score_technical_from_klines(klines)
