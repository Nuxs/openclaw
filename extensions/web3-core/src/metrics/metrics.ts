import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayError } from "../errors.js";
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

export function createWeb3MetricsSnapshotHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return ({ respond }: GatewayRequestHandlerOptions) => {
    try {
      respond(true, buildWeb3MetricsSnapshot(store, config));
    } catch (err) {
      respond(false, { error: formatWeb3GatewayError(err) });
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
      respond(false, { error: formatWeb3GatewayError(err) });
    }
  };
}
