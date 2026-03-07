from __future__ import annotations

from dataclasses import dataclass
from html import unescape
import re
from typing import Any
from urllib.request import Request, urlopen

NATIVE_USDC_CONTRACTS_URL = "https://developers.circle.com/stablecoins/usdc-contract-addresses"
CCTP_SUPPORTED_CHAINS_URL = "https://developers.circle.com/cctp/concepts/supported-chains-and-domains"
GATEWAY_SUPPORTED_BLOCKCHAINS_URL = "https://developers.circle.com/gateway/references/supported-blockchains"

TESTNET_MARKERS = (
    "testnet",
    "sepolia",
    "fuji",
    "devnet",
    "amoy",
    "atlantic",
    "hoodi",
)

CHAIN_NORMALIZATION = {
    "avalanche c-chain": "Avalanche",
    "bnb smart chain": "BNB Smart Chain",
    "ethereum": "Ethereum",
    "op": "Optimism",
    "op mainnet": "Optimism",
    "polygon": "Polygon",
    "polygon pos": "Polygon",
    "xrpl": "XRPL",
    "xrpl (xrp ledger)": "XRPL",
    "zksync era": "zkSync Era",
    "zksync": "zkSync Era",
    "zsync era": "zkSync Era",
}


@dataclass(frozen=True)
class CircleAdoptionSnapshot:
    native_usdc_mainnets: tuple[str, ...]
    native_usdc_testnets: tuple[str, ...]
    cctp_mainnets: tuple[str, ...]
    cctp_testnets: tuple[str, ...]
    cctp_fast_mainnets: tuple[str, ...]
    cctp_forwarding_mainnets: tuple[str, ...]
    gateway_mainnets: tuple[str, ...]
    gateway_testnets: tuple[str, ...]



def _fetch_text(url: str) -> str | None:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urlopen(request, timeout=20) as response:
            return response.read().decode("utf-8", "ignore")
    except Exception:
        return None



def _normalize_chain_name(name: str) -> str:
    cleaned = re.sub(r"\s*\([^)]*\)", "", name).strip()
    lowered = cleaned.lower()
    normalized = CHAIN_NORMALIZATION.get(lowered, cleaned)
    return re.sub(r"\s+", " ", normalized).strip()



def _is_testnet(name: str) -> bool:
    lowered = name.lower()
    return any(marker in lowered for marker in TESTNET_MARKERS)



def _extract_tables(html: str) -> list[list[list[str]]]:
    tables: list[list[list[str]]] = []
    for table_html in re.findall(r"(<table.*?</table>)", html, re.IGNORECASE | re.DOTALL):
        rows: list[list[str]] = []
        for row_html in re.findall(r"<tr>(.*?)</tr>", table_html, re.IGNORECASE | re.DOTALL):
            columns = [
                re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", unescape(cell))).strip()
                for cell in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, re.IGNORECASE | re.DOTALL)
            ]
            if columns:
                rows.append(columns)
        if len(rows) >= 2:
            tables.append(rows)
    return tables



def _sorted_tuple(values: set[str]) -> tuple[str, ...]:
    return tuple(sorted(values))



def _unique_chain_set(names: list[str], *, skip_usyc_only: bool = False) -> set[str]:
    chains: set[str] = set()
    for name in names:
        lowered = name.lower()
        if skip_usyc_only and "usyc only" in lowered:
            continue
        chains.add(_normalize_chain_name(name))
    return chains



def _parse_usdc_contract_snapshot(html: str) -> tuple[set[str], set[str]]:
    native_mainnets: set[str] = set()
    testnets: set[str] = set()
    for table in _extract_tables(html):
        header = " | ".join(table[0])
        chains = [row[0] for row in table[1:] if row]
        if "USDC Mainnet Address" in header:
            native_mainnets |= _unique_chain_set(chains)
        elif "Token Address" in header:
            testnets |= _unique_chain_set(chains)
    return native_mainnets, testnets



def _parse_cctp_snapshot(html: str) -> tuple[set[str], set[str], set[str], set[str]]:
    mainnets: set[str] = set()
    testnets: set[str] = set()
    fast_mainnets: set[str] = set()
    forwarding_mainnets: set[str] = set()

    for table in _extract_tables(html):
        header = table[0]
        if len(header) < 4 or header[0] != "Blockchain" or "Standard transfer" not in header[1]:
            continue
        for row in table[1:]:
            if len(row) < 4:
                continue
            chain_name, standard_enabled, fast_enabled, forwarding_enabled = row[:4]
            if standard_enabled != "✅":
                continue
            if _is_testnet(chain_name):
                testnets.add(_normalize_chain_name(chain_name))
                continue
            if "usyc only" in chain_name.lower():
                continue
            normalized = _normalize_chain_name(chain_name)
            mainnets.add(normalized)
            if fast_enabled == "✅":
                fast_mainnets.add(normalized)
            if forwarding_enabled == "✅":
                forwarding_mainnets.add(normalized)
    return mainnets, testnets, fast_mainnets, forwarding_mainnets



