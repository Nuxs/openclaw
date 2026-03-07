from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from oracle_engine.config import WEIGHTS
from oracle_engine.pipeline import build_analysis_snapshot


class DecisionContractTest(unittest.TestCase):
    def _dimension(self, name: str, score: int, details: dict) -> dict:
        return {
            "dimension": name,
            "score": score,
            "weight": WEIGHTS[name],
            "details": details,
            "signal_count": max(1, len(details)),
        }

    def test_snapshot_exposes_contract_and_claims_ledger(self) -> None:
        dimensions = [
            self._dimension("onchain", 10, {"price_change_30d_pct": 8.5}),
            self._dimension("technical", -6, {"price_vs_ma": "Price above MA99"}),
            self._dimension("macro", -12, {"treasury_10y": 4.3}),
            self._dimension("sentiment", 8, {"fear_greed_index": 38}),
            self._dimension("behavioral", -2, {"recency_bias": "cooling"}),
            self._dimension("defi", 11, {"tvl_change_30d_pct": 6.4}),
            self._dimension(
                "payments",
                37,
                {
                    "redeemability_state": "Redeemability intact",
                    "reserve_state": "Reserve transparency fresh and auditable",
                    "issuance_state": "Net issuance accelerating",
                    "adoption_state": "Circle adoption rails broad and programmable",
                    "chain_mix_state": "USDC chain mix balanced",
                    "payment_rail_state": "Circle / USDC rails strengthening",
                    "native_usdc_chain_count": 31,
                    "cctp_native_coverage_pct": 61.29,
                    "gateway_native_coverage_pct": 38.71,
                    "programmable_native_coverage_pct": 61.29,
                    "reserve_report_freshness_days": 7,
                    "usdc_top_chain": "Ethereum",
                },
            ),
        ]

        snapshot = build_analysis_snapshot(dimensions)
        contract = snapshot["decision_contract"]
        claims = snapshot["claims_ledger"]
        claim_ids = {claim["claim_id"] for claim in claims}

        self.assertEqual(contract["schema_version"], "1.0.0")
        self.assertEqual(contract["contract_type"], "investment_decision")
        self.assertIn(contract["decision_action"], {"deploy_risk", "monitor", "reduce_risk", "block"})
        self.assertIn(contract["execution_mode"], {"blocked", "monitor_only", "defensive_only", "sized_risk"})
        self.assertEqual(contract["recheck_after"], snapshot["portfolio_governance"]["review_cadence"])
        self.assertGreaterEqual(contract["ttl_seconds"], 6 * 60 * 60)
        self.assertIn("payments-adoption", claim_ids)
        self.assertGreaterEqual(snapshot["evidence"]["coverage"]["claims_total"], len(claims))
        self.assertIn("PAYMENTS_ADOPTION_BROAD", contract["payments"]["reason_codes"])
        self.assertTrue(snapshot["deliverables"]["principal_ready"])

        refs = []
        refs.extend(contract["evidence_refs"])
        refs.extend(contract["payments"]["evidence_refs"])
        for driver in contract["primary_drivers"] + contract["counter_drivers"]:
            refs.extend(driver["evidence_refs"])
        self.assertTrue(refs)
        for ref in refs:
            self.assertIn(ref["claim_id"], claim_ids)


if __name__ == "__main__":
    unittest.main()
