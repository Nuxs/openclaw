/**
 * 动态定价 Handlers
 * Dynamic Pricing Request Handlers
 */

import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import {
  calculateDynamicPrice,
  calculateTieredPrice,
  collectMarketMetrics,
  calculateVolatility,
} from "../pricing-engine.js";
import type {
  PricingModel,
  PriceHistory,
  MarketStatistics,
  OrderBook,
  OrderBookEntry,
} from "../pricing-types.js";
import {
  assertAccess,
  formatGatewayErrorResponse,
  requireActorId,
  nowIso,
  randomUUID,
} from "./_shared.js";

// 本地辅助函数
function requireString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number") {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

/**
 * 创建或更新定价模型
 */
export function createPricingModelHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const offerId = requireString(input.offerId, "offerId");

      // 验证 offer 存在且属于当前用户
      const offer = store.getOffer(offerId);
      if (!offer) throw new Error("E_NOT_FOUND: offer not found");
      if (actorId && offer.sellerId !== actorId) {
        throw new Error("E_FORBIDDEN: actorId does not match offer owner");
      }

      const pricingModel: PricingModel = {
        strategy: (input.strategy as PricingModel["strategy"]) || "fixed",
        basePrice: requireNumber(input.basePrice, "basePrice"),
        dynamic: input.dynamic as PricingModel["dynamic"],
        tiered: input.tiered as PricingModel["tiered"],
        surge: input.surge as PricingModel["surge"],
        auction: input.auction as PricingModel["auction"],
        constraints: input.constraints as PricingModel["constraints"],
      };

      // 保存定价模型
      // store.savePricingModel(offerId, pricingModel);

      respond(true, {
        offerId,
        strategy: pricingModel.strategy,
        basePrice: pricingModel.basePrice,
        message: "定价模型已保存",
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

/**
 * 获取定价模型
 */
export function getPricingModelHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const offerId = requireString(input.offerId, "offerId");

      const offer = store.getOffer(offerId);
      if (!offer) {
        throw new Error("E_NOT_FOUND: offer not found");
      }

      // 当前实现：若未持久化额外定价模型，则回退到 Offer 的固定价格。
      const pricingModel: PricingModel = {
        strategy: "fixed",
        basePrice: offer.price,
      };

      respond(true, { offerId, pricingModel });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

/**
 * 计算实时价格
 */
export function calculatePriceHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const offerId = requireString(input.offerId, "offerId");
      const quantity = input.quantity ? requireNumber(input.quantity, "quantity") : 1;

      const offer = store.getOffer(offerId);
      if (!offer) {
        throw new Error("E_NOT_FOUND: offer not found");
      }

      // 当前实现：未持久化额外定价模型时，使用 Offer 的固定价格。
      const pricingModel: PricingModel = {
        strategy: "fixed",
        basePrice: offer.price,
      };

      let priceCalculation;

      // 分级定价（如果提供了 tiered 配置）
      if (pricingModel.strategy === "tiered" && pricingModel.tiered?.enabled) {
        priceCalculation = calculateTieredPrice(pricingModel, quantity);
      }
      // 动态定价（如果提供了 dynamic/surge 配置）
      else if (pricingModel.strategy === "dynamic" || pricingModel.surge?.enabled) {
        const orders = store
          .listOrders()
          .filter((o) => o.offerId === offerId)
          .map((o) => ({ status: o.status, createdAt: o.createdAt }));

        const providers: Array<{ active: boolean; capacity: number; available: number }> = [];
        const competitorOffers: Array<{ price: number }> = [];

        const metrics = collectMarketMetrics({
          offerId,
          resourceType: offer.assetType,
          orders,
          providers,
          competitorOffers,
        });

        priceCalculation = calculateDynamicPrice(pricingModel, metrics);
      }
      // 固定价格
      else {
        priceCalculation = {
          basePrice: pricingModel.basePrice,
          finalPrice: pricingModel.basePrice * quantity,
          adjustments: [],
          metadata: { quantity },
        };
      }

      // 记录价格历史（当前未持久化，保留为将来扩展）
      const priceHistory: PriceHistory = {
        historyId: randomUUID(),
        resourceType: offer.assetType,
        offerId,
        price: priceCalculation.finalPrice,
        timestamp: nowIso(),
        source: "system",
        providerId: offer.sellerId,
      };
      void priceHistory;

      respond(true, { offerId, ...priceCalculation });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

/**
 * 获取价格历史
 */
export function getPriceHistoryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const offerId = requireString(input.offerId, "offerId");
      const limit = input.limit ? requireNumber(input.limit, "limit") : 100;

      const history: PriceHistory[] = []; // store.getPriceHistory(offerId, limit);
      void limit;

      respond(true, {
        offerId,
        count: history.length,
        history,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

/**
 * 获取市场统计
 */
export function getMarketStatisticsHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const assetType = requireString(input.assetType, "assetType");

      const offers = store.listOffers().filter((o) => o.assetType === assetType);
      if (offers.length === 0) {
        throw new Error("E_NOT_FOUND: no offers for assetType");
      }

      const prices = offers.map((o) => o.price).sort((a, b) => a - b);
      const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const min = prices[0] ?? 0;
      const max = prices[prices.length - 1] ?? 0;
      const median = prices[Math.floor(prices.length / 2)] ?? avg;
      const p25 = prices[Math.floor(prices.length * 0.25)] ?? min;
      const p75 = prices[Math.floor(prices.length * 0.75)] ?? max;

      const priceVolatility = calculateVolatility([]);

      const statistics: MarketStatistics = {
        resourceType: assetType,
        assetType,
        timestamp: nowIso(),
        offerCount: offers.length,
        priceStats: {
          min,
          max,
          median,
          p25,
          p75,
          avg,
        },
        volatility: priceVolatility,
      };

      respond(true, statistics);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

/**
 * 创建订单簿条目（买单/卖单）
 */
export function createOrderBookEntryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const offerId = requireString(input.offerId, "offerId");
      const side = requireString(input.side, "side");
      if (side !== "buy" && side !== "sell") {
        throw new Error("E_INVALID_ARGUMENT: side must be buy or sell");
      }
      const price = requireNumber(input.price, "price");
      const quantity = requireNumber(input.quantity, "quantity");
      const expiresIn = input.expiresIn ? requireNumber(input.expiresIn, "expiresIn") : undefined;

      const offer = store.getOffer(offerId);
      if (!offer) {
        throw new Error("E_NOT_FOUND: offer not found");
      }
      const entry: OrderBookEntry = {
        entryId: randomUUID(),
        offerId,
        resourceType: offer.assetType,
        side,
        price,
        quantity,
        userId: actorId,
        status: "pending",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
      };

      // store.saveOrderBookEntry(entry);

      // 尝试撮合
      const matches = matchOrderBookEntries(store, offerId);

      respond(true, {
        entryId: entry.entryId,
        status: entry.status,
        matches: matches.length,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

/**
 * 获取订单簿
 */
export function getOrderBookHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const offerId = requireString(input.offerId, "offerId");

      const entries: OrderBookEntry[] = []; // store.getOrderBookEntries(offerId);
      const bids = entries
        .filter((e) => e.side === "buy" && e.status === "pending")
        .sort((a, b) => b.price - a.price); // 买单降序
      const asks = entries
        .filter((e) => e.side === "sell" && e.status === "pending")
        .sort((a, b) => a.price - b.price); // 卖单升序

      const spread = bids.length > 0 && asks.length > 0 ? asks[0].price - bids[0].price : undefined;
      const midPrice = spread !== undefined ? (asks[0].price + bids[0].price) / 2 : undefined;

      const offer = store.getOffer(offerId);
      if (!offer) {
        throw new Error("E_NOT_FOUND: offer not found");
      }
      const orderBook: OrderBook = {
        offerId,
        resourceType: offer.assetType,
        timestamp: nowIso(),
        bids,
        asks,
        spread,
        midPrice,
      };

      respond(true, orderBook);
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

/**
 * 订单簿撮合算法
 *
 * 匹配买单和卖单，当买单价格 >= 卖单价格时成交
 */
function matchOrderBookEntries(
  store: MarketStateStore,
  offerId: string,
): Array<{
  buyEntry: OrderBookEntry;
  sellEntry: OrderBookEntry;
  matchPrice: number;
  matchQuantity: number;
}> {
  const entries: OrderBookEntry[] = []; // store.getOrderBookEntries(offerId);
  const bids = entries
    .filter((e) => e.side === "buy" && e.status === "pending")
    .sort((a, b) => b.price - a.price);
  const asks = entries
    .filter((e) => e.side === "sell" && e.status === "pending")
    .sort((a, b) => a.price - b.price);

  const matches: Array<{
    buyEntry: OrderBookEntry;
    sellEntry: OrderBookEntry;
    matchPrice: number;
    matchQuantity: number;
  }> = [];

  let bidIdx = 0;
  let askIdx = 0;

  while (bidIdx < bids.length && askIdx < asks.length) {
    const bid = bids[bidIdx];
    const ask = asks[askIdx];

    // 买单价格 < 卖单价格，无法成交
    if (bid.price < ask.price) break;

    // 成交价格为卖单价格（有利于买方）
    const matchPrice = ask.price;
    const matchQuantity = Math.min(bid.quantity, ask.quantity);

    matches.push({
      buyEntry: bid,
      sellEntry: ask,
      matchPrice,
      matchQuantity,
    });

    // 更新数量
    bid.quantity -= matchQuantity;
    ask.quantity -= matchQuantity;

    // 更新状态
    if (bid.quantity === 0) {
      bid.status = "filled";
      // store.saveOrderBookEntry(bid);
      bidIdx++;
    } else {
      bid.status = "partial";
      // store.saveOrderBookEntry(bid);
    }

    if (ask.quantity === 0) {
      ask.status = "filled";
      // store.saveOrderBookEntry(ask);
      askIdx++;
    } else {
      ask.status = "partial";
      // store.saveOrderBookEntry(ask);
    }
  }

  return matches;
}
