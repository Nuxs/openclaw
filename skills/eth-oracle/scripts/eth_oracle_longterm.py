#!/usr/bin/env python3
"""ETH Oracle — Long-term execution helper (4y, small capital)

This script DOES NOT place trades. It produces *actionable* buy/sell instructions
and can optionally record "executed" orders into a local state file for tracking.

Data sources used:
- ETH Oracle JSON output (local script): scripts/eth_oracle.py --json
- Fear & Greed + funding etc (via ETH Oracle sentiment dimension)
- Price (via ETH Oracle + CoinGecko 24h change)
- Stablecoin chain distribution (DefiLlama Stablecoins API)

Typical workflow:
  1) init once
  2) run weekly/daily and follow the printed instructions
  3) if you executed the order, rerun with --apply to record it

Security note: do NOT store exchange keys in this repo.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DEFAULT_STATE_PATH = Path.home() / ".openclaw" / "eth-oracle" / "longterm_state.json"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _read_json_url(url: str, *, timeout_s: int = 20) -> Any:
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": "ETH-Oracle-LongTerm/1.0"})
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        return json.loads(resp.read().decode())


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _save_state(path: Path, state: dict[str, Any]) -> None:
    _ensure_parent(path)
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def _run_eth_oracle_json(*, cwd: Path) -> dict[str, Any]:
    # Use --json to avoid parsing stderr.
    p = subprocess.run(
        [sys.executable, "scripts/eth_oracle.py", "--json"],
        cwd=str(cwd),
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if p.returncode != 0:
        raise RuntimeError(f"eth_oracle.py failed ({p.returncode}): {p.stderr[-400:]}")
    try:
        return json.loads(p.stdout)
    except Exception as e:
        raise RuntimeError(f"Failed to parse eth_oracle.py --json output: {e}")


def _find_dimension(oracle: dict[str, Any], name: str) -> dict[str, Any]:
    for d in oracle.get("dimensions", []):
        if d.get("dimension") == name:
            return d
    raise KeyError(f"Missing dimension: {name}")


def _coingecko_24h_change() -> tuple[float, float]:
    """Return (price_usd, 24h_change_pct).

    CoinGecko may rate-limit (HTTP 429). In that case we return (0, 0) and let
    callers fall back to ETH Oracle's price fields.
    """

    try:
        d = _read_json_url(
            "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true",
            timeout_s=20,
        )
        eth = d.get("ethereum") or {}
        return float(eth.get("usd", 0.0)), float(eth.get("usd_24h_change", 0.0))
    except Exception:
        return 0.0, 0.0


@dataclass(frozen=True)
class StablecoinChainStats:
    total_usd: float
    chain_usd: dict[str, float]
    chain_prev_month_usd: dict[str, float]


def _stablecoin_chain_stats() -> StablecoinChainStats:
    d = _read_json_url("https://stablecoins.llama.fi/stablecoins", timeout_s=25)
    cur: dict[str, float] = {}
    pm: dict[str, float] = {}

    for a in d.get("peggedAssets", []):
        for ch, v in (a.get("chainCirculating") or {}).items():
            cur[ch] = cur.get(ch, 0.0) + float((v.get("current") or {}).get("peggedUSD") or 0.0)
            pm[ch] = pm.get(ch, 0.0) + float((v.get("circulatingPrevMonth") or {}).get("peggedUSD") or 0.0)

    total = float(sum(cur.values()))
    return StablecoinChainStats(total_usd=total, chain_usd=cur, chain_prev_month_usd=pm)


def _pct(n: float, d: float) -> float:
    return 0.0 if d <= 0 else (n / d * 100.0)


def _state_has_exec(state: dict[str, Any], order_id: str) -> bool:
    for o in state.get("executed_orders", []):
        if o.get("id") == order_id:
            return True
    return False


def _state_get_exec(state: dict[str, Any], order_id: str) -> dict[str, Any] | None:
    for o in state.get("executed_orders", []):
        if o.get("id") == order_id:
            return o
    return None


def _append_snapshot(state: dict[str, Any], snap: dict[str, Any]) -> None:
    snaps = list(state.get("snapshots", []))
    snaps.append(snap)
    # keep last ~120 snapshots
    state["snapshots"] = snaps[-120:]


def _append_exec(state: dict[str, Any], order: dict[str, Any]) -> None:
    orders = list(state.get("executed_orders", []))
    orders.append(order)
    state["executed_orders"] = orders


def _get_position_eth(state: dict[str, Any]) -> float:
    return float((state.get("position") or {}).get("eth", 0.0) or 0.0)


def _get_cash_usd(state: dict[str, Any]) -> float:
    return float((state.get("position") or {}).get("cash_usd", 0.0) or 0.0)


def _set_position(state: dict[str, Any], *, cash_usd: float, eth: float) -> None:
    state["position"] = {"cash_usd": round(float(cash_usd), 8), "eth": round(float(eth), 8)}


def _apply_buy(state: dict[str, Any], *, order_id: str, usd: float, price: float, note: str) -> None:
    cash = _get_cash_usd(state)
    eth = _get_position_eth(state)
    usd = min(float(usd), cash)
    eth_qty = 0.0 if price <= 0 else usd / float(price)
    _set_position(state, cash_usd=cash - usd, eth=eth + eth_qty)
    _append_exec(
        state,
        {
            "id": order_id,
            "ts": _utc_now().isoformat(),
            "side": "BUY",
            "usd": round(usd, 2),
            "price": float(price),
            "eth": eth_qty,
            "note": note,
        },
    )


def _apply_sell(state: dict[str, Any], *, order_id: str, eth_qty: float, price: float, note: str) -> None:
    cash = _get_cash_usd(state)
    eth = _get_position_eth(state)
    eth_qty = min(float(eth_qty), eth)
    usd = eth_qty * float(price)
    _set_position(state, cash_usd=cash + usd, eth=eth - eth_qty)
    _append_exec(
        state,
        {
            "id": order_id,
            "ts": _utc_now().isoformat(),
            "side": "SELL",
            "usd": round(usd, 2),
            "price": float(price),
            "eth": eth_qty,
            "note": note,
        },
    )


def cmd_init(args: argparse.Namespace) -> int:
    path = Path(args.state)
    if path.exists() and not args.force:
        print(f"State already exists: {path} (use --force to overwrite)")
        return 2

    budget = float(args.budget_usd)
    first = float(args.first_tranche_usd)
    second = float(args.second_tranche_usd)
    if abs((first + second) - budget) > 0.01:
        print("Invalid config: first_tranche_usd + second_tranche_usd must equal budget_usd")
        return 2

    state: dict[str, Any] = {
        "version": 1,
        "created_at": _utc_now().isoformat(),
        "strategy": {
            "budget_usd": budget,
            "entry": {
                "first_tranche_usd": first,
                "second_tranche_usd": second,
                "first_tranche_fng_max": int(args.first_tranche_fng_max),
                "second_tranche_fng_max": int(args.second_tranche_fng_max),
                "second_tranche_oracle_score_max": int(args.second_tranche_oracle_score_max),
                "second_tranche_price_max": float(args.second_tranche_price_max),
                "second_tranche_24h_change_max": float(args.second_tranche_24h_change_max),
                "second_tranche_timeout_days": int(args.second_tranche_timeout_days),
            },
            "exit": {
                "take_profit_prices": [4000.0, 6000.0, 8000.0],
                "take_profit_sell_fracs": [0.25, 0.25, 0.25],
                "euphoria_fng_min": 90,
                "euphoria_days": 7,
                "euphoria_sell_frac": 0.50,
                "horizon_years": 4,
            },
            "thesis": {
                "eth_aligned_chains": [
                    "Ethereum",
                    "Arbitrum",
                    "Optimism",
                    "Base",
                    "Scroll",
                    "Linea",
                    "Starknet",
                    "zkSync Era",
                    "Polygon zkEVM",
                    "Blast",
                    "Mantle",
                    "Mode",
                    "Zora",
                    "Taiko",
                ]
            },
        },
        "position": {"cash_usd": budget, "eth": 0.0},
        "snapshots": [],
        "executed_orders": [],
    }

    _save_state(path, state)
    print(f"Initialized state: {path}")
    print(f"Budget: ${budget:.2f} (first=${first:.2f}, second=${second:.2f})")
    return 0


def _recommend_orders(
    *,
    state: dict[str, Any],
    oracle: dict[str, Any],
    price_usd: float,
    price_24h_change_pct: float,
    stable: StablecoinChainStats,
) -> tuple[list[dict[str, Any]], list[str]]:
    notes: list[str] = []
    orders: list[dict[str, Any]] = []

    entry = (state.get("strategy") or {}).get("entry") or {}
    thesis = (state.get("strategy") or {}).get("thesis") or {}
    governance = (oracle.get("portfolio_governance") or {})
    confidence = (oracle.get("confidence") or {})

    comp = int((oracle.get("composite") or {}).get("composite_score") or 0)
    sent = _find_dimension(oracle, "sentiment")["details"]
    raw_fng = sent.get("fear_greed_index")
    fng = int(raw_fng) if raw_fng is not None else 50
    stance = str(governance.get("stance") or "neutral")
    veto_triggered = bool(governance.get("veto_triggered"))

    notes.append(
        f"Governance: stance={stance}, confidence={confidence.get('level', 'unknown')}, review={governance.get('review_cadence', '72h')}"
    )
    if veto_triggered:
        notes.append(f"Veto active: {governance.get('veto_reason') or 'Tier 1 risk trigger'}")

    payments = None
    try:
        payments = _find_dimension(oracle, "payments")
    except KeyError:
        payments = None

    payments_score = int((payments or {}).get("score") or 0)
    payments_details = (payments or {}).get("details", {})
    if payments_details and not payments_details.get("error"):
        notes.append(
            "Payments: "
            f"{payments_details.get('payment_rail_state', 'mixed')} | "
            f"USDC 30d {payments_details.get('usdc_supply_change_30d_pct', 'N/A')}% | "
            f"ETH-aligned {payments_details.get('eth_aligned_share_pct', 'N/A')}% "
            f"({payments_details.get('eth_aligned_share_30d_pp', 'N/A')}pp)"
        )
        if payments_score <= -20:
            notes.append("Payments risk: Circle / USDC rail structure is deteriorating; keep entries defensive.")
        tron_share = payments_details.get("tron_share_pct")
        if tron_share is not None and float(tron_share) >= 35.0:
            notes.append("Payments risk: TRON controls an outsized share of stablecoin circulation (>=35%).")
    else:
        # Fallback keeps older state files usable even if the new payments dimension is unavailable.
        eth_aligned = set(thesis.get("eth_aligned_chains") or [])
        eth_cur = sum(stable.chain_usd.get(c, 0.0) for c in eth_aligned)
        eth_pm = sum(stable.chain_prev_month_usd.get(c, 0.0) for c in eth_aligned)
        eth_share = _pct(eth_cur, stable.total_usd)
        eth_share_30d_pp = eth_share - _pct(eth_pm, stable.total_usd)
        tron_share = _pct(stable.chain_usd.get("Tron", 0.0), stable.total_usd)
        sol_share = _pct(stable.chain_usd.get("Solana", 0.0), stable.total_usd)
        notes.append(
            f"Thesis: stablecoin share — ETH-aligned {eth_share:.1f}% (30d {eth_share_30d_pp:+.1f}pp), Tron {tron_share:.1f}%, Solana {sol_share:.1f}%"
        )
        if eth_share_30d_pp <= -1.0:
            notes.append("Thesis risk: ETH-aligned stablecoin share is shrinking meaningfully (30d <= -1.0pp).")
        if tron_share >= 35.0:
            notes.append("Thesis risk: TRON is taking a very large share of stablecoin circulation (>=35%).")

    buying_locked = veto_triggered or stance == "risk_off"

    # Entry tranche 1
    if not _state_has_exec(state, "entry_tranche_1"):
        if buying_locked:
            notes.append("Entry tranche 1 locked: governance is in defensive mode.")
        elif fng <= int(entry.get("first_tranche_fng_max", 15)):
            usd = float(entry.get("first_tranche_usd", 0.0))
            orders.append(
                {
                    "id": "entry_tranche_1",
                    "side": "BUY",
                    "usd": round(usd, 2),
                    "reason": f"F&G={fng} <= {entry.get('first_tranche_fng_max', 15)}",
                }
            )
        else:
            notes.append(
                f"Entry tranche 1 not triggered: F&G={fng} > {entry.get('first_tranche_fng_max', 15)}"
            )

    # Entry tranche 2 (depends on tranche1 timestamp)
    if _state_has_exec(state, "entry_tranche_1") and not _state_has_exec(state, "entry_tranche_2") and not buying_locked:
        t1 = _state_get_exec(state, "entry_tranche_1")
        t1_ts = datetime.fromisoformat(t1["ts"])
        timeout_days = int(entry.get("second_tranche_timeout_days", 30))
        timed_out = (_utc_now() - t1_ts) >= timedelta(days=timeout_days)

        trigger = False
        reasons: list[str] = []

        if comp <= int(entry.get("second_tranche_oracle_score_max", -25)):
            trigger = True
            reasons.append(f"oracle_score={comp} <= {entry.get('second_tranche_oracle_score_max', -25)}")

        if fng <= int(entry.get("second_tranche_fng_max", 8)):
            trigger = True
            reasons.append(f"F&G={fng} <= {entry.get('second_tranche_fng_max', 8)}")

        if price_usd <= float(entry.get("second_tranche_price_max", 1750.0)):
            trigger = True
            reasons.append(f"price=${price_usd:.2f} <= ${entry.get('second_tranche_price_max', 1750.0)}")

        if price_24h_change_pct <= float(entry.get("second_tranche_24h_change_max", -15.0)):
            trigger = True
            reasons.append(f"24h={price_24h_change_pct:.1f}% <= {entry.get('second_tranche_24h_change_max', -15.0)}%")

        if timed_out:
            trigger = True
            reasons.append(f"timeout>={timeout_days}d since tranche1")

        if trigger:
            usd = float(entry.get("second_tranche_usd", 0.0))
            orders.append(
                {
                    "id": "entry_tranche_2",
                    "side": "BUY",
                    "usd": round(usd, 2),
                    "reason": "; ".join(reasons) or "triggered",
                }
            )

    # Exit recommendations (requires tracking position)
    pos_eth = _get_position_eth(state)
    if pos_eth > 0:
        ex = (state.get("strategy") or {}).get("exit") or {}
        prices = list(ex.get("take_profit_prices") or [])
        fracs = list(ex.get("take_profit_sell_fracs") or [])
        for i, tp in enumerate(prices):
            order_id = f"take_profit_{i+1}"
            if price_usd >= float(tp) and not _state_has_exec(state, order_id):
                frac = float(fracs[i]) if i < len(fracs) else 0.25
                orders.append(
                    {
                        "id": order_id,
                        "side": "SELL",
                        "eth": round(pos_eth * frac, 8),
                        "reason": f"price>=${float(tp):.0f} take-profit",
                    }
                )

        # Euphoria exit (requires enough recent snapshots)
        fng_min = int(ex.get("euphoria_fng_min", 90))
        days = int(ex.get("euphoria_days", 7))
        sell_frac = float(ex.get("euphoria_sell_frac", 0.5))
        snaps = list(state.get("snapshots", []))
        since = _utc_now() - timedelta(days=days)
        recent = [s for s in snaps if datetime.fromisoformat(s["ts"]) >= since]
        if len(recent) >= days:
            if all(int(s.get("fng") or 0) >= fng_min for s in recent[-days:]):
                if not _state_has_exec(state, "euphoria_exit"):
                    orders.append(
                        {
                            "id": "euphoria_exit",
                            "side": "SELL",
                            "eth": round(pos_eth * sell_frac, 8),
                            "reason": f"F&G>={fng_min} for ~{days}d",
                        }
                    )

    return orders, notes


def cmd_run(args: argparse.Namespace) -> int:
    state_path = Path(args.state)
    state = _load_state(state_path)
    if not state:
        print(f"Missing state. Run init first. (expected: {state_path})")
        return 2

    # Run oracle & market data
    oracle = _run_eth_oracle_json(cwd=Path(__file__).resolve().parents[1])
    on = _find_dimension(oracle, "onchain")["details"]
    price = float(on.get("price_usd") or 0.0)
    cg_price, cg_24h = _coingecko_24h_change()
    if price <= 0:
        price = cg_price
    # CoinGecko fallback (rate-limited): keep Oracle price, treat 24h change as unknown.
    if cg_price <= 0:
        cg_price = price
        cg_24h = 0.0

    stable = _stablecoin_chain_stats()

    comp = int((oracle.get("composite") or {}).get("composite_score") or 0)
    sent = _find_dimension(oracle, "sentiment")["details"]
    raw_fng = sent.get("fear_greed_index")
    fng = int(raw_fng) if raw_fng is not None else 50
    governance = (oracle.get("portfolio_governance") or {})
    confidence = (oracle.get("confidence") or {})

    snap = {
        "ts": _utc_now().isoformat(),
        "price_usd": price,
        "price_24h_change_pct": cg_24h,
        "composite_score": comp,
        "fng": fng,
        "stance": governance.get("stance", "neutral"),
        "confidence": confidence.get("level", "low"),
    }
    _append_snapshot(state, snap)

    orders, notes = _recommend_orders(
        state=state,
        oracle=oracle,
        price_usd=price,
        price_24h_change_pct=cg_24h,
        stable=stable,
    )

    payments_dimension = next(
        (dimension for dimension in oracle.get("dimensions", []) if dimension.get("dimension") == "payments"),
        {},
    )
    out = {
        "ts": snap["ts"],
        "market": {
            "price_usd": price,
            "price_24h_change_pct": cg_24h,
            "composite_score": comp,
            "fng": fng,
        },
        "payments": payments_dimension,
        "governance": governance,
        "confidence": confidence,
        "position": state.get("position"),
        "notes": notes,
        "recommended_orders": orders,
        "board_brief": ((oracle.get("deliverables") or {}).get("board_brief") or ""),
    }

    if args.format == "json":
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print("═══════════════════════════════════════════════════════")
        print(f"ETH Long-term Exec — {_utc_now().strftime('%Y-%m-%d %H:%M UTC')}")
        print("═══════════════════════════════════════════════════════")
        print(f"Price: ${price:,.2f} (24h {cg_24h:+.2f}%)")
        print(
            f"Oracle composite: {comp:+d}  |  F&G: {fng}  |  stance={governance.get('stance', 'neutral')}  |  confidence={confidence.get('level', 'low')}"
        )
        pos = state.get("position") or {}
        print(f"Position: cash=${pos.get('cash_usd', 0):.2f}, eth={pos.get('eth', 0):.6f}")
        print()
        for n in notes:
            print(f"- {n}")
        print()
        if not orders:
            print("No action recommended.")
        else:
            print("Recommended orders:")
            for o in orders:
                if o["side"] == "BUY":
                    print(f"- BUY  ${o['usd']:.2f}  (id={o['id']})  reason: {o['reason']}")
                else:
                    print(f"- SELL {o['eth']:.6f} ETH (id={o['id']})  reason: {o['reason']}")

        board_brief = ((oracle.get("deliverables") or {}).get("board_brief") or "").strip()
        if board_brief:
            print("\nBoard brief:")
            print(board_brief)

        if args.apply and orders:
            for o in orders:
                if _state_has_exec(state, o["id"]):
                    continue
                if o["side"] == "BUY":
                    _apply_buy(state, order_id=o["id"], usd=float(o["usd"]), price=price, note=o["reason"])
                else:
                    _apply_sell(state, order_id=o["id"], eth_qty=float(o["eth"]), price=price, note=o["reason"])
            print(f"\nApplied {len(orders)} order(s) to state (paper execution).")

    _save_state(state_path, state)
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    state = _load_state(Path(args.state))
    if not state:
        print("No state.")
        return 2
    print(json.dumps({"position": state.get("position"), "executed_orders": state.get("executed_orders")[-20:]}, indent=2, ensure_ascii=False))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="ETH Oracle long-term execution helper")
    ap.add_argument("--state", default=str(DEFAULT_STATE_PATH), help="Path to state JSON")

    sub = ap.add_subparsers(dest="cmd", required=True)

    ap_init = sub.add_parser("init", help="Initialize a local state file")
    ap_init.add_argument("--budget-usd", type=float, default=1000.0)
    ap_init.add_argument("--first-tranche-usd", type=float, default=500.0)
    ap_init.add_argument("--second-tranche-usd", type=float, default=500.0)
    ap_init.add_argument("--first-tranche-fng-max", type=int, default=15)
    ap_init.add_argument("--second-tranche-fng-max", type=int, default=8)
    ap_init.add_argument("--second-tranche-oracle-score-max", type=int, default=-25)
    ap_init.add_argument("--second-tranche-price-max", type=float, default=1750.0)
    ap_init.add_argument("--second-tranche-24h-change-max", type=float, default=-15.0)
    ap_init.add_argument("--second-tranche-timeout-days", type=int, default=30)
    ap_init.add_argument("--force", action="store_true")
    ap_init.set_defaults(func=cmd_init)

    ap_run = sub.add_parser("run", help="Run once and print recommended actions")
    ap_run.add_argument("--format", choices=["text", "json"], default="text")
    ap_run.add_argument("--apply", action="store_true", help="Record recommended orders as executed (paper)")
    ap_run.set_defaults(func=cmd_run)

    ap_status = sub.add_parser("status", help="Show current tracked position and recent executions")
    ap_status.set_defaults(func=cmd_status)

    args = ap.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
