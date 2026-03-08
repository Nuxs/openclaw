import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import { assertTaskBidTransition, assertTaskOrderTransition } from "../task-state-machine.js";
import type { Offer, Order, Settlement, TaskBid } from "../types.js";
import { requireLimit, requireOptionalEnum, requireString } from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";

function requireBidPrice(input: Record<string, unknown>): { price: string; currency: string } {
  const price = requireString(input.price, "price");
  if (!/^\d+$/.test(price)) {
    throw new Error("E_INVALID_ARGUMENT: price must be integer string");
  }
  return {
    price,
    currency: requireString(input.currency, "currency"),
  };
}

export function createTaskBidPlaceHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const bidderActorId = requireActorId(opts, config, input);
      const task = store.getTask(requireString(input.taskId, "taskId"));
      if (!task) {
        throw new Error("E_NOT_FOUND: task not found");
      }
      if (task.status !== "task_open") {
        throw new Error("E_CONFLICT: task is not open");
      }
      const { price, currency } = requireBidPrice(input);
      if (currency !== task.budget.currency) {
        throw new Error("E_INVALID_ARGUMENT: bid currency must match task budget currency");
      }
      const createdAt = nowIso();
      const bid: TaskBid = {
        bidId: randomUUID(),
        taskId: task.taskId,
        bidderActorId,
        price,
        currency,
        etaHours: typeof input.etaHours === "number" ? input.etaHours : undefined,
        summary: typeof input.summary === "string" ? input.summary.trim() : undefined,
        status: "bid_submitted",
        bidHash: "",
        createdAt,
        updatedAt: createdAt,
      };
      bid.bidHash = hashCanonical({
        bidId: bid.bidId,
        taskId: bid.taskId,
        bidderActorId,
        price,
        currency,
        etaHours: bid.etaHours,
      });
      store.saveTaskBid(bid);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "task_bid_submitted",
        refId: bid.bidId,
        hash: bid.bidHash,
        anchorId: `task-bid:${bid.bidId}`,
        actor: bidderActorId,
        details: { taskId: bid.taskId, price, currency },
      });
      respond(true, { bidId: bid.bidId, status: bid.status, bidHash: bid.bidHash });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createTaskBidListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const status = requireOptionalEnum(input, "status", [
        "bid_submitted",
        "bid_withdrawn",
        "bid_accepted",
        "bid_rejected",
      ] as const);
      const limit = requireLimit(input, "limit", 50, 200);
      const taskId = typeof input.taskId === "string" ? input.taskId : undefined;
      const bidderActorId =
        typeof input.bidderActorId === "string" ? input.bidderActorId : undefined;
      const bids = store
        .listTaskBids()
        .filter((bid) => {
          if (taskId && bid.taskId !== taskId) return false;
          if (bidderActorId && bid.bidderActorId !== bidderActorId) return false;
          if (status && bid.status !== status) return false;
          if (actorId) {
            const task = store.getTask(bid.taskId);
            if (bid.bidderActorId !== actorId && task?.creatorActorId !== actorId) {
              return false;
            }
          }
          return true;
        })
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, limit);
      respond(true, { count: bids.length, bids });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

function buildSyntheticOffer(params: {
  taskId: string;
  taskTitle: string;
  sellerId: string;
  price: number;
  currency: string;
}): Offer {
  const createdAt = nowIso();
  const offerId = randomUUID();
  const offer: Offer = {
    offerId,
    sellerId: params.sellerId,
    assetId: `task:${params.taskId}`,
    assetType: "service",
    assetMeta: {
      title: params.taskTitle,
      description: `Task service offer for ${params.taskId}`,
      tags: ["task", "service"],
    },
    price: params.price,
    currency: params.currency,
    usageScope: { purpose: "task_execution", durationDays: 30, transferable: false },
    deliveryType: "service",
    status: "offer_published",
    offerHash: hashCanonical({
      taskId: params.taskId,
      sellerId: params.sellerId,
      price: params.price,
      currency: params.currency,
    }),
    createdAt,
    updatedAt: createdAt,
  };
  return offer;
}

export function createTaskBidAwardHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const bid = store.getTaskBid(requireString(input.bidId, "bidId"));
      if (!bid) {
        throw new Error("E_NOT_FOUND: bid not found");
      }
      const task = store.getTask(bid.taskId);
      if (!task) {
        throw new Error("E_NOT_FOUND: task not found");
      }
      assertActorMatch(config, actorId, task.creatorActorId, "creatorActorId");
      assertTaskOrderTransition(task.status, "task_awarded");
      assertTaskBidTransition(bid.status, "bid_accepted");

      const offer = buildSyntheticOffer({
        taskId: task.taskId,
        taskTitle: task.title,
        sellerId: bid.bidderActorId,
        price: Number(bid.price),
        currency: bid.currency,
      });
      const createdAt = nowIso();
      // Task market orders skip the standard consent/delivery flow —
      // TaskResult handles delivery. Start at "delivery_completed" so
      // releaseSettlementIncremental can transition to "settlement_completed".
      const order: Order = {
        orderId: randomUUID(),
        offerId: offer.offerId,
        buyerId: task.creatorActorId,
        quantity: 1,
        status: "delivery_completed",
        orderHash: hashCanonical({
          taskId: task.taskId,
          bidId: bid.bidId,
          offerId: offer.offerId,
          buyerId: task.creatorActorId,
        }),
        createdAt,
        updatedAt: createdAt,
        taskId: task.taskId,
        taskBidId: bid.bidId,
      };
      const settlement: Settlement = {
        settlementId: randomUUID(),
        orderId: order.orderId,
        status: "settlement_locked",
        amount: bid.price,
        releasedAmount: "0",
        strategy: "one-shot",
        lockedAt: createdAt,
        settlementHash: hashCanonical({
          taskId: task.taskId,
          orderId: order.orderId,
          amount: bid.price,
          currency: bid.currency,
        }),
        revision: 1,
        updatedAt: createdAt,
      };

      await store.runInTransaction(() => {
        store.saveOffer(offer);
        store.saveOrder(order);
        store.saveSettlement(settlement);

        task.status = "task_awarded";
        task.awardedBidId = bid.bidId;
        task.orderId = order.orderId;
        task.settlementId = settlement.settlementId;
        task.updatedAt = createdAt;
        store.saveTask(task);

        bid.status = "bid_accepted";
        bid.updatedAt = createdAt;
        store.saveTaskBid(bid);

        for (const entry of store.listTaskBids()) {
          if (entry.taskId !== task.taskId || entry.bidId === bid.bidId) continue;
          if (entry.status !== "bid_submitted") continue;
          assertTaskBidTransition(entry.status, "bid_rejected");
          entry.status = "bid_rejected";
          entry.updatedAt = createdAt;
          store.saveTaskBid(entry);
        }
      });

      await recordAuditWithAnchor({
        store,
        config,
        kind: "task_awarded",
        refId: task.taskId,
        hash: settlement.settlementHash ?? task.taskHash,
        anchorId: `task:${task.taskId}:award`,
        actor: actorId,
        details: {
          bidId: bid.bidId,
          orderId: order.orderId,
          settlementId: settlement.settlementId,
        },
      });

      respond(true, {
        taskId: task.taskId,
        bidId: bid.bidId,
        orderId: order.orderId,
        settlementId: settlement.settlementId,
        status: task.status,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
