/**
 * Web3 Status Summary handler — extracted from index.ts to keep the
 * main entry file lean.
 */
import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { AlertLevel, AlertStatus } from "../monitor/types.js";
import { Web3StateStore } from "../state/store.js";

/** @internal exported for testing */
export function resolveBrainAvailability(config: Web3PluginConfig) {
  const brain = config.brain;
  if (!brain.enabled) return null;
  if (!brain.providerId || !brain.defaultModel) return "degraded";
  if (brain.allowlist.length > 0 && !brain.allowlist.includes(brain.defaultModel))
    return "degraded";
  if (brain.protocol !== "openai-compat") return "degraded";
  if (!brain.endpoint?.trim()) return "unavailable";
  return "ok";
}

/** @internal exported for testing */
export function resolveBillingSummary(store: Web3StateStore, config: Web3PluginConfig) {
  if (!config.billing.enabled) {
    return { status: "unbound", credits: 0 } as const;
  }
  const records = store.listUsageRecords();
  const latest = records.reduce(
    (acc, entry) => {
      if (!acc) return entry;
      const accTs = Date.parse(acc.lastActivity);
      const entryTs = Date.parse(entry.lastActivity);
      if (Number.isNaN(entryTs)) return acc;
      if (Number.isNaN(accTs)) return entry;
      return entryTs >= accTs ? entry : acc;
    },
    undefined as undefined | (typeof records)[number],
  );

  const remaining = latest
    ? Math.max(0, latest.creditsQuota - latest.creditsUsed)
    : Math.max(0, config.billing.quotaPerSession);
  const status = remaining <= 0 ? "exhausted" : "active";
  return { status, credits: remaining } as const;
}

function countByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce(
    (acc, item) => {
      const status = typeof item.status === "string" ? item.status : "unknown";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

function filterExpiredIndexEntries<T extends { expiresAt?: string }>(
  entries: T[],
  now = Date.now(),
): T[] {
  return entries.filter((entry) => {
    if (!entry.expiresAt) return true;
    const expiresAt = Date.parse(entry.expiresAt);
    if (Number.isNaN(expiresAt)) return true;
    return expiresAt > now;
  });
}

/** @internal exported for testing */
export function createWeb3StatusSummaryHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return ({ respond }: GatewayRequestHandlerOptions) => {
    const events = store.readAuditEvents(50);
    const pendingAnchors = store.getPendingTxs();
    const pendingArchives = store.getPendingArchives();
    const pendingSettlements = store.getPendingSettlements();

    let disputes: ReturnType<typeof store.getDisputes> = [];
    try {
      disputes = store.getDisputes();
    } catch {
      // Graceful degradation if disputes data is corrupted
    }

    let alerts: ReturnType<typeof store.getAlerts> = [];
    try {
      alerts = store.getAlerts(500);
    } catch {
      // Graceful degradation if alerts data is corrupted
    }
    const lastEvent = events.at(-1);
    const lastArchived = [...events]
      .reverse()
      .find((event) => event.archivePointer?.cid || event.archivePointer?.uri);
    const lastAnchored = [...events].reverse().find((event) => event.chainRef?.tx);
    const archiveReceipt = store.getArchiveReceipt();
    const anchorReceipt = store.getLastAnchorReceipt();
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    const recentCount = events.filter((event) => {
      const ts = Date.parse(event.timestamp);
      return !Number.isNaN(ts) && ts >= cutoffMs;
    }).length;

    const resourceEntries = filterExpiredIndexEntries(store.getResourceIndex());
    const resourceByKind: Record<string, number> = {};
    let resourceTotal = 0;
    for (const entry of resourceEntries) {
      for (const resource of entry.resources ?? []) {
        resourceTotal += 1;
        resourceByKind[resource.kind] = (resourceByKind[resource.kind] ?? 0) + 1;
      }
    }

    const disputeByStatus = countByStatus(disputes);
    const disputeOpen = disputes.filter(
      (entry) => entry.status === "open" || entry.status === "evidence_submitted",
    ).length;
    const disputeInvestigating = disputes.filter(
      (entry) => entry.status === "evidence_submitted",
    ).length;
    const disputeResolved = disputes.filter((entry) => entry.status === "resolved").length;
    const disputeRejected = disputes.filter((entry) => entry.status === "rejected").length;
    const disputeExpired = disputes.filter((entry) => entry.status === "expired").length;

    const alertsByLevel: Record<AlertLevel, number> = {
      [AlertLevel.P0]: 0,
      [AlertLevel.P1]: 0,
      [AlertLevel.P2]: 0,
    };
    for (const alert of alerts) {
      if (alert.level in alertsByLevel) {
        alertsByLevel[alert.level as AlertLevel] += 1;
      }
    }
    const activeAlerts = alerts.filter((alert) => alert.status === AlertStatus.ACTIVE).length;

    const brainEnabled = config.brain.enabled;
    const brainSource = brainEnabled ? "web3/decentralized" : "centralized";
    const brainAvailability = resolveBrainAvailability(config);
    const billingSummary = resolveBillingSummary(store, config);

    const bindings = store.getBindings();
    const identitySummary = {
      siweEnabled: config.identity.allowSiwe,
      bindingsCount: bindings.length,
      bindings: bindings.map((b) => ({
        address: b.address,
        chainId: b.chainId,
        verifiedAt: b.verifiedAt,
        ensName: b.ensName ?? null,
      })),
      primary:
        bindings.length > 0
          ? {
              address: bindings[0].address,
              ensName: bindings[0].ensName ?? null,
            }
          : null,
    };

    respond(true, {
      auditEventsRecent: recentCount,
      auditLastAt: lastEvent?.timestamp ?? null,
      archiveProvider: config.storage.provider ?? null,
      archiveLastCid:
        archiveReceipt?.cid ??
        archiveReceipt?.uri ??
        lastArchived?.archivePointer?.cid ??
        lastArchived?.archivePointer?.uri ??
        null,
      archivePending: pendingArchives.length,
      anchorNetwork: anchorReceipt?.network ?? config.chain.network ?? null,
      anchorLastTx: anchorReceipt?.tx ?? lastAnchored?.chainRef?.tx ?? null,
      pendingAnchors: pendingAnchors.length,
      anchoringEnabled: Boolean(config.chain.privateKey),
      resources: {
        providers: resourceEntries.length,
        total: resourceTotal,
        byKind: resourceByKind,
      },
      disputes: {
        total: disputes.length,
        byStatus: disputeByStatus,
        open: disputeOpen,
        investigating: disputeInvestigating,
        resolved: disputeResolved,
        rejected: disputeRejected,
        expired: disputeExpired,
      },
      alerts: {
        total: alerts.length,
        active: activeAlerts,
        byLevel: alertsByLevel,
      },
      queues: {
        anchors: {
          pending: pendingAnchors.length,
          failed: pendingAnchors.filter((entry) => Boolean(entry.lastError)).length,
        },
        archives: {
          pending: pendingArchives.length,
          failed: pendingArchives.filter((entry) => Boolean(entry.lastError)).length,
        },
        settlements: {
          pending: pendingSettlements.length,
          failed: pendingSettlements.filter((entry) => Boolean(entry.lastError)).length,
        },
      },
      brain: {
        source: brainSource,
        provider: brainEnabled ? config.brain.providerId : null,
        model: brainEnabled ? config.brain.defaultModel : null,
        availability: brainAvailability,
      },
      billing: {
        status: billingSummary.status,
        credits: billingSummary.credits,
      },
      settlement: {
        pending: pendingSettlements.length,
      },
      identity: identitySummary,
    });
  };
}
