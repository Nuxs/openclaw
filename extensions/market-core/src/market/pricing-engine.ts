/**
 * 动态定价引擎（提供“建议”，不强制替卖方定价）
 * Dynamic Pricing Engine
 *
 * 注意：本模块只负责计算“建议价格/调整项”。
 * - 最终定价仍由 Provider 决定与发布
 * - 这里的模型字段以 `pricing-types.ts` 为准（`dynamic/tiered/surge/...`）
 */

import type {
  DynamicPricingConfig,
  MarketMetrics,
  PriceAdjustment,
  PriceCalculation,
  PricingConstraints,
  PricingModel,
  PriceTier,
  SurgePricingConfig,
  TierPricingConfig,
} from "./pricing-types.js";

function pushAdjustment(
  adjustments: PriceAdjustment[],
  item: {
    type: string;
    amount: number;
    reason: string;
    percentage?: number;
    metadata?: Record<string, unknown>;
  },
): void {
  const metadata = {
    ...(item.metadata ?? {}),
    ...(item.percentage === undefined ? {} : { percentage: item.percentage }),
  };
  adjustments.push({
    type: item.type,
    amount: item.amount,
    reason: item.reason,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  });
}

/**
 * 计算动态价格建议
 */
export function calculateDynamicPrice(
  model: PricingModel,
  metrics: MarketMetrics,
): PriceCalculation {
  const adjustments: PriceAdjustment[] = [];
  let currentPrice = model.basePrice;

  // 1) 供需定价（deprecated 但仍保留旧接口兼容）
  if (model.strategy === "dynamic" && model.dynamic?.enabled) {
    const adjustment = applySupplyDemandPricing(currentPrice, model.dynamic, metrics);
    if (adjustment) {
      currentPrice += adjustment.amount;
      pushAdjustment(adjustments, adjustment);
    }
  }

  // 2) 高峰定价（deprecated）
  if (model.surge?.enabled) {
    const adjustment = applySurgePricing(currentPrice, model.surge, metrics);
    if (adjustment) {
      currentPrice += adjustment.amount;
      pushAdjustment(adjustments, adjustment);
    }
  }

  // 3) 竞争定价（可选）
  const similarOffers = metrics.similarOffers ?? 0;
  const avgCompetitorPrice = metrics.avgCompetitorPrice ?? 0;
  if (similarOffers > 0 && avgCompetitorPrice > 0) {
    const adjustment = applyCompetitivePricing(currentPrice, metrics);
    if (adjustment) {
      currentPrice += adjustment.amount;
      pushAdjustment(adjustments, adjustment);
    }
  }

  // 4) 价格约束（deprecated）
  if (model.constraints) {
    const constrainedPrice = applyConstraints(currentPrice, model.basePrice, model.constraints);
    if (constrainedPrice !== currentPrice) {
      const delta = constrainedPrice - currentPrice;
      pushAdjustment(adjustments, {
        type: "constraint",
        amount: delta,
        percentage: currentPrice === 0 ? undefined : (delta / currentPrice) * 100,
        reason: "价格约束调整",
      });
      currentPrice = constrainedPrice;
    }
  }

  // 确保价格非负
  currentPrice = Math.max(0, currentPrice);

  return {
    basePrice: model.basePrice,
    finalPrice: parseFloat(currentPrice.toFixed(6)),
    adjustments,
    metadata: {
      offerId: metrics.offerId,
      resourceType: metrics.resourceType,
      metrics,
    },
  };
}

/**
 * 供需定价算法（deprecated）
 */
function applySupplyDemandPricing(
  currentPrice: number,
  config: DynamicPricingConfig,
  metrics: MarketMetrics,
): { type: string; amount: number; percentage: number; reason: string } | null {
  // 计算需求指标（归一化）
  const demandRatio = metrics.orderRate > 0 ? metrics.orderRate / 10 : 0.1; // 假设基准为10单/时
  const demand = demandRatio * config.demandWeight;

  // 计算供给指标（归一化）
  const supplyRatio = metrics.availableCapacity / Math.max(metrics.totalCapacity, 1);
  const supply = supplyRatio * config.supplyWeight;

  if (supply === 0) {
    return {
      type: "supply_demand",
      amount: currentPrice * 0.5,
      percentage: 50,
      reason: "供给严重不足",
    };
  }

  const demandSupplyRatio = demand / supply;
  const priceChange = currentPrice * config.elasticity * (demandSupplyRatio - 1);

  if (Math.abs(priceChange) < currentPrice * 0.01) {
    return null;
  }

  return {
    type: "supply_demand",
    amount: priceChange,
    percentage: (priceChange / currentPrice) * 100,
    reason: `供需比率: ${demandSupplyRatio.toFixed(2)}`,
  };
}

/**
 * 高峰定价算法（deprecated）
 */
function applySurgePricing(
  currentPrice: number,
  config: SurgePricingConfig,
  metrics: MarketMetrics,
): { type: string; amount: number; percentage: number; reason: string } | null {
  if (metrics.utilizationRate < config.thresholdUtilization) {
    return null;
  }

  const surgeAmount = currentPrice * (config.surgeMultiplier - 1);

  return {
    type: "surge",
    amount: surgeAmount,
    percentage: (config.surgeMultiplier - 1) * 100,
    reason: `高峰期（利用率: ${(metrics.utilizationRate * 100).toFixed(1)}%）`,
  };
}

/**
 * 竞争定价算法
 */
