import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  MarketDispute,
  MarketExecutionSummaryView,
  MarketExecutionTraceView,
  MarketLease,
} from "../types.ts";
import { normalizeGatewayPayload } from "./normalize.ts";

type MarketExecutionState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  hello?: unknown;
  marketLeases: MarketLease[];
  marketDisputes: MarketDispute[];
  marketExecutionLoading: boolean;
  marketExecutionError: string | null;
  marketExecutions: MarketExecutionSummaryView[];
};

type ExecutionTarget = {
  orderId: string;
  leaseId: string | null;
  lastTouchedAtMs: number;
};

const MAX_EXECUTIONS = 6;

export async function loadMarketExecutions(state: MarketExecutionState) {
  if (!state.client || !state.connected || state.marketExecutionLoading) {
    return;
  }

  state.marketExecutionLoading = true;
  state.marketExecutionError = null;

  try {
    if (!hasExecutionMethod(state.hello)) {
      state.marketExecutions = [];
      state.marketExecutionError =
        "Execution summary API 未就绪：缺少 web3.market.execution.status。请升级 web3-core 后重试。";
      return;
    }

    const targets = buildExecutionTargets(state.marketLeases, state.marketDisputes, MAX_EXECUTIONS);
    if (targets.length === 0) {
      state.marketExecutions = [];
      return;
    }

    const responses = await Promise.allSettled(
      targets.map((target) =>
        state.client!.request(
          "web3.market.execution.status",
          target.leaseId ? { leaseId: target.leaseId } : { orderId: target.orderId },
        ),
      ),
    );

    const executions: MarketExecutionSummaryView[] = [];
    const failures: string[] = [];
    for (const response of responses) {
      if (response.status === "rejected") {
        failures.push(String(response.reason));
        continue;
      }
      const summary = normalizeExecutionSummary(response.value);
      if (summary) {
        executions.push(summary);
      }
    }

    state.marketExecutions = executions.toSorted(
      (left, right) => toTimestampMs(right.lastUpdatedAt) - toTimestampMs(left.lastUpdatedAt),
    );
    if (failures.length > 0) {
      state.marketExecutionError = `部分 execution 摘要加载失败（${failures.length}/${targets.length}）。`;
    }
  } finally {
    state.marketExecutionLoading = false;
  }
}

function hasExecutionMethod(hello: unknown): boolean {
  const methods = (hello as { features?: { methods?: unknown } } | undefined)?.features?.methods;
  if (!Array.isArray(methods)) {
    return true;
  }
  return methods.includes("web3.market.execution.status");
}

function buildExecutionTargets(
  leases: MarketLease[],
  disputes: MarketDispute[],
  limit: number,
): ExecutionTarget[] {
  const targets = new Map<string, ExecutionTarget>();

  for (const lease of leases) {
    const orderId = lease.orderId?.trim();
    if (!orderId) {
      continue;
    }
    const next: ExecutionTarget = {
      orderId,
      leaseId: lease.leaseId,
      lastTouchedAtMs: toTimestampMs(lease.issuedAt),
    };
    targets.set(orderId, next);
  }

  for (const dispute of disputes) {
    const orderId = dispute.orderId?.trim();
    if (!orderId) {
      continue;
    }
    const current = targets.get(orderId);
    const disputeTouchedAtMs = toTimestampMs(dispute.resolvedAt ?? dispute.openedAt);
    if (!current) {
      targets.set(orderId, {
        orderId,
        leaseId: null,
        lastTouchedAtMs: disputeTouchedAtMs,
      });
      continue;
    }
    current.lastTouchedAtMs = Math.max(current.lastTouchedAtMs, disputeTouchedAtMs);
  }

  return [...targets.values()]
    .toSorted((left, right) => right.lastTouchedAtMs - left.lastTouchedAtMs)
    .slice(0, limit);
}

