from ..config import WEIGHTS
from ..http import fetch_json



def score_defi() -> dict:
    details: dict[str, float] = {}
    signals: list[float] = []

    chains = fetch_json("https://api.llama.fi/v2/chains")
    if chains:
        eth_chain = next((chain for chain in chains if chain.get("name") == "Ethereum"), None)
        if eth_chain:
            details["ethereum_tvl_usd"] = round(eth_chain.get("tvl", 0), 0)

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

    stablecoins = fetch_json("https://stablecoins.llama.fi/stablecoinchains")
    if stablecoins:
        eth_stables = next((item for item in stablecoins if item.get("name") == "Ethereum"), None)
        if eth_stables:
            stable_mcap = eth_stables.get("totalCirculatingUSD", {})
            total = stable_mcap.get("peggedUSD", 0) if isinstance(stable_mcap, dict) else stable_mcap
            details["eth_stablecoin_mcap"] = total

    dex_payload = fetch_json(
        "https://api.llama.fi/overview/dexs/ethereum?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true"
    )
    if dex_payload:
        change_1d = dex_payload.get("change_1d", 0)
        details["dex_volume_24h"] = dex_payload.get("total24h", 0)
        details["dex_volume_change_1d"] = change_1d
        if change_1d and change_1d > 30:
            signals.append(-10)
        elif change_1d and change_1d > 10:
            signals.append(10)
        elif change_1d and change_1d < -30:
            signals.append(-15)
        else:
            signals.append(0)

    github_payload = fetch_json("https://api.github.com/repos/ethereum/go-ethereum/stats/commit_activity")
    if github_payload and len(github_payload) >= 4:
        recent_commits = sum(week.get("total", 0) for week in github_payload[-4:])
        older_commits = sum(week.get("total", 0) for week in github_payload[-8:-4]) if len(github_payload) >= 8 else recent_commits
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
                signals.append(5)

    score = int(sum(signals) / max(len(signals), 1)) if signals else 0
    score = max(-100, min(100, score))

    return {
        "dimension": "defi",
        "score": score,
        "weight": WEIGHTS["defi"],
        "details": details,
        "signal_count": len(signals),
    }