def _parse_gateway_snapshot(html: str) -> tuple[set[str], set[str]]:
    mainnets: set[str] = set()
    testnets: set[str] = set()
    for table in _extract_tables(html):
        header = table[0]
        if len(header) < 2 or header[:2] != ["Blockchain", "Domain"]:
            continue
        chains = [row[0] for row in table[1:] if row]
        if not chains:
            continue
        if sum(1 for chain in chains if _is_testnet(chain)) >= len(chains) / 2:
            testnets |= _unique_chain_set(chains)
        else:
            mainnets |= _unique_chain_set(chains)
    return mainnets, testnets



def fetch_circle_adoption_snapshot() -> CircleAdoptionSnapshot | None:
    usdc_html = _fetch_text(NATIVE_USDC_CONTRACTS_URL)
    cctp_html = _fetch_text(CCTP_SUPPORTED_CHAINS_URL)
    gateway_html = _fetch_text(GATEWAY_SUPPORTED_BLOCKCHAINS_URL)

    if not any((usdc_html, cctp_html, gateway_html)):
        return None

    native_mainnets, native_testnets = _parse_usdc_contract_snapshot(usdc_html or "")
    cctp_mainnets, cctp_testnets, cctp_fast_mainnets, cctp_forwarding_mainnets = _parse_cctp_snapshot(cctp_html or "")
    gateway_mainnets, gateway_testnets = _parse_gateway_snapshot(gateway_html or "")

    return CircleAdoptionSnapshot(
        native_usdc_mainnets=_sorted_tuple(native_mainnets),
        native_usdc_testnets=_sorted_tuple(native_testnets),
        cctp_mainnets=_sorted_tuple(cctp_mainnets),
        cctp_testnets=_sorted_tuple(cctp_testnets),
        cctp_fast_mainnets=_sorted_tuple(cctp_fast_mainnets),
        cctp_forwarding_mainnets=_sorted_tuple(cctp_forwarding_mainnets),
        gateway_mainnets=_sorted_tuple(gateway_mainnets),
        gateway_testnets=_sorted_tuple(gateway_testnets),
    )



