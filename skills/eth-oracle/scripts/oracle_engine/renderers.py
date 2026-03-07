from typing import Any



def _pick_key_factor(dimension: dict) -> str:
    details = dimension["details"]
    name = dimension["dimension"]

    if name == "onchain":
        if "price_change_30d_pct" in details:
            return f"30d change: {details['price_change_30d_pct']:.1f}%"
        return f"Gas: {details.get('avg_gas_gwei', 'N/A')} gwei"

    if name == "technical":
        rsi = details.get("RSI14", "N/A")
        ma_position = details.get("price_vs_ma", "N/A")
        return f"RSI={rsi}, {ma_position}"

    if name == "macro":
        if "treasury_10y" in details:
            return f"10Y={details['treasury_10y']}%, BTC.D={details.get('btc_dominance', 'N/A')}%"
        return f"BTC.D={details.get('btc_dominance', 'N/A')}%"

    if name == "sentiment":
        fear_greed = details.get("fear_greed_index", "N/A")
        fear_class = details.get("fear_greed_class", "")
        funding_rate = details.get("latest_funding_rate", "N/A")
        return f"F&G={fear_greed} ({fear_class}), FR={funding_rate}"

    if name == "behavioral":
        capitulation = details.get("capitulation_candle", "None")
        recency = details.get("recency_bias", "N/A")
        return f"Capit: {capitulation[:20]}, Bias: {recency}"

    if name == "defi":
        tvl_change = details.get("tvl_change_30d_pct", "N/A")
        return f"TVL 30d: {tvl_change}%"

    if name == "payments":
        redeemability = details.get("redeemability_state", "orderly")
        adoption = details.get("adoption_state")
        top_chain = details.get("usdc_top_chain", "N/A")
        if adoption and adoption != "Circle adoption unavailable":
            return f"{redeemability}; {adoption}; top chain: {top_chain}"
        net_issued = details.get("net_issued_30d_usd_bn", "N/A")
        return f"{redeemability}; net 30d: {net_issued}B; top chain: {top_chain}"

    return str(list(details.values())[:1])



def format_report(
    dimensions: list[dict],
    composite: dict,
    *,
    governance: dict | None = None,
    confidence: dict | None = None,
) -> str:
    timestamp = composite.get("timestamp") or "current snapshot"
    lines: list[str] = []

    lines.append("═" * 55)
    lines.append(f"  ETH Oracle Report — {timestamp}")
    lines.append("═" * 55)
    lines.append("")
    lines.append(f"  Composite Score:  {composite['composite_score']:+d}/100")
    lines.append(f"  Signal:           {composite['signal']}")
    lines.append(f"  Confidence:       {composite['confidence']} ({composite['agreement']})")
    lines.append(f"  Position Size:    {composite['position_size_pct']}% of portfolio")
    if governance:
        lines.append(f"  Stance:           {governance['stance']}")
        lines.append(f"  Review Cadence:   {governance['review_cadence']}")
    lines.append("")
    lines.append(f"  {'Dimension':<14} {'Score':>6}  {'Key Factor'}")
    lines.append(f"  {'─' * 14} {'─' * 6}  {'─' * 32}")

    for dimension in dimensions:
        lines.append(f"  {dimension['dimension']:<14} {dimension['score']:>+5d}   {_pick_key_factor(dimension)}")

    lines.append("")
    lines.append(f"  Action: {composite['action']}")
    lines.append("")
    lines.append("  Risk Alerts:")

    if composite.get("veto_triggered"):
        lines.append(f"    ⚠ Tier 1 veto triggered — {composite.get('veto_reason')}")
    if abs(composite["composite_score"]) > 70:
        lines.append("    ⚠ Extreme signal — verify with manual cross-check")
    if composite["confidence"] == "LOW":
        lines.append("    ⚠ Low confidence — dimensions disagree, reduce size")

    for dimension in dimensions:
        if dimension["dimension"] != "technical":
            continue
        volume_ratio = float(dimension["details"].get("volume_ratio", 1) or 1)
        if volume_ratio > 2:
            lines.append(f"    ⚠ High volume ({volume_ratio:.1f}x avg) — elevated volatility")

    if confidence and confidence.get("unknowns"):
        lines.append("    ⚠ Unknowns: " + "; ".join(confidence["unknowns"][:2]))

    lines.append("")
    lines.append("  ⚠ DISCLAIMER: This is a decision support tool, not financial advice.")
    lines.append("    Always apply your own judgment and risk management.")
    lines.append("═" * 55)

    return "\n".join(lines)



