import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import type { ResourceIndexEntry } from "../state/store.js";
import { Web3StateStore } from "../state/store.js";

type AlertSeverity = "p0" | "p1";

function filterExpired(entries: ResourceIndexEntry[], now = Date.now()): ResourceIndexEntry[] {
  return entries.filter((entry) => {
    if (!entry.expiresAt) return true;
    const expiresAt = Date.parse(entry.expiresAt);
    if (Number.isNaN(expiresAt)) return true;
    return expiresAt > now;
  });
}

export function createWeb3MetricsSnapshotHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return ({ respond }: GatewayRequestHandlerOptions) => {
    try {
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

      respond(true, {
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
      });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}
