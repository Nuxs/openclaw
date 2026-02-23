import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import type { MarketLeaseStatus } from "../resources.js";
import type { Dispute } from "../types.js";
import { requireOptionalIsoTimestamp, requireLimit } from "../validators.js";
import { assertAccess, formatGatewayErrorResponse, requireOptionalAddress } from "./_shared.js";

type ReputationInput = {
  providerActorId?: string;
  resourceId?: string;
  since?: string;
  until?: string;
  limit?: number;
};

type ReputationSummary = {
  providerActorId?: string;
  resourceId?: string;
  score: number;
  signals: string[];
  leases: {
    total: number;
    byStatus: Record<MarketLeaseStatus, number>;
  };
  disputes: {
    total: number;
    byStatus: Record<string, number>;
  };
  ledger: {
    totalCost: string;
    currency: string;
  };
};

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countByStatus(disputes: Dispute[]): Record<string, number> {
  return disputes.reduce<Record<string, number>>((acc, entry) => {
    const status = entry.status ?? "unknown";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

function buildSignals(params: {
  totalLeases: number;
  revoked: number;
  expired: number;
  disputes: number;
}): string[] {
  const signals: string[] = [];
  if (params.totalLeases === 0) {
    signals.push("insufficient_data");
    return signals;
  }
  const disputeRate = params.disputes / params.totalLeases;
  const revokeRate = params.revoked / params.totalLeases;
  const expireRate = params.expired / params.totalLeases;
  if (disputeRate > 0.2) signals.push("high_dispute_rate");
  if (revokeRate > 0.3) signals.push("high_revoke_rate");
  if (expireRate > 0.3) signals.push("high_expire_rate");
  return signals;
}

function computeScore(params: {
  totalLeases: number;
  revoked: number;
  expired: number;
  disputes: number;
}): number {
  if (params.totalLeases === 0) return 50;
  const disputeRate = params.disputes / params.totalLeases;
  const revokeRate = params.revoked / params.totalLeases;
  const expireRate = params.expired / params.totalLeases;
  const penalty = disputeRate * 40 + revokeRate * 20 + expireRate * 10;
  return clampScore(100 - penalty);
}

export function createReputationSummaryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown> & ReputationInput;
      const providerActorId = requireOptionalAddress(input, "providerActorId");
      const resourceId = typeof input.resourceId === "string" ? input.resourceId.trim() : undefined;
      const since = requireOptionalIsoTimestamp(input, "since");
      const until = requireOptionalIsoTimestamp(input, "until");
      const limit = requireLimit(input, "limit", 200, 1000);

      const leases = store.listLeases({ providerActorId, resourceId, limit });
      const leaseCounts: Record<MarketLeaseStatus, number> = {
        lease_active: 0,
        lease_revoked: 0,
        lease_expired: 0,
      };
      for (const lease of leases) {
        // Filter by time range if provided (MarketLeaseFilter lacks since/until)
        if (since) {
          const issuedAt = Date.parse(lease.issuedAt);
          if (Number.isNaN(issuedAt) || issuedAt < Date.parse(since)) continue;
        }
        if (until) {
          const issuedAt = Date.parse(lease.issuedAt);
          if (Number.isNaN(issuedAt) || issuedAt > Date.parse(until)) continue;
        }
        leaseCounts[lease.status] = (leaseCounts[lease.status] ?? 0) + 1;
      }

      // Resolve resources: direct lookup when resourceId is given, otherwise list by provider
      const resourceMatches = resourceId
        ? (() => {
            const res = store.getResource(resourceId);
            return res ? [res] : [];
          })()
        : store.listResources(providerActorId ? { providerActorId } : {});
      const offerIds = new Set(resourceMatches.map((entry) => entry.offerId));
      const orders = store.listOrders().filter((order) => offerIds.has(order.offerId));
      const orderIds = new Set(orders.map((order) => order.orderId));

      let disputes = store.listDisputes().filter((entry) => orderIds.has(entry.orderId));
      if (since || until) {
        disputes = disputes.filter((entry) => {
          const openedAt = Date.parse(entry.openedAt);
          if (Number.isNaN(openedAt)) return false;
          if (since && openedAt < Date.parse(since)) return false;
          if (until && openedAt > Date.parse(until)) return false;
          return true;
        });
      }

      const ledgerSummary = store.summarizeLedger({
        providerActorId,
        resourceId,
        since,
        until,
      });

      const totalLeases = Object.values(leaseCounts).reduce((sum, n) => sum + n, 0);
      const revoked = leaseCounts.lease_revoked ?? 0;
      const expired = leaseCounts.lease_expired ?? 0;
      const disputeCount = disputes.length;
      const signals = buildSignals({ totalLeases, revoked, expired, disputes: disputeCount });
      const score = computeScore({ totalLeases, revoked, expired, disputes: disputeCount });

      const summary: ReputationSummary = {
        providerActorId,
        resourceId,
        score,
        signals,
        leases: {
          total: totalLeases,
          byStatus: leaseCounts,
        },
        disputes: {
          total: disputeCount,
          byStatus: countByStatus(disputes),
        },
        ledger: {
          totalCost: ledgerSummary.totalCost,
          currency: ledgerSummary.currency,
        },
      };

      respond(true, summary);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
