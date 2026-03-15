import { evaluateBudgetPolicy } from "./budget-policy.js";
import { selectStewardCandidate } from "./provider-selection.js";
import { evaluateRiskPolicy } from "./risk-policy.js";
import type {
  MarketStewardCandidate,
  MarketStewardPlan,
  StewardApproval,
  StewardBudgetPolicy,
  StewardRiskPolicy,
  StewardSelectionPolicy,
} from "./types.js";

export function planMarketStewardPurchase(params: {
  candidates: MarketStewardCandidate[];
  requestedResourceId?: string;
  selectionPolicy?: StewardSelectionPolicy;
  budgetPolicy?: StewardBudgetPolicy;
  riskPolicy?: StewardRiskPolicy;
  approval?: StewardApproval;
  requireBudgetPolicy?: boolean;
  requireRiskPolicy?: boolean;
  now?: Date;
}): MarketStewardPlan {
  const selection = selectStewardCandidate({
    candidates: params.candidates,
    requestedResourceId: params.requestedResourceId,
    policy: params.selectionPolicy,
  });

  if (!selection.ok || !selection.selectedCandidate) {
    return {
      status: "rejected",
      canExecute: false,
      requiresApproval: false,
      selection,
      selectedCandidate: null,
      budget: null,
      risk: null,
    };
  }

  const selectedCandidate = selection.selectedCandidate;
  const budget = evaluateBudgetPolicy({
    quoteAmount: selectedCandidate.estimatedTotal ?? selectedCandidate.priceAmount,
    currency: selectedCandidate.currency ?? undefined,
    policy: params.budgetPolicy,
    approval: params.approval,
    requirePolicy: params.requireBudgetPolicy,
    now: params.now,
  });
  const risk = evaluateRiskPolicy({
    candidate: selectedCandidate,
    policy: params.riskPolicy,
    approval: params.approval,
    requirePolicy: params.requireRiskPolicy,
    now: params.now,
  });

  const requiresApproval = budget.requiresApproval || risk.requiresApproval;
  const status =
    budget.status === "rejected" || risk.status === "rejected"
      ? "rejected"
      : budget.status === "approval_required" || risk.status === "approval_required"
        ? "approval_required"
        : "approved";

  return {
    status,
    canExecute: status === "approved",
    requiresApproval,
    selection,
    selectedCandidate,
    budget,
    risk,
  };
}
