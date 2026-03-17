import {
  planMarketStewardPurchase,
  type MarketStewardCandidate,
  type MarketStewardPlan,
  type StewardApproval,
  type StewardBudgetPolicy,
  type StewardRiskPolicy,
  type StewardSelectionPolicy,
} from "openclaw/plugin-sdk/steward-policy";
import type { MarketResource } from "./resources.js";
import { resolveServiceWrapper } from "./service-wrapper.js";
import type { ConsentApprovalDecision } from "./types.js";

export type MarketProviderReputationSnapshot = {
  score: number;
  signals: string[];
};

export type MarketStewardRiskPolicy = StewardRiskPolicy & {
  minProviderScore?: number;
  blockedSignals?: string[];
};

export type MarketStewardPolicyInput = {
  selectionPolicy?: StewardSelectionPolicy;
  budgetPolicy?: StewardBudgetPolicy;
  riskPolicy?: MarketStewardRiskPolicy;
  approval?: StewardApproval;
  requireBudgetPolicy?: boolean;
  requireRiskPolicy?: boolean;
};

export type ProviderDecision = ConsentApprovalDecision & {
  score?: number;
  signals?: string[];
  blockedSignals?: string[];
  minProviderScore?: number;
};

export type MarketStewardPolicyDecision = {
  status: "approved" | "approval_required" | "rejected";
  canExecute: boolean;
  requiresApproval: boolean;
  candidate: MarketStewardCandidate;
  plan: MarketStewardPlan;
  providerDecision: ProviderDecision;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRiskLevel(value: unknown): "low" | "medium" | "high" | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const list = value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
  return list.length > 0 ? [...new Set(list)] : undefined;
}

function toApproval(raw: unknown): StewardApproval | undefined {
  const input = asRecord(raw);
  if (!input) {
    return undefined;
  }
  return {
    approved: input.approved === true,
    approvalId: asString(input.approvalId),
    approverId: asString(input.approverId),
    decidedAt: asString(input.decidedAt),
    expiresAt: asString(input.expiresAt),
  };
}

function toSelectionPolicy(raw: unknown): StewardSelectionPolicy | undefined {
  const input = asRecord(raw);
  if (!input) {
    return undefined;
  }
  const strategy = asString(input.strategy);
  return {
    strategy:
      strategy === "best_score" || strategy === "lowest_price" || strategy === "proof_first"
        ? strategy
        : undefined,
    maxCandidates: asNumber(input.maxCandidates),
    preferProof: asBoolean(input.preferProof),
  };
}

function toBudgetPolicy(raw: unknown): StewardBudgetPolicy | undefined {
  const input = asRecord(raw);
  if (!input) {
    return undefined;
  }
  return {
    currency: asString(input.currency),
    maxAmount: asString(input.maxAmount),
    remainingDailyAmount: asString(input.remainingDailyAmount ?? input.maxDailySpend),
    requireApprovalAbove: asString(input.requireApprovalAbove),
    failClosed: asBoolean(input.failClosed),
  };
}

function toRiskPolicy(raw: unknown): MarketStewardRiskPolicy | undefined {
  const input = asRecord(raw);
  if (!input) {
    return undefined;
  }
  return {
    maxRiskLevel: asRiskLevel(input.maxRiskLevel),
    requireProof: asBoolean(input.requireProof),
    requireProviderActor: asBoolean(input.requireProviderActor),
    requireApprovalForMediumRisk: asBoolean(input.requireApprovalForMediumRisk),
    requireApprovalForHighRisk: asBoolean(input.requireApprovalForHighRisk),
    allowUnpriced: asBoolean(input.allowUnpriced),
    failClosed: asBoolean(input.failClosed),
    minProviderScore: asNumber(input.minProviderScore ?? input.minReputation),
    blockedSignals: parseStringList(input.blockedSignals),
  };
}

function multiplyDecimalString(amount: string, quantity: number): string | null {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const total = parsed * quantity;
  return total.toFixed(6).replace(/\.0+$|(?<=\.\d*?)0+$/g, "");
}

