import os

from ..config import WEIGHTS
from ..http import fetch_json



def _score_onchain_price_signals(*, ath_change_pct: float | int, price_change_30d_pct: float | int) -> list[float]:
    """Derive on-chain proxy signals purely from price context."""
    signals: list[float] = []

    if ath_change_pct and ath_change_pct < -70:
        signals.append(40)
    elif ath_change_pct and ath_change_pct < -50:
        signals.append(20)
    elif ath_change_pct and ath_change_pct > -20:
        signals.append(-20)

    if price_change_30d_pct:
        if price_change_30d_pct < -25:
            signals.append(-40)
        elif price_change_30d_pct < -10:
            signals.append(-20)
        elif price_change_30d_pct > 20:
            signals.append(20)
        else:
            signals.append(0)

    return signals



def score_onchain() -> dict:
    details: dict[str, float] = {}
    signals: list[float] = []

    etherscan_key = os.environ.get("ETHERSCAN_KEY", "")
    if etherscan_key:
        gas_data = fetch_json(
            f"https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey={etherscan_key}"
        )
        if gas_data and gas_data.get("status") == "1":
            avg_gas = float(gas_data["result"].get("ProposeGasPrice", 0))
            details["avg_gas_gwei"] = avg_gas
            if avg_gas > 30:
                signals.append(30)
            elif avg_gas > 10:
                signals.append(0)
            else:
                signals.append(-30)

    coin_gecko_data = fetch_json(
        "https://api.coingecko.com/api/v3/coins/ethereum?"
        "localization=false&tickers=false&community_data=false&developer_data=false"
    )
    if coin_gecko_data and "market_data" in coin_gecko_data:
        market_data = coin_gecko_data["market_data"]
        price = market_data.get("current_price", {}).get("usd", 0)
        ath = market_data.get("ath", {}).get("usd", 0)
        ath_change_pct = market_data.get("ath_change_percentage", {}).get("usd", 0)
        price_change_30d_pct = market_data.get("price_change_percentage_30d", 0)

        details["price_usd"] = price
        details["ath_usd"] = ath
        details["ath_change_pct"] = ath_change_pct
        details["price_change_30d_pct"] = price_change_30d_pct

        signals.extend(
            _score_onchain_price_signals(
                ath_change_pct=ath_change_pct,
                price_change_30d_pct=price_change_30d_pct,
            )
        )

    if etherscan_key:
        binance_hot = "0x28C6c06298d514Db089934071355E5743bf21d60"
        balance_data = fetch_json(
            f"https://api.etherscan.io/api?module=account&action=balance"
            f"&address={binance_hot}&apikey={etherscan_key}"
        )
        if balance_data and balance_data.get("status") == "1":
            balance_eth = int(balance_data["result"]) / 1e18
            details["binance_hot_wallet_eth"] = round(balance_eth, 2)

    score = int(sum(signals) / max(len(signals), 1)) if signals else 0
    score = max(-100, min(100, score))

    return {
        "dimension": "onchain",
        "score": score,
        "weight": WEIGHTS["onchain"],
        "details": details,
        "signal_count": len(signals),
    }