def _pct(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator * 100.0



def _key_chain_list(chains: set[str]) -> list[str]:
    priority = [
        "Ethereum",
        "Base",
        "Optimism",
        "Arbitrum",
        "Solana",
        "Avalanche",
        "Polygon",
        "Starknet",
        "Unichain",
        "World Chain",
        "Sui",
        "XRPL",
    ]
    picked = [chain for chain in priority if chain in chains]
    return picked[:8]



def _describe_native_coverage_state(native_count: int) -> str:
    if native_count >= 25:
        return "Native USDC coverage broad"
    if native_count >= 18:
        return "Native USDC coverage substantial"
    if native_count >= 10:
        return "Native USDC coverage moderate"
    return "Native USDC coverage limited"



def _describe_cctp_state(*, coverage_pct: float | None, fast_coverage_pct: float | None, eth_aligned_count: int) -> str:
    if coverage_pct is None or coverage_pct <= 0:
        return "CCTP coverage unavailable"
    if coverage_pct >= 55 and (fast_coverage_pct or 0.0) >= 25 and eth_aligned_count >= 5:
        return "CCTP broad across core native USDC rails"
    if coverage_pct >= 40:
        return "CCTP available across major USDC rails"
    return "CCTP coverage present but uneven"



def _describe_gateway_state(*, coverage_pct: float | None, eth_aligned_count: int) -> str:
    if coverage_pct is None or coverage_pct <= 0:
        return "Gateway coverage unavailable"
    if coverage_pct >= 30 and eth_aligned_count >= 4:
        return "Gateway unified balance live on core rails"
    if coverage_pct >= 15:
        return "Gateway live on selected USDC rails"
    return "Gateway coverage narrow"



def _describe_adoption_state(*, native_count: int, combined_coverage_pct: float | None, eth_aligned_count: int) -> str:
    if native_count >= 25 and (combined_coverage_pct or 0.0) >= 55 and eth_aligned_count >= 5:
        return "Circle adoption rails broad and programmable"
    if native_count >= 18 and (combined_coverage_pct or 0.0) >= 40:
        return "Circle adoption rails broadening"
    if (combined_coverage_pct or 0.0) > 0:
        return "Circle adoption rails present but uneven"
    return "Circle adoption rails limited"



def score_circle_adoption(
    *,
    snapshot: CircleAdoptionSnapshot | None,
    eth_aligned_payment_chains: tuple[str, ...],
) -> tuple[int | None, dict[str, Any]]:
    if snapshot is None:
        return None, {}

    native_mainnets = set(snapshot.native_usdc_mainnets)
    if not native_mainnets:
        return None, {}

    cctp_mainnets = native_mainnets & set(snapshot.cctp_mainnets)
    gateway_mainnets = native_mainnets & set(snapshot.gateway_mainnets)
    cctp_fast_mainnets = cctp_mainnets & set(snapshot.cctp_fast_mainnets)
    cctp_forwarding_mainnets = cctp_mainnets & set(snapshot.cctp_forwarding_mainnets)
    combined_mainnets = cctp_mainnets | gateway_mainnets

    eth_aligned = {_normalize_chain_name(chain) for chain in eth_aligned_payment_chains}
    native_eth_aligned = native_mainnets & eth_aligned
    cctp_eth_aligned = cctp_mainnets & eth_aligned
    gateway_eth_aligned = gateway_mainnets & eth_aligned
    combined_eth_aligned = combined_mainnets & eth_aligned

    native_count = len(native_mainnets)
    cctp_count = len(cctp_mainnets)
    cctp_fast_count = len(cctp_fast_mainnets)
    cctp_forwarding_count = len(cctp_forwarding_mainnets)
    gateway_count = len(gateway_mainnets)
    combined_count = len(combined_mainnets)

    cctp_coverage_pct = _pct(cctp_count, native_count)
    cctp_fast_coverage_pct = _pct(cctp_fast_count, native_count)
    gateway_coverage_pct = _pct(gateway_count, native_count)
    combined_coverage_pct = _pct(combined_count, native_count)
    eth_aligned_native_coverage_pct = _pct(len(native_eth_aligned), len(eth_aligned))
    eth_aligned_combined_coverage_pct = _pct(len(combined_eth_aligned), len(eth_aligned))

    score = 0
    if native_count >= 25:
        score += 15
    elif native_count >= 18:
        score += 8
    else:
        score -= 10

    if cctp_coverage_pct is not None:
        if cctp_coverage_pct >= 60:
            score += 12
        elif cctp_coverage_pct >= 45:
            score += 6
        elif cctp_coverage_pct < 20:
            score -= 8

    if cctp_fast_coverage_pct is not None:
        if cctp_fast_coverage_pct >= 25:
            score += 6
        elif cctp_fast_coverage_pct >= 10:
            score += 3
        elif cctp_fast_coverage_pct == 0:
            score -= 2

    if gateway_coverage_pct is not None:
        if gateway_coverage_pct >= 40:
            score += 12
        elif gateway_coverage_pct >= 25:
            score += 6
        elif gateway_coverage_pct == 0:
            score -= 8

    if combined_coverage_pct is not None:
        if combined_coverage_pct >= 60:
            score += 10
        elif combined_coverage_pct >= 45:
            score += 5
        elif combined_coverage_pct < 25:
            score -= 5

    if len(combined_eth_aligned) >= 6:
        score += 10
    elif len(combined_eth_aligned) >= 4:
        score += 5
    elif len(combined_eth_aligned) <= 1:
        score -= 5

    native_state = _describe_native_coverage_state(native_count)
    cctp_state = _describe_cctp_state(
        coverage_pct=cctp_coverage_pct,
        fast_coverage_pct=cctp_fast_coverage_pct,
        eth_aligned_count=len(cctp_eth_aligned),
    )
    gateway_state = _describe_gateway_state(
        coverage_pct=gateway_coverage_pct,
        eth_aligned_count=len(gateway_eth_aligned),
    )
    adoption_state = _describe_adoption_state(
        native_count=native_count,
        combined_coverage_pct=combined_coverage_pct,
        eth_aligned_count=len(combined_eth_aligned),
    )

    details: dict[str, Any] = {
        "circle_native_usdc_source": NATIVE_USDC_CONTRACTS_URL,
        "circle_cctp_source": CCTP_SUPPORTED_CHAINS_URL,
        "circle_gateway_source": GATEWAY_SUPPORTED_BLOCKCHAINS_URL,
        "adoption_evidence_tier": 1,
        "native_usdc_chain_count": native_count,
        "native_usdc_testnet_count": len(snapshot.native_usdc_testnets),
        "cctp_chain_count": cctp_count,
        "cctp_testnet_count": len(snapshot.cctp_testnets),
        "cctp_fast_chain_count": cctp_fast_count,
        "cctp_forwarding_chain_count": cctp_forwarding_count,
        "gateway_chain_count": gateway_count,
        "gateway_testnet_count": len(snapshot.gateway_testnets),
        "cctp_native_coverage_pct": round(cctp_coverage_pct, 2) if cctp_coverage_pct is not None else None,
        "cctp_fast_native_coverage_pct": round(cctp_fast_coverage_pct, 2) if cctp_fast_coverage_pct is not None else None,
        "gateway_native_coverage_pct": round(gateway_coverage_pct, 2) if gateway_coverage_pct is not None else None,
        "programmable_native_coverage_pct": round(combined_coverage_pct, 2) if combined_coverage_pct is not None else None,
        "eth_aligned_native_coverage_pct": round(eth_aligned_native_coverage_pct, 2)
        if eth_aligned_native_coverage_pct is not None
        else None,
        "eth_aligned_programmable_coverage_pct": round(eth_aligned_combined_coverage_pct, 2)
        if eth_aligned_combined_coverage_pct is not None
        else None,
        "adoption_key_chains": _key_chain_list(native_mainnets),
        "native_usdc_coverage_state": native_state,
        "cctp_state": cctp_state,
        "gateway_state": gateway_state,
        "adoption_state": adoption_state,
    }

    return max(-100, min(100, score)), details
