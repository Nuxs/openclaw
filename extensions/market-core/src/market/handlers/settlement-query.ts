/**
 * Settlement Query Handlers
 *
 * Read-only handlers for querying settlement status and listing
 * settlements with aggregation, time-range filtering, and trend analysis.
 */

import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import type { Settlement } from "../types.js";
import {
  normalizeBuyerId,
  requireLimit,
  requireOptionalEnum,
  requireOptionalIsoTimestamp,
} from "../validators.js";
import { assertAccess, formatGatewayErrorResponse, requireActorId } from "./_shared.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseSettlementAmount(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveSettlementTimestamp(settlement: Settlement): string | undefined {
  return (
    settlement.releasedAt ?? settlement.refundedAt ?? settlement.lockedAt ?? settlement.updatedAt
  );
}

// ---------------------------------------------------------------------------
// Single-settlement status lookup
// ---------------------------------------------------------------------------

export function createSettlementStatusHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const orderId = typeof input.orderId === "string" ? input.orderId : undefined;
      const settlementId = typeof input.settlementId === "string" ? input.settlementId : undefined;

      if (!orderId && !settlementId) {
        throw new Error("orderId or settlementId is required");
      }

      let settlement = settlementId ? store.getSettlement(settlementId) : undefined;
      if (!settlement && orderId) {
        settlement = store.getSettlementByOrder(orderId);
      }
      if (!settlement) throw new Error("settlement not found");

      const resolvedOrderId = orderId ?? settlement.orderId;
      const order = store.getOrder(resolvedOrderId);
      const offer = order ? store.getOffer(order.offerId) : undefined;

      if (actorId && order) {
        const buyerMatch = normalizeBuyerId(actorId) === normalizeBuyerId(order.buyerId ?? "");
        const sellerMatch = offer ? actorId === offer.sellerId : false;
        if (!buyerMatch && !sellerMatch) {
          throw new Error("actorId does not match buyerId or sellerId");
        }
      }

      respond(true, {
        orderId: resolvedOrderId,
        orderStatus: order?.status ?? null,
        settlementId: settlement.settlementId,
        status: settlement.status ?? null,
        amount: settlement.amount ?? null,
        releasedAmount:
          settlement.releasedAmount ??
          (settlement.status === "settlement_released" ? settlement.amount : "0"),
        strategy: settlement.strategy ?? "one-shot",
        tokenAddress: settlement.tokenAddress ?? null,
        lockTxHash: settlement.lockTxHash ?? null,
        releaseTxHash: settlement.releaseTxHash ?? null,
        refundTxHash: settlement.refundTxHash ?? null,
        lockedAt: settlement.lockedAt ?? null,
        releasedAt: settlement.releasedAt ?? null,
        refundedAt: settlement.refundedAt ?? null,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

// ---------------------------------------------------------------------------
// Multi-settlement list with aggregation & trend
// ---------------------------------------------------------------------------

export function createSettlementQueryHandler(
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
      const settlementId =
        typeof input.settlementId === "string" ? input.settlementId.trim() : undefined;
      const status = requireOptionalEnum(input, "status", [
        "settlement_locked",
        "settlement_released",
        "settlement_refunded",
      ] as const);
      const timeRange = requireOptionalEnum(input, "timeRange", [
        "today",
        "week",
        "month",
      ] as const);
      const now = new Date();
      const nowMs = now.getTime();
      const since =
        requireOptionalIsoTimestamp(input, "since") ??
        (timeRange === "today"
          ? new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
          : timeRange === "week"
            ? new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()
            : timeRange === "month"
              ? new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString()
              : undefined);
      const until =
        requireOptionalIsoTimestamp(input, "until") ?? (since ? now.toISOString() : undefined);
      const limit = requireLimit(input, "limit", 50, 200);

      const orders = store.listOrders();
      const orderMap = new Map(orders.map((order) => [order.orderId, order]));
      const offers = store.listOffers();
      const offerMap = new Map(offers.map((offer) => [offer.offerId, offer]));

      const filtered = store
        .listSettlements()
        .filter((settlement) => {
          if (settlementId && settlement.settlementId !== settlementId) return false;
          if (orderId && settlement.orderId !== orderId) return false;
          if (status && settlement.status !== status) return false;

          const ts = resolveSettlementTimestamp(settlement);
          if (since && (!ts || Date.parse(ts) < Date.parse(since))) return false;
          if (until && (!ts || Date.parse(ts) > Date.parse(until))) return false;

          if (actorId) {
            const order = orderMap.get(settlement.orderId);
            const offer = order ? offerMap.get(order.offerId) : undefined;
            const actorMatchesBuyer = order
              ? normalizeBuyerId(order.buyerId) === normalizeBuyerId(actorId)
              : false;
            const actorMatchesSeller = offer
              ? normalizeBuyerId(offer.sellerId) === normalizeBuyerId(actorId)
              : false;
            if (!actorMatchesBuyer && !actorMatchesSeller) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const aTs = resolveSettlementTimestamp(a);
          const bTs = resolveSettlementTimestamp(b);
          return Date.parse(bTs ?? "") - Date.parse(aTs ?? "");
        });

      const settlements = filtered.slice(0, limit).map((settlement) => {
        const order = orderMap.get(settlement.orderId);
        const offer = order ? offerMap.get(order.offerId) : undefined;
        return {
          settlementId: settlement.settlementId,
          orderId: settlement.orderId,
          status: settlement.status,
          amount: settlement.amount,
          releasedAmount:
            settlement.releasedAmount ??
            (settlement.status === "settlement_released" ? settlement.amount : "0"),
          orderStatus: order?.status ?? null,
          buyerId: order?.buyerId ?? null,
          sellerId: offer?.sellerId ?? null,
          lockedAt: settlement.lockedAt ?? null,
          releasedAt: settlement.releasedAt ?? null,
          refundedAt: settlement.refundedAt ?? null,
        };
      });

      const total = settlements.reduce(
        (sum, settlement) => sum + parseSettlementAmount(settlement.amount),
        0,
      );
      const settled = settlements
        .filter((settlement) => settlement.status === "settlement_released")
        .reduce((sum, settlement) => sum + parseSettlementAmount(settlement.releasedAmount), 0);
      const pending = settlements
        .filter((settlement) => settlement.status === "settlement_locked")
        .reduce((sum, settlement) => sum + parseSettlementAmount(settlement.amount), 0);
      const refunded = settlements
        .filter((settlement) => settlement.status === "settlement_refunded")
        .reduce((sum, settlement) => sum + parseSettlementAmount(settlement.amount), 0);

      let trend = 0;
      if (since && until) {
        const sinceMs = Date.parse(since);
        const untilMs = Date.parse(until);
        const windowMs = Math.max(1, untilMs - sinceMs);
        const prevSince = new Date(sinceMs - windowMs).toISOString();
        const prevUntil = new Date(sinceMs).toISOString();

        const previousTotal = store
          .listSettlements()
          .filter((settlement) => {
            const ts = resolveSettlementTimestamp(settlement);
            if (!ts) return false;
            const tsMs = Date.parse(ts);
            return tsMs >= Date.parse(prevSince) && tsMs < Date.parse(prevUntil);
          })
          .reduce((sum, settlement) => sum + parseSettlementAmount(settlement.amount), 0);

        if (previousTotal > 0) {
          trend = ((total - previousTotal) / previousTotal) * 100;
        } else if (total > 0) {
          trend = 100;
        }
      }

      respond(true, {
        count: settlements.length,
        orderCount: new Set(settlements.map((item) => item.orderId)).size,
        total,
        settled,
        pending,
        refunded,
        trend,
        range: since || until ? { since: since ?? null, until: until ?? null } : null,
        settlements,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
