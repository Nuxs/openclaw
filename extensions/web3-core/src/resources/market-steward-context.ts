import type {
  StewardApproval,
  StewardBudgetPolicy,
  StewardRiskPolicy,
} from "openclaw/plugin-sdk/steward-policy";
import { loadCoreConfig, loadSessionStoreHelpers, type SessionEntry } from "../core-imports.js";

type SessionStewardState = {
  actorId?: string;
  consumerActorId?: string;
  budgetPolicy?: StewardBudgetPolicy;
  riskPolicy?: StewardRiskPolicy;
  approval?: StewardApproval;
  lastStatus?: string;
  lastOrderId?: string;
  lastResourceId?: string;
  lastLeaseId?: string;
  lastConsentId?: string;
  lastProofId?: string;
  lastDisputeId?: string;
  lastSettlementId?: string;
  growthSummary?: string;
  updatedAt?: number;
};

type SessionEntryWithSteward = SessionEntry & {
  settlement?: {
    orderId?: string;
    payer?: string;
    amount?: string;
    actorId?: string;
  };
  steward?: SessionStewardState;
};

export type ResolvedMarketStewardContext = {
  sessionKey?: string;
  actorId?: string;
  consumerActorId?: string;
  budgetPolicy?: StewardBudgetPolicy;
  riskPolicy?: StewardRiskPolicy;
  approval?: StewardApproval;
  usedStoredIdentity: boolean;
  usedStoredBudgetPolicy: boolean;
  usedStoredRiskPolicy: boolean;
  usedStoredApproval: boolean;
  usedDefaultBudgetPolicy: boolean;
  usedDefaultRiskPolicy: boolean;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function trimApproval(approval?: StewardApproval): StewardApproval | undefined {
  if (!approval) {
    return undefined;
  }
  return {
    approved: approval.approved === true,
    approvalId: asString(approval.approvalId),
    approverId: asString(approval.approverId),
    decidedAt: asString(approval.decidedAt),
    expiresAt: asString(approval.expiresAt),
  };
}

function buildDefaultBudgetPolicy(maxCost?: string): StewardBudgetPolicy {
  const cappedCost = asString(maxCost);
  if (cappedCost) {
    return {
      maxAmount: cappedCost,
      requireApprovalAbove: cappedCost,
      failClosed: true,
    };
  }
  return {
    requireApprovalAbove: "0",
    failClosed: true,
  };
}

function buildDefaultRiskPolicy(): StewardRiskPolicy {
  return {
    maxRiskLevel: "high",
    requireProof: true,
    requireProviderActor: true,
    requireApprovalForHighRisk: true,
    allowUnpriced: false,
    failClosed: true,
  };
}

async function readSessionEntry(sessionKey?: string): Promise<{
  sessionKey?: string;
  entry: SessionEntryWithSteward | null;
}> {
  const trimmedKey = asString(sessionKey);
  if (!trimmedKey) {
    return { entry: null };
  }
  try {
    const cfg = await loadCoreConfig();
    const helpers = await loadSessionStoreHelpers();
    const canonicalKey = helpers.resolveSessionStoreKey({ cfg, sessionKey: trimmedKey });
    const agentId = helpers.resolveSessionAgentId({ sessionKey: canonicalKey, config: cfg });
    const storePath = helpers.resolveStorePath(cfg.session?.store, { agentId });
    let current: SessionEntryWithSteward | null = null;
    await helpers.updateSessionStoreEntry({
      storePath,
      sessionKey: canonicalKey,
      update: async (entry) => {
        current = entry as SessionEntryWithSteward;
        return null;
      },
    });
    return { sessionKey: canonicalKey, entry: current };
  } catch {
    return { sessionKey: trimmedKey, entry: null };
  }
}

export async function resolveMarketStewardContext(params: {
  sessionKey?: string;
  actorId?: string;
  consumerActorId?: string;
  budgetPolicy?: StewardBudgetPolicy;
  riskPolicy?: StewardRiskPolicy;
  approval?: StewardApproval;
  maxCost?: string;
  execute?: boolean;
}): Promise<ResolvedMarketStewardContext> {
  const explicitActorId = asString(params.actorId);
  const explicitConsumerActorId = asString(params.consumerActorId);
  const explicitBudgetPolicy = params.budgetPolicy;
  const explicitRiskPolicy = params.riskPolicy;
  const explicitApproval = trimApproval(params.approval);
  const shouldEnforcePolicies = params.execute === true;

  const { sessionKey, entry } = await readSessionEntry(params.sessionKey);
  const storedSteward = entry?.steward;
  const storedActorId = asString(storedSteward?.actorId) ?? asString(entry?.settlement?.actorId);
  const storedConsumerActorId =
    asString(storedSteward?.consumerActorId) ?? asString(entry?.settlement?.payer);

  const budgetPolicy =
    explicitBudgetPolicy ??
    storedSteward?.budgetPolicy ??
    (shouldEnforcePolicies ? buildDefaultBudgetPolicy(params.maxCost) : undefined);
  const riskPolicy =
    explicitRiskPolicy ??
    storedSteward?.riskPolicy ??
    (shouldEnforcePolicies ? buildDefaultRiskPolicy() : undefined);
  const approval = explicitApproval ?? trimApproval(storedSteward?.approval);

  return {
    sessionKey,
    actorId: explicitActorId ?? storedActorId,
    consumerActorId: explicitConsumerActorId ?? storedConsumerActorId,
    budgetPolicy,
    riskPolicy,
    approval,
    usedStoredIdentity:
      (!explicitActorId && Boolean(storedActorId)) ||
      (!explicitConsumerActorId && Boolean(storedConsumerActorId)),
    usedStoredBudgetPolicy: !explicitBudgetPolicy && Boolean(storedSteward?.budgetPolicy),
    usedStoredRiskPolicy: !explicitRiskPolicy && Boolean(storedSteward?.riskPolicy),
    usedStoredApproval: !explicitApproval && Boolean(storedSteward?.approval),
    usedDefaultBudgetPolicy:
      shouldEnforcePolicies && !explicitBudgetPolicy && !storedSteward?.budgetPolicy,
    usedDefaultRiskPolicy:
      shouldEnforcePolicies && !explicitRiskPolicy && !storedSteward?.riskPolicy,
  };
}

export async function rememberMarketStewardContext(params: {
  sessionKey?: string;
  actorId?: string;
  consumerActorId?: string;
  budgetPolicy?: StewardBudgetPolicy;
  riskPolicy?: StewardRiskPolicy;
  approval?: StewardApproval;
  status?: string;
  orderId?: string;
  resourceId?: string;
  leaseId?: string;
  consentId?: string;
  proofId?: string;
  disputeId?: string;
  settlementId?: string;
  growthSummary?: string;
}): Promise<void> {
  const trimmedKey = asString(params.sessionKey);
  if (!trimmedKey) {
    return;
  }
  try {
    const cfg = await loadCoreConfig();
    const helpers = await loadSessionStoreHelpers();
    const canonicalKey = helpers.resolveSessionStoreKey({ cfg, sessionKey: trimmedKey });
    const agentId = helpers.resolveSessionAgentId({ sessionKey: canonicalKey, config: cfg });
    const storePath = helpers.resolveStorePath(cfg.session?.store, { agentId });

    await helpers.updateSessionStoreEntry({
      storePath,
      sessionKey: canonicalKey,
      update: async (entry) => {
        const current = entry as SessionEntryWithSteward;
        const actorId = asString(params.actorId);
        const consumerActorId = asString(params.consumerActorId);
        const orderId = asString(params.orderId);
        const nextSteward: SessionStewardState = {
          ...(current.steward ?? {}),
          ...(actorId ? { actorId } : {}),
          ...(consumerActorId ? { consumerActorId } : {}),
          ...(params.budgetPolicy ? { budgetPolicy: params.budgetPolicy } : {}),
          ...(params.riskPolicy ? { riskPolicy: params.riskPolicy } : {}),
          ...(params.approval ? { approval: trimApproval(params.approval) } : {}),
          ...(asString(params.status) ? { lastStatus: asString(params.status) } : {}),
          ...(orderId ? { lastOrderId: orderId } : {}),
          ...(asString(params.resourceId) ? { lastResourceId: asString(params.resourceId) } : {}),
          ...(asString(params.leaseId) ? { lastLeaseId: asString(params.leaseId) } : {}),
          ...(asString(params.consentId) ? { lastConsentId: asString(params.consentId) } : {}),
          ...(asString(params.proofId) ? { lastProofId: asString(params.proofId) } : {}),
          ...(asString(params.disputeId) ? { lastDisputeId: asString(params.disputeId) } : {}),
          ...(asString(params.settlementId)
            ? { lastSettlementId: asString(params.settlementId) }
            : {}),
          ...(asString(params.growthSummary)
            ? { growthSummary: asString(params.growthSummary) }
            : {}),
          updatedAt: Date.now(),
        };
        return {
          ...(orderId
            ? {
                settlement: {
                  orderId,
                  payer: consumerActorId ?? current.settlement?.payer,
                  amount: current.settlement?.amount,
                  actorId: actorId ?? current.settlement?.actorId,
                },
              }
            : {}),
          steward: nextSteward,
        } as Partial<SessionEntry>;
      },
    });
  } catch {
    // Best-effort only; steward memory should not break execution.
  }
}
