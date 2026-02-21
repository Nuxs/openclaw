import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { createDeliveryCredentialsStore } from "../credentials.js";
import { hashCanonical } from "../hash.js";
import { executeRevocation } from "../revocation.js";
import { assertDeliveryTransition, assertOrderTransition } from "../state-machine.js";
import type { Delivery } from "../types.js";
import { requireDeliveryPayload, requireString } from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  createRevocationJob,
  formatGatewayError,
  nowIso,
  randomUUID,
  recordAudit,
  recordAuditWithAnchor,
  requireActorId,
  resolveDeliveryPayloadForRevocation,
} from "./_shared.js";

export function createDeliveryIssueHandler(
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
      const order = store.getOrder(orderId);
      if (!order) throw new Error("order not found");
      assertOrderTransition(order.status, "delivery_ready");

      const offer = store.getOffer(order.offerId);
      if (!offer) throw new Error("offer not found");
      if (actorId) {
        assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      }

      const payload = requireDeliveryPayload(offer.deliveryType, input.payload);
      const deliveryId = randomUUID();
      const issuedAt = nowIso();
      const deliveryHash = hashCanonical({
        deliveryId,
        orderId,
        deliveryType: offer.deliveryType,
        issuedAt,
        payload,
      });

      const credentialsStore = createDeliveryCredentialsStore(config.credentials);
      const payloadRef =
        credentialsStore && payload
          ? await credentialsStore.putDeliveryPayload(deliveryId, payload)
          : undefined;
      const storedPayload = payloadRef ? undefined : payload;

      const delivery: Delivery = {
        deliveryId,
        orderId,
        deliveryType: offer.deliveryType,
        status: "delivery_ready",
        deliveryHash,
        issuedAt,
        payload: storedPayload,
        payloadRef,
      };

      store.saveDelivery(delivery);
      order.status = "delivery_ready";
      order.updatedAt = issuedAt;
      store.saveOrder(order);

      await recordAuditWithAnchor({
        store,
        config,
        kind: "delivery_issued",
        refId: deliveryId,
        hash: deliveryHash,
        anchorId: `delivery:${deliveryId}`,
        actor: actorId || offer.sellerId,
        details: {
          deliveryType: delivery.deliveryType,
          payloadRef: payloadRef?.ref,
        },
      });
      respond(true, { deliveryId, deliveryHash, status: delivery.status, payload });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
  };
}

export function createDeliveryRevokeHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const deliveryId = requireString(input.deliveryId, "deliveryId");
      const reason =
        typeof input.reason === "string" && input.reason.trim().length > 0
          ? input.reason
          : undefined;
      const delivery = store.getDelivery(deliveryId);
      if (!delivery) throw new Error("delivery not found");
      assertDeliveryTransition(delivery.status, "delivery_revoked");

      const revokedAt = nowIso();
      const revokeReason = reason ?? "manual_revoke";
      delivery.status = "delivery_revoked";
      delivery.revokedAt = revokedAt;
      delivery.revokeReason = revokeReason;
      const revokeHash = hashCanonical({
        deliveryId: delivery.deliveryId,
        orderId: delivery.orderId,
        revokedAt,
        reason: revokeReason,
      });
      delivery.revokeHash = revokeHash;
      store.saveDelivery(delivery);

      const order = store.getOrder(delivery.orderId);
      const offer = order ? store.getOffer(order.offerId) : undefined;
      if (offer && actorId) {
        assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      }
      const deliveryPayload = await resolveDeliveryPayloadForRevocation(config, delivery);
      const revokeResult = await executeRevocation(config, {
        delivery: deliveryPayload ? { ...delivery, payload: deliveryPayload } : delivery,
        order: order ?? undefined,
        offer,
        reason: revokeReason,
      });

      if (!revokeResult.ok) {
        const job = createRevocationJob({
          config,
          delivery,
          order: order ?? undefined,
          offer,
          reason: revokeReason,
          error: revokeResult.error,
        });
        store.saveRevocation(job);
        recordAudit(store, "revocation_retry", job.jobId, job.payloadHash, undefined, {
          deliveryId: delivery.deliveryId,
          attempts: job.attempts,
          nextAttemptAt: job.nextAttemptAt,
        });
      }

      await recordAuditWithAnchor({
        store,
        config,
        kind: "delivery_revoked",
        refId: deliveryId,
        hash: revokeHash,
        anchorId: `revoke:${deliveryId}`,
        actor: actorId || offer?.sellerId,
        details: {
          deliveryHash: delivery.deliveryHash,
          revokeReason,
          revokeOk: revokeResult.ok,
          revokeStatus: revokeResult.status,
          revokeError: revokeResult.error,
        },
      });
      respond(true, { deliveryId, revokedAt, revokeResult });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
  };
}

export function createDeliveryCompleteHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const deliveryId = requireString(input.deliveryId, "deliveryId");
      const delivery = store.getDelivery(deliveryId);
      if (!delivery) throw new Error("delivery not found");
      assertDeliveryTransition(delivery.status, "delivery_completed");

      delivery.status = "delivery_completed";
      store.saveDelivery(delivery);

      const order = store.getOrder(delivery.orderId);
      const offer = order ? store.getOffer(order.offerId) : undefined;
      if (offer && actorId) {
        assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      }
      if (order) {
        assertOrderTransition(order.status, "delivery_completed");
        order.status = "delivery_completed";
        order.updatedAt = nowIso();
        store.saveOrder(order);
      }

      recordAudit(
        store,
        "delivery_completed",
        deliveryId,
        delivery.deliveryHash,
        actorId || offer?.sellerId,
      );
      respond(true, { deliveryId, status: delivery.status });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
  };
}
