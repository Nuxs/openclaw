import { describe, expect, it } from "vitest";
import {
  buildMarketApprovalQueue,
  buildMarketGrowthLoop,
  buildOwnerGovernanceSnapshot,
} from "./market-steward-controller.ts";

describe("market steward controller", () => {
  it("builds a mixed approval queue from consents, executions, and disputes", () => {
    const queue = buildMarketApprovalQueue({
      consents: [
        {
          consentId: "consent-1",
          orderId: "order-1",
          status: "consent_pending",
          purpose: "security-review",
          grantedAt: "2026-03-16T00:00:00.000Z",
        },
      ],
      executions: [
        {
          orderId: "order-2",
          leaseId: "lease-2",
          resourceId: "res-2",
          resourceLabel: "Proof-backed review",
          providerActorId: "seller-2",
          buyerId: "buyer-2",
          executionStatus: "awaiting_acceptance",
          acceptanceStatus: "acceptance_pending",
          deliveryStatus: "delivery_ready",
          proofId: "proof-2",
          proofStatus: "proof_submitted",
          proofType: "tlsnotary",
          settlementStatus: "settlement_locked",
          settlementAmount: "4",
          releasedAmount: null,
          disputeStatus: null,
          currency: "USDC",
          lastUpdatedAt: "2026-03-16T00:00:00.000Z",
          trace: [],
        },
      ],
      disputes: [
        {
          disputeId: "dispute-3",
          orderId: "order-3",
          initiatorActorId: "buyer-3",
          respondentActorId: "seller-3",
          reason: "delivery mismatch",
          status: "dispute_opened",
          openedAt: "2026-03-16T00:00:00.000Z",
        },
      ],
    });

    expect(queue).toHaveLength(3);
    expect(queue.map((item) => item.kind)).toEqual(["consent", "acceptance", "dispute"]);
    expect(queue[1]?.refs).toContain("proofId=proof-2");
  });

  it("elevates kill switch posture when alerts and readiness failures pile up", () => {
    const approvalQueue = buildMarketApprovalQueue({ consents: [], executions: [], disputes: [] });
    const snapshot = buildOwnerGovernanceSnapshot({
      approvalQueue,
      auditSnapshot: {
        count: 2,
        byKind: { settlement: 1 },
        lastEventAt: "2026-03-16T00:00:00.000Z",
        events: [],
      },
      status: {
        offers: {},
        orders: {},
        deliveries: {},
        settlements: {},
        leases: { total: 0, byStatus: {}, active: 0, expired: 0, revoked: 0 },
        disputes: { total: 2, byStatus: {}, open: 2, resolved: 0, rejected: 0 },
        revocations: { total: 1, pending: 1, failed: 0 },
        audit: { events: 2, anchorPending: 2 },
        repair: { candidates: 3, expiredActive: 0, orphaned: 0 },
        totals: { offers: 0, orders: 0, deliveries: 0, settlements: 0 },
      },
      opsSummary: {
        activeAlerts: 3,
        alertsByLevel: { p1: 3 },
        healthProbes: [],
        walletHealthy: false,
        discoveryHealthy: false,
        paymentHealthy: false,
        settlementHealthy: false,
        preset: {
          mode: "single-node",
          healthy: false,
          summary: "needs fixes",
          readiness: {
            ready: false,
            checks: [],
            passCount: 0,
            warnCount: 1,
            failCount: 2,
          },
          metrics: {
            publishedResources: 0,
            activeLeases: 0,
            activeAlerts: 3,
            discoveryEnabled: false,
            consumerEnabled: false,
            advertiseToMarket: false,
            providerListenEnabled: false,
            walletReady: false,
            paymentReady: false,
            billingEnabled: false,
            autopayEnabled: false,
          },
          recommendedActions: ["Fix wallet readiness before enabling autonomous buys."],
        },
      },
    });

    expect(snapshot.killSwitchState).toBe("tripped");
    expect(snapshot.killSwitchReason).toContain("failing checks");
    expect(snapshot.auditBacklog).toBe(5);
  });

  it("creates growth loop items for memory, reflection, research, and heartbeat", () => {
    const items = buildMarketGrowthLoop({
      approvalQueue: [
        {
          id: "acceptance:order-1",
          kind: "acceptance",
          title: "Buyer acceptance",
          status: "acceptance_pending",
          action: "Sign or reject",
          detail: "Proof pending final sign-off",
          refs: ["orderId=order-1", "proofId=proof-1"],
          priority: "high",
        },
      ],
      auditSnapshot: {
        count: 1,
        byKind: { proof: 1 },
        lastEventAt: "2026-03-16T00:00:00.000Z",
        events: [],
      },
      status: {
        offers: {},
        orders: {},
        deliveries: {},
        settlements: {},
        leases: { total: 0, byStatus: {}, active: 0, expired: 0, revoked: 0 },
        disputes: { total: 1, byStatus: {}, open: 1, resolved: 0, rejected: 0 },
        revocations: { total: 0, pending: 0, failed: 0 },
        audit: { events: 1, anchorPending: 1 },
        repair: { candidates: 1, expiredActive: 0, orphaned: 0 },
        totals: { offers: 0, orders: 0, deliveries: 0, settlements: 0 },
      },
      opsSummary: {
        activeAlerts: 1,
        alertsByLevel: { p1: 1 },
        healthProbes: [],
        walletHealthy: true,
        discoveryHealthy: true,
        paymentHealthy: true,
        settlementHealthy: true,
        preset: null,
      },
    });

    expect(items.map((item) => item.phase)).toEqual([
      "memory",
      "reflection",
      "research",
      "heartbeat",
    ]);
    expect(items[0]?.priority).toBe("high");
    expect(items[3]?.detail).toContain("audit backlog");
  });
});
