from __future__ import annotations

from collections import defaultdict
from typing import Any

SOURCE_REGISTRY: dict[str, dict[str, Any]] = {
    "onchain": {"tier": 1, "sources": ["Etherscan", "CoinGecko"]},
    "technical": {"tier": 2, "sources": ["Binance Spot API"]},
    "macro": {"tier": 1, "sources": ["FRED", "CoinGecko Global"]},
    "sentiment": {"tier": 2, "sources": ["Alternative.me", "Binance Futures"]},
    "behavioral": {"tier": 2, "sources": ["Binance Spot API"]},
    "defi": {"tier": 2, "sources": ["DefiLlama", "GitHub"]},
    "payments": {
        "tier": 2,
        "sources": [
            "DefiLlama Stablecoins",
            "CoinGecko Stablecoin Prices",
            "Circle Transparency",
            "Circle CCTP Docs",
            "Circle Gateway Docs",
            "Circle USDC Contract Addresses",
        ],
    },
}

_PREFERRED_DETAIL_KEYS: dict[str, list[tuple[str, str]]] = {
    "onchain": [("price_change_30d_pct", "30d price change"), ("avg_gas_gwei", "avg gas")],
    "technical": [("price_vs_ma", "trend"), ("weekly_structure", "weekly structure")],
    "macro": [("treasury_10y", "US 10Y"), ("btc_dominance", "BTC dominance")],
    "sentiment": [("fear_greed_index", "fear & greed"), ("latest_funding_rate", "funding")],
    "behavioral": [("capitulation_candle", "capitulation"), ("recency_bias", "recency bias")],
    "defi": [("tvl_change_30d_pct", "30d TVL change")],
}



def get_source_registry() -> dict[str, dict[str, Any]]:
    return SOURCE_REGISTRY



def _format_value(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.2f}".rstrip("0").rstrip(".")
    return str(value)



def _freshness_from_days(days: Any) -> str:
    if days is None:
        return "live"
    try:
        value = float(days)
    except Exception:
        return "recent"
    if value <= 1:
        return "live"
    if value <= 30:
        return "recent"
    return "stale"



def _build_claim(
    *,
    claim_id: str,
    dimension: str,
    claim: str,
    claim_type: str,
    tier: int,
    source: str,
    observed_at: str,
    freshness: str,
    status: str,
    supports: list[str],
    notes: str = "",
) -> dict[str, Any]:
    return {
        "claim_id": claim_id,
        "dimension": dimension,
        "claim": claim,
        "claim_type": claim_type,
        "tier": int(tier),
        "source": source,
        "observed_at": observed_at,
        "freshness": freshness,
        "status": status,
        "supports": supports,
        "notes": notes,
    }



def _build_generic_dimension_claim(dimension: dict[str, Any], observed_at: str) -> list[dict[str, Any]]:
    name = str(dimension.get("dimension") or "unknown")
    details = dimension.get("details", {}) or {}
    score = int(dimension.get("score", 0) or 0)
    registry_entry = SOURCE_REGISTRY.get(name, {"tier": 2, "sources": ["Unknown"]})
    source = str(registry_entry["sources"][0])
    error = details.get("error")
    note = str(details.get("note") or "")

    if error:
        return [
            _build_claim(
                claim_id=f"{name}-summary",
                dimension=name,
                claim=f"{name} dimension degraded: {error}",
                claim_type="risk",
                tier=int(registry_entry["tier"]),
                source=source,
                observed_at=observed_at,
                freshness="stale",
                status="provisional",
                supports=[f"dimension:{name}", "coverage", "decision_contract"],
                notes=str(error),
            )
        ]

    for key, label in _PREFERRED_DETAIL_KEYS.get(name, []):
        if key not in details:
            continue
        value = details.get(key)
        claim = f"{name} read is {score:+d}; {label}={_format_value(value)}"
        return [
            _build_claim(
                claim_id=f"{name}-summary",
                dimension=name,
                claim=claim,
                claim_type="interpretation",
                tier=int(registry_entry["tier"]),
                source=source,
                observed_at=observed_at,
                freshness="live",
                status="confirmed",
                supports=[f"dimension:{name}", "composite", "decision_contract"],
                notes=note,
            )
        ]

    return [
        _build_claim(
            claim_id=f"{name}-summary",
            dimension=name,
            claim=f"{name} read is {score:+d}",
            claim_type="interpretation",
            tier=int(registry_entry["tier"]),
            source=source,
            observed_at=observed_at,
            freshness="live",
            status="confirmed",
            supports=[f"dimension:{name}", "composite", "decision_contract"],
            notes=note,
        )
    ]



