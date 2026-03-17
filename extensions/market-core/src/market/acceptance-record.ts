import {
  DEFAULT_ACCEPTANCE_REVIEW_WINDOW_HOURS,
  createDefaultAcceptancePolicy,
  type AcceptancePolicy,
} from "./service-wrapper.js";
import type { Dispute, Order, ServiceProof, Settlement } from "./types.js";

export type AcceptanceStatus = "pending" | "accepted" | "rejected" | "expired";

export type MilestoneAcceptance = {
  index: number;
  description: string;
  status: "pending" | "accepted" | "rejected";
  acceptedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
};

export type AcceptanceRecord = {
  acceptanceId: string;
  orderId: string;
  proofId?: string;
  status: AcceptanceStatus;
  acceptedBy?: string;
  rejectedBy?: string;
  rejectReason?: string;
  milestones?: MilestoneAcceptance[];
  expiresAt: string;
  acceptedAt?: string;
  rejectedAt?: string;
  policy: AcceptancePolicy;
};

function addHours(isoTimestamp: string, hours: number): string {
  const parsed = Date.parse(isoTimestamp);
  if (Number.isNaN(parsed)) {
    return isoTimestamp;
  }
  return new Date(parsed + hours * 60 * 60 * 1000).toISOString();
}

function buildMilestones(policy: AcceptancePolicy): MilestoneAcceptance[] | undefined {
  if (policy.mode !== "milestone") {
    return undefined;
  }
  const milestoneCount = Math.max(1, policy.milestoneCount ?? 1);
  return Array.from({ length: milestoneCount }, (_, index) => ({
    index,
    description: `Milestone ${index + 1}`,
    status: "pending",
  }));
}

export function buildAcceptanceId(orderId: string, proofId?: string): string {
  return proofId ? `acceptance:${orderId}:${proofId}` : `acceptance:${orderId}`;
}

export function deriveAcceptanceRecord(params: {
  order: Order;
  proof?: ServiceProof | null;
  settlement?: Settlement | null;
  dispute?: Dispute | null;
  policy?: AcceptancePolicy;
  acceptedBy?: string;
  now?: string;
}): AcceptanceRecord | null {
  const { order } = params;
  const proof = params.proof ?? null;
  const settlement = params.settlement ?? null;
  const dispute = params.dispute ?? null;
  if (!proof && order.status !== "delivery_completed" && order.status !== "settlement_completed") {
    return null;
  }

  const policy = params.policy ?? createDefaultAcceptancePolicy("digital");
  const reviewWindowHours = policy.reviewWindowHours ?? DEFAULT_ACCEPTANCE_REVIEW_WINDOW_HOURS;
  const basisTimestamp = proof?.submittedAt ?? order.updatedAt ?? order.createdAt;
  const expiresAt = addHours(basisTimestamp, reviewWindowHours);
  const now = params.now ?? new Date().toISOString();
  const accepted =
    settlement?.status === "settlement_released" || order.status === "settlement_completed";
  const rejected =
    dispute?.status === "dispute_opened" || dispute?.status === "dispute_evidence_submitted";
  const expired =
    !accepted &&
    !rejected &&
    !Number.isNaN(Date.parse(expiresAt)) &&
    Date.parse(expiresAt) <= Date.parse(now);
  const status: AcceptanceStatus = accepted
    ? "accepted"
    : rejected
      ? "rejected"
      : expired
        ? "expired"
        : "pending";

  return {
    acceptanceId: buildAcceptanceId(order.orderId, proof?.proofId),
    orderId: order.orderId,
    proofId: proof?.proofId,
    status,
    acceptedBy: accepted ? (params.acceptedBy ?? order.buyerId) : undefined,
    rejectedBy: rejected ? (dispute?.initiatorActorId ?? order.buyerId) : undefined,
    rejectReason: rejected ? dispute?.reason : undefined,
    milestones: buildMilestones(policy),
    expiresAt,
    acceptedAt: accepted ? (settlement?.releasedAt ?? order.updatedAt) : undefined,
    rejectedAt: rejected ? (dispute?.openedAt ?? order.updatedAt) : undefined,
    policy,
  };
}