function toCandidate(params: {
  resource: MarketResource;
  quantity: number;
  reputation?: MarketProviderReputationSnapshot;
}): MarketStewardCandidate {
  const { resource, quantity, reputation } = params;
  const serviceWrapper = resolveServiceWrapper({
    serviceSchema: resource.serviceSchema,
    serviceWrapper: resource.serviceWrapper,
  });
  const proofTypes = serviceWrapper?.proof.families ?? [];
  return {
    resourceId: resource.resourceId,
    offerId: resource.offerId,
    providerActorId: resource.providerActorId,
    label: resource.label,
    kind: resource.kind,
    score:
      typeof reputation?.score === "number"
        ? Number((reputation.score / 10).toFixed(2))
        : undefined,
    proofRequired: serviceWrapper?.proof.required ?? proofTypes.length > 0,
    proofTypes,
    estimatedTotal: multiplyDecimalString(resource.price.amount, quantity),
    priceAmount: resource.price.amount,
    currency: resource.price.currency,
  };
}

function toProviderDecision(params: {
  policy?: MarketStewardRiskPolicy;
  reputation?: MarketProviderReputationSnapshot;
}): ProviderDecision {
  const score = params.reputation?.score;
  const signals = params.reputation?.signals ?? [];
  const blockedSignals = params.policy?.blockedSignals ?? [];

  if (params.policy?.minProviderScore !== undefined && typeof score === "number") {
    if (score < params.policy.minProviderScore) {
      return {
        status: "rejected",
        reason: "provider_reputation_below_threshold",
        policyApplied: true,
        score,
        signals,
        minProviderScore: params.policy.minProviderScore,
      };
    }
  }

  if (blockedSignals.length > 0) {
    const matched = signals.filter((signal) => blockedSignals.includes(signal));
    if (matched.length > 0) {
      return {
        status: "rejected",
        reason: "provider_signal_blocked",
        policyApplied: true,
        score,
        signals,
        blockedSignals: matched,
      };
    }
  }

  return {
    status: "approved",
    reason: "provider_allowed",
    policyApplied: Boolean(
      params.policy?.minProviderScore !== undefined || blockedSignals.length > 0,
    ),
    score,
    signals,
    minProviderScore: params.policy?.minProviderScore,
    blockedSignals,
  };
}

export function parseMarketStewardPolicyInput(
  input: Record<string, unknown>,
): MarketStewardPolicyInput | undefined {
  const selectionPolicy = toSelectionPolicy(input.selectionPolicy);
  const budgetPolicy = toBudgetPolicy(input.budgetPolicy);
  const riskPolicy = toRiskPolicy(input.riskPolicy);
  const approval = toApproval(input.approval);
  if (!selectionPolicy && !budgetPolicy && !riskPolicy && !approval) {
    return undefined;
  }
  return {
    selectionPolicy,
    budgetPolicy,
    riskPolicy,
    approval,
  };
}

export function evaluateMarketStewardPolicy(params: {
  resource: MarketResource;
  quantity?: number;
  policy?: MarketStewardPolicyInput;
  reputation?: MarketProviderReputationSnapshot;
}): MarketStewardPolicyDecision {
  const quantity = Math.max(1, Math.floor(params.quantity ?? 1));
  const candidate = toCandidate({
    resource: params.resource,
    quantity,
    reputation: params.reputation,
  });
  const plan = planMarketStewardPurchase({
    candidates: [candidate],
    requestedResourceId: params.resource.resourceId,
    selectionPolicy: params.policy?.selectionPolicy,
    budgetPolicy: params.policy?.budgetPolicy,
    riskPolicy: params.policy?.riskPolicy,
    approval: params.policy?.approval,
    requireBudgetPolicy: params.policy?.requireBudgetPolicy,
    requireRiskPolicy: params.policy?.requireRiskPolicy,
  });
  const providerDecision = toProviderDecision({
    policy: params.policy?.riskPolicy,
    reputation: params.reputation,
  });
  const status =
    plan.status === "rejected" || providerDecision.status === "rejected"
      ? "rejected"
      : plan.status === "approval_required"
        ? "approval_required"
        : "approved";
  return {
    status,
    canExecute: status === "approved",
    requiresApproval: plan.requiresApproval,
    candidate,
    plan,
    providerDecision,
  };
}
