import sys
import time
from datetime import datetime, timezone
from typing import Any

from .config import TRADE_THRESHOLD
from .governance import build_portfolio_governance, compute_composite
from .renderers import build_deliverables
from .scoring import (
    score_behavioral,
    score_defi,
    score_macro,
    score_onchain,
    score_payments,
    score_sentiment,
    score_technical,
)



def get_scorers() -> dict[str, Any]:
    return {
        "onchain": score_onchain,
        "technical": score_technical,
        "macro": score_macro,
        "sentiment": score_sentiment,
        "behavioral": score_behavioral,
        "defi": score_defi,
        "payments": score_payments,
    }



def _source_registry() -> dict[str, dict[str, Any]]:
    return {
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



def _collect_unknowns(dimensions: list[dict]) -> list[str]:
    unknowns: list[str] = []
    for dimension in dimensions:
        details = dimension.get("details", {})
        error = details.get("error")
        note = details.get("note")
        if error:
            unknowns.append(f"{dimension['dimension']}: {error}")
        elif note and isinstance(note, str) and note not in unknowns:
            unknowns.append(f"{dimension['dimension']}: {note}")
    if not unknowns:
        unknowns.append("No major data gap detected, but regime shifts can outrun model history.")
    return unknowns



def _collect_counterarguments(dimensions: list[dict], composite: dict) -> list[str]:
    direction = composite.get("direction", "FLAT")
    if direction == "LONG":
        opposing = sorted(dimensions, key=lambda item: item.get("score", 0))[:2]
    elif direction == "SHORT":
        opposing = sorted(dimensions, key=lambda item: item.get("score", 0), reverse=True)[:2]
    else:
        opposing = sorted(dimensions, key=lambda item: abs(item.get("score", 0)), reverse=True)[:2]

    counterarguments: list[str] = []
    for dimension in opposing:
        score = int(dimension.get("score", 0))
        if direction == "LONG" and score >= 0:
            continue
        if direction == "SHORT" and score <= 0:
            continue
        details = dimension.get("details", {})
        key = "counter-signal present"
        if details:
            for preferred_key in (
                "payment_rail_state",
                "redeemability_state",
                "reserve_state",
                "issuance_state",
                "adoption_state",
                "chain_mix_state",
                "price_vs_ma",
                "weekly_structure",
                "note",
                "error",
            ):
                if preferred_key in details:
                    key = details[preferred_key]
                    break
            else:
                for value in details.values():
                    if isinstance(value, (str, int, float)) and value not in {True, False}:
                        key = value
                        break
        counterarguments.append(f"{dimension['dimension']} pushes against the base case: {key}")

    if not counterarguments:
        counterarguments.append("Cross-asset macro transmission can still overpower the current base case.")
    return counterarguments



def build_mandate() -> dict[str, Any]:
    return {
        "asset_scope": ["ETH", "stablecoins", "payments", "macro"],
        "time_horizon": "position",
        "mode": ["research", "decision", "brief", "automation"],
    }



def build_evidence_summary(dimensions: list[dict]) -> dict[str, Any]:
    registry = _source_registry()
    tier_summary = {
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

    return {
        "policy": "tiered-source-weighting",
        "tier_summary": tier_summary,
        "coverage": {
            "dimensions_scored": scored,
            "dimensions_total": len(dimensions),
            "dimensions_missing": [d["dimension"] for d in dimensions if d.get("details", {}).get("error")],
        },
        "warnings": warnings,
    }



def build_confidence(dimensions: list[dict], composite: dict) -> dict[str, Any]:
    active_dimensions = [dimension for dimension in dimensions if not dimension.get("details", {}).get("error")]
    agreement_ratio = float(composite.get("agreement_ratio") or 0)
    veto_triggered = bool(composite.get("veto_triggered"))

    if veto_triggered:
        level = "high"
        summary = "Tier 1 veto has priority over softer cross-signals."
    elif len(active_dimensions) >= 5 and agreement_ratio >= 0.66:
        level = "high"
        summary = "Evidence coverage is broad and cross-dimension agreement is strong."
    elif len(active_dimensions) >= 4 and agreement_ratio >= 0.5:
        level = "medium"
        summary = "The balance of evidence is usable, but the transmission path is not fully settled."
    else:
        level = "low"
        summary = "Coverage or agreement is limited; treat the conclusion as provisional."

    return {
        "level": level,
        "summary": summary,
        "unknowns": _collect_unknowns(dimensions),
        "counterarguments": _collect_counterarguments(dimensions, composite),
    }



def build_analysis_snapshot(dimensions: list[dict]) -> dict[str, Any]:
    timestamp = datetime.now(timezone.utc).isoformat()
    composite = compute_composite(dimensions)
    composite["timestamp"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    evidence = build_evidence_summary(dimensions)
    confidence = build_confidence(dimensions, composite)
    governance = build_portfolio_governance(dimensions, composite)

    snapshot = {
        "timestamp": timestamp,
        "mandate": build_mandate(),
        "dimensions": dimensions,
        "composite": composite,
        "evidence": evidence,
        "confidence": confidence,
        "portfolio_governance": governance,
    }
    snapshot["deliverables"] = build_deliverables(snapshot)
    return snapshot



def run_full_analysis(*, print_progress: bool = True) -> dict[str, Any]:
    if print_progress:
        print("\n🔮 ETH Oracle — Gathering signals...\n", file=sys.stderr)

    dimensions: list[dict] = []
    scorers = get_scorers()
    for name, scorer in scorers.items():
        if print_progress:
            print(f"  Scoring {name}...", file=sys.stderr)
        try:
            result = scorer()
            dimensions.append(result)
            if print_progress:
                print(f"  ✓ {name}: {result['score']:+d}", file=sys.stderr)
        except Exception as error:
            if print_progress:
                print(f"  ✗ {name}: Error — {error}", file=sys.stderr)
            dimensions.append(
                {
                    "dimension": name,
                    "score": 0,
                    "weight": 0 if name == "sentiment" and TRADE_THRESHOLD > 0 else 0,
                    "details": {"error": str(error)},
                    "signal_count": 0,
                }
            )
        time.sleep(0.3)

    return build_analysis_snapshot(dimensions)
