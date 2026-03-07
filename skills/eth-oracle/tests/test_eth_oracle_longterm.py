from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import eth_oracle_longterm as longterm


class LongtermDecisionContractTest(unittest.TestCase):
    def _state(self) -> dict:
        return {
            "strategy": {
                "entry": {
                    "first_tranche_usd": 500.0,
                    "second_tranche_usd": 500.0,
                    "first_tranche_fng_max": 15,
                    "second_tranche_fng_max": 8,
                    "second_tranche_oracle_score_max": -25,
                    "second_tranche_price_max": 1750.0,
                    "second_tranche_24h_change_max": -15.0,
                    "second_tranche_timeout_days": 30,
                },
                "exit": {
                    "take_profit_prices": [4000.0, 6000.0, 8000.0],
                    "take_profit_sell_fracs": [0.25, 0.25, 0.25],
                    "euphoria_fng_min": 90,
                    "euphoria_days": 7,
                    "euphoria_sell_frac": 0.5,
                },
                "thesis": {"eth_aligned_chains": ["Ethereum", "Base", "Arbitrum"]},
            },
            "position": {"cash_usd": 1000.0, "eth": 0.0},
            "snapshots": [],
            "executed_orders": [],
        }

    def _oracle(self, *, can_open_risk: bool, can_add_risk: bool, confidence: str = "medium") -> dict:
        return {
            "portfolio_governance": {
                "stance": "selective_risk_on" if can_open_risk else "neutral",
                "position_size_pct": 12.5 if can_open_risk else 0.0,
                "veto_triggered": False,
                "veto_reason": None,
                "review_cadence": "72h",
                "risk_triggers": ["Tier 1 stablecoin de-peg or liquidity shock"],
            },
            "confidence": {"level": confidence, "unknowns": ["Need follow-up"]},
            "composite": {"composite_score": 28 if can_open_risk else 0},
            "decision_contract": {
                "decision_action": "deploy_risk" if can_open_risk else "monitor",
                "execution_mode": "sized_risk" if can_open_risk else "monitor_only",
                "can_open_risk": can_open_risk,
                "can_add_risk": can_add_risk,
                "blocking_conditions": [] if can_open_risk else ["Composite remains in the neutral regime"],
                "must_wait_for": [] if can_open_risk else ["composite score to leave the neutral regime"],
                "recheck_after": "72h",
                "escalation_required": not can_open_risk,
                "escalation_reason": "Composite remains in the neutral regime" if not can_open_risk else "",
                "payments": {
                    "rail_health": "strengthening",
                    "adoption_status": "Circle adoption rails broad and programmable",
                },
            },
            "dimensions": [
                {"dimension": "sentiment", "details": {"fear_greed_index": 10}},
                {
                    "dimension": "payments",
                    "score": 30,
                    "details": {
                        "payment_rail_state": "Circle / USDC rails strengthening",
                        "adoption_state": "Circle adoption rails broad and programmable",
                        "usdc_supply_change_30d_pct": 1.2,
                        "eth_aligned_share_pct": 54.1,
                        "eth_aligned_share_30d_pp": 0.8,
                    },
                },
            ],
        }

    def test_recommend_orders_uses_contract_to_allow_entry(self) -> None:
        orders, notes = longterm._recommend_orders(
            state=self._state(),
            oracle=self._oracle(can_open_risk=True, can_add_risk=True),
            price_usd=2200.0,
            price_24h_change_pct=0.0,
            stable=longterm.StablecoinChainStats(total_usd=100.0, chain_usd={"Ethereum": 50.0}, chain_prev_month_usd={"Ethereum": 49.0}),
        )

        self.assertEqual(orders[0]["id"], "entry_tranche_1")
        self.assertTrue(any(note.startswith("Protocol: action=deploy_risk") for note in notes))

    def test_recommend_orders_respects_monitor_only_contract(self) -> None:
        orders, notes = longterm._recommend_orders(
            state=self._state(),
            oracle=self._oracle(can_open_risk=False, can_add_risk=False, confidence="low"),
            price_usd=2200.0,
            price_24h_change_pct=0.0,
            stable=longterm.StablecoinChainStats(total_usd=100.0, chain_usd={"Ethereum": 50.0}, chain_prev_month_usd={"Ethereum": 49.0}),
        )

        self.assertEqual(orders, [])
        self.assertIn("Protocol block: Composite remains in the neutral regime", notes)
        self.assertIn("Entry tranche 1 locked: decision contract does not permit opening risk.", notes)


if __name__ == "__main__":
    unittest.main()
