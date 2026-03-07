import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/compat";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import type { Offer, Order, ServiceProof, Settlement } from "../types.js";
import { normalizeBuyerId, requireExecutionProof, requireString } from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";

function assertReadableByActor(actorId: string | undefined, order: Order, offer: Offer): void {
  if (!actorId) return;
  const buyerMatch = normalizeBuyerId(actorId) === normalizeBuyerId(order.buyerId);
  const sellerMatch = actorId === offer.sellerId;
  if (!buyerMatch && !sellerMatch) {
    throw new Error("E_FORBIDDEN: actorId does not match buyerId or sellerId");
  }
}

function assertServiceProofSubmissionState(order: Order, settlement: Settlement | undefined): void {
  if (order.status !== "delivery_completed" && order.status !== "settlement_completed") {
    throw new Error("E_CONFLICT: order.status must be delivery_completed or settlement_completed");
  }
  if (!settlement) {
    throw new Error("E_CONFLICT: settlement not found");
  }
  if (settlement.status === "settlement_refunded") {
    throw new Error("E_CONFLICT: settlement already refunded");
  }
}

function parseLimit(value: unknown): number {
  if (value === undefined) return 50;
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isInteger(value) || value < 1) {
    throw new Error("E_INVALID_ARGUMENT: limit must be a positive integer");
  }
  return Math.min(value, 200);
}

export function createServiceProofSubmitHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const orderId = requireString(input.orderId, "orderId");
      const proof = requireExecutionProof(input.proof);

      const order = store.getOrder(orderId);
      if (!order) throw new Error("E_NOT_FOUND: order not found");
      const offer = store.getOffer(order.offerId);
      if (!offer) throw new Error("E_NOT_FOUND: offer not found");
      if (offer.assetType !== "service") {
        throw new Error("E_CONFLICT: offer.assetType must be service");
      }
      if (offer.deliveryType !== "service") {
        throw new Error("E_CONFLICT: offer.deliveryType must be service");
      }
      if (actorId) {
        assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      }
      const settlement = store.getSettlementByOrder(orderId);
      assertServiceProofSubmissionState(order, settlement);
      const resolvedActorId = actorId || offer.sellerId;

      const existingProof = store.getServiceProofByOrder(orderId);
      if (existingProof) {
        throw new Error("E_CONFLICT: proof already submitted for order");
      }

      const leaseId =
        typeof input.leaseId === "string" && input.leaseId.trim().length > 0
          ? input.leaseId.trim()
          : undefined;
      if (leaseId) {
        const lease = store.getLease(leaseId);
        if (!lease) throw new Error("E_NOT_FOUND: lease not found");
        if (lease.orderId !== orderId) {
          throw new Error("E_INVALID_ARGUMENT: leaseId does not match orderId");
        }
      }

      const deliveryId =
        typeof input.deliveryId === "string" && input.deliveryId.trim().length > 0
          ? input.deliveryId.trim()
          : undefined;
      if (deliveryId) {
        const delivery = store.getDelivery(deliveryId);
        if (!delivery) throw new Error("E_NOT_FOUND: delivery not found");
        if (delivery.orderId !== orderId) {
          throw new Error("E_INVALID_ARGUMENT: deliveryId does not match orderId");
        }
      }

      const submittedAt = nowIso();
      const proofHash = hashCanonical({
        orderId,
        leaseId,
        deliveryId,
        actorId: resolvedActorId,
        proof,
        submittedAt,
      });
      const serviceProof: ServiceProof = {
        proofId: randomUUID(),
        orderId,
        leaseId,
        deliveryId,
        actorId: resolvedActorId,
        proof,
        proofHash,
        submittedAt,
        status: "proof_submitted",
      };

      store.saveServiceProof(serviceProof);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "service_proof_submitted",
        refId: serviceProof.proofId,
        hash: proofHash,
        anchorId: `service-proof:${serviceProof.proofId}`,
        actor: resolvedActorId,
        details: {
          orderId,
          leaseId,
          deliveryId,
          orderStatus: order.status,
          settlementStatus: settlement!.status,
          proofType: proof.type,
          artifactHash: proof.artifactHash,
        },
      });

      respond(true, {
        proofId: serviceProof.proofId,
        orderId,
        status: serviceProof.status,
        proofHash,
        orderStatus: order.status,
        settlementStatus: settlement!.status,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createServiceProofGetHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const proofId = requireString(input.proofId, "proofId");

      const proof = store.getServiceProof(proofId);
      if (!proof) throw new Error("E_NOT_FOUND: service proof not found");
      const order = store.getOrder(proof.orderId);
      if (!order) throw new Error("E_NOT_FOUND: order not found");
      const offer = store.getOffer(order.offerId);
      if (!offer) throw new Error("E_NOT_FOUND: offer not found");
      assertReadableByActor(actorId, order, offer);

      respond(true, {
        proof,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createServiceProofListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const orderId = typeof input.orderId === "string" ? input.orderId.trim() : undefined;
      const limit = parseLimit(input.limit);

      let proofs = store.listServiceProofs({ orderId, limit });
      if (orderId) {
        const order = store.getOrder(orderId);
        if (!order) throw new Error("E_NOT_FOUND: order not found");
        const offer = store.getOffer(order.offerId);
        if (!offer) throw new Error("E_NOT_FOUND: offer not found");
        assertReadableByActor(actorId, order, offer);
      } else if (actorId) {
        proofs = proofs.filter((entry) => {
          const order = store.getOrder(entry.orderId);
          if (!order) return false;
          const offer = store.getOffer(order.offerId);
          if (!offer) return false;
          const buyerMatch = normalizeBuyerId(actorId) === normalizeBuyerId(order.buyerId);
          const sellerMatch = actorId === offer.sellerId;
          return buyerMatch || sellerMatch;
        });
      }

      respond(true, {
        proofs,
        count: proofs.length,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
