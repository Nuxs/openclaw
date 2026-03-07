from typing import Any

from ..config import WEIGHTS
from ..http import fetch_json



def _score_behavioral_from_klines(klines: list) -> dict:
    details: dict[str, Any] = {}
    signals: list[float] = []

    opens = [float(k[1]) for k in klines]
    highs = [float(k[2]) for k in klines]
    lows = [float(k[3]) for k in klines]
    closes = [float(k[4]) for k in klines]
    volumes = [float(k[5]) for k in klines]
    average_volume = sum(volumes) / len(volumes)

    capitulation_detected = False
    for index in range(-7, 0):
        body = abs(closes[index] - opens[index])
        lower_wick = min(opens[index], closes[index]) - lows[index]
        volume_ratio = volumes[index] / average_volume if average_volume > 0 else 1
        if volume_ratio > 2.0 and lower_wick > body * 1.5 and closes[index] > opens[index]:
            capitulation_detected = True
            details["capitulation_candle"] = f"Detected at index {len(klines) + index}"

    if capitulation_detected:
        signals.append(35)
    else:
        details["capitulation_candle"] = "None detected (last 7 days)"

    recent_high = max(highs[-30:])
    current = closes[-1]
    breakdown_pct = (current - recent_high) / recent_high * 100
    details["pct_from_30d_high"] = round(breakdown_pct, 2)

    if -5 < breakdown_pct < 0:
        signals.append(-20)
        details["disposition_effect"] = "Price near prior high — expect selling"
    elif breakdown_pct < -25:
        signals.append(15)
        details["disposition_effect"] = "Deep drawdown — panic selling may be exhausted"
    else:
        signals.append(0)

    round_levels = [1000, 1500, 2000, 2500, 3000, 3500, 4000]
    nearest_round = min(round_levels, key=lambda level: abs(current - level))
    distance_pct = abs(current - nearest_round) / current * 100
    details["nearest_round_number"] = nearest_round
    details["distance_to_round_pct"] = round(distance_pct, 2)

    if distance_pct < 3:
        signals.append(-10)
        details["anchoring"] = f"Near ${nearest_round} — expect volatility"

    if len(closes) >= 14:
        first_half_return = (closes[-8] - closes[-14]) / closes[-14] * 100
        second_half_return = (closes[-1] - closes[-8]) / closes[-8] * 100
        if first_half_return < -10 and second_half_return < -10:
            signals.append(20)
            details["recency_bias"] = "Sustained decline — contrarian opportunity"
        elif first_half_return > 10 and second_half_return > 10:
            signals.append(-20)
            details["recency_bias"] = "Sustained rally — caution"
        else:
            details["recency_bias"] = "Mixed"

    if len(volumes) >= 14:
        volume_first = sum(volumes[-14:-7]) / 7
        volume_second = sum(volumes[-7:]) / 7
        volume_trend = ((volume_second - volume_first) / volume_first * 100) if volume_first > 0 else 0
        details["volume_trend_7d_pct"] = round(volume_trend, 2)

        price_trend = closes[-1] - closes[-14]
        if price_trend < 0 and volume_trend < -20:
            signals.append(25)
            details["volume_signal"] = "Declining volume in downtrend — exhaustion"
        elif price_trend > 0 and volume_trend > 20:
            signals.append(20)
            details["volume_signal"] = "Rising volume in uptrend — healthy"
        elif price_trend > 0 and volume_trend < -20:
            signals.append(-15)
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



def score_behavioral() -> dict:
    klines = fetch_json("https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1d&limit=30")
    if not klines or len(klines) < 7:
        return {
            "dimension": "behavioral",
            "score": 0,
            "weight": WEIGHTS["behavioral"],
            "details": {"error": "Insufficient data"},
            "signal_count": 0,
        }
    return _score_behavioral_from_klines(klines)
