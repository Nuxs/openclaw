import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import type { Offer, Order, ServiceProof, Settlement } from "../types.js";
import { normalizeBuyerId, requireString } from "../validators.js";
import { assertAccess, formatGatewayErrorResponse, requireActorId } from "./_shared.js";
import { createServiceProofSubmitHandler } from "./service-proof.js";

function assertReadableByActor(actorId: string | undefined, order: Order, offer: Offer): void {
  if (!actorId) return;
  const buyerMatch = normalizeBuyerId(actorId) === normalizeBuyerId(order.buyerId);
  const sellerMatch = normalizeBuyerId(actorId) === normalizeBuyerId(offer.sellerId);
  if (!buyerMatch && !sellerMatch) {
    throw new Error("E_FORBIDDEN: actorId does not match buyerId or sellerId");
  }
}

function resolveProofContext(params: {
  store: MarketStateStore;
  proofId?: string;
  orderId?: string;
}): {
  proof: ServiceProof;
  order: Order;
  offer: Offer;
  settlement?: Settlement;
} {
  const { store, proofId, orderId } = params;
  const proof = proofId
    ? store.getServiceProof(proofId)
    : orderId
      ? store.getServiceProofByOrder(orderId)
      : undefined;
  if (!proof) {
    throw new Error("E_NOT_FOUND: proof not found");
  }
  const order = store.getOrder(proof.orderId);
  if (!order) {
    throw new Error("E_NOT_FOUND: order not found");
  }
  const offer = store.getOffer(order.offerId);
  if (!offer) {
    throw new Error("E_NOT_FOUND: offer not found");
  }
  const settlement = store.getSettlementByOrder(order.orderId);
  return { proof, order, offer, settlement: settlement ?? undefined };
}

export function createProofSubmitHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return createServiceProofSubmitHandler(store, config);
}

export function createProofVerifyHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const proofId = typeof input.proofId === "string" ? input.proofId.trim() : undefined;
      const orderId = typeof input.orderId === "string" ? input.orderId.trim() : undefined;
      if (!proofId && !orderId) {
        throw new Error("E_INVALID_ARGUMENT: proofId or orderId is required");
      }

      const { proof, order, offer, settlement } = resolveProofContext({ store, proofId, orderId });
      assertReadableByActor(actorId || undefined, order, offer);

      const dispute = store.getDisputeByOrder(order.orderId);
      const verified =
        proof.status === "proof_submitted" &&
        typeof proof.proof.artifactHash === "string" &&
        proof.proof.artifactHash.startsWith("sha256:");

      respond(true, {
        proofId: proof.proofId,
        orderId: proof.orderId,
        verified,
        verificationStatus: verified ? "verified" : "invalid",
        orderStatus: order.status,
        settlementStatus: settlement?.status ?? null,
        disputeStatus: dispute?.status ?? null,
        summary: {
          type: proof.proof.type,
          verifier: proof.proof.verifier,
          artifactHash: proof.proof.artifactHash,
          issuedAt: proof.proof.issuedAt,
          submittedAt: proof.submittedAt,
          redactedFields: proof.proof.redactedFields ?? [],
        },
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
