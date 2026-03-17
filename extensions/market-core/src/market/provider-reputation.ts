import type { MarketStateStore } from "../state/store.js";
import { isVerifiedExecutionProof } from "./proof-types.js";
import type {
  MarketLedgerSummary,
  MarketLease,
  MarketLeaseStatus,
  MarketResource,
} from "./resources.js";
import type { Dispute, Order, ServiceProof } from "./types.js";

export type ProviderReputationSnapshot = {
  providerActorId?: string;
  resourceId?: string;
  score: number;
  signals: string[];
  matchedResources: MarketResource[];
  matchedLeases: MarketLease[];
  disputes: Dispute[];
  proofs: ServiceProof[];
  completedJobs: number;
  providerLosses: number;
  leaseCounts: Record<MarketLeaseStatus, number>;
  disputeCounts: Record<string, number>;
  ledgerSummary: MarketLedgerSummary;
  lastUpdated: string;
};

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sameActor(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function isWithinTimeWindow(value: string | undefined, since?: string, until?: string): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  if (since && parsed < Date.parse(since)) return false;
  if (until && parsed > Date.parse(until)) return false;
  return true;
}

function countByStatus(disputes: Dispute[]): Record<string, number> {
  return disputes.reduce<Record<string, number>>((acc, entry) => {
    const status = entry.status ?? "unknown";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

function collectMatchedProofs(params: {
  store: MarketStateStore;
  orders: Order[];
  since?: string;
  until?: string;
  limit: number;
}): ServiceProof[] {
  const proofs = new Map<string, ServiceProof>();
  for (const order of params.orders) {
    for (const proof of params.store.listServiceProofs({
      orderId: order.orderId,
      limit: params.limit,
    })) {
      if (!isWithinTimeWindow(proof.submittedAt, params.since, params.until)) {
        continue;
      }
      proofs.set(proof.proofId, proof);
    }
  }
  return [...proofs.values()];
}

function isCompletedOrder(order: Order): boolean {
  return order.status === "delivery_completed" || order.status === "settlement_completed";
}

function computeLastUpdated(params: {
  leases: MarketLease[];
  disputes: Dispute[];
  proofs: ServiceProof[];
}): string {
  let latest = 0;
  for (const lease of params.leases) {
    latest = Math.max(latest, Date.parse(lease.issuedAt) || 0);
  }
  for (const dispute of params.disputes) {
    latest = Math.max(latest, Date.parse(dispute.updatedAt ?? dispute.openedAt) || 0);
  }
  for (const proof of params.proofs) {
    latest = Math.max(latest, Date.parse(proof.submittedAt) || 0);
  }
  return latest > 0 ? new Date(latest).toISOString() : new Date().toISOString();
}

function buildSignals(params: {
  totalLeases: number;
  revoked: number;
  expired: number;
  disputes: number;
  providerLosses: number;
  verifiedProofRate: number;
}): string[] {
  const signals: string[] = [];
  if (params.totalLeases === 0) {
    signals.push("insufficient_data");
    return signals;
  }
  const disputeRate = params.disputes / params.totalLeases;
  const revokeRate = params.revoked / params.totalLeases;
  const expireRate = params.expired / params.totalLeases;
  const providerLossRate = params.providerLosses / params.totalLeases;
  if (disputeRate > 0.2) signals.push("high_dispute_rate");
  if (revokeRate > 0.3) signals.push("high_revoke_rate");
  if (expireRate > 0.3) signals.push("high_expire_rate");
  if (providerLossRate > 0.1) signals.push("provider_penalized");
  if (params.verifiedProofRate < 0.5) signals.push("low_verified_proof_rate");
  return signals;
}

function computeScore(params: {
  totalLeases: number;
  revoked: number;
  expired: number;
  disputes: number;
  providerLosses: number;
  completedJobs: number;
  proofCoverage: number;
  verifiedProofRate: number;
}): number {
  if (params.totalLeases === 0) return 50;
  const disputeRate = params.disputes / params.totalLeases;
  const revokeRate = params.revoked / params.totalLeases;
  const expireRate = params.expired / params.totalLeases;
  const providerLossRate = params.providerLosses / params.totalLeases;
  const completionRate = params.completedJobs / params.totalLeases;
  const proofCoverage = Math.min(1, Math.max(0, params.proofCoverage));
  const verifiedProofRate = Math.min(1, Math.max(0, params.verifiedProofRate));
  const penalty = disputeRate * 18 + providerLossRate * 22 + revokeRate * 14 + expireRate * 10;
  const reward = completionRate * 24 + proofCoverage * 10 + verifiedProofRate * 12;
  return clampScore(40 + reward - penalty);
}

export function summarizeProviderReputation(params: {
  store: MarketStateStore;
  providerActorId?: string;
  resourceId?: string;
  since?: string;
  until?: string;
  limit: number;
}): ProviderReputationSnapshot {
  const matchedLeases = params.store
    .listLeases({
      providerActorId: params.providerActorId,
      resourceId: params.resourceId,
      limit: params.limit,
    })
    .filter((lease) =>
      !params.since && !params.until
        ? true
        : isWithinTimeWindow(lease.issuedAt, params.since, params.until),
    );
  const leaseCounts: Record<MarketLeaseStatus, number> = {
    lease_active: 0,
    lease_revoked: 0,
    lease_expired: 0,
  };
  for (const lease of matchedLeases) {
    leaseCounts[lease.status] = (leaseCounts[lease.status] ?? 0) + 1;
  }

  const matchedResources = (
    params.resourceId
      ? (() => {
          const resource = params.store.getResource(params.resourceId!);
          return resource ? [resource] : [];
        })()
      : params.store.listResources()
  ).filter(
    (resource) =>
      !params.providerActorId || sameActor(resource.providerActorId, params.providerActorId),
  );
  const offerIds = new Set(matchedResources.map((entry) => entry.offerId));
  const orders = params.store.listOrders().filter((order) => offerIds.has(order.offerId));
  const orderIds = new Set(orders.map((order) => order.orderId));

  let disputes = params.store.listDisputes().filter((entry) => orderIds.has(entry.orderId));
  if (params.since || params.until) {
    disputes = disputes.filter((entry) =>
      isWithinTimeWindow(entry.openedAt, params.since, params.until),
    );
  }

  const proofs = collectMatchedProofs({
    store: params.store,
    orders,
    since: params.since,
    until: params.until,
    limit: params.limit,
  });

  const completedJobs = new Set([
    ...orders.filter((order) => isCompletedOrder(order)).map((order) => order.orderId),
    ...proofs.map((proof) => proof.orderId),
  ]).size;
  const providerLosses = disputes.filter(
    (entry) =>
      entry.status === "dispute_resolved" && sameActor(entry.loserActorId, params.providerActorId),
  ).length;
  const verifiedProofs = proofs.filter((proof) => isVerifiedExecutionProof(proof.proof)).length;
  const verifiedProofRate = proofs.length === 0 ? 0 : verifiedProofs / proofs.length;
  const proofCoverage = matchedLeases.length === 0 ? 0 : proofs.length / matchedLeases.length;
  const totalLeases = Object.values(leaseCounts).reduce((sum, count) => sum + count, 0);
  const revoked = leaseCounts.lease_revoked ?? 0;
  const expired = leaseCounts.lease_expired ?? 0;
  const signals = buildSignals({
    totalLeases,
    revoked,
    expired,
    disputes: disputes.length,
    providerLosses,
    verifiedProofRate,
  });
  const score = computeScore({
    totalLeases,
    revoked,
    expired,
    disputes: disputes.length,
    providerLosses,
    completedJobs,
    proofCoverage,
    verifiedProofRate,
  });

  return {
    providerActorId: params.providerActorId,
    resourceId: params.resourceId,
    score,
    signals,
    matchedResources,
    matchedLeases,
    disputes,
    proofs,
    completedJobs,
    providerLosses,
    leaseCounts,
    disputeCounts: countByStatus(disputes),
    ledgerSummary: params.store.summarizeLedger({
      providerActorId: params.providerActorId,
      resourceId: params.resourceId,
      since: params.since,
      until: params.until,
    }),
    lastUpdated: computeLastUpdated({ leases: matchedLeases, disputes, proofs }),
  };
}
