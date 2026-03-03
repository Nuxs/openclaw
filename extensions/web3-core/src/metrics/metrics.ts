import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayError, formatWeb3GatewayErrorResponse } from "../errors.js";
import type { ResourceIndexEntry } from "../state/store.js";
import { Web3StateStore } from "../state/store.js";

type GatewayCallResult = {
  ok?: boolean;
  error?: string;
  result?: unknown;
};

type CallGatewayFn = (opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<unknown>;

type AlertSeverity = "p0" | "p1";

type X402AutopayMetricEvent = "attempt" | "success" | "failure" | "retry" | "circuit_breaker_trip";

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}

async function loadCallGateway(): Promise<CallGatewayFn> {
  try {
    const mod = await import("../../../../src/gateway/call.ts");
    if (typeof mod.callGateway === "function") {
      return mod.callGateway as CallGatewayFn;
    }
  } catch {
    // ignore
  }

  // @ts-expect-error — dist fallback only exists after build; unreachable when src import succeeds
  const mod = await import("../../../../dist/gateway/call.js");
  if (typeof mod.callGateway !== "function") {
    throw new Error("callGateway is not available");
  }
  return mod.callGateway as CallGatewayFn;
}

function normalizeGatewayResult(payload: unknown): {
  ok: boolean;
  result?: unknown;
  error?: string;
} {
  if (payload && typeof payload === "object") {
    const record = payload as GatewayCallResult;
    if (record.ok === false) {
      return { ok: false, error: record.error ?? "gateway call failed" };
    }
    const result = "result" in record ? record.result : payload;
    return { ok: true, result };
  }
  return { ok: true, result: payload };
}

function filterExpired(entries: ResourceIndexEntry[], now = Date.now()): ResourceIndexEntry[] {
  return entries.filter((entry) => {
    if (!entry.expiresAt) return true;
    const expiresAt = Date.parse(entry.expiresAt);
    if (Number.isNaN(expiresAt)) return true;
    return expiresAt > now;
  });
}

