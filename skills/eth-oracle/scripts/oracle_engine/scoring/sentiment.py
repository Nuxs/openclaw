from typing import Any

from ..config import WEIGHTS
from ..http import fetch_json



def _score_sentiment_from_components(
    *,
    fng_value: int | None,
    fng_class: str | None,
    funding: list | None,
    open_interest_eth: float | None,
    ls_ratio: list | None,
) -> dict:
    details: dict[str, Any] = {}
    signals: list[float] = []

    if fng_value is not None:
        details["fear_greed_index"] = int(fng_value)
        if fng_class is not None:
            details["fear_greed_class"] = str(fng_class)

        if fng_value < 10:
            signals.append(60)
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
            signals.append(-50)

    if funding and len(funding) > 0:
        latest_rate = float(funding[-1].get("fundingRate", 0))
        average_rate = sum(float(item.get("fundingRate", 0)) for item in funding) / len(funding)
        details["latest_funding_rate"] = round(latest_rate, 6)
        details["avg_funding_rate_10"] = round(average_rate, 6)

        if average_rate < -0.001:
            signals.append(40)
        elif average_rate < 0:
            signals.append(20)
        elif average_rate < 0.0005:
            signals.append(0)
        elif average_rate < 0.001:
            signals.append(-20)
        else:
            signals.append(-40)

    if open_interest_eth is not None:
        details["open_interest_eth"] = float(open_interest_eth)

    if ls_ratio and len(ls_ratio) > 0:
        latest_ls = float(ls_ratio[-1].get("longShortRatio", 1))
        details["long_short_ratio"] = round(latest_ls, 4)
        if latest_ls < 0.8:
            signals.append(30)
        elif latest_ls > 2.0:
            signals.append(-30)
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



def score_sentiment() -> dict:
    fng_value = None
    fng_class = None
    fear_and_greed = fetch_json("https://api.alternative.me/fng/?limit=1")
    if fear_and_greed and "data" in fear_and_greed and len(fear_and_greed["data"]) > 0:
        fng_value = int(fear_and_greed["data"][0]["value"])
        fng_class = fear_and_greed["data"][0]["value_classification"]

    funding = fetch_json("https://fapi.binance.com/fapi/v1/fundingRate?symbol=ETHUSDT&limit=10")
    open_interest_payload = fetch_json("https://fapi.binance.com/fapi/v1/openInterest?symbol=ETHUSDT")
    open_interest = float(open_interest_payload.get("openInterest", 0)) if open_interest_payload else None
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
