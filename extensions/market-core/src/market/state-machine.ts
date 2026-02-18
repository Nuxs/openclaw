import type { DeliveryStatus, OfferStatus, OrderStatus, SettlementStatus } from "./types.js";

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
