from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

SCHEMA_VERSION = "1.0.0"
CONTRACT_TYPE = "investment_decision"
DECISION_ACTIONS = ("deploy_risk", "monitor", "reduce_risk", "block")
EXECUTION_MODES = ("blocked", "monitor_only", "defensive_only", "sized_risk")
RECHECK_TO_TTL_SECONDS = {
    "24h": 24 * 60 * 60,
    "72h": 72 * 60 * 60,
    "7d": 7 * 24 * 60 * 60,
    # Event-driven decisions should be treated as short-dated until the trigger is reviewed.
    "event-driven": 6 * 60 * 60,
}



def _parse_timestamp(value: Any) -> datetime:
    raw = str(value or "")
    if not raw:
        return datetime.now(timezone.utc)
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except Exception:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)



def _isoformat(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")



def _claim_index(claims_ledger: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, list[str]]]:
    claims_by_id = {str(claim.get("claim_id")): claim for claim in claims_ledger if claim.get("claim_id")}
    claim_ids_by_dimension: dict[str, list[str]] = defaultdict(list)
    for claim in claims_ledger:
        claim_id = str(claim.get("claim_id") or "")
        dimension = str(claim.get("dimension") or "")
        if not claim_id or not dimension:
            continue
        claim_ids_by_dimension[dimension].append(claim_id)
    return claims_by_id, claim_ids_by_dimension