def render_research_report(snapshot: dict[str, Any]) -> str:
    dimensions = snapshot.get("dimensions", [])
    composite = snapshot.get("composite", {})
    confidence = snapshot.get("confidence", {})
    governance = snapshot.get("portfolio_governance", {})
    evidence = snapshot.get("evidence", {})

    lines = [
        "Mandate",
        f"- Scope: {', '.join(snapshot.get('mandate', {}).get('asset_scope', []))}",
        f"- Horizon: {snapshot.get('mandate', {}).get('time_horizon', 'position')}",
        "",
        "Bottom Line",
        f"- Signal: {composite.get('signal', 'UNKNOWN')} ({composite.get('composite_score', 0):+d})",
        f"- Stance: {governance.get('stance', 'neutral')}",
        f"- Confidence: {confidence.get('level', 'low')} — {confidence.get('summary', '')}",
        "",
        "Evidence Ledger",
        f"- Coverage: {evidence.get('coverage', {}).get('dimensions_scored', 0)}/{evidence.get('coverage', {}).get('dimensions_total', 0)} dimensions active",
        f"- Tier 1 sources: {', '.join(evidence.get('tier_summary', {}).get('tier_1', {}).get('sources', []))}",
        f"- Tier 2 sources: {', '.join(evidence.get('tier_summary', {}).get('tier_2', {}).get('sources', []))}",
        "",
        "Dimension Read",
    ]
    for dimension in dimensions:
        lines.append(f"- {dimension['dimension']}: {dimension['score']:+d} — {_pick_key_factor(dimension)}")
    lines.extend([
        "",
        "Counterargument",
        *[f"- {item}" for item in confidence.get("counterarguments", [])[:2]],
        "",
        "Unknowns",
        *[f"- {item}" for item in confidence.get("unknowns", [])[:3]],
        "",
        "Review Trigger",
        f"- Next review: {governance.get('review_cadence', '72h')}",
    ])
    return "\n".join(lines)



def render_investment_memo(snapshot: dict[str, Any]) -> str:
    composite = snapshot.get("composite", {})
    governance = snapshot.get("portfolio_governance", {})
    confidence = snapshot.get("confidence", {})

    lines = [
        f"Conclusion: {composite.get('signal', 'UNKNOWN')} ({composite.get('composite_score', 0):+d})",
        f"Portfolio stance: {governance.get('stance', 'neutral')}",
        f"Recommended size: {governance.get('position_size_pct', 0)}% (max {governance.get('max_position_pct', 25)}%)",
        f"Confidence: {confidence.get('level', 'low')} — {confidence.get('summary', '')}",
        "Key drivers:",
    ]
    top_drivers = sorted(snapshot.get("dimensions", []), key=lambda item: abs(item.get("score", 0)), reverse=True)[:3]
    for dimension in top_drivers:
        lines.append(f"- {dimension['dimension']}: {_pick_key_factor(dimension)}")
    lines.extend([
        "Risk triggers:",
        *[f"- {item}" for item in governance.get("risk_triggers", [])[:3]],
        "Invalidation:",
        *[f"- {item}" for item in governance.get("invalidation_conditions", [])[:3]],
        f"Next review: {governance.get('review_cadence', '72h')}",
    ])
    return "\n".join(lines)



def render_board_brief(snapshot: dict[str, Any]) -> str:
    composite = snapshot.get("composite", {})
    governance = snapshot.get("portfolio_governance", {})
    confidence = snapshot.get("confidence", {})
    lines = [
        f"Judgment: {composite.get('signal', 'UNKNOWN')} / {governance.get('stance', 'neutral')} / confidence {confidence.get('level', 'low')}",
        "Key points:",
    ]
    for dimension in sorted(snapshot.get("dimensions", []), key=lambda item: abs(item.get("score", 0)), reverse=True)[:3]:
        lines.append(f"- {dimension['dimension']}: {_pick_key_factor(dimension)}")
    lines.extend([
        f"Principal risk: {governance.get('risk_triggers', ['No explicit risk trigger'])[0]}",
        f"Recommended action: {composite.get('action', '')}",
        f"Next watchpoint: {governance.get('review_cadence', '72h')}",
    ])
    return "\n".join(lines)