function buildWeb3MetricsSnapshot(store: Web3StateStore, config: Web3PluginConfig) {
  const auditEvents = store.readAuditEvents(500);
  const pendingAnchors = store.getPendingTxs();
  const pendingArchives = store.getPendingArchives();
  const pendingSettlements = store.getPendingSettlements();
  const usageRecords = store.listUsageRecords();
  const paymentRequiredRecords = store.listPaymentRequiredRecords();

  const auditByKind = auditEvents.reduce(
    (acc, event) => {
      acc[event.kind] = (acc[event.kind] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const resourceEntries = filterExpired(store.getResourceIndex());
  const resourceByKind: Record<string, number> = {};
  let resourceTotal = 0;
  for (const entry of resourceEntries) {
    for (const resource of entry.resources) {
      resourceTotal += 1;
      resourceByKind[resource.kind] = (resourceByKind[resource.kind] ?? 0) + 1;
    }
  }

  const anchorPending = pendingAnchors.length;
  const archivePending = pendingArchives.length;
  const settlementPending = pendingSettlements.length;
  const now = Date.now();
  const autopaySuccessCount1h = paymentRequiredRecords.filter((record) => {
    const createdAt = Date.parse(record.createdAt);
    if (Number.isNaN(createdAt)) {
      return false;
    }
    return now - createdAt <= 60 * 60 * 1000;
  }).length;

  const autopayStats = store.getX402AutopayStats();
  const autopayAttemptCount = autopayStats.attempts;
  const autopaySuccessCount = autopayStats.successes;
  const autopayFailureCount = autopayStats.failures;
  const autopayRetryCount = autopayStats.retryCount;
  const autopayCircuitBreakerTrips = autopayStats.circuitBreakerTrips;
  const autopaySuccessRate = safeRate(autopaySuccessCount, autopayAttemptCount);

  const alerts: Array<{
    rule: string;
    severity: AlertSeverity;
    triggered: boolean;
    value: number;
  }> = [
    {
      rule: "anchor_pending",
      severity: "p0",
      triggered: anchorPending > 100,
      value: anchorPending,
    },
    {
      rule: "archive_pending",
      severity: "p1",
      triggered: archivePending > 50,
      value: archivePending,
    },
    {
      rule: "settlement_pending",
      severity: "p1",
      triggered: settlementPending > 20,
      value: settlementPending,
    },
    {
      rule: "x402_autopay_failure_rate",
      severity: "p1",
      triggered:
        autopayAttemptCount > 0 && autopaySuccessRate !== null
          ? 1 - autopaySuccessRate > 0.2
          : false,
      value: autopayAttemptCount > 0 && autopaySuccessRate !== null ? 1 - autopaySuccessRate : 0,
    },
    {
      rule: "x402_autopay_circuit_breaker_trips",
      severity: "p0",
      triggered: autopayCircuitBreakerTrips >= 3,
      value: autopayCircuitBreakerTrips,
    },
  ];

  return {
    audit: {
      total: auditEvents.length,
      byKind: auditByKind,
    },
    anchoring: {
      enabled: Boolean(config.chain.privateKey),
      pending: anchorPending,
    },
    archive: {
      provider: config.storage.provider ?? null,
      pending: archivePending,
    },
    settlement: {
      pending: settlementPending,
    },
    x402: {
      autopay: {
        success: {
          count: autopaySuccessCount,
          count1h: autopaySuccessCount1h,
          rate: autopaySuccessRate,
        },
        failure: {
          count: autopayFailureCount,
        },
        retry: {
          count: autopayRetryCount,
        },
        circuitBreaker: {
          trips: autopayCircuitBreakerTrips,
        },
      },
    },
    billing: {
      enabled: config.billing.enabled,
      usageRecords: usageRecords.length,
      creditsUsed: usageRecords.reduce((sum, record) => sum + record.creditsUsed, 0),
    },
    resources: {
      providers: resourceEntries.length,
      total: resourceTotal,
      byKind: resourceByKind,
    },
    alerts,
  };
}

export function createWeb3RecordX402AutopayMetricHandler(
  store: Web3StateStore,
): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      const input = (params ?? {}) as { event?: unknown; count?: unknown };
      const event = input.event;
      if (
        event !== "attempt" &&
        event !== "success" &&
        event !== "failure" &&
        event !== "retry" &&
        event !== "circuit_breaker_trip"
      ) {
        throw new Error("E_INVALID_ARGUMENT: event is invalid");
      }

      const rawCount =
        typeof input.count === "number" && Number.isFinite(input.count) ? input.count : 1;
      const count = Math.max(1, Math.floor(rawCount));
      const deltaByEvent: Record<
        X402AutopayMetricEvent,
        Parameters<Web3StateStore["updateX402AutopayStats"]>[0]
      > = {
        attempt: { attempts: count },
        success: { successes: count },
        failure: { failures: count },
        retry: { retryCount: count },
        circuit_breaker_trip: { circuitBreakerTrips: count },
      };
      const stats = store.updateX402AutopayStats(deltaByEvent[event]);
      respond(true, { stats });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

export function createWeb3MetricsSnapshotHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return ({ respond }: GatewayRequestHandlerOptions) => {
    try {
      respond(true, buildWeb3MetricsSnapshot(store, config));
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

export function createWeb3MonitorSnapshotHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return async ({ respond }: GatewayRequestHandlerOptions) => {
    try {
      const web3 = buildWeb3MetricsSnapshot(store, config);
      let market: unknown = null;
      let marketError: string | null = null;
      try {
        const callGateway = await loadCallGateway();
        const response = await callGateway({
          method: "market.metrics.snapshot",
          params: {},
          timeoutMs: config.brain.timeoutMs,
        });
        const normalized = normalizeGatewayResult(response);
        if (!normalized.ok) {
          marketError = formatWeb3GatewayError(normalized.error ?? "market metrics unavailable");
        } else {
          market = normalized.result ?? null;
        }
      } catch (err) {
        marketError = formatWeb3GatewayError(err);
      }

      respond(true, {
        web3,
        market,
        marketError,
      });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}
