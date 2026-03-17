import { callGateway } from "../../gateway/call.js";

export type MarketReferenceContext = {
  taskId?: string;
  orderId?: string;
  leaseId?: string;
  proofId?: string;
  acceptanceId?: string;
  settlementId?: string;
  disputeId?: string;
  executionRef?: string;
};

export type MarketLeaseMountSummary =
  | {
      status: "mounted";
      leaseId: string;
      orderId?: string;
      resourceId: string;
      kind?: string;
      serviceCategory?: string | null;
      expiresAt?: string;
    }
  | {
      status: "approval_required";
      orderId?: string;
      consentId?: string;
      resourceId?: string;
    };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function listMarketReferenceEntries(refs?: MarketReferenceContext): Array<[string, string]> {
  if (!refs) {
    return [];
  }
  return [
    ["taskId", refs.taskId],
    ["orderId", refs.orderId],
    ["leaseId", refs.leaseId],
    ["proofId", refs.proofId],
    ["acceptanceId", refs.acceptanceId],
    ["settlementId", refs.settlementId],
    ["disputeId", refs.disputeId],
    ["executionRef", refs.executionRef],
  ].filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].trim().length > 0,
  );
}

export function formatMarketReferenceContext(refs?: MarketReferenceContext): string | undefined {
  const entries = listMarketReferenceEntries(refs);
  if (entries.length === 0) {
    return undefined;
  }
  return `Market references: ${entries.map(([key, value]) => `${key}=${value}`).join(", ")}.`;
}

export function formatMountedMarketLeaseContext(
  mountedLease?: MarketLeaseMountSummary | null,
): string | undefined {
  if (!mountedLease) {
    return undefined;
  }
  if (mountedLease.status === "approval_required") {
    const details = [
      mountedLease.orderId ? `orderId=${mountedLease.orderId}` : undefined,
      mountedLease.consentId ? `consentId=${mountedLease.consentId}` : undefined,
      mountedLease.resourceId ? `resourceId=${mountedLease.resourceId}` : undefined,
    ].filter((entry): entry is string => Boolean(entry));
    return `Market lease not mounted yet: approval is required${details.length > 0 ? ` (${details.join(", ")})` : ""}.`;
  }
  const details = [
    `leaseId=${mountedLease.leaseId}`,
    `resourceId=${mountedLease.resourceId}`,
    mountedLease.kind ? `kind=${mountedLease.kind}` : undefined,
    mountedLease.serviceCategory ? `serviceCategory=${mountedLease.serviceCategory}` : undefined,
    mountedLease.expiresAt ? `expiresAt=${mountedLease.expiresAt}` : undefined,
  ].filter((entry): entry is string => Boolean(entry));
  return `Market lease mounted internally: ${details.join(", ")}. Token stays in runtime only; never print or re-request it.`;
}

export function appendMarketReferenceContext(task: string, refs?: MarketReferenceContext): string {
  const contextLine = formatMarketReferenceContext(refs);
  if (!contextLine) {
    return task;
  }
  return `${task}\n\n${contextLine}`;
}

async function resolveExecutionSnapshot(refs: MarketReferenceContext) {
  if (!refs.orderId && !refs.leaseId && !refs.proofId) {
    return null;
  }
  const response = await callGateway({
    method: "web3.market.execution.status",
    params: {
      orderId: refs.orderId,
      leaseId: refs.leaseId,
      proofId: refs.proofId,
      limit: 10,
    },
    timeoutMs: 15_000,
  });
  return asRecord(response);
}

export async function resolveAndMountLease(
  refs?: MarketReferenceContext,
): Promise<MarketLeaseMountSummary | null> {
  if (!refs) {
    return null;
  }

  let leaseId = asString(refs.leaseId);
  let orderId = asString(refs.orderId);
  let resourceId: string | undefined;
  let kind: string | undefined;
  let serviceCategory: string | null | undefined;
  let expiresAt: string | undefined;

  const shouldResolveExecution = !leaseId && (refs.orderId || refs.proofId);
  const execution = shouldResolveExecution ? await resolveExecutionSnapshot(refs) : null;
  const executionLease = asRecord(execution?.lease);
  const executionResource = asRecord(execution?.resource);
  const executionApproval = asRecord(execution?.approval);

  leaseId = leaseId ?? asString(executionLease?.leaseId);
  orderId = orderId ?? asString(execution?.orderId);
  resourceId = asString(executionResource?.resourceId);
  kind = asString(executionResource?.kind);
  expiresAt = asString(executionLease?.expiresAt);
  serviceCategory =
    executionResource &&
    executionResource.serviceWrapper &&
    typeof executionResource.serviceWrapper === "object"
      ? (asString(asRecord(executionResource.serviceWrapper)?.category) ?? null)
      : undefined;

  if (!leaseId) {
    if (asString(executionApproval?.status) === "approval_required") {
      return {
        status: "approval_required",
        orderId,
        consentId: asString(executionApproval?.consentId),
        resourceId,
      };
    }
    return null;
  }

  const mounted = await callGateway({
    method: "web3.market.lease.mount",
    params: { leaseId },
    timeoutMs: 15_000,
  });
  const payload = asRecord(mounted);
  const mountedResourceId = asString(payload?.resourceId) ?? resourceId;
  if (!mountedResourceId) {
    return null;
  }

  return {
    status: "mounted",
    leaseId,
    orderId: asString(payload?.orderId) ?? orderId,
    resourceId: mountedResourceId,
    kind: asString(payload?.kind) ?? kind,
    serviceCategory:
      payload?.serviceCategory === null
        ? null
        : (asString(payload?.serviceCategory) ?? serviceCategory ?? null),
    expiresAt: asString(payload?.expiresAt) ?? expiresAt,
  };
}
