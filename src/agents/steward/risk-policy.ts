import { compareRiskLevel, parseMoneyValue, resolveApprovalStatus } from "./shared.js";
import type {
  MarketStewardCandidate,
  StewardApproval,
  StewardRiskDecision,
  StewardRiskLevel,
  StewardRiskPolicy,
} from "./types.js";

function inferRiskLevel(
  candidate: MarketStewardCandidate,
  policy: StewardRiskPolicy | undefined,
): StewardRiskLevel {
  if (!candidate.providerActorId && policy?.requireProviderActor !== false) {
    return "high";
  }
  if (
    (parseMoneyValue(candidate.estimatedTotal) ?? parseMoneyValue(candidate.priceAmount)) === null
  ) {
    return policy?.allowUnpriced ? "medium" : "high";
  }
  if (policy?.requireProof && !candidate.proofRequired) {
    return "high";
  }
  if ((candidate.score ?? 0) < 4) {
    return "high";
  }
  if (!candidate.proofRequired || (candidate.score ?? 0) < 8) {
    return "medium";
  }
  return "low";
}

export function evaluateRiskPolicy(params: {
  candidate: MarketStewardCandidate;
  policy?: StewardRiskPolicy;
  approval?: StewardApproval;
  requirePolicy?: boolean;
  now?: Date;
}): StewardRiskDecision {
  const policy = params.policy;
  const now = params.now ?? new Date();
  const approval = resolveApprovalStatus(params.approval, now);

  if (!policy) {
    return {
      status: params.requirePolicy ? "rejected" : "approved",
      reason: params.requirePolicy ? "risk_policy_missing" : "policy_not_required",
      requiresApproval: false,
      riskLevel: inferRiskLevel(params.candidate, undefined),
      policyApplied: false,
    };
  }

  if (policy.requireProviderActor && !params.candidate.providerActorId) {
    return {
      status: "rejected",
      reason: "provider_missing",
      requiresApproval: false,
      riskLevel: "high",
      policyApplied: true,
    };
  }

  const priced =
    (parseMoneyValue(params.candidate.estimatedTotal) ??
      parseMoneyValue(params.candidate.priceAmount)) !== null;
  if (!priced && policy.allowUnpriced !== true) {
    return {
      status: "rejected",
      reason: "unpriced_resource",
      requiresApproval: false,
      riskLevel: "high",
      policyApplied: true,
    };
  }

  if (policy.requireProof && !params.candidate.proofRequired) {
    return {
      status: "rejected",
      reason: "proof_required",
      requiresApproval: false,
      riskLevel: "high",
      policyApplied: true,
    };
  }

  const riskLevel = inferRiskLevel(params.candidate, policy);
  if (policy.maxRiskLevel && compareRiskLevel(riskLevel, policy.maxRiskLevel) > 0) {
    return {
      status: "rejected",
      reason: "risk_level_exceeded",
      requiresApproval: false,
      riskLevel,
      policyApplied: true,
    };
  }

  const approvalRequired =
    (riskLevel === "medium" && policy.requireApprovalForMediumRisk) ||
    (riskLevel === "high" && policy.requireApprovalForHighRisk);
  if (approvalRequired) {
    if (approval.expired) {
      return {
        status: "approval_required",
        reason: "approval_expired",
        requiresApproval: true,
        riskLevel,
        policyApplied: true,
      };
    }
    if (!approval.approved) {
      return {
        status: "approval_required",
        reason: "approval_required",
        requiresApproval: true,
        riskLevel,
        policyApplied: true,
      };
    }
  }

  return {
    status: "approved",
    reason: "risk_accepted",
    requiresApproval: false,
    riskLevel,
    policyApplied: true,
  };
}
