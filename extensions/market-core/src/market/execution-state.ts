import type { AcceptanceRecord } from "./acceptance-record.js";
import type { MarketLease } from "./resources.js";
import type { Consent, Dispute, Order, ServiceProof, Settlement } from "./types.js";

export type ExecutionLifecycleStatus =
  | "approval_required"
  | "awaiting_payment"
  | "awaiting_delivery"
  | "awaiting_acceptance"
  | "settled"
  | "disputed"
  | "cancelled";

export type ExecutionPhase =
  | "queued"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type ExecutionState = {
  orderId: string;
  phase: ExecutionPhase;
  marketStatus: ExecutionLifecycleStatus;
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  error?: {
    code: string;
    message: string;
  };
  refs: {
    consentId?: string;
    leaseId?: string;
    proofId?: string;
    settlementId?: string;
    acceptanceId?: string;
    disputeId?: string;
  };
};

export type ExecutionStateQuery = {
  orderId: string;
  includeProgress: boolean;
  includeTiming: boolean;
  includeError: boolean;
};

function buildRefs(params: {
  consent?: Consent | null;
  lease?: MarketLease | null;
  proof?: ServiceProof | null;
  settlement?: Settlement | null;
  acceptance?: AcceptanceRecord | null;
  dispute?: Dispute | null;
}) {
  return {
    consentId: params.consent?.consentId,
    leaseId: params.lease?.leaseId,
    proofId: params.proof?.proofId,
    settlementId: params.settlement?.settlementId,
    acceptanceId: params.acceptance?.acceptanceId,
    disputeId: params.dispute?.disputeId,
  };
}

export function deriveExecutionLifecycleStatus(params: {
  orderStatus: string;
  settlementStatus?: string;
  disputeStatus?: string;
  hasProof: boolean;
  hasPendingApproval?: boolean;
}): ExecutionLifecycleStatus {
  const { orderStatus, settlementStatus, disputeStatus, hasProof, hasPendingApproval } = params;
  if (hasPendingApproval) {
    return "approval_required";
  }
  if (orderStatus === "order_cancelled" || orderStatus === "settlement_cancelled") {
    return "cancelled";
  }
  if (disputeStatus === "dispute_opened" || disputeStatus === "dispute_evidence_submitted") {
    return "disputed";
  }
  if (settlementStatus === "settlement_released" || orderStatus === "settlement_completed") {
    return "settled";
  }
  if (hasProof || orderStatus === "delivery_completed") {
    return "awaiting_acceptance";
  }
  if (orderStatus === "delivery_ready" || orderStatus === "consent_granted") {
    return "awaiting_delivery";
  }
  return "awaiting_payment";
}

export function buildExecutionState(params: {
  order: Order;
  lease?: MarketLease | null;
  proof?: ServiceProof | null;
  settlement?: Settlement | null;
  dispute?: Dispute | null;
  acceptance?: AcceptanceRecord | null;
  consent?: Consent | null;
}): ExecutionState {
  const refs = buildRefs(params);
  const lifecycle = deriveExecutionLifecycleStatus({
    orderStatus: params.order.status,
    settlementStatus: params.settlement?.status ?? undefined,
    disputeStatus: params.dispute?.status ?? undefined,
    hasProof: Boolean(params.proof),
    hasPendingApproval: params.consent?.status === "consent_pending",
  });

  if (lifecycle === "approval_required") {
    return {
      orderId: params.order.orderId,
      phase: "blocked",
      marketStatus: lifecycle,
      progress: 0,
      startedAt: params.order.createdAt,
      refs,
    };
  }

  if (lifecycle === "cancelled") {
    return {
      orderId: params.order.orderId,
      phase: "cancelled",
      marketStatus: lifecycle,
      progress: 0,
      startedAt: params.order.createdAt,
      completedAt: params.order.updatedAt,
      refs,
    };
  }

  if (lifecycle === "disputed") {
    return {
      orderId: params.order.orderId,
      phase: "failed",
      marketStatus: lifecycle,
      progress: 100,
      startedAt: params.order.createdAt,
      completedAt: params.dispute?.openedAt,
      error: {
        code: "DISPUTED",
        message: params.dispute?.reason ?? "Execution entered dispute state",
      },
      refs,
    };
  }

  if (lifecycle === "settled") {
    return {
      orderId: params.order.orderId,
      phase: "completed",
      marketStatus: lifecycle,
      progress: 100,
      startedAt: params.order.createdAt,
      completedAt: params.settlement?.releasedAt ?? params.order.updatedAt,
      refs,
    };
  }

  if (lifecycle === "awaiting_acceptance") {
    return {
      orderId: params.order.orderId,
      phase: "completed",
      marketStatus: lifecycle,
      progress: 100,
      startedAt: params.order.createdAt,
      completedAt: params.proof?.submittedAt ?? params.order.updatedAt,
      refs,
    };
  }

  if (lifecycle === "awaiting_delivery") {
    return {
      orderId: params.order.orderId,
      phase: "running",
      marketStatus: lifecycle,
      progress: 60,
      startedAt: params.order.createdAt,
      refs,
    };
  }

  return {
    orderId: params.order.orderId,
    phase: "queued",
    marketStatus: lifecycle,
    progress: 0,
    startedAt: params.order.createdAt,
    refs,
  };
}