def _build_payments_claims(dimension: dict[str, Any], observed_at: str) -> list[dict[str, Any]]:
    details = dimension.get("details", {}) or {}
    score = int(dimension.get("score", 0) or 0)
    error = details.get("error")
    if error:
        return [
            _build_claim(
                claim_id="payments-summary",
                dimension="payments",
                claim=f"payments dimension degraded: {error}",
                claim_type="risk",
                tier=2,
                source="Circle Transparency",
                observed_at=observed_at,
                freshness="stale",
                status="provisional",
                supports=["dimension:payments", "coverage", "decision_contract"],
                notes=str(error),
            )
        ]

    claims: list[dict[str, Any]] = []
    payments_freshness = _freshness_from_days(details.get("reserve_report_freshness_days"))

    payments_fields = [
        ("payments-redeemability", "redeemability_state", "Redeemability", "Circle Transparency", 1, "fact"),
        ("payments-reserve", "reserve_state", "Reserve", "Circle Transparency", 1, "fact"),
        ("payments-issuance", "issuance_state", "Issuance", "DefiLlama Stablecoins", 2, "fact"),
        ("payments-adoption", "adoption_state", "Adoption", "Circle CCTP Docs", 1, "interpretation"),
        ("payments-rail", "payment_rail_state", "Rail state", "Circle Transparency", 1, "interpretation"),
    ]
    for claim_id, key, label, source, tier, claim_type in payments_fields:
        value = details.get(key)
        if value is None:
            continue
        claims.append(
            _build_claim(
                claim_id=claim_id,
                dimension="payments",
                claim=f"{label}: {value} (payments score {score:+d})",
                claim_type=claim_type,
                tier=tier,
                source=source,
                observed_at=observed_at,
                freshness=payments_freshness,
                status="confirmed" if value != "Circle adoption unavailable" else "provisional",
                supports=["dimension:payments", "payments_contract", "decision_contract"],
            )
        )

    coverage_bits: list[str] = []
    for label, key in (
        ("native_usdc_mainnets", "native_usdc_chain_count"),
        ("cctp_native_coverage_pct", "cctp_native_coverage_pct"),
        ("gateway_native_coverage_pct", "gateway_native_coverage_pct"),
        ("programmable_native_coverage_pct", "programmable_native_coverage_pct"),
    ):
        if key in details and details.get(key) is not None:
            coverage_bits.append(f"{label}={_format_value(details.get(key))}")
    if coverage_bits:
        claims.append(
            _build_claim(
                claim_id="payments-coverage",
                dimension="payments",
                claim="Payments coverage snapshot: " + ", ".join(coverage_bits),
                claim_type="fact",
                tier=1,
                source="Circle USDC Contract Addresses",
                observed_at=observed_at,
                freshness=payments_freshness,
                status="confirmed",
                supports=["payments_contract", "decision_contract"],
            )
        )

    if not claims:
        claims.append(
            _build_claim(
                claim_id="payments-summary",
                dimension="payments",
                claim=f"payments read is {score:+d}",
                claim_type="interpretation",
                tier=2,
                source="DefiLlama Stablecoins",
                observed_at=observed_at,
                freshness="live",
                status="confirmed",
                supports=["dimension:payments", "decision_contract"],
            )
        )
    return claims



