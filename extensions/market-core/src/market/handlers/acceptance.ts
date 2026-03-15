import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import type { Dispute, Offer, Order } from "../types.js";
import { normalizeBuyerId, requireString } from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";
import { releaseSettlementIncremental } from "./settlement-release.js";
import { getReleasedAmount, parseAmount } from "./settlement-shared.js";

function resolveAcceptanceContext(
  store: MarketStateStore,
  orderId: string,
): { order: Order; offer: Offer } {
  const order = store.getOrder(orderId);
  if (!order) {
    throw new Error("E_NOT_FOUND: order not found");
  }
  const offer = store.getOffer(order.offerId);
  if (!offer) {
    throw new Error("E_NOT_FOUND: offer not found");
  }
  return { order, offer };
}

function assertBuyerActor(config: MarketPluginConfig, actorId: string, order: Order): void {
  assertActorMatch(
    config,
    normalizeBuyerId(actorId),
    normalizeBuyerId(order.buyerId),
    "order.buyerId",
  );
}

function resolveProofId(
  store: MarketStateStore,
  orderId: string,
  inputProofId?: string,
): string | undefined {
  if (inputProofId) {
    const proof = store.getServiceProof(inputProofId);
    if (!proof) {
      throw new Error("E_NOT_FOUND: proof not found");
    }
    if (proof.orderId !== orderId) {
      throw new Error("E_INVALID_ARGUMENT: proofId does not match orderId");
    }
    return proof.proofId;
  }
  return store.getServiceProofByOrder(orderId)?.proofId;
}

export function createAcceptanceSignHandler(
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
      const proofId = typeof input.proofId === "string" ? input.proofId.trim() : undefined;

      const { order, offer } = resolveAcceptanceContext(store, orderId);
      assertBuyerActor(config, actorId, order);
      const settlement = store.getSettlementByOrder(orderId);
      if (!settlement) {
        throw new Error("E_CONFLICT: settlement not found");
      }
      if (settlement.status === "settlement_refunded") {
        throw new Error("E_CONFLICT: settlement already refunded");
      }
      const resolvedProofId = resolveProofId(store, orderId, proofId);
      if (offer.assetType === "service" && !resolvedProofId) {
        throw new Error("E_CONFLICT: service proof not found");
      }

      const totalAmount = parseAmount(settlement.amount, "settlement.amount");
      const releasedAmount = getReleasedAmount(settlement);
      if (releasedAmount >= totalAmount && order.status === "settlement_completed") {
        respond(true, {
          orderId,
          proofId: resolvedProofId ?? null,
          settlementId: settlement.settlementId,
          acceptanceStatus: "acceptance_signed",
          orderStatus: order.status,
          settlementStatus: settlement.status,
          releasedAmount: releasedAmount.toString(),
        });
        return;
      }

      const remainingAmount = (totalAmount - releasedAmount).toString();
      const releaseResult = await releaseSettlementIncremental({
        store,
        config,
        orderId,
        actorId: offer.sellerId,
        payees: [{ address: offer.sellerId, amount: remainingAmount }],
        releaseAmount: remainingAmount,
        idempotencyKey:
          typeof input.idempotencyKey === "string" && input.idempotencyKey.trim().length > 0
            ? input.idempotencyKey.trim()
            : `acceptance:${orderId}`,
      });

      await recordAuditWithAnchor({
        store,
        config,
        kind: "acceptance_signed",
        refId: orderId,
        hash: hashCanonical({
          orderId,
          proofId: resolvedProofId ?? null,
          actorId,
          acceptedAt: nowIso(),
        }),
        anchorId: `acceptance:${orderId}`,
        actor: actorId,
        details: {
          orderId,
          proofId: resolvedProofId ?? null,
          settlementId: releaseResult.settlementId,
          settlementStatus: releaseResult.status,
          releasedAmount: releaseResult.releasedAmount,
        },
      });

      respond(true, {
        orderId,
        proofId: resolvedProofId ?? null,
        settlementId: releaseResult.settlementId,
        acceptanceStatus: "acceptance_signed",
        orderStatus: releaseResult.orderStatus,
        settlementStatus: releaseResult.status,
        releasedAmount: releaseResult.releasedAmount,
        remainingAmount: releaseResult.remainingAmount,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createAcceptanceRejectHandler(
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
      const reason = requireString(input.reason, "reason");
      const proofId = typeof input.proofId === "string" ? input.proofId.trim() : undefined;

      const { order, offer } = resolveAcceptanceContext(store, orderId);
      assertBuyerActor(config, actorId, order);
      const resolvedProofId = resolveProofId(store, orderId, proofId);
      const existing = store.getDisputeByOrder(orderId);
      if (
        existing &&
        existing.status !== "dispute_resolved" &&
        existing.status !== "dispute_rejected"
      ) {
        respond(true, {
          orderId,
          proofId: resolvedProofId ?? null,
          acceptanceStatus: "acceptance_rejected",
          disputeId: existing.disputeId,
          disputeStatus: existing.status,
        });
        return;
      }

      const openedAt = nowIso();
      const dispute: Dispute = {
        disputeId: randomUUID(),
        orderId,
        initiatorActorId: actorId,
        respondentActorId: offer.sellerId,
        arbitratorType: "platform",
        reason,
        status: "dispute_opened",
        evidence: [],
        disputeHash: "",
        openedAt,
        updatedAt: openedAt,
      };
      dispute.disputeHash = hashCanonical({
        disputeId: dispute.disputeId,
        orderId,
        proofId: resolvedProofId ?? null,
        initiatorActorId: actorId,
        respondentActorId: offer.sellerId,
        reason,
        openedAt,
      });
      store.saveDispute(dispute);

      await recordAuditWithAnchor({
        store,
        config,
        kind: "acceptance_rejected",
        refId: orderId,
        hash: dispute.disputeHash,
        anchorId: `acceptance:${orderId}`,
        actor: actorId,
        details: {
          orderId,
          proofId: resolvedProofId ?? null,
          disputeId: dispute.disputeId,
          reason,
        },
      });
      await recordAuditWithAnchor({
        store,
        config,
        kind: "dispute_opened",
        refId: dispute.disputeId,
        hash: dispute.disputeHash,
        anchorId: `dispute:${dispute.disputeId}`,
        actor: actorId,
        details: {
          orderId,
          proofId: resolvedProofId ?? null,
          reason,
        },
      });

      respond(true, {
        orderId,
        proofId: resolvedProofId ?? null,
        acceptanceStatus: "acceptance_rejected",
        disputeId: dispute.disputeId,
        disputeStatus: dispute.status,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
