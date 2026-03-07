#!/usr/bin/env python3
"""
ETH Oracle — Multi-Factor Decision Engine

Thin CLI facade over `oracle_engine/`, preserving the historical import and command
surface for backtests, long-term helpers, and automations.
"""

import argparse
import json
import sys

from oracle_engine import (
    MAX_POSITION_PCT,
    REGIME_FILTER,
    SIGNAL_THRESHOLDS,
    SIZING_EXP,
    TIER_WEIGHTS,
    TRADE_THRESHOLD,
    WEIGHTS,
    _score_behavioral_from_klines,
    _score_onchain_price_signals,
    _score_sentiment_from_components,
    _score_technical_from_klines,
    compute_composite,
    fetch_json,
    fetch_text,
    format_report,
    run_full_analysis,
    score_behavioral,
    score_defi,
    score_macro,
    score_onchain,
    score_sentiment,
    score_technical,
)



def main() -> None:
    parser = argparse.ArgumentParser(description="ETH Oracle — Multi-Factor Decision Engine")
    parser.add_argument("--full", action="store_true", help="Run full analysis (all dimensions)")
    parser.add_argument(
        "--dimension",
        type=str,
        choices=["onchain", "technical", "macro", "sentiment", "defi", "behavioral"],
        help="Run single dimension",
    )
    parser.add_argument("--score-only", action="store_true", help="Output only composite score (integer)")
    parser.add_argument("--json", action="store_true", help="Output full result as JSON")
    args = parser.parse_args()

    if not args.full and not args.dimension:
        args.full = True

    scorers = {
        "onchain": score_onchain,
        "technical": score_technical,
        "macro": score_macro,
        "sentiment": score_sentiment,
        "behavioral": score_behavioral,
        "defi": score_defi,
    }

    if args.dimension:
        result = scorers[args.dimension]()
        if args.json:
            print(json.dumps(result, indent=2, default=str))
        else:
            print(f"\n{result['dimension'].upper()} Score: {result['score']:+d}")
            print(f"Weight: {result['weight']}")
            print("Details:")
            for key, value in result["details"].items():
                print(f"  {key}: {value}")
        return

    snapshot = run_full_analysis(print_progress=True)

    if args.score_only:
        print(snapshot["composite"]["composite_score"])
    elif args.json:
        print(json.dumps(snapshot, indent=2, default=str))
    else:
        report = format_report(
            snapshot["dimensions"],
            snapshot["composite"],
            governance=snapshot.get("portfolio_governance"),
            confidence=snapshot.get("confidence"),
        )
        print(report)
        print("\n[JSON output on stderr for programmatic use]", file=sys.stderr)
        print(json.dumps(snapshot, indent=2, default=str), file=sys.stderr)


if __name__ == "__main__":
    main()
