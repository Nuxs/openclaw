from typing import Any, TypedDict


class ConfidenceBlock(TypedDict):
    level: str
    summary: str
    unknowns: list[str]
    counterarguments: list[str]


class PortfolioGovernanceBlock(TypedDict):
    stance: str
    position_size_pct: float
    max_position_pct: float
    veto_triggered: bool
    veto_reason: str | None
    review_cadence: str
    risk_triggers: list[str]
    invalidation_conditions: list[str]


class EvidenceReferenceBlock(TypedDict):
    claim_id: str
    dimension: str
    tier: int
    source: str
    freshness: str
    status: str


class EvidenceClaimBlock(TypedDict):
    claim_id: str
    dimension: str
    claim: str
    claim_type: str
    tier: int
    source: str
    observed_at: str
    freshness: str
    status: str
    supports: list[str]
    notes: str


class DriverBlock(TypedDict):
    dimension: str
    score: int
    reason_code: str
    summary: str
    evidence_refs: list[EvidenceReferenceBlock]


class PaymentsDecisionBlock(TypedDict):
    score: int
    rail_health: str
    redeemability_status: str
    reserve_status: str
    issuance_status: str
    adoption_status: str
    native_usdc_chain_count: Any
    cctp_native_coverage_pct: Any
    gateway_native_coverage_pct: Any
    programmable_native_coverage_pct: Any
    reason_codes: list[str]
    evidence_refs: list[EvidenceReferenceBlock]


class DecisionContractBlock(TypedDict):
    schema_version: str
    contract_type: str
    decision_id: str
    generated_at: str
    valid_until: str
    recheck_at: str
    ttl_seconds: int
    asset_scope: list[str]
    time_horizon: str
    decision_action: str
    signal: str
    direction: str
    stance: str
    execution_mode: str
    confidence: str
    summary: str
    portfolio_action: str
    can_open_risk: bool
    can_add_risk: bool
    can_reduce_risk: bool
    requires_human_approval: bool
    target_size_pct: float
    max_size_pct: float
    recheck_after: str
    must_wait_for: list[str]
    blocking_conditions: list[str]
    escalation_required: bool
    escalation_reason: str
    reason_codes: list[str]
    policy_flags: list[str]
    evidence_refs: list[EvidenceReferenceBlock]
    primary_drivers: list[DriverBlock]
    counter_drivers: list[DriverBlock]
    payments: PaymentsDecisionBlock


class DeliverablesBlock(TypedDict):
    research_report: str
    investment_memo: str
    board_brief: str
    principal_ready: str
