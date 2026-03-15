export type StewardDecisionStatus = "approved" | "approval_required" | "rejected";

export type StewardApproval = {
  approved: boolean;
  approvalId?: string;
  approverId?: string;
  decidedAt?: string;
  expiresAt?: string;
};

export type StewardBudgetPolicy = {
  currency?: string;
  maxAmount?: string;
  remainingDailyAmount?: string;
  requireApprovalAbove?: string;
  failClosed?: boolean;
};

export type StewardRiskLevel = "low" | "medium" | "high";

export type StewardRiskPolicy = {
  maxRiskLevel?: StewardRiskLevel;
  requireProof?: boolean;
  requireProviderActor?: boolean;
  requireApprovalForMediumRisk?: boolean;
  requireApprovalForHighRisk?: boolean;
  allowUnpriced?: boolean;
  failClosed?: boolean;
};

export type StewardSelectionStrategy = "best_score" | "lowest_price" | "proof_first";

export type StewardSelectionPolicy = {
  strategy?: StewardSelectionStrategy;
  maxCandidates?: number;
  preferProof?: boolean;
};

export type MarketStewardCandidate = {
  resourceId: string;
  offerId?: string;
  providerActorId?: string;
  label?: string | null;
  kind?: string | null;
  score?: number | null;
  proofRequired?: boolean;
  proofTypes?: string[];
  estimatedTotal?: string | number | null;
  priceAmount?: string | number | null;
  currency?: string | null;
};

export type StewardBudgetReason =
  | "policy_not_required"
  | "budget_policy_missing"
  | "amount_missing"
  | "currency_mismatch"
  | "budget_exceeded"
  | "daily_budget_exceeded"
  | "approval_required"
  | "approval_expired"
  | "within_budget";

export type StewardRiskReason =
  | "policy_not_required"
  | "risk_policy_missing"
  | "provider_missing"
  | "proof_required"
  | "unpriced_resource"
  | "risk_level_exceeded"
  | "approval_required"
  | "approval_expired"
  | "risk_accepted";

export type StewardSelectionReason = "selected" | "requested_resource_missing" | "no_candidates";

export type StewardBudgetDecision = {
  status: StewardDecisionStatus;
  reason: StewardBudgetReason;
  requiresApproval: boolean;
  amount?: number;
  currency?: string;
  policyApplied: boolean;
};

export type StewardRiskDecision = {
  status: StewardDecisionStatus;
  reason: StewardRiskReason;
  requiresApproval: boolean;
  riskLevel: StewardRiskLevel;
  policyApplied: boolean;
};

export type StewardSelectionDecision = {
  ok: boolean;
  reason: StewardSelectionReason;
  strategy: StewardSelectionStrategy;
  selectedCandidate: MarketStewardCandidate | null;
  consideredCandidates: MarketStewardCandidate[];
};

export type MarketStewardPlan = {
  status: StewardDecisionStatus;
  canExecute: boolean;
  requiresApproval: boolean;
  selection: StewardSelectionDecision;
  selectedCandidate: MarketStewardCandidate | null;
  budget: StewardBudgetDecision | null;
  risk: StewardRiskDecision | null;
};