def render_principal_ready(snapshot: dict[str, Any]) -> str:
    dimensions = snapshot.get("dimensions", [])
    composite = snapshot.get("composite", {})
    governance = snapshot.get("portfolio_governance", {})
    confidence = snapshot.get("confidence", {})
    evidence = snapshot.get("evidence", {})
    dimensions_by_name = {
        dimension.get("dimension"): dimension for dimension in dimensions if dimension.get("dimension")
    }
    payments = dimensions_by_name.get("payments", {"score": 0, "details": {}})
    payment_details = payments.get("details", {})
    strongest_positive = sorted(dimensions, key=lambda item: item.get("score", 0), reverse=True)[:2]
    strongest_negative = sorted(dimensions, key=lambda item: item.get("score", 0))[:2]
    position_size_pct = governance.get("position_size_pct", composite.get("position_size_pct", 0))
    execution_mode = "monitor-only" if float(position_size_pct or 0) <= 0 else "sized-risk"
    tier_1_sources = ", ".join(evidence.get("tier_summary", {}).get("tier_1", {}).get("sources", [])) or "N/A"
    tier_2_sources = ", ".join(evidence.get("tier_summary", {}).get("tier_2", {}).get("sources", [])) or "N/A"
    adoption_key_chains = ", ".join(payment_details.get("adoption_key_chains", [])) or "N/A"
    lines = [
        "PRINCIPAL READY — DECISION PACKET",
        f"Timestamp: {composite.get('timestamp', snapshot.get('timestamp', 'current snapshot'))}",
        "",
        "[Decision]",
        f"Signal: {composite.get('signal', 'UNKNOWN')}",
        f"Action: {composite.get('action', 'Hold')}",
        f"Stance: {governance.get('stance', 'neutral')}",
        f"Recommended size: {position_size_pct}% of portfolio",
        f"Confidence: {confidence.get('level', 'low')} — {confidence.get('summary', '')}",
        f"Review cadence: {governance.get('review_cadence', '72h')}",
        "",
        "[Transmission Map]",
        *[f"Positive driver: {dimension['dimension']} {dimension['score']:+d} — {_pick_key_factor(dimension)}" for dimension in strongest_positive],
        *[f"Drag: {dimension['dimension']} {dimension['score']:+d} — {_pick_key_factor(dimension)}" for dimension in strongest_negative],
        "",
        "[Circle / USDC / Payments]",
        f"Payments score: {payments.get('score', 0):+d}",
        f"Redeemability: {payment_details.get('redeemability_state', 'N/A')}",
        f"Reserve: {payment_details.get('reserve_state', 'N/A')}",
        f"Issuance: {payment_details.get('issuance_state', 'N/A')}",
        f"Adoption: {payment_details.get('adoption_state', 'N/A')}",
        f"Chain mix: {payment_details.get('chain_mix_state', 'N/A')}",
        f"Native USDC mainnets: {payment_details.get('native_usdc_chain_count', 'N/A')}",
        f"CCTP / Gateway / Programmable coverage: {payment_details.get('cctp_native_coverage_pct', 'N/A')}% / {payment_details.get('gateway_native_coverage_pct', 'N/A')}% / {payment_details.get('programmable_native_coverage_pct', 'N/A')}%",
        f"Adoption key chains: {adoption_key_chains}",
        "",
        "[Risk Controls]",
        *[f"Risk trigger: {item}" for item in governance.get('risk_triggers', [])[:3]],
        *[f"Invalidation: {item}" for item in governance.get('invalidation_conditions', [])[:3]],
        "",
        "[Data Quality]",
        f"Tier 1 sources: {tier_1_sources}",
        f"Tier 2 sources: {tier_2_sources}",
        *[f"Unknown: {item}" for item in confidence.get('unknowns', [])[:2]],
        "",
        "[AI Butler Handoff]",
        f"Execution mode: {execution_mode}",
        f"Escalate on: {(governance.get('risk_triggers') or confidence.get('unknowns') or ['next scheduled review'])[0]}",
    ]
    return "\n".join(lines)



def build_deliverables(snapshot: dict[str, Any]) -> dict[str, str]:
    return {
        "research_report": render_research_report(snapshot),
        "investment_memo": render_investment_memo(snapshot),
        "board_brief": render_board_brief(snapshot),
        "principal_ready": render_principal_ready(snapshot),
    }
