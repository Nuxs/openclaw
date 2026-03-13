import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { Web3PluginConfig } from "../config.js";
import { loadCallGateway, normalizeGatewayResult, type CallGatewayFn } from "../core-imports.js";
import { formatWeb3GatewayError, formatWeb3GatewayErrorResponse } from "../errors.js";
import type { ResourceIndexEntry } from "../state/store.js";
import { Web3StateStore } from "../state/store.js";

type AlertSeverity = "p0" | "p1";

type X402AutopayMetricEvent = "attempt" | "success" | "failure" | "retry" | "circuit_breaker_trip";

const AUTOPAY_SLIDING_WINDOW_MS = 10 * 60 * 1000;
const AUTOPAY_FAILURE_RATE_THRESHOLD = 0.5;
const AUTOPAY_MIN_ATTEMPTS_IN_WINDOW = 5;
const AUTOPAY_COOLDOWN_MS = 5 * 60 * 1000;

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return numerator / denominator;
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
  const autopayLastCircuitBreakerTripAt = autopayStats.lastCircuitBreakerTripAt;
  const autopaySuccessRate = safeRate(autopaySuccessCount, autopayAttemptCount);

  const windowStart = now - AUTOPAY_SLIDING_WINDOW_MS;
  const attemptInWindow = autopayStats.attemptEvents.filter((entry) => {
    const ts = Date.parse(entry);
    return !Number.isNaN(ts) && ts >= windowStart;
  }).length;
  const failureInWindow = autopayStats.failureEvents.filter((entry) => {
    const ts = Date.parse(entry);
    return !Number.isNaN(ts) && ts >= windowStart;
  }).length;
  const failureRateInWindow = safeRate(failureInWindow, attemptInWindow) ?? 0;
  const cooldownUntilTs = autopayStats.cooldownUntil
    ? Date.parse(autopayStats.cooldownUntil)
    : Number.NaN;
  const cooldownActive = Number.isFinite(cooldownUntilTs) && cooldownUntilTs > now;
  const breakerRateTriggered =
    attemptInWindow >= AUTOPAY_MIN_ATTEMPTS_IN_WINDOW &&
    failureRateInWindow >= AUTOPAY_FAILURE_RATE_THRESHOLD;

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
      triggered: breakerRateTriggered,
      value: failureRateInWindow,
    },
    {
      rule: "x402_autopay_circuit_breaker_trips",
      severity: "p0",
      triggered: cooldownActive,
      value: cooldownActive ? Math.max(0, cooldownUntilTs - now) : 0,
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
          lastTripAt: autopayLastCircuitBreakerTripAt,
          cooldownUntil: autopayStats.cooldownUntil,
          cooldownActive,
        },
        window: {
          windowMs: AUTOPAY_SLIDING_WINDOW_MS,
          attempts: attemptInWindow,
          failures: failureInWindow,
          failureRate: failureRateInWindow,
          minAttempts: AUTOPAY_MIN_ATTEMPTS_IN_WINDOW,
          threshold: AUTOPAY_FAILURE_RATE_THRESHOLD,
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
    discovery: {
      peers: store.getP2pPeers().length,
      identities: store.getDiscoveryIdentityMap().length,
      staleRecords: store.getP2pPeers().filter((p) => {
        const ts = Date.parse(p.lastSeenAt);
        return !Number.isNaN(ts) && now - ts > 24 * 60 * 60 * 1000;
      }).length,
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
      const eventAt = new Date().toISOString();
      const deltaByEvent: Record<
        X402AutopayMetricEvent,
        Parameters<Web3StateStore["updateX402AutopayStats"]>[0]
      > = {
        attempt: { attempts: count, attemptEventAt: eventAt },
        success: { successes: count },
        failure: { failures: count, failureEventAt: eventAt },
        retry: { retryCount: count },
        circuit_breaker_trip: {
          circuitBreakerTrips: count,
          lastCircuitBreakerTripAt: eventAt,
          cooldownUntil: new Date(Date.now() + AUTOPAY_COOLDOWN_MS).toISOString(),
        },
      };
      const stats = store.updateX402AutopayStats(deltaByEvent[event]);

      const now = Date.now();
      const windowStart = now - AUTOPAY_SLIDING_WINDOW_MS;
      const attemptsInWindow = stats.attemptEvents.filter((entry) => {
        const ts = Date.parse(entry);
        return !Number.isNaN(ts) && ts >= windowStart;
      }).length;
      const failuresInWindow = stats.failureEvents.filter((entry) => {
        const ts = Date.parse(entry);
        return !Number.isNaN(ts) && ts >= windowStart;
      }).length;
      const failureRate = safeRate(failuresInWindow, attemptsInWindow) ?? 0;

      let nextStats = stats;
      const cooldownUntilTs = stats.cooldownUntil ? Date.parse(stats.cooldownUntil) : Number.NaN;
      if (
        attemptsInWindow >= AUTOPAY_MIN_ATTEMPTS_IN_WINDOW &&
        failureRate >= AUTOPAY_FAILURE_RATE_THRESHOLD
      ) {
        nextStats = store.updateX402AutopayStats({
          cooldownUntil: new Date(now + AUTOPAY_COOLDOWN_MS).toISOString(),
        });
      } else if (Number.isFinite(cooldownUntilTs) && cooldownUntilTs <= now) {
        nextStats = store.updateX402AutopayStats({ cooldownUntil: undefined });
      }

      respond(true, { stats: nextStats });
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
      let marketStatus: unknown = null;
      let marketStatusError: string | null = null;

      try {
        const callGateway = await loadCallGateway();

        const marketMetricsResponse = await callGateway({
          method: "market.metrics.snapshot",
          params: {},
          timeoutMs: config.brain.timeoutMs,
        });
        const marketMetricsNormalized = normalizeGatewayResult(marketMetricsResponse);
        if (!marketMetricsNormalized.ok) {
          marketError = formatWeb3GatewayError(
            marketMetricsNormalized.error ?? "market metrics unavailable",
          );
        } else {
          market = marketMetricsNormalized.result ?? null;
        }

        const marketStatusResponse = await callGateway({
          method: "market.status.summary",
          params: {},
          timeoutMs: config.brain.timeoutMs,
        });
        const marketStatusNormalized = normalizeGatewayResult(marketStatusResponse);
        if (!marketStatusNormalized.ok) {
          marketStatusError = formatWeb3GatewayError(
            marketStatusNormalized.error ?? "market status unavailable",
          );
        } else {
          marketStatus = marketStatusNormalized.result ?? null;
        }
      } catch (err) {
        marketError = formatWeb3GatewayError(err);
        if (!marketStatusError) {
          marketStatusError = marketError;
        }
      }

      respond(true, {
        web3,
        market,
        marketError,
        marketStatus,
        marketStatusError,
      });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}
