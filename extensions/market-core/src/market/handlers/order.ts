import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import { assertOrderTransition } from "../state-machine.js";
import type { Order, OrderStatus } from "../types.js";
import {
  normalizeBuyerId,
  requireAddress,
  requireLimit,
  requireNumber,
  requireOptionalEnum,
  requireString,
} from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAudit,
  recordAuditWithAnchor,
  requireActorId,
  requireOptionalAddress,
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

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "order_created",
  "payment_locked",
  "consent_granted",
  "delivery_ready",
  "delivery_completed",
];

export function createOrderListHandler(
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
      const offerId = typeof input.offerId === "string" ? input.offerId.trim() : undefined;
      const buyerId = requireOptionalAddress(input, "buyerId");
      const sellerId = requireOptionalAddress(input, "sellerId");
      const statusInput = requireOptionalEnum(input, "status", [
        "active",
        "order_created",
        "payment_locked",
        "consent_granted",
        "delivery_ready",
        "delivery_completed",
        "settlement_completed",
        "order_cancelled",
        "settlement_cancelled",
        "consent_revoked",
      ] as const);
      const statuses =
        statusInput === "active"
          ? new Set<string>(ACTIVE_ORDER_STATUSES)
          : statusInput
            ? new Set<string>([statusInput])
            : undefined;
      const limit = requireLimit(input, "limit", 50, 200);

      const offers = store.listOffers();
      const offerMap = new Map(offers.map((offer) => [offer.offerId, offer]));
      const resources = store.listResources();
      const resourceByOfferId = new Map(resources.map((resource) => [resource.offerId, resource]));

      const orders = store
        .listOrders()
        .filter((order) => {
          if (orderId && order.orderId !== orderId) return false;
          if (offerId && order.offerId !== offerId) return false;
          if (buyerId && normalizeBuyerId(order.buyerId) !== normalizeBuyerId(buyerId))
            return false;
          if (statuses && !statuses.has(order.status)) return false;

          const offer = offerMap.get(order.offerId);
          if (
            sellerId &&
            (!offer || normalizeBuyerId(offer.sellerId) !== normalizeBuyerId(sellerId))
          ) {
            return false;
          }

          if (actorId) {
            const actorMatchesBuyer = normalizeBuyerId(order.buyerId) === normalizeBuyerId(actorId);
            const actorMatchesSeller =
              offer && normalizeBuyerId(offer.sellerId) === normalizeBuyerId(actorId);
            if (!actorMatchesBuyer && !actorMatchesSeller) return false;
          }

          return true;
        })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, limit)
        .map((order) => {
          const offer = offerMap.get(order.offerId);
          const resource = resourceByOfferId.get(order.offerId);
          return {
            orderId: order.orderId,
            offerId: order.offerId,
            resourceId: resource?.resourceId,
            resourceName: resource?.label ?? offer?.assetMeta.title ?? offer?.assetId ?? null,
            buyerId: order.buyerId,
            sellerId: offer?.sellerId ?? null,
            quantity: order.quantity,
            status: order.status,
            price: offer?.price ?? null,
            currency: offer?.currency ?? null,
            unit: resource?.price.unit ?? null,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          };
        });

      respond(true, {
        count: orders.length,
        orders,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
