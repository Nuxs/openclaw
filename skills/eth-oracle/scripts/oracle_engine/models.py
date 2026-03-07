from typing import TypedDict


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


class DeliverablesBlock(TypedDict):
    research_report: str
    investment_memo: str
    board_brief: str
