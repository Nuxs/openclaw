import type { MarketLeaseStatus, MarketResourceStatus } from "./resources.js";
import type {
  DeliveryStatus,
  DisputeStatus,
  OfferStatus,
  OrderStatus,
  RewardStatus,
  SettlementStatus,
} from "./types.js";

export function assertOfferTransition(from: OfferStatus, to: OfferStatus) {
  const allowed: Record<OfferStatus, OfferStatus[]> = {
    offer_created: ["offer_published", "offer_closed"],
    offer_published: ["offer_closed"],
    offer_closed: [],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid offer transition: ${from} -> ${to}`);
  }
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus) {
  const allowed: Record<OrderStatus, OrderStatus[]> = {
    order_created: ["payment_locked", "order_cancelled"],
    payment_locked: ["consent_granted", "settlement_cancelled"],
    consent_granted: ["delivery_ready", "consent_revoked"],
    delivery_ready: ["delivery_completed", "consent_revoked"],
    delivery_completed: ["settlement_completed"],
    settlement_completed: [],
    order_cancelled: [],
    settlement_cancelled: [],
    consent_revoked: ["settlement_cancelled"],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid order transition: ${from} -> ${to}`);
  }
}

export function assertDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus) {
  const allowed: Record<DeliveryStatus, DeliveryStatus[]> = {
    delivery_ready: ["delivery_completed", "delivery_revoked"],
    delivery_completed: [],
    delivery_revoked: [],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid delivery transition: ${from} -> ${to}`);
  }
}

export function assertSettlementTransition(from: SettlementStatus, to: SettlementStatus) {
  const allowed: Record<SettlementStatus, SettlementStatus[]> = {
    settlement_locked: ["settlement_released", "settlement_refunded"],
    settlement_released: [],
    settlement_refunded: [],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid settlement transition: ${from} -> ${to}`);
  }
}

export function assertRewardTransition(from: RewardStatus, to: RewardStatus) {
  const allowed: Record<RewardStatus, RewardStatus[]> = {
    reward_created: ["claim_issued", "reward_cancelled"],
    claim_issued: ["onchain_submitted", "reward_cancelled"],
    onchain_submitted: ["onchain_confirmed", "onchain_failed"],
    onchain_confirmed: [],
    onchain_failed: ["claim_issued", "reward_cancelled"],
    reward_cancelled: [],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid reward transition: ${from} -> ${to}`);
  }
}

const conflict = (message: string) => new Error(`E_CONFLICT: ${message}`);

export function assertResourceTransition(from: MarketResourceStatus, to: MarketResourceStatus) {
  if (from === to) return;
  if (from === "resource_draft" && to === "resource_published") return;
  if (from === "resource_published" && to === "resource_unpublished") return;
  throw conflict(`invalid resource transition: ${from} -> ${to}`);
}

export function assertLeaseTransition(from: MarketLeaseStatus, to: MarketLeaseStatus) {
  if (from === to) return;
  if (from === "lease_active" && (to === "lease_revoked" || to === "lease_expired")) {
    return;
  }
  throw conflict(`invalid lease transition: ${from} -> ${to}`);
}

export function assertDisputeTransition(from: DisputeStatus, to: DisputeStatus) {
  const allowed: Record<DisputeStatus, DisputeStatus[]> = {
    dispute_opened: ["dispute_evidence_submitted", "dispute_resolved", "dispute_rejected"],
    dispute_evidence_submitted: ["dispute_resolved", "dispute_rejected"],
    dispute_resolved: [],
    dispute_rejected: [],
  };
  if (!allowed[from].includes(to)) {
    throw conflict(`invalid dispute transition: ${from} -> ${to}`);
  }
}
