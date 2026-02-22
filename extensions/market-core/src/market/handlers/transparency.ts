import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { assertAccess, formatGatewayErrorResponse, redactAuditDetails } from "./_shared.js";

function redactDelivery<T extends { payload?: unknown; payloadRef?: unknown }>(delivery: T): T {
  return {
    ...delivery,
    payload: undefined,
    payloadRef: undefined,
  };
}

function redactAuditEvent<T extends { details?: Record<string, unknown> }>(event: T): T {
  if (!event.details) return event;
  return {
    ...event,
    details: redactAuditDetails(event.details),
  };
}

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
      const leases = store.listLeases();
      const disputes = store.listDisputes();
      const revocations = store.listRevocations();
      const auditEvents = store.readAuditEvents(200);

      const countBy = <T extends { status: string }>(items: T[]) =>
        items.reduce(
          (acc, item) => {
            acc[item.status] = (acc[item.status] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

      const now = Date.now();
      const expiredActive = leases.filter(
        (lease) => lease.status === "lease_active" && Date.parse(lease.expiresAt) <= now,
      ).length;

      // Pre-load resources, orders, and deliveries into Maps to avoid N+1 queries
      const resources = store.listResources();
      const resourceMap = new Map(resources.map((r) => [r.resourceId, r]));
      const orderMap = new Map(orders.map((o) => [o.orderId, o]));
      const deliveryMap = new Map(deliveries.map((d) => [d.deliveryId, d]));

      let orphaned = 0;
      const repairCandidates: typeof leases = [];
      for (const lease of leases) {
        const resource = resourceMap.get(lease.resourceId);
        const order = orderMap.get(lease.orderId);
        const delivery = lease.deliveryId ? deliveryMap.get(lease.deliveryId) : undefined;
        const missingRef = !resource || !order || (lease.deliveryId ? !delivery : false);
        const expired = Date.parse(lease.expiresAt) <= now;

        if (missingRef) orphaned++;
        if (
          (lease.status === "lease_active" && expired) ||
          !resource ||
          !order ||
          (lease.deliveryId && !delivery)
        ) {
          repairCandidates.push(lease);
        }
      }

      const unresolvedDisputes = disputes.filter(
        (entry) =>
          entry.status === "dispute_opened" || entry.status === "dispute_evidence_submitted",
      );
      const disputeResolved = disputes.filter(
        (entry) => entry.status === "dispute_resolved",
      ).length;
      const disputeRejected = disputes.filter(
        (entry) => entry.status === "dispute_rejected",
      ).length;

      const revocationPending = revocations.filter((job) => job.status === "pending").length;
      const revocationFailed = revocations.filter((job) => job.status === "failed").length;
      const anchorPending = auditEvents.filter(
        (event) => event.details && typeof event.details.anchorError === "string",
      ).length;

      respond(true, {
        offers: countBy(offers),
        orders: countBy(orders),
        deliveries: countBy(deliveries),
        settlements: countBy(settlements),
        leases: {
          total: leases.length,
          byStatus: countBy(leases),
          active: leases.filter((entry) => entry.status === "lease_active").length,
          expired: leases.filter((entry) => entry.status === "lease_expired").length,
          revoked: leases.filter((entry) => entry.status === "lease_revoked").length,
        },
        disputes: {
          total: disputes.length,
          byStatus: countBy(disputes),
          open: unresolvedDisputes.length,
          resolved: disputeResolved,
          rejected: disputeRejected,
        },
        revocations: {
          total: revocations.length,
          pending: revocationPending,
          failed: revocationFailed,
        },
        audit: {
          events: auditEvents.length,
          anchorPending,
        },
        repair: {
          candidates: repairCandidates.length,
          expiredActive,
          orphaned,
        },
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
      const events = store.readAuditEvents(limit ?? 100).map(redactAuditEvent);
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
      const deliveries = store.listDeliveries().map(redactDelivery);
      const settlements = store.listSettlements();
      const revocations = store.listRevocations();
      const events = store.readAuditEvents(limit ?? 200).map(redactAuditEvent);

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

      const deliveries = store
        .listDeliveries()
        .filter((delivery) => {
          if (input.deliveryId && delivery.deliveryId !== input.deliveryId) return false;
          if (input.orderId && delivery.orderId !== input.orderId) return false;
          if (orders.length > 0 && !orders.find((order) => order.orderId === delivery.orderId)) {
            return false;
          }
          return true;
        })
        .map(redactDelivery);

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
        .filter((event) => refIds.has(event.refId))
        .map(redactAuditEvent);

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
