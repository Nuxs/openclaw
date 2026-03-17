import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import {
  buildGenericProofSummary,
  isVerifiedExecutionProof,
  toGenericProof,
} from "../proof-types.js";
import type { Offer, Order, ServiceProof, Settlement } from "../types.js";
import { normalizeBuyerId, requireString } from "../validators.js";
import { assertAccess, formatGatewayErrorResponse, requireActorId } from "./_shared.js";
export { createServiceProofSubmitHandler as createProofSubmitHandler } from "./service-proof.js";

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

function buildVerificationContext(proof: ServiceProof) {
  if (proof.proof.type === "human_attestation") {
    return {
      family: "human_attestation",
      attesterRole:
        typeof proof.proof.metadata?.attesterRole === "string"
          ? proof.proof.metadata.attesterRole
          : null,
      confidence:
        typeof proof.proof.metadata?.confidence === "number"
          ? proof.proof.metadata.confidence
          : null,
      subject:
        typeof proof.proof.metadata?.subject === "string" ? proof.proof.metadata.subject : null,
      requiresManualReview: true,
      complianceStatus: "attested",
    };
  }
  if (proof.proof.type === "oracle_event") {
    return {
      family: "oracle_event",
      oracle: typeof proof.proof.metadata?.oracle === "string" ? proof.proof.metadata.oracle : null,
      eventId:
        typeof proof.proof.metadata?.eventId === "string" ? proof.proof.metadata.eventId : null,
      outcome:
        typeof proof.proof.metadata?.outcome === "string" ? proof.proof.metadata.outcome : null,
      requiresManualReview: false,
      complianceStatus: "oracle_verified",
    };
  }
  if (proof.proof.type === "signed_receipt") {
    return {
      family: "signed_receipt",
      receiptId:
        typeof proof.proof.metadata?.receiptId === "string" ? proof.proof.metadata.receiptId : null,
      requiresManualReview: false,
      complianceStatus: "receipt_verified",
    };
  }
  return {
    family: "tlsnotary",
    requiresManualReview: false,
    complianceStatus: "cryptographic_proof",
  };
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
      const verified = proof.status === "proof_submitted" && isVerifiedExecutionProof(proof.proof);
      const genericProof = toGenericProof(proof);
      const genericSummary = buildGenericProofSummary(proof);
      const verificationContext = buildVerificationContext(proof);

      respond(true, {
        proofId: proof.proofId,
        orderId: proof.orderId,
        verified,
        verificationStatus: verified ? "verified" : "invalid",
        orderStatus: order.status,
        settlementStatus: settlement?.status ?? null,
        disputeStatus: dispute?.status ?? null,
        genericProof: {
          ...genericProof,
          metadata: {
            ...genericProof.metadata,
            settlementId: settlement?.settlementId ?? null,
          },
        },
        summary: {
          family: genericSummary.family,
          type: proof.proof.type,
          verifier: proof.proof.verifier,
          artifactHash: proof.proof.artifactHash,
          issuedAt: proof.proof.issuedAt,
          submittedAt: proof.submittedAt,
          artifactCount: genericSummary.artifactCount,
          redactedFields: proof.proof.redactedFields ?? [],
          metadata: proof.proof.metadata ?? null,
        },
        verificationContext,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
