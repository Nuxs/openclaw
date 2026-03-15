import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { requireLimit, requireString } from "../validators.js";
import { assertAccess, formatGatewayErrorResponse, redactAuditDetails } from "./_shared.js";

function resolveOrderId(store: MarketStateStore, input: Record<string, unknown>): string {
  if (typeof input.orderId === "string" && input.orderId.trim().length > 0) {
    return input.orderId.trim();
  }
  if (typeof input.leaseId === "string" && input.leaseId.trim().length > 0) {
    const lease = store.getLease(input.leaseId.trim());
    if (!lease) throw new Error("E_NOT_FOUND: lease not found");
    return lease.orderId;
  }
  if (typeof input.proofId === "string" && input.proofId.trim().length > 0) {
    const proof = store.getServiceProof(input.proofId.trim());
    if (!proof) throw new Error("E_NOT_FOUND: proof not found");
    return proof.orderId;
  }
  throw new Error("E_INVALID_ARGUMENT: orderId, leaseId, or proofId is required");
}

function deriveAcceptanceStatus(params: {
  orderStatus: string;
  settlementStatus?: string;
  disputeStatus?: string;
  hasProof: boolean;
}): string {
  const { orderStatus, settlementStatus, disputeStatus, hasProof } = params;
  if (settlementStatus === "settlement_released" || orderStatus === "settlement_completed") {
    return "acceptance_signed";
  }
  if (disputeStatus === "dispute_opened" || disputeStatus === "dispute_evidence_submitted") {
    return "acceptance_rejected";
  }
  if (hasProof || orderStatus === "delivery_completed") {
    return "acceptance_pending";
  }
  return "acceptance_not_ready";
}

function deriveExecutionStatus(params: {
  orderStatus: string;
  settlementStatus?: string;
  disputeStatus?: string;
  hasProof: boolean;
}): string {
  const { orderStatus, settlementStatus, disputeStatus, hasProof } = params;
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

export function createExecutionGetHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const orderId = resolveOrderId(store, input);
      const traceLimit = requireLimit(input, "limit", 20, 50);

      const order = store.getOrder(orderId);
      if (!order) throw new Error("E_NOT_FOUND: order not found");
      const offer = store.getOffer(order.offerId);
      if (!offer) throw new Error("E_NOT_FOUND: offer not found");
      const resource =
        store.listResources().find((entry) => entry.offerId === order.offerId) ?? null;
      const lease = store.listLeases().find((entry) => entry.orderId === orderId) ?? null;
      const delivery = lease?.deliveryId
        ? (store.getDelivery(lease.deliveryId) ?? null)
        : (store.listDeliveries().find((entry) => entry.orderId === orderId) ?? null);
      const proof = store.getServiceProofByOrder(orderId) ?? null;
      const settlement = store.getSettlementByOrder(orderId) ?? null;
      const dispute = store.getDisputeByOrder(orderId) ?? null;

      const traceIds = new Set(
        [
          orderId,
          order.offerId,
          resource?.resourceId ?? null,
          lease?.leaseId ?? null,
          delivery?.deliveryId ?? null,
          proof?.proofId ?? null,
          settlement?.settlementId ?? null,
          dispute?.disputeId ?? null,
        ].filter((value): value is string => Boolean(value)),
      );
      const trace = store
        .readAuditEvents(200)
        .filter((event) => {
          if (traceIds.has(event.refId)) return true;
          const eventOrderId =
            event.details && typeof event.details.orderId === "string"
              ? event.details.orderId
              : undefined;
          return eventOrderId === orderId;
        })
        .slice(-traceLimit)
        .map((event) => ({
          id: event.id,
          kind: event.kind,
          refId: event.refId,
          timestamp: event.timestamp,
          actor: event.actor ?? null,
          details: redactAuditDetails(event.details) ?? null,
        }));

      const acceptanceStatus = deriveAcceptanceStatus({
        orderStatus: order.status,
        settlementStatus: settlement?.status ?? undefined,
        disputeStatus: dispute?.status ?? undefined,
        hasProof: Boolean(proof),
      });
      const executionStatus = deriveExecutionStatus({
        orderStatus: order.status,
        settlementStatus: settlement?.status ?? undefined,
        disputeStatus: dispute?.status ?? undefined,
        hasProof: Boolean(proof),
      });

      respond(true, {
        orderId,
        executionStatus,
        order: {
          orderId: order.orderId,
          status: order.status,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          buyerId: order.buyerId,
          offerId: order.offerId,
          quantity: order.quantity,
        },
        offer: {
          offerId: offer.offerId,
          sellerId: offer.sellerId,
          assetId: offer.assetId,
          assetType: offer.assetType,
          price: offer.price,
          currency: offer.currency,
          deliveryType: offer.deliveryType,
          usageScope: offer.usageScope,
        },
        resource: resource
          ? {
              resourceId: resource.resourceId,
              kind: resource.kind,
              label: resource.label,
              description: resource.description,
              tags: resource.tags ?? [],
              price: resource.price,
              serviceSchema: resource.serviceSchema ?? null,
            }
          : null,
        lease: lease
          ? {
              leaseId: lease.leaseId,
              status: lease.status,
              issuedAt: lease.issuedAt,
              expiresAt: lease.expiresAt,
              resourceId: lease.resourceId,
            }
          : null,
        delivery: delivery
          ? {
              deliveryId: delivery.deliveryId,
              status: delivery.status,
              deliveryType: delivery.deliveryType,
              issuedAt: delivery.issuedAt,
              revokedAt: delivery.revokedAt ?? null,
            }
          : null,
        proof: proof
          ? {
              proofId: proof.proofId,
              status: proof.status,
              submittedAt: proof.submittedAt,
              summary: {
                type: proof.proof.type,
                verifier: proof.proof.verifier,
                artifactHash: proof.proof.artifactHash,
                issuedAt: proof.proof.issuedAt,
              },
            }
          : null,
        acceptance: {
          status: acceptanceStatus,
          decidedAt:
            acceptanceStatus === "acceptance_signed"
              ? (settlement?.releasedAt ?? order.updatedAt)
              : acceptanceStatus === "acceptance_rejected"
                ? (dispute?.openedAt ?? order.updatedAt)
                : null,
        },
        settlement: settlement
          ? {
              settlementId: settlement.settlementId,
              status: settlement.status,
              amount: settlement.amount,
              releasedAmount: settlement.releasedAmount ?? null,
              lockedAt: settlement.lockedAt ?? null,
              releasedAt: settlement.releasedAt ?? null,
              refundedAt: settlement.refundedAt ?? null,
            }
          : null,
        dispute: dispute
          ? {
              disputeId: dispute.disputeId,
              status: dispute.status,
              reason: dispute.reason,
              openedAt: dispute.openedAt,
              resolvedAt: dispute.resolvedAt ?? null,
            }
          : null,
        trace,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
