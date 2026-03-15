import { parseMoneyValue, resolveApprovalStatus } from "./shared.js";
import type { StewardApproval, StewardBudgetDecision, StewardBudgetPolicy } from "./types.js";

export function evaluateBudgetPolicy(params: {
  quoteAmount?: unknown;
  currency?: string | null;
  policy?: StewardBudgetPolicy;
  approval?: StewardApproval;
  requirePolicy?: boolean;
  now?: Date;
}): StewardBudgetDecision {
  const amount = parseMoneyValue(params.quoteAmount);
  const currency = params.currency ?? undefined;
  const policy = params.policy;
  const now = params.now ?? new Date();
  const approval = resolveApprovalStatus(params.approval, now);

  if (!policy) {
    return {
      status: params.requirePolicy ? "rejected" : "approved",
      reason: params.requirePolicy ? "budget_policy_missing" : "policy_not_required",
      requiresApproval: false,
      amount: amount ?? undefined,
      currency,
      policyApplied: false,
    };
  }

  if (amount === null) {
    return {
      status: policy.failClosed === false ? "approved" : "rejected",
      reason: policy.failClosed === false ? "within_budget" : "amount_missing",
      requiresApproval: false,
      currency,
      policyApplied: true,
    };
  }

  if (policy.currency && currency && policy.currency !== currency) {
    return {
      status: "rejected",
      reason: "currency_mismatch",
      requiresApproval: false,
      amount,
      currency,
      policyApplied: true,
    };
  }

  const maxAmount = parseMoneyValue(policy.maxAmount);
  if (maxAmount !== null && amount > maxAmount) {
    return {
      status: "rejected",
      reason: "budget_exceeded",
      requiresApproval: false,
      amount,
      currency,
      policyApplied: true,
    };
  }

  const remainingDailyAmount = parseMoneyValue(policy.remainingDailyAmount);
  if (remainingDailyAmount !== null && amount > remainingDailyAmount) {
    return {
      status: "rejected",
      reason: "daily_budget_exceeded",
      requiresApproval: false,
      amount,
      currency,
      policyApplied: true,
    };
  }

  const approvalThreshold = parseMoneyValue(policy.requireApprovalAbove);
  if (approvalThreshold !== null && amount > approvalThreshold) {
    if (approval.expired) {
      return {
        status: "approval_required",
        reason: "approval_expired",
        requiresApproval: true,
        amount,
        currency,
        policyApplied: true,
      };
    }
    if (!approval.approved) {
      return {
        status: "approval_required",
        reason: "approval_required",
        requiresApproval: true,
        amount,
        currency,
        policyApplied: true,
      };
    }
  }

  return {
    status: "approved",
    reason: "within_budget",
    requiresApproval: false,
    amount,
    currency,
    policyApplied: true,
  };
}
