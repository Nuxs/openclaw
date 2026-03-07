from .config import (
    MAX_POSITION_PCT,
    REGIME_FILTER,
    SIGNAL_THRESHOLDS,
    SIZING_EXP,
    TRADE_THRESHOLD,
)



def check_tier1_veto(dimensions: list[dict]) -> tuple[bool, str]:
    """Return `(is_vetoed, reason)` for Tier 1 risks."""
    for dimension in dimensions:
        details = dimension.get("details", {})
        if dimension.get("dimension") == "onchain":
            ath_change_pct = float(details.get("ath_change_pct") or 0)
            if ath_change_pct < -90:
                return True, "Extreme Tier 1 on-chain deviation (>90% below ATH proxy)"

            stablecoin_depeg = details.get("stablecoin_depeg")
            if stablecoin_depeg is not None and float(stablecoin_depeg) <= 0.95:
                return True, "Tier 1 stablecoin de-peg trigger"

        if dimension.get("dimension") == "macro":
            regulatory_ban = details.get("regulatory_ban")
            if regulatory_ban:
                return True, str(regulatory_ban)

    return False, ""



def compute_composite(dimensions: list[dict]) -> dict:
    weighted_sum = 0.0
    total_weight = 0.0
    agreement_bullish = 0
    agreement_bearish = 0

    is_vetoed, veto_reason = check_tier1_veto(dimensions)

    for dimension in dimensions:
        score = float(dimension.get("score", 0))
        weight = float(dimension.get("weight", 0))
        weighted_sum += score * weight
        total_weight += weight
        if score >= TRADE_THRESHOLD:
            agreement_bullish += 1
        elif score <= -TRADE_THRESHOLD:
            agreement_bearish += 1

    composite = int(weighted_sum / total_weight) if total_weight > 0 else 0
    if is_vetoed:
        composite = -100
        signal = "STRONG SELL"
        action = f"VETO TRIGGERED: {veto_reason}. Exit all positions immediately."
    else:
        composite = max(-100, min(100, composite))
        signal = "UNKNOWN"
        action = ""
        for threshold, candidate_signal, candidate_action in SIGNAL_THRESHOLDS:
            if composite >= threshold:
                signal = candidate_signal
                action = candidate_action
                break

    total_dimensions = len(dimensions)
    max_agreement = max(agreement_bullish, agreement_bearish)
    agreement_ratio = (max_agreement / total_dimensions) if total_dimensions > 0 else 0

    if total_dimensions >= 3 and agreement_ratio >= 0.8:
        confidence = "HIGH"
    elif total_dimensions >= 2 and agreement_ratio >= 0.5:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    if composite >= TRADE_THRESHOLD:
        direction = "LONG"
    elif composite <= -TRADE_THRESHOLD:
        direction = "SHORT"
    else:
        direction = "FLAT"

    if REGIME_FILTER == "ma99":
        technical = next((dimension for dimension in dimensions if dimension.get("dimension") == "technical"), None)
        ma99 = None
        try:
            ma99 = float((technical or {}).get("details", {}).get("MA99"))
        except Exception:
            ma99 = None

        if ma99 and "current_price" in (technical or {}).get("details", {}):
            price = float((technical or {}).get("details", {}).get("current_price", 0))
            if direction == "LONG" and price < ma99:
                direction = "FLAT"
            elif direction == "SHORT" and price > ma99:
                direction = "FLAT"

    if direction == "FLAT":
        position_pct = 0.0
    else:
        abs_score = abs(composite)
        base_pct = ((abs_score / 100) ** SIZING_EXP) * MAX_POSITION_PCT
        confidence_multiplier = {"HIGH": 1.0, "MEDIUM": 0.7, "LOW": 0.4}[confidence]
        position_pct = round(base_pct * confidence_multiplier, 1)

    position_pct = min(position_pct, MAX_POSITION_PCT)

    return {
        "composite_score": composite,
        "signal": signal,
        "action": action,
        "confidence": confidence,
        "agreement": f"{max_agreement}/{total_dimensions} dimensions agree",
        "agreement_count": max_agreement,
        "agreement_ratio": round(agreement_ratio, 4),
        "position_size_pct": position_pct,
        "direction": direction,
        "veto": veto_reason if is_vetoed else "None",
        "veto_triggered": is_vetoed,
        "veto_reason": veto_reason or None,
    }



def build_portfolio_governance(dimensions: list[dict], composite: dict) -> dict:
    score = int(composite.get("composite_score") or 0)
    confidence = str(composite.get("confidence") or "LOW").lower()
    veto_triggered = bool(composite.get("veto_triggered"))

    if veto_triggered or score <= -60:
        stance = "risk_off"
    elif score <= -10:
        stance = "selective_risk_off"
    elif score < 10:
        stance = "neutral"
    elif score < 60:
        stance = "selective_risk_on"
    else:
        stance = "risk_on"

    if confidence == "low" and stance == "risk_on":
        stance = "selective_risk_on"

    review_cadence = "7d"
    if veto_triggered or abs(score) >= 50:
        review_cadence = "24h"
    elif abs(score) >= 20 or confidence == "low":
        review_cadence = "72h"

    risk_triggers = [
        "Tier 1 stablecoin de-peg or liquidity shock",
        "Major US/EU regulatory action against core market structure",
        "FOMC / CPI / major geopolitical escalation window",
    ]

    invalidation_conditions = [
        "Composite score crosses back into the opposite regime",
        "Primary macro driver reverses materially",
        "Key thesis is contradicted by Tier 1 evidence",
    ]

    technical = next((dimension for dimension in dimensions if dimension.get("dimension") == "technical"), None)
    volume_ratio = float((technical or {}).get("details", {}).get("volume_ratio") or 0)
    if volume_ratio > 2:
        risk_triggers.append("Realized volatility spike (>2x average volume)")
        if review_cadence == "7d":
            review_cadence = "72h"

    return {
        "stance": stance,
        "position_size_pct": float(composite.get("position_size_pct") or 0.0),
        "max_position_pct": float(MAX_POSITION_PCT),
        "veto_triggered": veto_triggered,
        "veto_reason": composite.get("veto_reason"),
        "review_cadence": review_cadence,
        "risk_triggers": risk_triggers,
        "invalidation_conditions": invalidation_conditions,
    }
