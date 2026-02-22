import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { assertAccess, formatGatewayErrorResponse } from "./_shared.js";

export function createMarketStatusSummaryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const offers = store.listOffers();
      const orders = store.listOrders();
      const deliveries = store.listDeliveries();
      const settlements = store.listSettlements();

      const countBy = <T extends { status: string }>(items: T[]) =>
        items.reduce(
          (acc, item) => {
            acc[item.status] = (acc[item.status] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

      respond(true, {
        offers: countBy(offers),
        orders: countBy(orders),
        deliveries: countBy(deliveries),
        settlements: countBy(settlements),
        totals: {
          offers: offers.length,
          orders: orders.length,
          deliveries: deliveries.length,
          settlements: settlements.length,
        },
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createMarketAuditQueryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const { limit } = (params ?? {}) as { limit?: number };
      const events = store.readAuditEvents(limit ?? 100);
      respond(true, { events, count: events.length });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createMarketTransparencySummaryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const { limit } = (params ?? {}) as { limit?: number };
      const offers = store.listOffers();
      const orders = store.listOrders();
      const consents = store.listConsents();
      const deliveries = store.listDeliveries();
      const settlements = store.listSettlements();
      const revocations = store.listRevocations();
      const events = store.readAuditEvents(limit ?? 200);

      const countBy = <T extends { status: string }>(items: T[]) =>
        items.reduce(
          (acc, item) => {
            acc[item.status] = (acc[item.status] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

      const purposes = offers.reduce(
        (acc, offer) => {
          const purpose = offer.usageScope.purpose;
          acc[purpose] = (acc[purpose] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const assets = offers.reduce(
        (acc, offer) => {
          acc[offer.assetId] = (acc[offer.assetId] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const revokeFailures = events.filter(
        (event) =>
          event.kind === "delivery_revoked" && event.details && event.details.revokeOk === false,
      ).length;

      const anchorFailures = events.filter(
        (event) => event.details && typeof event.details.anchorError === "string",
      ).length;

      respond(true, {
        totals: {
          offers: offers.length,
          orders: orders.length,
          consents: consents.length,
          deliveries: deliveries.length,
          settlements: settlements.length,
          revocations: revocations.length,
        },
        statuses: {
          offers: countBy(offers),
          orders: countBy(orders),
          deliveries: countBy(deliveries),
          settlements: countBy(settlements),
          consents: countBy(consents),
        },
        revocation: {
          pending: revocations.filter((job) => job.status === "pending").length,
          failed: revocations.filter((job) => job.status === "failed").length,
        },
        purposes,
        assets,
        audit: {
          events: events.slice(-Math.min(events.length, limit ?? 200)),
          count: events.length,
          revokeFailures,
          anchorFailures,
        },
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createMarketTransparencyTraceHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as {
        offerId?: string;
        orderId?: string;
        buyerId?: string;
        assetId?: string;
        deliveryId?: string;
        consentId?: string;
        settlementId?: string;
        limit?: number;
      };

      const offers = store.listOffers().filter((offer) => {
        if (input.offerId && offer.offerId !== input.offerId) return false;
        if (input.assetId && offer.assetId !== input.assetId) return false;
        return true;
      });

      const orders = store.listOrders().filter((order) => {
        if (input.orderId && order.orderId !== input.orderId) return false;
        if (input.offerId && order.offerId !== input.offerId) return false;
        if (input.buyerId && order.buyerId !== input.buyerId) return false;
        if (input.assetId) {
          const offer = offers.find((entry) => entry.offerId === order.offerId);
          if (!offer) return false;
        }
        return true;
      });

      const consents = store.listConsents().filter((consent) => {
        if (input.consentId && consent.consentId !== input.consentId) return false;
        if (input.orderId && consent.orderId !== input.orderId) return false;
        if (orders.length > 0 && !orders.find((order) => order.orderId === consent.orderId)) {
          return false;
        }
        return true;
      });

      const deliveries = store.listDeliveries().filter((delivery) => {
        if (input.deliveryId && delivery.deliveryId !== input.deliveryId) return false;
        if (input.orderId && delivery.orderId !== input.orderId) return false;
        if (orders.length > 0 && !orders.find((order) => order.orderId === delivery.orderId)) {
          return false;
        }
        return true;
      });

      const settlements = store.listSettlements().filter((settlement) => {
        if (input.settlementId && settlement.settlementId !== input.settlementId) return false;
        if (input.orderId && settlement.orderId !== input.orderId) return false;
        if (orders.length > 0 && !orders.find((order) => order.orderId === settlement.orderId)) {
          return false;
        }
        return true;
      });

      const refIds = new Set([
        ...offers.map((offer) => offer.offerId),
        ...orders.map((order) => order.orderId),
        ...consents.map((consent) => consent.consentId),
        ...deliveries.map((delivery) => delivery.deliveryId),
        ...settlements.map((settlement) => settlement.settlementId),
      ]);

      const events = store
        .readAuditEvents(input.limit ?? 300)
        .filter((event) => refIds.has(event.refId));

      respond(true, {
        offers,
        orders,
        consents,
        deliveries,
        settlements,
        audit: {
          events,
          count: events.length,
        },
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
