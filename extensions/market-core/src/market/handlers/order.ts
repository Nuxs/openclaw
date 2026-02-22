import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import { assertOrderTransition } from "../state-machine.js";
import type { Order } from "../types.js";
import { normalizeBuyerId, requireAddress, requireNumber, requireString } from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAudit,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";

export function createOrderCreateHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const offerId = requireString(input.offerId, "offerId");
      const offer = store.getOffer(offerId);
      if (!offer) throw new Error("offer not found");
      if (offer.status !== "offer_published") throw new Error("offer is not published");
      const buyerId = requireAddress(input.buyerId, "buyerId");
      if (actorId) {
        assertActorMatch(config, normalizeBuyerId(actorId), normalizeBuyerId(buyerId), "buyerId");
      }
      const quantity = input.quantity === undefined ? 1 : requireNumber(input.quantity, "quantity");
      if (quantity <= 0) throw new Error("quantity must be greater than 0");

      const orderId = randomUUID();
      const createdAt = nowIso();
      const orderHash = hashCanonical({
        orderId,
        offerId,
        buyerId,
        quantity,
        price: offer.price,
        currency: offer.currency,
      });

      const order: Order = {
        orderId,
        offerId,
        buyerId,
        quantity,
        status: "order_created",
        orderHash,
        createdAt,
        updatedAt: createdAt,
      };

      store.saveOrder(order);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "order_created",
        refId: orderId,
        hash: orderHash,
        anchorId: `order:${orderId}`,
        actor: buyerId,
      });
      respond(true, { orderId, orderHash, status: order.status });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createOrderCancelHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const orderId = requireString(input.orderId, "orderId");
      const order = store.getOrder(orderId);
      if (!order) throw new Error("order not found");
      if (actorId) {
        assertActorMatch(
          config,
          normalizeBuyerId(actorId),
          normalizeBuyerId(order.buyerId),
          "buyerId",
        );
      }
      assertOrderTransition(order.status, "order_cancelled");
      order.status = "order_cancelled";
      order.updatedAt = nowIso();
      store.saveOrder(order);
      recordAudit(store, "order_cancelled", orderId, order.orderHash, actorId || order.buyerId);
      respond(true, { orderId, status: order.status });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
