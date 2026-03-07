import os

WEIGHTS = {
    "onchain": 0.20,
    "technical": 0.25,
    "macro": 0.20,
    "sentiment": 0.15,
    "behavioral": 0.10,
    "defi": 0.05,
    "payments": 0.05,
}

TIER_WEIGHTS = {
    1: 1.0,
    2: 0.8,
    3: 0.3,
}


def _read_env_int(name: str, default: int, *, min_v: int, max_v: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except Exception:
        return default
    return max(min_v, min(max_v, value))



def _read_env_float(name: str, default: float, *, min_v: float, max_v: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = float(raw)
    except Exception:
        return default
    return max(min_v, min(max_v, value))



def _read_env_str(name: str, default: str) -> str:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return str(raw)


TRADE_THRESHOLD = _read_env_int("ETH_ORACLE_TRADE_THRESHOLD", 10, min_v=3, max_v=30)
MAX_POSITION_PCT = _read_env_float("ETH_ORACLE_MAX_POSITION_PCT", 25.0, min_v=0.0, max_v=100.0)
SIZING_EXP = _read_env_float("ETH_ORACLE_SIZING_EXP", 1.0, min_v=0.2, max_v=3.0)
REGIME_FILTER = _read_env_str("ETH_ORACLE_REGIME_FILTER", "").strip().lower() or None



def _build_signal_thresholds(trade_threshold: int) -> list[tuple[int, str, str]]:
    threshold = int(trade_threshold)
    return [
        (60, "STRONG BUY", "Deploy 80-100% of allocated capital"),
        (30, "BUY", "Deploy 40-60% (DCA in)"),
        (threshold, "LEAN BUY", "Deploy 20-30%, tight stops"),
        (-(threshold - 1), "NEUTRAL / HOLD", "No new positions, maintain existing"),
        (-(threshold + 19), "LEAN SELL", "Reduce 20-30%, raise stops"),
        (-(threshold + 49), "SELL", "Reduce 50-70%, hedge with puts"),
        (-100, "STRONG SELL", "Exit 80%+, consider short hedge"),
    ]


SIGNAL_THRESHOLDS = _build_signal_thresholds(TRADE_THRESHOLD)
