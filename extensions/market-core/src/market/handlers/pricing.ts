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
  requireActorId,
  requireString,
  requireNumber,
  nowIso,
  randomUUID,
} from "./_shared.js";

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
      if (!offer) throw new Error("offer not found");
      if (actorId && offer.sellerId !== actorId) {
        throw new Error("unauthorized: not offer owner");
      }

      const pricingModel: PricingModel = {
        strategy: (input.strategy as PricingModel["strategy"]) || "fixed",
        basePrice: requireNumber(input.basePrice, "basePrice"),
        currency: requireString(input.currency, "currency"),
        dynamicConfig: input.dynamicConfig as PricingModel["dynamicConfig"],
        tierConfig: input.tierConfig as PricingModel["tierConfig"],
        surgeConfig: input.surgeConfig as PricingModel["surgeConfig"],
        auctionConfig: input.auctionConfig as PricingModel["auctionConfig"],
        constraints: input.constraints as PricingModel["constraints"],
      };

      // 保存定价模型
      store.savePricingModel(offerId, pricingModel);

      respond(true, {
        offerId,
        strategy: pricingModel.strategy,
        basePrice: pricingModel.basePrice,
        message: "定价模型已保存",
      });
    } catch (err) {
      respond(false, { error: String(err) });
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

      const pricingModel = store.getPricingModel(offerId);
      if (!pricingModel) {
        respond(false, { error: "定价模型不存在" });
        return;
      }

      respond(true, { offerId, pricingModel });
    } catch (err) {
      respond(false, { error: String(err) });
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

      const pricingModel = store.getPricingModel(offerId);
      if (!pricingModel) {
        respond(false, { error: "定价模型不存在" });
        return;
      }

      let priceCalculation;

      // 如果是分级定价
      if (pricingModel.strategy === "tiered" && pricingModel.tierConfig?.enabled) {
        priceCalculation = calculateTieredPrice(pricingModel, quantity);
        priceCalculation.offerId = offerId;
      }
      // 如果是动态定价
      else if (pricingModel.strategy === "dynamic" || pricingModel.surgeConfig?.enabled) {
        // 收集市场指标
        const orders = store.getOrdersByOffer(offerId);
        const providers = store.getProvidersByOffer?.(offerId) || [];
        const competitorOffers = store.getCompetitorOffers?.(offerId) || [];

        const metrics = collectMarketMetrics(offerId, orders, providers, competitorOffers);
        priceCalculation = calculateDynamicPrice(pricingModel, metrics);
      }
      // 固定价格
      else {
        priceCalculation = {
          offerId,
          originalPrice: pricingModel.basePrice,
          calculatedPrice: pricingModel.basePrice * quantity,
          adjustments: [],
          effectiveAt: nowIso(),
        };
      }

      // 记录价格历史
      const priceHistory: PriceHistory = {
        historyId: randomUUID(),
        offerId,
        price: priceCalculation.calculatedPrice,
        volume: quantity,
        timestamp: nowIso(),
        source: "system",
      };
      store.savePriceHistory(priceHistory);

      respond(true, priceCalculation);
    } catch (err) {
      respond(false, { error: String(err) });
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

      const history = store.getPriceHistory(offerId, limit);

      respond(true, {
        offerId,
        count: history.length,
        history,
      });
    } catch (err) {
      respond(false, { error: String(err) });
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

      // 获取该类型的所有 offers
      const offers = store.getOffersByAssetType(assetType);
      if (!offers.length) {
        respond(false, { error: "暂无该类型服务" });
        return;
      }

      // 计算价格统计
      const prices = offers.map((o) => o.price).sort((a, b) => a - b);
      const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const minPrice = prices[0];
      const maxPrice = prices[prices.length - 1];
      const medianPrice = prices[Math.floor(prices.length / 2)];

      // 获取价格历史计算波动率
      const allHistory: PriceHistory[] = [];
      for (const offer of offers) {
        const history = store.getPriceHistory(offer.offerId, 100);
        allHistory.push(...history);
      }
      const priceVolatility = calculateVolatility(allHistory);

      // 计算交易统计
      const allOrders = offers.flatMap((o) => store.getOrdersByOffer(o.offerId));
      const totalVolume = allOrders.reduce((sum, o) => sum + o.quantity, 0);
      const avgOrderSize = allOrders.length > 0 ? totalVolume / allOrders.length : 0;

      // 计算24小时变化
      const oneDayAgo = Date.now() - 86400000;
      const recentHistory = allHistory.filter((h) => new Date(h.timestamp).getTime() > oneDayAgo);
      const oldHistory = allHistory.filter((h) => new Date(h.timestamp).getTime() <= oneDayAgo);

      const recentAvgPrice =
        recentHistory.length > 0
          ? recentHistory.reduce((sum, h) => sum + h.price, 0) / recentHistory.length
          : avgPrice;
      const oldAvgPrice =
        oldHistory.length > 0
          ? oldHistory.reduce((sum, h) => sum + h.price, 0) / oldHistory.length
          : avgPrice;

      const priceChange24h =
        oldAvgPrice > 0 ? ((recentAvgPrice - oldAvgPrice) / oldAvgPrice) * 100 : 0;

      const recentVolume = recentHistory.reduce((sum, h) => sum + h.volume, 0);
      const oldVolume = oldHistory.reduce((sum, h) => sum + h.volume, 0);
      const volumeChange24h = oldVolume > 0 ? ((recentVolume - oldVolume) / oldVolume) * 100 : 0;

      const trendDirection = priceChange24h > 5 ? "up" : priceChange24h < -5 ? "down" : "stable";

      const statistics: MarketStatistics = {
        assetType,
        timestamp: nowIso(),
        avgPrice,
        minPrice,
        maxPrice,
        medianPrice,
        priceVolatility,
        totalVolume,
        totalOrders: allOrders.length,
        avgOrderSize,
        priceChange24h,
        volumeChange24h,
        trendDirection,
      };

      respond(true, statistics);
    } catch (err) {
      respond(false, { error: String(err) });
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
      const side = requireString(input.side, "side") as "buy" | "sell";
      const price = requireNumber(input.price, "price");
      const quantity = requireNumber(input.quantity, "quantity");
      const expiresIn = input.expiresIn ? requireNumber(input.expiresIn, "expiresIn") : undefined;

      const entry: OrderBookEntry = {
        entryId: randomUUID(),
        offerId,
        side,
        price,
        quantity,
        buyerId: side === "buy" ? actorId : undefined,
        sellerId: side === "sell" ? actorId : undefined,
        status: "pending",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
      };

      store.saveOrderBookEntry(entry);

      // 尝试撮合
      const matches = matchOrderBookEntries(store, offerId);

      respond(true, {
        entryId: entry.entryId,
        status: entry.status,
        matches: matches.length,
      });
    } catch (err) {
      respond(false, { error: String(err) });
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

      const entries = store.getOrderBookEntries(offerId);
      const bids = entries
        .filter((e) => e.side === "buy" && e.status === "pending")
        .sort((a, b) => b.price - a.price); // 买单降序
      const asks = entries
        .filter((e) => e.side === "sell" && e.status === "pending")
        .sort((a, b) => a.price - b.price); // 卖单升序

      const spread = bids.length > 0 && asks.length > 0 ? asks[0].price - bids[0].price : undefined;
      const midPrice = spread !== undefined ? (asks[0].price + bids[0].price) / 2 : undefined;

      const offer = store.getOffer(offerId);
      const orderBook: OrderBook = {
        offerId,
        assetType: offer?.assetType || "unknown",
        timestamp: nowIso(),
        bids,
        asks,
        spread,
        midPrice,
      };

      respond(true, orderBook);
    } catch (err) {
      respond(false, { error: String(err) });
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
  const entries = store.getOrderBookEntries(offerId);
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
      store.saveOrderBookEntry(bid);
      bidIdx++;
    } else {
      bid.status = "partial";
      store.saveOrderBookEntry(bid);
    }

    if (ask.quantity === 0) {
      ask.status = "filled";
      store.saveOrderBookEntry(ask);
      askIdx++;
    } else {
      ask.status = "partial";
      store.saveOrderBookEntry(ask);
    }
  }

  return matches;
}
