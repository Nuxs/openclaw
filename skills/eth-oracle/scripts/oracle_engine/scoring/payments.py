from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
from typing import Any
from urllib.request import Request, urlopen

from ..config import WEIGHTS
from ..http import fetch_json
from .payments_circle_adoption import CircleAdoptionSnapshot, fetch_circle_adoption_snapshot, score_circle_adoption

ETH_ALIGNED_PAYMENT_CHAINS = (
    "Ethereum",
    "Arbitrum",
    "Optimism",
    "Base",
    "Scroll",
    "Linea",
    "StarkNet",
    "zkSync Era",
    "Polygon zkEVM",
    "Blast",
    "Mantle",
    "Mode",
    "Zora",
    "Taiko",
)

CIRCLE_TRANSPARENCY_URL = "https://www.circle.com/transparency"


@dataclass(frozen=True)
class StablecoinChainStats:
    total_usd: float
    total_prev_month_usd: float
    chain_usd: dict[str, float]
    chain_prev_month_usd: dict[str, float]
    usdc_usd: float
    usdc_prev_month_usd: float
    usdc_chain_usd: dict[str, float]
    usdc_chain_prev_month_usd: dict[str, float]
    usdt_usd: float
    usdt_prev_month_usd: float


@dataclass(frozen=True)
class CircleTransparencySnapshot:
    as_of: str | None
    in_circulation_usd_bn: float | None
    issued_7d_usd_bn: float | None
    redeemed_7d_usd_bn: float | None
    issued_30d_usd_bn: float | None
    redeemed_30d_usd_bn: float | None
    issued_365d_usd_bn: float | None
    redeemed_365d_usd_bn: float | None
    reserve_cash_usd_bn: float | None
    reserve_short_treasuries_usd_bn: float | None
    reserve_other_bucket_usd_bn: float | None
    weekly_disclosure: bool
    monthly_attestation: bool
    reserve_fund_reference: bool



def _extract_pegged_usd(payload: Any) -> float:
    if isinstance(payload, (int, float)):
        return float(payload)
    if isinstance(payload, dict):
        return float(payload.get("peggedUSD") or 0.0)
    return 0.0



