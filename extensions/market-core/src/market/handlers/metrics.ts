import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { assertAccess, formatGatewayErrorResponse } from "./_shared.js";

type AlertSeverity = "p0" | "p1";

function countByStatus<T extends { status: string }>(items: T[]) {
  return items.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

function safeRate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function countRecentAuditByKind(
  auditEvents: Array<{ kind?: string; timestamp?: string }>,
  kinds: string[],
  windowMs: number,
  nowMs: number,
): number {
  const allow = new Set(kinds);
  return auditEvents.filter((event) => {
    if (!event.kind || !allow.has(event.kind)) return false;
    const ts = Date.parse(event.timestamp ?? "");
    return Number.isFinite(ts) && nowMs - ts <= windowMs;
  }).length;
}

export function createMarketMetricsSnapshotHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { respond } = opts;
    try {
      assertAccess(opts, config, "read");

      const offers = store.listOffers();
      const orders = store.listOrders();
      const settlements = store.listSettlements();
      const leases = store.listLeases();
      const disputes = store.listDisputes();
      const revocations = store.listRevocations();
      const auditEvents = store.readAuditEvents(1_000);

      const settlementReleased = settlements.filter(
        (entry) => entry.status === "settlement_released",
      ).length;
      const settlementRefunded = settlements.filter(
        (entry) => entry.status === "settlement_refunded",
      ).length;
      const settlementFailureRate = safeRate(
        settlementRefunded,
        settlementReleased + settlementRefunded,
      );

      const revocationPending = revocations.filter((job) => job.status === "pending").length;
      const revocationFailed = revocations.filter((job) => job.status === "failed").length;

      const anchorPending = auditEvents.filter(
        (event) => event.details && typeof event.details.anchorError === "string",
      ).length;
      const settlementPartialReleaseCount = auditEvents.filter(
        (event) => event.kind === "settlement_released" && event.details?.completed === false,
      ).length;
      const settlementOverReleaseBlockedCount = auditEvents.filter(
        (event) => event.kind === "settlement_over_release_blocked",
      ).length;

      const now = Date.now();
      const unresolvedDisputes = disputes.filter(
        (entry) =>
          entry.status === "dispute_opened" || entry.status === "dispute_evidence_submitted",
      );
      const disputeOver24h = unresolvedDisputes.filter((entry) => {
        const openedAt = Date.parse(entry.openedAt);
        if (Number.isNaN(openedAt)) return false;
        return now - openedAt > 24 * 60 * 60 * 1000;
      }).length;

      const repairCandidates = leases.filter((lease) => {
        const expired = lease.status === "lease_active" && Date.parse(lease.expiresAt) <= now;
        if (expired) return true;
        const resource = store.getResource(lease.resourceId);
        const order = store.getOrder(lease.orderId);
        const delivery = lease.deliveryId ? store.getDelivery(lease.deliveryId) : undefined;
        return !resource || !order || (lease.deliveryId ? !delivery : false);
      }).length;

      const window24hMs = 24 * 60 * 60 * 1000;
      const ops = {
        expireSweep: {
          last24h: countRecentAuditByKind(auditEvents, ["lease_expired"], window24hMs, now),
        },
        repairRetry: {
          last24h: countRecentAuditByKind(auditEvents, ["repair_retry"], window24hMs, now),
          candidates: repairCandidates,
        },
        revocationRetry: {
          last24h: countRecentAuditByKind(auditEvents, ["revocation_retry"], window24hMs, now),
          failedLast24h: countRecentAuditByKind(
            auditEvents,
            ["revocation_failed"],
            window24hMs,
            now,
          ),
          succeededLast24h: countRecentAuditByKind(
            auditEvents,
            ["revocation_succeeded"],
            window24hMs,
            now,
          ),
        },
      };

      const alerts: Array<{
        rule: string;
        severity: AlertSeverity;
        triggered: boolean;
        value: number;
      }> = [
        {
          rule: "settlement_failure_rate",
          severity: "p0",
          triggered: settlementFailureRate > 0.05,
          value: settlementFailureRate,
        },
        {
          rule: "anchor_pending",
          severity: "p0",
          triggered: anchorPending > 100,
          value: anchorPending,
        },
        {
          rule: "dispute_unresolved_24h",
          severity: "p0",
          triggered: disputeOver24h > 0,
          value: disputeOver24h,
        },
        {
          rule: "repair_candidates",
          severity: "p1",
          triggered: repairCandidates > 0,
          value: repairCandidates,
        },
        {
          rule: "revocation_failed",
          severity: "p1",
          triggered: revocationFailed > 0,
          value: revocationFailed,
        },
        {
          rule: "revocation_pending",
          severity: "p1",
          triggered: revocationPending > 20,
          value: revocationPending,
        },
        {
          rule: "settlement_over_release_blocked",
          severity: "p1",
          triggered: settlementOverReleaseBlockedCount > 0,
          value: settlementOverReleaseBlockedCount,
        },
      ];

      respond(true, {
        offers: { total: offers.length, byStatus: countByStatus(offers) },
        orders: { total: orders.length, byStatus: countByStatus(orders) },
        settlements: {
          total: settlements.length,
          byStatus: countByStatus(settlements),
          failureRate: settlementFailureRate,
          partialReleaseCount: settlementPartialReleaseCount,
          overReleaseBlockedCount: settlementOverReleaseBlockedCount,
        },
        leases: {
          total: leases.length,
          byStatus: countByStatus(leases),
          active: leases.filter((entry) => entry.status === "lease_active").length,
          expired: leases.filter((entry) => entry.status === "lease_expired").length,
          revoked: leases.filter((entry) => entry.status === "lease_revoked").length,
        },
        disputes: {
          total: disputes.length,
          byStatus: countByStatus(disputes),
          open: unresolvedDisputes.length,
          resolved: disputes.filter((entry) => entry.status === "dispute_resolved").length,
          rejected: disputes.filter((entry) => entry.status === "dispute_rejected").length,
        },
        revocations: {
          total: revocations.length,
          pending: revocationPending,
          failed: revocationFailed,
        },
        audit: {
          events: auditEvents.length,
          anchorPending,
        },
        ops,
        alerts,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
