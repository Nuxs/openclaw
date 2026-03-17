import type {
  StewardApproval,
  StewardBudgetPolicy,
  StewardRiskPolicy,
} from "openclaw/plugin-sdk/steward-policy";
import {
  loadCoreConfig,
  loadSessionStoreHelpers,
  loadStewardGrowthRuntimeHelpers,
  type SessionEntry,
} from "../core-imports.js";

type SessionStewardCadence = {
  everyMs?: number;
  label?: string;
  reason?: string;
};

type SessionStewardGrowthJob = {
  jobId?: string;
  enabled?: boolean;
  target?: string;
  nextWakeAt?: string;
};

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
  reflectionBacklog?: string[];
  researchBacklog?: string[];
  heartbeatBacklog?: string[];
  autonomyPosture?: "active" | "conservative" | "guarded" | "tripped";
  cadence?: SessionStewardCadence;
  growthJob?: SessionStewardGrowthJob;
  lastHeartbeatedAt?: string;
  lastReflectedAt?: string;
  lastResearchedAt?: string;
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

function trimStringArray(values?: string[]): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const next: string[] = [];
  for (const entry of values) {
    const trimmed = asString(entry);
    if (trimmed && !next.includes(trimmed)) {
      next.push(trimmed);
    }
  }
  return next.length > 0 ? next : [];
}

function trimCadence(cadence?: SessionStewardCadence): SessionStewardCadence | undefined {
  if (!cadence) {
    return undefined;
  }
  const everyMs =
    typeof cadence.everyMs === "number" && Number.isFinite(cadence.everyMs) && cadence.everyMs > 0
      ? Math.floor(cadence.everyMs)
      : undefined;
  const label = asString(cadence.label);
  const reason = asString(cadence.reason);
  if (everyMs === undefined && !label && !reason) {
    return undefined;
  }
  return {
    ...(everyMs !== undefined ? { everyMs } : {}),
    ...(label ? { label } : {}),
    ...(reason ? { reason } : {}),
  };
}

function trimGrowthJob(job?: SessionStewardGrowthJob): SessionStewardGrowthJob | undefined {
  if (!job) {
    return undefined;
  }
  const next: SessionStewardGrowthJob = {
    ...(asString(job.jobId) ? { jobId: asString(job.jobId) } : {}),
    ...(typeof job.enabled === "boolean" ? { enabled: job.enabled } : {}),
    ...(asString(job.target) ? { target: asString(job.target) } : {}),
    ...(asString(job.nextWakeAt) ? { nextWakeAt: asString(job.nextWakeAt) } : {}),
  };
  return Object.keys(next).length > 0 ? next : undefined;
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
  reflectionBacklog?: string[];
  researchBacklog?: string[];
  heartbeatBacklog?: string[];
  autonomyPosture?: "active" | "conservative" | "guarded" | "tripped";
  cadence?: SessionStewardCadence;
  growthJob?: SessionStewardGrowthJob;
  lastHeartbeatedAt?: string;
  lastReflectedAt?: string;
  lastResearchedAt?: string;
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
          ...(trimStringArray(params.reflectionBacklog)
            ? { reflectionBacklog: trimStringArray(params.reflectionBacklog) }
            : {}),
          ...(trimStringArray(params.researchBacklog)
            ? { researchBacklog: trimStringArray(params.researchBacklog) }
            : {}),
          ...(trimStringArray(params.heartbeatBacklog)
            ? { heartbeatBacklog: trimStringArray(params.heartbeatBacklog) }
            : {}),
          ...(asString(params.autonomyPosture)
            ? {
                autonomyPosture: asString(
                  params.autonomyPosture,
                ) as SessionStewardState["autonomyPosture"],
              }
            : {}),
          ...(trimCadence(params.cadence) ? { cadence: trimCadence(params.cadence) } : {}),
          ...(trimGrowthJob(params.growthJob)
            ? { growthJob: trimGrowthJob(params.growthJob) }
            : {}),
          ...(asString(params.lastHeartbeatedAt)
            ? { lastHeartbeatedAt: asString(params.lastHeartbeatedAt) }
            : {}),
          ...(asString(params.lastReflectedAt)
            ? { lastReflectedAt: asString(params.lastReflectedAt) }
            : {}),
          ...(asString(params.lastResearchedAt)
            ? { lastResearchedAt: asString(params.lastResearchedAt) }
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

    try {
      const runtimeHelpers = await loadStewardGrowthRuntimeHelpers();
      await runtimeHelpers.syncStewardGrowthLoop({ sessionKey: canonicalKey });
    } catch {
      // Best-effort only; runtime synchronization should not break market execution.
    }
  } catch {
    // Best-effort only; steward memory should not break execution.
  }
}