def _build_meta_claims(
    *,
    composite: dict[str, Any],
    governance: dict[str, Any],
    confidence: dict[str, Any],
    observed_at: str,
) -> list[dict[str, Any]]:
    signal = str(composite.get("signal") or "UNKNOWN")
    score = int(composite.get("composite_score") or 0)
    stance = str(governance.get("stance") or "neutral")
    review_cadence = str(governance.get("review_cadence") or "72h")
    confidence_level = str(confidence.get("level") or "low")
    veto_triggered = bool(governance.get("veto_triggered"))
    veto_reason = str(governance.get("veto_reason") or composite.get("veto_reason") or "")

    claims = [
        _build_claim(
            claim_id="composite-summary",
            dimension="composite",
            claim=f"Composite signal is {signal} at {score:+d}",
            claim_type="interpretation",
            tier=2,
            source="ETH Oracle composite model",
            observed_at=observed_at,
            freshness="live",
            status="confirmed",
            supports=["decision_contract", "governance"],
        ),
        _build_claim(
            claim_id="governance-summary",
            dimension="governance",
            claim=f"Governance stance is {stance}; review cadence {review_cadence}; confidence {confidence_level}",
            claim_type="governance",
            tier=2,
            source="ETH Oracle governance model",
            observed_at=observed_at,
            freshness="live",
            status="confirmed",
            supports=["decision_contract", "governance"],
        ),
    ]
    if veto_triggered:
        claims.append(
            _build_claim(
                claim_id="governance-veto",
                dimension="governance",
                claim=f"Tier 1 veto is active: {veto_reason}",
                claim_type="risk",
                tier=1,
                source="ETH Oracle governance model",
                observed_at=observed_at,
                freshness="live",
                status="confirmed",
                supports=["decision_contract", "governance"],
                notes=veto_reason,
            )
        )
    return claims



def build_claims_ledger(
    dimensions: list[dict[str, Any]],
    composite: dict[str, Any],
    governance: dict[str, Any],
    confidence: dict[str, Any],
    *,
    observed_at: str,
) -> list[dict[str, Any]]:
    claims: list[dict[str, Any]] = []
    for dimension in dimensions:
        name = str(dimension.get("dimension") or "")
        if not name:
            continue
        if name == "payments":
            claims.extend(_build_payments_claims(dimension, observed_at))
        else:
            claims.extend(_build_generic_dimension_claim(dimension, observed_at))
    claims.extend(
        _build_meta_claims(
            composite=composite,
            governance=governance,
            confidence=confidence,
            observed_at=observed_at,
        )
    )
    return claims



def build_evidence_summary(dimensions: list[dict[str, Any]], claims_ledger: list[dict[str, Any]]) -> dict[str, Any]:
    registry = get_source_registry()
    tier_summary = {
        "tier_1": {"sources": [], "count": 0},
        "tier_2": {"sources": [], "count": 0},
        "tier_3": {"sources": [], "count": 0},
    }
    claim_tier_summary = {
        "tier_1": {"sources": [], "count": 0},
        "tier_2": {"sources": [], "count": 0},
        "tier_3": {"sources": [], "count": 0},
    }
    warnings: list[str] = []
    scored = 0

    for dimension in dimensions:
        name = dimension.get("dimension")
        entry = registry.get(name, {"tier": 2, "sources": []})
        tier_key = f"tier_{entry['tier']}"
        tier_summary[tier_key]["count"] += 1
        for source in entry["sources"]:
            if source not in tier_summary[tier_key]["sources"]:
                tier_summary[tier_key]["sources"].append(source)
        if not dimension.get("details", {}).get("error"):
            scored += 1
        else:
            warnings.append(f"{name} degraded: {dimension['details']['error']}")

    seen_claim_sources: dict[str, set[str]] = defaultdict(set)
    for claim in claims_ledger:
        tier = int(claim.get("tier") or 2)
        tier_key = f"tier_{tier}"
        if tier_key not in claim_tier_summary:
            continue
        claim_tier_summary[tier_key]["count"] += 1
        source = str(claim.get("source") or "Unknown")
        if source not in seen_claim_sources[tier_key]:
            claim_tier_summary[tier_key]["sources"].append(source)
            seen_claim_sources[tier_key].add(source)

    return {
        "policy": "tiered-source-weighting",
        "tier_summary": tier_summary,
        "claim_tier_summary": claim_tier_summary,
        "coverage": {
            "dimensions_scored": scored,
            "dimensions_total": len(dimensions),
            "dimensions_missing": [d["dimension"] for d in dimensions if d.get("details", {}).get("error")],
            "claims_total": len(claims_ledger),
        },
        "warnings": warnings,
    }