function applyCompetitivePricing(
  currentPrice: number,
  metrics: MarketMetrics,
): { type: string; amount: number; percentage: number; reason: string } | null {
  const avgPrice = metrics.avgCompetitorPrice ?? 0;
  if (avgPrice <= 0) return null;

  const priceDiff = avgPrice - currentPrice;

  // 如果当前价格远高于市场平均（>20%），适度降价
  if (currentPrice > avgPrice * 1.2) {
    const adjustment = priceDiff * 0.3;
    return {
      type: "competitive",
      amount: adjustment,
      percentage: (adjustment / currentPrice) * 100,
      reason: `竞争调价（市场均价: ${avgPrice.toFixed(2)}）`,
    };
  }

  const priceRank = metrics.priceRank ?? 999;

  // 如果当前价格远低于市场平均（<-20%），且排名靠前，可以适度涨价
  if (currentPrice < avgPrice * 0.8 && priceRank <= 3) {
    const adjustment = priceDiff * 0.2;
    return {
      type: "competitive",
      amount: adjustment,
      percentage: (adjustment / currentPrice) * 100,
      reason: `价格优化（排名: ${priceRank}）`,
    };
  }

  return null;
}

/**
 * 应用价格约束（deprecated）
 */
function applyConstraints(
  calculatedPrice: number,
  basePrice: number,
  constraints: PricingConstraints,
): number {
  let price = calculatedPrice;

  if (constraints.minPrice !== undefined) {
    price = Math.max(price, constraints.minPrice);
  }
  if (constraints.maxPrice !== undefined) {
    price = Math.min(price, constraints.maxPrice);
  }

  if (constraints.priceChangeLimit !== undefined) {
    const maxChange = basePrice * (constraints.priceChangeLimit / 100);
    const change = price - basePrice;
    if (Math.abs(change) > maxChange) {
      price = basePrice + (change > 0 ? maxChange : -maxChange);
    }
  }

  if (constraints.maxDiscount !== undefined && price < basePrice) {
    const minAllowedPrice = basePrice * (1 - constraints.maxDiscount / 100);
    price = Math.max(price, minAllowedPrice);
  }

  return price;
}

/**
 * 计算分级定价
 */
export function calculateTieredPrice(model: PricingModel, quantity: number): PriceCalculation {
  const tiered = model.tiered;

  if (!tiered?.enabled || tiered.tiers.length === 0) {
    return {
      basePrice: model.basePrice,
      finalPrice: model.basePrice * quantity,
      adjustments: [],
      metadata: { quantity },
    };
  }

  const tier = findTier(tiered, quantity);
  const totalPrice = tier.pricePerUnit * quantity;
  const originalTotal = model.basePrice * quantity;
  const discount = originalTotal - totalPrice;

  const adjustments: PriceAdjustment[] = [];
  if (discount > 0) {
    pushAdjustment(adjustments, {
      type: "tier_discount",
      amount: -discount,
      percentage: originalTotal === 0 ? 0 : -(discount / originalTotal) * 100,
      reason: `批量折扣（数量: ${quantity}）`,
    });
  }

  return {
    basePrice: originalTotal,
    finalPrice: totalPrice,
    adjustments,
    metadata: { quantity, tier },
  };
}

function findTier(config: TierPricingConfig, quantity: number): PriceTier {
  const exact = config.tiers.find(
    (t) => quantity >= t.minQuantity && (t.maxQuantity === undefined || quantity <= t.maxQuantity),
  );
  return exact ?? config.tiers[config.tiers.length - 1];
}

/**
 * 收集市场指标（用于生成统计和建议）
 */
export function collectMarketMetrics(params: {
  offerId: string;
  resourceType: string;
  orders: Array<{ status: string; createdAt: string }>;
  providers: Array<{ active: boolean; capacity: number; available: number }>;
  competitorOffers: Array<{ price: number }>;
}): MarketMetrics {
  const now = Date.now();
  const oneHourAgo = now - 3_600_000;
  const oneDayAgo = now - 86_400_000;

  const activeProviders = params.providers.filter((p) => p.active).length;
  const totalCapacity = params.providers.reduce((sum, p) => sum + p.capacity, 0);
  const availableCapacity = params.providers.reduce((sum, p) => sum + p.available, 0);
  const utilizationRate =
    totalCapacity > 0 ? (totalCapacity - availableCapacity) / totalCapacity : 0;

  const orders24h = params.orders.filter((o) => Date.parse(o.createdAt) > oneDayAgo);
  const orders1h = params.orders.filter((o) => Date.parse(o.createdAt) > oneHourAgo);
  const completedOrders24h = orders24h.filter((o) => o.status === "settlement_completed").length;

  const pendingOrders = params.orders.filter(
    (o) => o.status === "order_created" || o.status === "payment_locked",
  ).length;

  const sortedPrices = params.competitorOffers.map((o) => o.price).sort((a, b) => a - b);
  const avgCompetitorPrice =
    sortedPrices.length > 0 ? sortedPrices.reduce((sum, p) => sum + p, 0) / sortedPrices.length : 0;

  return {
    timestamp: new Date(now).toISOString(),
    resourceType: params.resourceType,
    offerId: params.offerId,

    totalProviders: params.providers.length,
    activeProviders,
    totalCapacity,
    availableCapacity,
    utilizationRate,

    totalOrders24h: orders24h.length,
    pendingOrders,
    completedOrders24h,
    orderRate: orders1h.length,

    avgPrice24h: avgCompetitorPrice,
    priceChange24h: 0,

    similarOffers: params.competitorOffers.length,
    avgCompetitorPrice,
    priceRank: 0,
  };
}

/**
 * 计算价格波动率
 */
export function calculateVolatility(prices: Array<{ price: number; timestamp: string }>): number {
  if (prices.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1];
    const curr = prices[i];
    if (!prev || !curr) continue;
    if (prev.price === 0) continue;
    returns.push((curr.price - prev.price) / prev.price);
  }

  if (returns.length < 2) return 0;

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
}