def _build_evidence_refs(claim_ids: list[str], claims_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for claim_id in claim_ids:
        if claim_id in seen or claim_id not in claims_by_id:
            continue
        claim = claims_by_id[claim_id]
        refs.append(
            {
                "claim_id": claim_id,
                "dimension": claim.get("dimension"),
                "tier": claim.get("tier"),
                "source": claim.get("source"),
                "freshness": claim.get("freshness"),
                "status": claim.get("status"),
            }
        )
        seen.add(claim_id)
    return refs



def _driver_reason_code(name: str, score: int) -> str:
    suffix = "POSITIVE" if score >= 0 else "NEGATIVE"
    return f"DRIVER_{name.upper()}_{suffix}"



def _build_driver_blocks(
    dimensions: list[dict[str, Any]],
    *,
    reverse: bool,
    claims_by_id: dict[str, dict[str, Any]],
    claim_ids_by_dimension: dict[str, list[str]],
) -> list[dict[str, Any]]:
    ordered = sorted(dimensions, key=lambda item: item.get("score", 0), reverse=reverse)[:2]
    drivers: list[dict[str, Any]] = []
    for dimension in ordered:
        name = str(dimension.get("dimension") or "unknown")
        score = int(dimension.get("score") or 0)
        claim_ids = claim_ids_by_dimension.get(name, [])[:2]
        drivers.append(
            {
                "dimension": name,
                "score": score,
                "reason_code": _driver_reason_code(name, score),
                "summary": str((dimension.get("details") or {}).get("payment_rail_state") or (dimension.get("details") or {}).get("adoption_state") or "driver present"),
                "evidence_refs": _build_evidence_refs(claim_ids, claims_by_id),
            }
        )
    return drivers



def _build_wait_conditions(
    *,
    composite: dict[str, Any],
    governance: dict[str, Any],
    confidence: dict[str, Any],
    evidence: dict[str, Any],
    payments_details: dict[str, Any],
) -> tuple[list[str], list[str]]:
    must_wait_for: list[str] = []
    blocking_conditions: list[str] = []
    confidence_level = str(confidence.get("level") or "low")
    direction = str(composite.get("direction") or "FLAT")
    veto_triggered = bool(governance.get("veto_triggered"))
    missing_dimensions = list((evidence.get("coverage") or {}).get("dimensions_missing") or [])

    if veto_triggered:
        reason = str(governance.get("veto_reason") or composite.get("veto_reason") or "Tier 1 veto active")
        blocking_conditions.append(reason)
        must_wait_for.append("Tier 1 veto to clear via fresh official evidence")
    if direction == "FLAT":
        must_wait_for.append("composite score to leave the neutral regime")
    if confidence_level == "low":
        blocking_conditions.append("Confidence remains low; require stronger cross-dimension confirmation")
        must_wait_for.append("higher-confidence cross-dimension confirmation")
    if missing_dimensions:
        blocking_conditions.append("Evidence coverage is incomplete across one or more dimensions")
        must_wait_for.append("missing dimension coverage to recover")
    if str(payments_details.get("adoption_state") or "") == "Circle adoption unavailable":
        must_wait_for.append("fresh Circle adoption coverage snapshot")

    deduped_wait: list[str] = []
    for item in must_wait_for:
        if item not in deduped_wait:
            deduped_wait.append(item)
    deduped_blocking: list[str] = []
    for item in blocking_conditions:
        if item not in deduped_blocking:
            deduped_blocking.append(item)
    return deduped_wait, deduped_blocking



def _build_reason_codes(
    *,
    composite: dict[str, Any],
    governance: dict[str, Any],
    confidence: dict[str, Any],
    evidence: dict[str, Any],
    payments_details: dict[str, Any],
    execution_mode: str,
) -> list[str]:
    reason_codes = [
        f"STANCE_{str(governance.get('stance') or 'neutral').upper()}",
        f"CONFIDENCE_{str(confidence.get('level') or 'low').upper()}",
        f"RECHECK_{str(governance.get('review_cadence') or '72h').upper().replace('-', '_')}",
        f"EXECUTION_{execution_mode.upper()}",
    ]
    if bool(governance.get("veto_triggered")):
        reason_codes.append("VETO_TIER1_ACTIVE")
    direction = str(composite.get("direction") or "FLAT")
    if direction == "LONG":
        reason_codes.append("REGIME_BULLISH")
    elif direction == "SHORT":
        reason_codes.append("REGIME_BEARISH")
    else:
        reason_codes.append("REGIME_NEUTRAL")

    missing_dimensions = list((evidence.get("coverage") or {}).get("dimensions_missing") or [])
    if missing_dimensions:
        reason_codes.append("EVIDENCE_GAPS_PRESENT")

    rail_state = str(payments_details.get("payment_rail_state") or "")
    adoption_state = str(payments_details.get("adoption_state") or "")
    if "strengthening" in rail_state.lower():
        reason_codes.append("PAYMENTS_RAILS_STRENGTHENING")
    elif "weakening" in rail_state.lower() or "stress" in rail_state.lower():
        reason_codes.append("PAYMENTS_RAILS_WEAKENING")
    if adoption_state == "Circle adoption rails broad and programmable":
        reason_codes.append("PAYMENTS_ADOPTION_BROAD")
    elif adoption_state == "Circle adoption unavailable":
        reason_codes.append("PAYMENTS_ADOPTION_UNAVAILABLE")

    return reason_codes



def _build_policy_flags(
    *,
    governance: dict[str, Any],
    confidence: dict[str, Any],
    evidence: dict[str, Any],
    execution_mode: str,
    payments_details: dict[str, Any],
) -> list[str]:
    flags: list[str] = []
    if bool(governance.get("veto_triggered")):
        flags.append("tier1_veto")
    if str(confidence.get("level") or "low") == "low":
        flags.append("low_confidence")
    if list((evidence.get("coverage") or {}).get("dimensions_missing") or []):
        flags.append("evidence_gap")
    if execution_mode == "monitor_only":
        flags.append("monitor_only")
    if execution_mode == "blocked":
        flags.append("blocked")
    if str(payments_details.get("adoption_state") or "") == "Circle adoption rails broad and programmable":
        flags.append("payments_adoption_broad")
    return flags



def _build_payments_contract(
    payments: dict[str, Any],
    *,
    claims_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    details = payments.get("details", {}) or {}
    claim_ids = [
        claim_id
        for claim_id in (
            "payments-redeemability",
            "payments-reserve",
            "payments-issuance",
            "payments-adoption",
            "payments-rail",
            "payments-coverage",
            "payments-summary",
        )
        if claim_id in claims_by_id
    ]
    rail_health = "mixed"
    rail_state = str(details.get("payment_rail_state") or "")
    if "strengthening" in rail_state.lower():
        rail_health = "strengthening"
    elif "weakening" in rail_state.lower() or "stress" in rail_state.lower():
        rail_health = "weakening"

    reason_codes: list[str] = []
    if rail_health == "strengthening":
        reason_codes.append("PAYMENTS_RAILS_STRENGTHENING")
    elif rail_health == "weakening":
        reason_codes.append("PAYMENTS_RAILS_WEAKENING")
    adoption_state = str(details.get("adoption_state") or "")
    if adoption_state == "Circle adoption rails broad and programmable":
        reason_codes.append("PAYMENTS_ADOPTION_BROAD")
    elif adoption_state == "Circle adoption unavailable":
        reason_codes.append("PAYMENTS_ADOPTION_UNAVAILABLE")

    return {
        "score": int(payments.get("score") or 0),
        "rail_health": rail_health,
        "redeemability_status": details.get("redeemability_state", "N/A"),
        "reserve_status": details.get("reserve_state", "N/A"),
        "issuance_status": details.get("issuance_state", "N/A"),
        "adoption_status": details.get("adoption_state", "N/A"),
        "native_usdc_chain_count": details.get("native_usdc_chain_count"),
        "cctp_native_coverage_pct": details.get("cctp_native_coverage_pct"),
        "gateway_native_coverage_pct": details.get("gateway_native_coverage_pct"),
        "programmable_native_coverage_pct": details.get("programmable_native_coverage_pct"),
        "reason_codes": reason_codes,
        "evidence_refs": _build_evidence_refs(claim_ids, claims_by_id),
    }



def build_decision_contract(snapshot: dict[str, Any]) -> dict[str, Any]:
    generated_at_dt = _parse_timestamp(snapshot.get("timestamp"))
    generated_at = _isoformat(generated_at_dt)

    mandate = snapshot.get("mandate", {}) or {}
    dimensions = snapshot.get("dimensions", []) or []
    composite = snapshot.get("composite", {}) or {}
    governance = snapshot.get("portfolio_governance", {}) or {}
    confidence = snapshot.get("confidence", {}) or {}
    evidence = snapshot.get("evidence", {}) or {}
    claims_ledger = snapshot.get("claims_ledger", []) or []
    claims_by_id, claim_ids_by_dimension = _claim_index(claims_ledger)

    payments = next((dimension for dimension in dimensions if dimension.get("dimension") == "payments"), {"details": {}})
    payments_details = payments.get("details", {}) or {}

    review_cadence = str(governance.get("review_cadence") or "72h")
    ttl_seconds = int(RECHECK_TO_TTL_SECONDS.get(review_cadence, RECHECK_TO_TTL_SECONDS["72h"]))
    recheck_at_dt = generated_at_dt + timedelta(seconds=ttl_seconds)
    recheck_at = _isoformat(recheck_at_dt)

    position_size_pct = float(governance.get("position_size_pct") or composite.get("position_size_pct") or 0.0)
    direction = str(composite.get("direction") or "FLAT")
    stance = str(governance.get("stance") or "neutral")
    veto_triggered = bool(governance.get("veto_triggered"))
    confidence_level = str(confidence.get("level") or "low")

    if veto_triggered:
        execution_mode = "blocked"
        decision_action = "block"
    elif stance in {"risk_off", "selective_risk_off"} or direction == "SHORT":
        execution_mode = "defensive_only"
        decision_action = "reduce_risk"
    elif position_size_pct <= 0 or direction == "FLAT":
        execution_mode = "monitor_only"
        decision_action = "monitor"
    else:
        execution_mode = "sized_risk"
        decision_action = "deploy_risk"

    can_open_risk = execution_mode == "sized_risk" and direction == "LONG" and not veto_triggered
    can_add_risk = can_open_risk and stance in {"risk_on", "selective_risk_on"}
    can_reduce_risk = decision_action in {"reduce_risk", "block"}

    must_wait_for, blocking_conditions = _build_wait_conditions(
        composite=composite,
        governance=governance,
        confidence=confidence,
        evidence=evidence,
        payments_details=payments_details,
    )

    reason_codes = _build_reason_codes(
        composite=composite,
        governance=governance,
        confidence=confidence,
        evidence=evidence,
        payments_details=payments_details,
        execution_mode=execution_mode,
    )
    policy_flags = _build_policy_flags(
        governance=governance,
        confidence=confidence,
        evidence=evidence,
        execution_mode=execution_mode,
        payments_details=payments_details,
    )

    escalation_required = veto_triggered or confidence_level == "low" or bool(blocking_conditions)
    escalation_reason = ""
    if escalation_required:
        escalation_reason = str(
            (blocking_conditions or governance.get("risk_triggers") or confidence.get("unknowns") or ["Manual review required"])[0]
        )

    top_level_claim_ids = ["composite-summary", "governance-summary"]
    if veto_triggered:
        top_level_claim_ids.append("governance-veto")
    for driver in _build_driver_blocks(
        dimensions,
        reverse=True,
        claims_by_id=claims_by_id,
        claim_ids_by_dimension=claim_ids_by_dimension,
    ):
        top_level_claim_ids.extend(ref["claim_id"] for ref in driver["evidence_refs"] if ref.get("claim_id"))
    for driver in _build_driver_blocks(
        dimensions,
        reverse=False,
        claims_by_id=claims_by_id,
        claim_ids_by_dimension=claim_ids_by_dimension,
    ):
        top_level_claim_ids.extend(ref["claim_id"] for ref in driver["evidence_refs"] if ref.get("claim_id"))

    summary = (
        f"{composite.get('signal', 'UNKNOWN')} / {stance} / {execution_mode}; "
        f"target {position_size_pct}% with review {review_cadence}"
    )

    return {
        "schema_version": SCHEMA_VERSION,
        "contract_type": CONTRACT_TYPE,
        "decision_id": f"eth-oracle-{generated_at_dt.strftime('%Y%m%dT%H%M%SZ')}",
        "generated_at": generated_at,
        "valid_until": recheck_at,
        "recheck_at": recheck_at,
        "ttl_seconds": ttl_seconds,
        "asset_scope": mandate.get("asset_scope", []),
        "time_horizon": mandate.get("time_horizon", "position"),
        "decision_action": decision_action,
        "signal": composite.get("signal", "UNKNOWN"),
        "direction": direction,
        "stance": stance,
        "execution_mode": execution_mode,
        "confidence": confidence_level,
        "summary": summary,
        "portfolio_action": composite.get("action", "Hold"),
        "can_open_risk": can_open_risk,
        "can_add_risk": can_add_risk,
        "can_reduce_risk": can_reduce_risk,
        "requires_human_approval": confidence_level == "low" or veto_triggered,
        "target_size_pct": position_size_pct,
        "max_size_pct": float(governance.get("max_position_pct") or 0.0),
        "recheck_after": review_cadence,
        "must_wait_for": must_wait_for,
        "blocking_conditions": blocking_conditions,
        "escalation_required": escalation_required,
        "escalation_reason": escalation_reason,
        "reason_codes": reason_codes,
        "policy_flags": policy_flags,
        "evidence_refs": _build_evidence_refs(top_level_claim_ids, claims_by_id),
        "primary_drivers": _build_driver_blocks(
            dimensions,
            reverse=True,
            claims_by_id=claims_by_id,
            claim_ids_by_dimension=claim_ids_by_dimension,
        ),
        "counter_drivers": _build_driver_blocks(
            dimensions,
            reverse=False,
            claims_by_id=claims_by_id,
            claim_ids_by_dimension=claim_ids_by_dimension,
        ),
        "payments": _build_payments_contract(payments, claims_by_id=claims_by_id),
    }