def _sum_chain_bucket(asset: dict[str, Any], bucket_name: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for chain, values in (asset.get("chainCirculating") or {}).items():
        if not isinstance(values, dict):
            continue
        out[chain] = _extract_pegged_usd(values.get(bucket_name))
    return out



def _merge_chain_totals(target: dict[str, float], source: dict[str, float]) -> None:
    for chain, amount in source.items():
        target[chain] = target.get(chain, 0.0) + float(amount)



def _pct(numerator: float, denominator: float) -> float:
    return 0.0 if denominator <= 0 else numerator / denominator * 100.0



def _safe_pct_change(current: float, previous: float) -> float | None:
    if previous <= 0:
        return None
    return ((current - previous) / previous) * 100.0



def _pp_change(current_pct: float, previous_pct: float) -> float:
    return current_pct - previous_pct



def _safe_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None



def _append_note(details: dict[str, Any], text: str) -> None:
    note = str(details.get("note") or "").strip()
    details["note"] = text if not note else f"{note}; {text}"



def fetch_stablecoin_chain_stats() -> StablecoinChainStats | None:
    payload = fetch_json("https://stablecoins.llama.fi/stablecoins")
    pegged_assets = payload.get("peggedAssets") if isinstance(payload, dict) else None
    if not pegged_assets:
        return None

    total_usd = 0.0
    total_prev_month_usd = 0.0
    chain_usd: dict[str, float] = {}
    chain_prev_month_usd: dict[str, float] = {}
    usdc_usd = 0.0
    usdc_prev_month_usd = 0.0
    usdc_chain_usd: dict[str, float] = {}
    usdc_chain_prev_month_usd: dict[str, float] = {}
    usdt_usd = 0.0
    usdt_prev_month_usd = 0.0

    for asset in pegged_assets:
        if not isinstance(asset, dict):
            continue

        current_total = _extract_pegged_usd(asset.get("circulating"))
        prev_month_total = _extract_pegged_usd(asset.get("circulatingPrevMonth"))
        current_by_chain = _sum_chain_bucket(asset, "current")
        prev_month_by_chain = _sum_chain_bucket(asset, "circulatingPrevMonth")

        if current_total <= 0 and current_by_chain:
            current_total = float(sum(current_by_chain.values()))
        if prev_month_total <= 0 and prev_month_by_chain:
            prev_month_total = float(sum(prev_month_by_chain.values()))

        total_usd += current_total
        total_prev_month_usd += prev_month_total
        _merge_chain_totals(chain_usd, current_by_chain)
        _merge_chain_totals(chain_prev_month_usd, prev_month_by_chain)

        symbol = str(asset.get("symbol") or "").upper()
        gecko_id = str(asset.get("gecko_id") or "").lower()
        name = str(asset.get("name") or "").lower()

        if symbol == "USDC" or gecko_id == "usd-coin" or name == "usd coin":
            usdc_usd = current_total
            usdc_prev_month_usd = prev_month_total
            usdc_chain_usd = current_by_chain
            usdc_chain_prev_month_usd = prev_month_by_chain

        if symbol == "USDT" or gecko_id == "tether" or name == "tether":
            usdt_usd = current_total
            usdt_prev_month_usd = prev_month_total

    if total_usd <= 0:
        return None

    return StablecoinChainStats(
        total_usd=total_usd,
        total_prev_month_usd=total_prev_month_usd,
        chain_usd=chain_usd,
        chain_prev_month_usd=chain_prev_month_usd,
        usdc_usd=usdc_usd,
        usdc_prev_month_usd=usdc_prev_month_usd,
        usdc_chain_usd=usdc_chain_usd,
        usdc_chain_prev_month_usd=usdc_chain_prev_month_usd,
        usdt_usd=usdt_usd,
        usdt_prev_month_usd=usdt_prev_month_usd,
    )



def _fetch_text(url: str) -> str | None:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urlopen(request, timeout=20) as response:
            return response.read().decode("utf-8", "ignore")
    except Exception:
        return None



def _extract_regex_float(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text)
    return _safe_float(match.group(1)) if match else None



def fetch_circle_transparency_snapshot() -> CircleTransparencySnapshot | None:
    html = _fetch_text(CIRCLE_TRANSPARENCY_URL)
    if not html:
        return None

    lowered = html.lower()
    as_of_match = re.search(r"As of ([A-Z][a-z]{2} \d{2}, \d{4})", html)

    return CircleTransparencySnapshot(
        as_of=as_of_match.group(1) if as_of_match else None,
        in_circulation_usd_bn=_extract_regex_float(r'data-point="([0-9.]+)"[^>]*id="usdc-in-circulation"', html),
        issued_7d_usd_bn=_extract_regex_float(r'id="usdc-issued-7"[^>]*data-point="([0-9.]+)"', html),
        redeemed_7d_usd_bn=_extract_regex_float(r'id="usdc-redeemed-7"[^>]*data-point="([0-9.]+)"', html),
        issued_30d_usd_bn=_extract_regex_float(r'id="usdc-issued-30"[^>]*data-point="([0-9.]+)"', html),
        redeemed_30d_usd_bn=_extract_regex_float(r'id="usdc-redeemed-30"[^>]*data-point="([0-9.]+)"', html),
        issued_365d_usd_bn=_extract_regex_float(r'id="usdc-issued-365"[^>]*data-point="([0-9.]+)"', html),
        redeemed_365d_usd_bn=_extract_regex_float(r'id="usdc-redeemed-365"[^>]*data-point="([0-9.]+)"', html),
        reserve_cash_usd_bn=_extract_regex_float(r'data-usdc-cash="([0-9.]+)"', html),
        reserve_short_treasuries_usd_bn=_extract_regex_float(r'data-usdc-us-treasuries="([0-9.]+)"', html),
        reserve_other_bucket_usd_bn=_extract_regex_float(r'data-usdc-months="([0-9.]+)"', html),
        weekly_disclosure="fully disclosed on a weekly basis" in lowered,
        monthly_attestation="monthly third-party assurance" in lowered,
        reserve_fund_reference="circle reserve fund (usdxx)" in lowered,
    )



def _days_since_report(as_of: str | None) -> int | None:
    if not as_of:
        return None
    try:
        report_dt = datetime.strptime(as_of, "%b %d, %Y").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return max(0, (datetime.now(timezone.utc) - report_dt).days)



def _describe_redeemability_state(*, stablecoin_depeg: float | None, usdc_deviation_bps: float | None) -> str:
    if stablecoin_depeg is not None and stablecoin_depeg < 0.985:
        return "Redeemability stress"
    if usdc_deviation_bps is not None and usdc_deviation_bps >= 25:
        return "Redeemability under pressure"
    if usdc_deviation_bps is not None and usdc_deviation_bps <= 5:
        return "Redeemability intact"
    return "Redeemability orderly"



def _describe_reserve_state(*, report_freshness_days: int | None, weekly_disclosure: bool, monthly_attestation: bool) -> str:
    if report_freshness_days is None:
        return "Reserve transparency unavailable"
    if report_freshness_days <= 7 and weekly_disclosure and monthly_attestation:
        return "Reserve transparency fresh and auditable"
    if report_freshness_days <= 30 and monthly_attestation:
        return "Reserve transparency adequate"
    return "Reserve transparency stale"



def _describe_issuance_state(
    *,
    net_issued_30d_pct_of_circulation: float | None,
    usdc_supply_change_30d_pct: float | None = None,
) -> str:
    basis = net_issued_30d_pct_of_circulation
    if basis is None:
        basis = usdc_supply_change_30d_pct
    if basis is None:
        return "Issuance signal unavailable"
    if basis >= 5:
        return "Net issuance accelerating"
    if basis >= 1:
        return "Net issuance positive"
    if basis <= -5:
        return "Net redemptions material"
    if basis < 0:
        return "Issuance soft"
    return "Issuance balanced"



def _describe_chain_mix_state(*, usdc_eth_aligned_share_pct: float | None, eth_aligned_share_30d_pp: float | None, top_chain: str | None) -> str:
    if usdc_eth_aligned_share_pct is None:
        return "Chain mix signal unavailable"
    if usdc_eth_aligned_share_pct >= 70 and (eth_aligned_share_30d_pp or 0.0) >= 0:
        return "USDC chain mix aligned with ETH settlement stack"
    if usdc_eth_aligned_share_pct < 45:
        return "USDC chain mix drifting from ETH settlement stack"
    if top_chain and top_chain == "Tron":
        return "USDC chain mix vulnerable to non-ETH concentration"
    return "USDC chain mix balanced"



def _describe_payment_rail_state(
    *,
    redeemability_state: str,
    reserve_state: str,
    issuance_state: str,
    chain_mix_state: str,
    adoption_state: str,
) -> str:
    if redeemability_state in {"Redeemability stress", "Redeemability under pressure"}:
        return "Circle / USDC rails under stress"
    if reserve_state == "Reserve transparency stale":
        return "Circle / USDC rails need reserve verification"
    if issuance_state in {"Net issuance accelerating", "Net issuance positive"} and (
        "aligned" in chain_mix_state or adoption_state in {"Circle adoption rails broad and programmable", "Circle adoption rails broadening"}
    ):
        return "Circle / USDC rails strengthening"
    if issuance_state == "Net redemptions material" or "drifting" in chain_mix_state or "vulnerable" in chain_mix_state:
        return "Circle / USDC rails weakening"
    return "Circle / USDC rails mixed but orderly"



def _top_chain_mix(chain_usd: dict[str, float], total_usd: float, limit: int = 4) -> list[dict[str, Any]]:
    if total_usd <= 0:
        return []
    ranked = sorted(chain_usd.items(), key=lambda item: item[1], reverse=True)
    out: list[dict[str, Any]] = []
    for chain, amount in ranked[:limit]:
        out.append({"chain": chain, "share_pct": round(_pct(float(amount), total_usd), 2)})
    return out



def _score_redeemability(*, stablecoin_depeg: float | None, usdc_deviation_bps: float | None) -> int | None:
    if stablecoin_depeg is None and usdc_deviation_bps is None:
        return None
    if stablecoin_depeg is not None and stablecoin_depeg < 0.95:
        return -100
    if stablecoin_depeg is not None and stablecoin_depeg < 0.985:
        return -80
    if usdc_deviation_bps is not None and usdc_deviation_bps >= 50:
        return -50
    if stablecoin_depeg is not None and stablecoin_depeg < 0.995:
        return -35
    if usdc_deviation_bps is not None and usdc_deviation_bps >= 25:
        return -20
    if usdc_deviation_bps is not None and usdc_deviation_bps <= 5:
        return 20
    return 5



def _score_reserve(transparency: CircleTransparencySnapshot | None) -> tuple[int | None, dict[str, float | int | None]]:
    if transparency is None:
        return None, {}

    report_freshness_days = _days_since_report(transparency.as_of)
    reserve_components_total_usd_bn = sum(
        value for value in (
            transparency.reserve_cash_usd_bn,
            transparency.reserve_short_treasuries_usd_bn,
            transparency.reserve_other_bucket_usd_bn,
        )
        if value is not None
    )
    reserve_components_vs_circulation_pct = None
    if transparency.in_circulation_usd_bn and reserve_components_total_usd_bn > 0:
        reserve_components_vs_circulation_pct = _pct(
            reserve_components_total_usd_bn,
            transparency.in_circulation_usd_bn,
        )

    score = 0
    if report_freshness_days is not None:
        if report_freshness_days <= 7:
            score += 15
        elif report_freshness_days <= 30:
            score += 5
        else:
            score -= 15
    if transparency.weekly_disclosure:
        score += 10
    if transparency.monthly_attestation:
        score += 10
    if transparency.reserve_fund_reference:
        score += 5
    if reserve_components_vs_circulation_pct is not None:
        if reserve_components_vs_circulation_pct >= 97:
            score += 10
        elif reserve_components_vs_circulation_pct < 90:
            score -= 10

    metrics: dict[str, float | int | None] = {
        "reserve_report_freshness_days": report_freshness_days,
        "reserve_components_total_usd_bn": round(reserve_components_total_usd_bn, 2) if reserve_components_total_usd_bn > 0 else None,
        "reserve_components_vs_circulation_pct": round(reserve_components_vs_circulation_pct, 2)
        if reserve_components_vs_circulation_pct is not None
        else None,
    }
    return max(-100, min(100, score)), metrics



def _score_issuance(
    *,
    usdc_supply_change_30d_pct: float | None,
    net_issued_30d_pct_of_circulation: float | None,
    issued_redeemed_ratio_30d: float | None,
) -> int | None:
    if (
        usdc_supply_change_30d_pct is None
        and net_issued_30d_pct_of_circulation is None
        and issued_redeemed_ratio_30d is None
    ):
        return None

    score = 0
    basis = net_issued_30d_pct_of_circulation
    if basis is None:
        basis = usdc_supply_change_30d_pct

    if basis is not None:
        if basis >= 8:
            score += 30
        elif basis >= 2:
            score += 15
        elif basis > -3:
            score += 0
        elif basis > -8:
            score -= 15
        else:
            score -= 30

    if issued_redeemed_ratio_30d is not None:
        if issued_redeemed_ratio_30d >= 1.15:
            score += 10
        elif issued_redeemed_ratio_30d <= 0.9:
            score -= 10

    return max(-100, min(100, score))



def _score_chain_mix(
    *,
    eth_aligned_share_30d_pp: float | None,
    tron_share_pct: float | None,
    usdc_eth_aligned_share_pct: float | None,
    top_chain: str | None,
    top_chain_share_pct: float | None,
) -> int | None:
    if (
        eth_aligned_share_30d_pp is None
        and tron_share_pct is None
        and usdc_eth_aligned_share_pct is None
        and top_chain_share_pct is None
    ):
        return None

    score = 0
    if eth_aligned_share_30d_pp is not None:
        if eth_aligned_share_30d_pp > 0.75:
            score += 25
        elif eth_aligned_share_30d_pp > 0.1:
            score += 10
        elif eth_aligned_share_30d_pp > -0.5:
            score += 0
        elif eth_aligned_share_30d_pp > -1.0:
            score -= 15
        else:
            score -= 30

    if tron_share_pct is not None:
        if tron_share_pct >= 35:
            score -= 30
        elif tron_share_pct >= 30:
            score -= 15
        elif tron_share_pct <= 25:
            score += 10

    if usdc_eth_aligned_share_pct is not None:
        if usdc_eth_aligned_share_pct >= 70:
            score += 20
        elif usdc_eth_aligned_share_pct >= 55:
            score += 10
        elif usdc_eth_aligned_share_pct >= 40:
            score += 0
        else:
            score -= 20

    if top_chain_share_pct is not None and top_chain is not None:
        if top_chain == "Tron" and top_chain_share_pct >= 30:
            score -= 15
        elif top_chain in ETH_ALIGNED_PAYMENT_CHAINS and top_chain_share_pct >= 20:
            score += 5

    return max(-100, min(100, score))



def _score_payments_from_components(
    *,
    stable: StablecoinChainStats,
    usdc_price_usd: float | None,
    usdt_price_usd: float | None = None,
    dai_price_usd: float | None = None,
    transparency: CircleTransparencySnapshot | None = None,
    adoption_snapshot: CircleAdoptionSnapshot | None = None,
    historical_proxy: bool = False,
) -> dict:
    details: dict[str, Any] = {"historical_proxy": historical_proxy}
    signals: list[int] = []
    factor_scores: dict[str, int] = {}

    stable_prices = {
        "usdc_price_usd": usdc_price_usd,
        "usdt_price_usd": usdt_price_usd,
        "dai_price_usd": dai_price_usd,
    }
    valid_prices = [float(price) for price in stable_prices.values() if price is not None]
    for key, price in stable_prices.items():
        if price is not None:
            details[key] = round(float(price), 6)

    stablecoin_depeg = min(valid_prices) if valid_prices else None
    usdc_deviation_bps = abs(float(usdc_price_usd) - 1.0) * 10_000 if usdc_price_usd is not None else None
    if stablecoin_depeg is not None:
        details["stablecoin_depeg"] = round(stablecoin_depeg, 6)
    if usdc_deviation_bps is not None:
        details["usdc_deviation_bps"] = round(usdc_deviation_bps, 2)

    redeemability_score = _score_redeemability(
        stablecoin_depeg=stablecoin_depeg,
        usdc_deviation_bps=usdc_deviation_bps,
    )
    details["redeemability_state"] = _describe_redeemability_state(
        stablecoin_depeg=stablecoin_depeg,
        usdc_deviation_bps=usdc_deviation_bps,
    )
    if redeemability_score is not None:
        factor_scores["redeemability"] = redeemability_score
        signals.append(redeemability_score)

    usdc_supply_change = _safe_pct_change(stable.usdc_usd, stable.usdc_prev_month_usd)
    details["usdc_market_cap_usd"] = round(stable.usdc_usd, 2)
    if usdc_supply_change is not None:
        details["usdc_supply_change_30d_pct"] = round(usdc_supply_change, 2)

    usdc_market_share_30d_pp = None
    if stable.total_usd > 0:
        usdc_market_share_pct = _pct(stable.usdc_usd, stable.total_usd)
        details["usdc_market_share_pct"] = round(usdc_market_share_pct, 2)
        if stable.total_prev_month_usd > 0 and stable.usdc_prev_month_usd > 0:
            usdc_market_share_prev_pct = _pct(stable.usdc_prev_month_usd, stable.total_prev_month_usd)
            usdc_market_share_30d_pp = _pp_change(usdc_market_share_pct, usdc_market_share_prev_pct)
            details["usdc_market_share_30d_pp"] = round(usdc_market_share_30d_pp, 2)

    eth_aligned_share_30d_pp = None
    tron_share_pct = None
    usdc_eth_aligned_share_pct = None
    top_chain = None
    top_chain_share_pct = None
    if stable.chain_usd:
        eth_aligned_current = sum(stable.chain_usd.get(chain, 0.0) for chain in ETH_ALIGNED_PAYMENT_CHAINS)
        eth_aligned_prev = sum(stable.chain_prev_month_usd.get(chain, 0.0) for chain in ETH_ALIGNED_PAYMENT_CHAINS)
        eth_aligned_share_pct = _pct(eth_aligned_current, stable.total_usd)
        eth_aligned_share_prev_pct = _pct(eth_aligned_prev, stable.total_prev_month_usd)
        eth_aligned_share_30d_pp = _pp_change(eth_aligned_share_pct, eth_aligned_share_prev_pct)
        tron_share_pct = _pct(stable.chain_usd.get("Tron", 0.0), stable.total_usd)
        details["eth_aligned_share_pct"] = round(eth_aligned_share_pct, 2)
        details["eth_aligned_share_30d_pp"] = round(eth_aligned_share_30d_pp, 2)
        details["tron_share_pct"] = round(tron_share_pct, 2)

    if stable.usdc_chain_usd and stable.usdc_usd > 0:
        usdc_eth_aligned = sum(stable.usdc_chain_usd.get(chain, 0.0) for chain in ETH_ALIGNED_PAYMENT_CHAINS)
        usdc_eth_aligned_share_pct = _pct(usdc_eth_aligned, stable.usdc_usd)
        details["usdc_eth_aligned_share_pct"] = round(usdc_eth_aligned_share_pct, 2)
        details["usdc_chain_count"] = len([amount for amount in stable.usdc_chain_usd.values() if amount > 0])
        top_mix = _top_chain_mix(stable.usdc_chain_usd, stable.usdc_usd)
        details["usdc_top_chain_mix"] = top_mix
        if top_mix:
            top_chain = str(top_mix[0]["chain"])
            top_chain_share_pct = float(top_mix[0]["share_pct"])
            details["usdc_top_chain"] = top_chain
            details["usdc_top_chain_share_pct"] = round(top_chain_share_pct, 2)
        for chain_name in ("Ethereum", "Base", "Solana", "Arbitrum", "Avalanche", "Polygon"):
            amount = stable.usdc_chain_usd.get(chain_name)
            if amount is None:
                continue
            details[f"usdc_{chain_name.lower().replace(' ', '_')}_share_pct"] = round(_pct(amount, stable.usdc_usd), 2)

    chain_mix_score = _score_chain_mix(
        eth_aligned_share_30d_pp=eth_aligned_share_30d_pp,
        tron_share_pct=tron_share_pct,
        usdc_eth_aligned_share_pct=usdc_eth_aligned_share_pct,
        top_chain=top_chain,
        top_chain_share_pct=top_chain_share_pct,
    )
    details["chain_mix_state"] = _describe_chain_mix_state(
        usdc_eth_aligned_share_pct=usdc_eth_aligned_share_pct,
        eth_aligned_share_30d_pp=eth_aligned_share_30d_pp,
        top_chain=top_chain,
    )
    if chain_mix_score is not None:
        factor_scores["chain_mix"] = chain_mix_score
        signals.append(chain_mix_score)

    details["adoption_state"] = "Circle adoption unavailable"
    adoption_score, adoption_metrics = score_circle_adoption(
        snapshot=adoption_snapshot,
        eth_aligned_payment_chains=ETH_ALIGNED_PAYMENT_CHAINS,
    )
    if adoption_metrics:
        details.update({key: value for key, value in adoption_metrics.items() if value is not None})
    if adoption_score is not None:
        factor_scores["adoption"] = adoption_score
        signals.append(adoption_score)
    elif historical_proxy:
        _append_note(details, "Historical proxy cannot reconstruct Circle CCTP, Gateway, or native USDC coverage history")
    else:
        _append_note(details, "Circle developer docs unavailable; adoption factor omitted")

    net_issued_30d_pct_of_circulation = None
    issued_redeemed_ratio_30d = None
    reserve_state = "Reserve transparency unavailable"
    issuance_state = "Issuance signal unavailable"
    if transparency is not None:
        details["circle_transparency_source"] = CIRCLE_TRANSPARENCY_URL
        details["reserve_report_as_of"] = transparency.as_of
        details["reserve_disclosure_frequency"] = "weekly" if transparency.weekly_disclosure else "unknown"
        details["reserve_attestation_frequency"] = "monthly" if transparency.monthly_attestation else "unknown"
        details["reserve_fund_reference"] = bool(transparency.reserve_fund_reference)
        details["reserve_cash_usd_bn"] = round(float(transparency.reserve_cash_usd_bn or 0.0), 2)
        details["reserve_short_treasuries_usd_bn"] = round(float(transparency.reserve_short_treasuries_usd_bn or 0.0), 2)
        details["reserve_other_bucket_usd_bn"] = round(float(transparency.reserve_other_bucket_usd_bn or 0.0), 2)
        details["usdc_in_circulation_usd_bn"] = round(float(transparency.in_circulation_usd_bn or 0.0), 2)
        details["issued_7d_usd_bn"] = round(float(transparency.issued_7d_usd_bn or 0.0), 2)
        details["redeemed_7d_usd_bn"] = round(float(transparency.redeemed_7d_usd_bn or 0.0), 2)
        details["net_issued_7d_usd_bn"] = round(
            float((transparency.issued_7d_usd_bn or 0.0) - (transparency.redeemed_7d_usd_bn or 0.0)),
            2,
        )
        details["issued_30d_usd_bn"] = round(float(transparency.issued_30d_usd_bn or 0.0), 2)
        details["redeemed_30d_usd_bn"] = round(float(transparency.redeemed_30d_usd_bn or 0.0), 2)
        details["net_issued_30d_usd_bn"] = round(
            float((transparency.issued_30d_usd_bn or 0.0) - (transparency.redeemed_30d_usd_bn or 0.0)),
            2,
        )
        details["issued_365d_usd_bn"] = round(float(transparency.issued_365d_usd_bn or 0.0), 2)
        details["redeemed_365d_usd_bn"] = round(float(transparency.redeemed_365d_usd_bn or 0.0), 2)
        details["net_issued_365d_usd_bn"] = round(
            float((transparency.issued_365d_usd_bn or 0.0) - (transparency.redeemed_365d_usd_bn or 0.0)),
            2,
        )
        if transparency.in_circulation_usd_bn and transparency.in_circulation_usd_bn > 0:
            net_issued_30d_pct_of_circulation = _pct(
                float((transparency.issued_30d_usd_bn or 0.0) - (transparency.redeemed_30d_usd_bn or 0.0)),
                float(transparency.in_circulation_usd_bn),
            )
            details["net_issued_30d_pct_of_circulation"] = round(net_issued_30d_pct_of_circulation, 2)
        if transparency.redeemed_30d_usd_bn and transparency.redeemed_30d_usd_bn > 0:
            issued_redeemed_ratio_30d = float(transparency.issued_30d_usd_bn or 0.0) / float(transparency.redeemed_30d_usd_bn)
            details["issued_redeemed_ratio_30d"] = round(issued_redeemed_ratio_30d, 3)

        reserve_score, reserve_metrics = _score_reserve(transparency)
        reserve_state = _describe_reserve_state(
            report_freshness_days=int(reserve_metrics.get("reserve_report_freshness_days"))
            if reserve_metrics.get("reserve_report_freshness_days") is not None
            else None,
            weekly_disclosure=transparency.weekly_disclosure,
            monthly_attestation=transparency.monthly_attestation,
        )
        details["reserve_state"] = reserve_state
        for key, value in reserve_metrics.items():
            if value is not None:
                details[key] = round(float(value), 2) if isinstance(value, float) else value
        if reserve_score is not None:
            factor_scores["reserve"] = reserve_score
            signals.append(reserve_score)
        if reserve_metrics.get("reserve_components_total_usd_bn") is not None:
            known_total = float(reserve_metrics["reserve_components_total_usd_bn"] or 0.0)
            details["reserve_cash_share_pct"] = round(
                _pct(float(transparency.reserve_cash_usd_bn or 0.0), known_total),
                2,
            )
            details["reserve_short_treasuries_share_pct"] = round(
                _pct(float(transparency.reserve_short_treasuries_usd_bn or 0.0), known_total),
                2,
            )
            details["reserve_other_bucket_share_pct"] = round(
                _pct(float(transparency.reserve_other_bucket_usd_bn or 0.0), known_total),
                2,
            )
            _append_note(
                details,
                "Circle static HTML exposes one aggregated reserve bucket beyond cash and short Treasuries; exact sub-splits remain in the dashboard UI",
            )
    else:
        details["reserve_state"] = reserve_state
        if historical_proxy:
            _append_note(details, "Historical proxy cannot reconstruct Circle reserve disclosures or mint/burn dashboard data")
        else:
            _append_note(details, "Circle transparency dashboard unavailable; reserve and issuance use market-structure proxies where possible")

    issuance_score = _score_issuance(
        usdc_supply_change_30d_pct=usdc_supply_change,
        net_issued_30d_pct_of_circulation=net_issued_30d_pct_of_circulation,
        issued_redeemed_ratio_30d=issued_redeemed_ratio_30d,
    )
    issuance_state = _describe_issuance_state(
        net_issued_30d_pct_of_circulation=net_issued_30d_pct_of_circulation,
        usdc_supply_change_30d_pct=usdc_supply_change,
    )
    details["issuance_state"] = issuance_state
    if issuance_score is not None:
        factor_scores["issuance"] = issuance_score
        signals.append(issuance_score)

    details["payment_rail_state"] = _describe_payment_rail_state(
        redeemability_state=details["redeemability_state"],
        reserve_state=reserve_state,
        issuance_state=issuance_state,
        chain_mix_state=details["chain_mix_state"],
        adoption_state=str(details.get("adoption_state") or "Circle adoption unavailable"),
    )
    details["factor_scores"] = factor_scores

    score = int(sum(signals) / max(len(signals), 1)) if signals else 0
    score = max(-100, min(100, score))

    return {
        "dimension": "payments",
        "score": score,
        "weight": WEIGHTS["payments"],
        "details": details,
        "signal_count": len(signals),
    }



def _score_payments_from_market_caps(
    *,
    usdc_price_usd: float | None,
    usdt_price_usd: float | None,
    usdc_market_cap_usd: float | None,
    usdc_market_cap_30d_ago_usd: float | None,
    usdt_market_cap_usd: float | None,
    usdt_market_cap_30d_ago_usd: float | None,
) -> dict:
    if all(
        value is None
        for value in (
            usdc_price_usd,
            usdt_price_usd,
            usdc_market_cap_usd,
            usdc_market_cap_30d_ago_usd,
            usdt_market_cap_usd,
            usdt_market_cap_30d_ago_usd,
        )
    ):
        return {
            "dimension": "payments",
            "score": 0,
            "weight": WEIGHTS["payments"],
            "details": {"error": "No historical stablecoin market-structure proxy for this date"},
            "signal_count": 0,
        }

    stable = StablecoinChainStats(
        total_usd=float((usdc_market_cap_usd or 0.0) + (usdt_market_cap_usd or 0.0)),
        total_prev_month_usd=float((usdc_market_cap_30d_ago_usd or 0.0) + (usdt_market_cap_30d_ago_usd or 0.0)),
        chain_usd={},
        chain_prev_month_usd={},
        usdc_usd=float(usdc_market_cap_usd or 0.0),
        usdc_prev_month_usd=float(usdc_market_cap_30d_ago_usd or 0.0),
        usdc_chain_usd={},
        usdc_chain_prev_month_usd={},
        usdt_usd=float(usdt_market_cap_usd or 0.0),
        usdt_prev_month_usd=float(usdt_market_cap_30d_ago_usd or 0.0),
    )
    return _score_payments_from_components(
        stable=stable,
        usdc_price_usd=usdc_price_usd,
        usdt_price_usd=usdt_price_usd,
        transparency=None,
        historical_proxy=True,
    )



def score_payments() -> dict:
    stable = fetch_stablecoin_chain_stats()
    if stable is None:
        return {
            "dimension": "payments",
            "score": 0,
            "weight": WEIGHTS["payments"],
            "details": {"error": "Stablecoin / payment rail data unavailable"},
            "signal_count": 0,
        }

    prices = fetch_json(
        "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether,dai&vs_currencies=usd"
    )
    usdc_price = None
    usdt_price = None
    dai_price = None
    if isinstance(prices, dict):
        usdc_price = (prices.get("usd-coin") or {}).get("usd")
        usdt_price = (prices.get("tether") or {}).get("usd")
        dai_price = (prices.get("dai") or {}).get("usd")

    return _score_payments_from_components(
        stable=stable,
        usdc_price_usd=float(usdc_price) if usdc_price is not None else None,
        usdt_price_usd=float(usdt_price) if usdt_price is not None else None,
        dai_price_usd=float(dai_price) if dai_price is not None else None,
        transparency=fetch_circle_transparency_snapshot(),
        adoption_snapshot=fetch_circle_adoption_snapshot(),
    )
