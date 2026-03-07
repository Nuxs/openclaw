import os

from ..config import WEIGHTS
from ..http import fetch_json



def score_macro() -> dict:
    details: dict[str, float | str] = {}
    signals: list[float] = []

    fred_key = os.environ.get("FRED_KEY", "")
    if fred_key:
        treasury_payload = fetch_json(
            "https://api.stlouisfed.org/fred/series/observations?"
            f"series_id=DGS10&api_key={fred_key}&file_type=json&sort_order=desc&limit=5"
        )
        if treasury_payload and "observations" in treasury_payload:
            for observation in treasury_payload["observations"]:
                if observation["value"] == ".":
                    continue
                yield_10y = float(observation["value"])
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

        fed_funds_payload = fetch_json(
            "https://api.stlouisfed.org/fred/series/observations?"
            f"series_id=FEDFUNDS&api_key={fred_key}&file_type=json&sort_order=desc&limit=3"
        )
        if fed_funds_payload and "observations" in fed_funds_payload:
            for observation in fed_funds_payload["observations"]:
                if observation["value"] == ".":
                    continue
                rate = float(observation["value"])
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

        dollar_index_payload = fetch_json(
            "https://api.stlouisfed.org/fred/series/observations?"
            f"series_id=DTWEXBGS&api_key={fred_key}&file_type=json&sort_order=desc&limit=5"
        )
        if dollar_index_payload and "observations" in dollar_index_payload:
            for observation in dollar_index_payload["observations"]:
                if observation["value"] == ".":
                    continue
                dxy_value = float(observation["value"])
                details["dollar_index_proxy"] = dxy_value
                if dxy_value > 130:
                    signals.append(-40)
                elif dxy_value > 120:
                    signals.append(-20)
                elif dxy_value < 110:
                    signals.append(20)
                else:
                    signals.append(0)
                break
    else:
        details["note"] = "No FRED_KEY set. Macro scoring limited. Set FRED_KEY env var for full analysis."
        signals.append(-15)

    global_market_payload = fetch_json("https://api.coingecko.com/api/v3/global")
    if global_market_payload and "data" in global_market_payload:
        market_data = global_market_payload["data"]
        btc_dominance = market_data.get("market_cap_percentage", {}).get("btc", 0)
        eth_dominance = market_data.get("market_cap_percentage", {}).get("eth", 0)
        total_market_cap = market_data.get("total_market_cap", {}).get("usd", 0)
        market_cap_change = market_data.get("market_cap_change_percentage_24h_usd", 0)

        details["btc_dominance"] = round(btc_dominance, 2)
        details["eth_dominance"] = round(eth_dominance, 2)
        details["total_market_cap_usd"] = total_market_cap
        details["market_cap_change_24h_pct"] = round(market_cap_change, 2)

        if btc_dominance > 60:
            signals.append(-25)
        elif btc_dominance > 55:
            signals.append(-10)
        elif btc_dominance < 45:
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