function normalizeExecutionSummary(payload: unknown): MarketExecutionSummaryView | null {
  const result = normalizeGatewayPayload<Record<string, unknown>>(payload);
  if (!result) {
    return null;
  }

  const order = asRecord(result.order);
  const offer = asRecord(result.offer);
  const resource = asRecord(result.resource);
  const lease = asRecord(result.lease);
  const delivery = asRecord(result.delivery);
  const proof = asRecord(result.proof);
  const proofSummary = asRecord(proof?.summary);
  const acceptance = asRecord(result.acceptance);
  const settlement = asRecord(result.settlement);
  const dispute = asRecord(result.dispute);
  const orderId = asString(result.orderId) ?? asString(order?.orderId);
  if (!orderId) {
    return null;
  }

  const trace = Array.isArray(result.trace)
    ? result.trace
        .map((entry) => normalizeTraceEntry(entry))
        .filter((entry): entry is MarketExecutionTraceView => Boolean(entry))
    : [];

  const lastUpdatedAt = latestTimestamp([
    asString(order?.updatedAt),
    asString(settlement?.releasedAt),
    asString(settlement?.refundedAt),
    asString(settlement?.lockedAt),
    asString(dispute?.resolvedAt),
    asString(dispute?.openedAt),
    asString(proof?.submittedAt),
    asString(delivery?.issuedAt),
    asString(lease?.issuedAt),
    trace[0]?.timestamp,
  ]);

  return {
    orderId,
    leaseId: asString(lease?.leaseId) ?? null,
    resourceId: asString(resource?.resourceId) ?? null,
    resourceLabel: asString(resource?.label) ?? null,
    providerActorId: asString(offer?.sellerId) ?? null,
    buyerId: asString(order?.buyerId) ?? null,
    executionStatus: asString(result.executionStatus) ?? "unknown",
    acceptanceStatus: asString(acceptance?.status) ?? null,
    deliveryStatus: asString(delivery?.status) ?? null,
    proofId: asString(proof?.proofId) ?? null,
    proofStatus: asString(proof?.status) ?? null,
    proofType: asString(proofSummary?.type) ?? null,
    settlementStatus: asString(settlement?.status) ?? null,
    settlementAmount: asScalarString(settlement?.amount),
    releasedAmount: asScalarString(settlement?.releasedAmount),
    disputeStatus: asString(dispute?.status) ?? null,
    currency: asString(offer?.currency) ?? asString(asRecord(resource?.price)?.currency) ?? null,
    lastUpdatedAt,
    trace,
  };
}

function normalizeTraceEntry(value: unknown): MarketExecutionTraceView | null {
  const entry = asRecord(value);
  const id = asString(entry?.id);
  const kind = asString(entry?.kind);
  const refId = asString(entry?.refId);
  const timestamp = asString(entry?.timestamp);
  if (!id || !kind || !refId || !timestamp) {
    return null;
  }
  return {
    id,
    kind,
    refId,
    actor: asString(entry?.actor) ?? null,
    timestamp,
    detailSummary: summarizeTraceDetails(entry?.details),
  };
}

function summarizeTraceDetails(value: unknown): string | null {
  const details = asRecord(value);
  if (!details) {
    return null;
  }
  const interestingKeys = [
    "status",
    "reason",
    "message",
    "type",
    "approvalId",
    "resourceId",
    "proofId",
  ];
  const summary = interestingKeys
    .map((key) => {
      const entry = details[key];
      if (typeof entry !== "string" || entry.trim().length === 0) {
        return null;
      }
      return `${key}: ${entry}`;
    })
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 2);
  return summary.length > 0 ? summary.join(" · ") : null;
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const timestamps = values.filter((value): value is string => Boolean(value));
  if (timestamps.length === 0) {
    return null;
  }
  return (
    timestamps.toSorted((left, right) => toTimestampMs(right) - toTimestampMs(left))[0] ?? null
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asScalarString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return asString(value);
}

function toTimestampMs(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
