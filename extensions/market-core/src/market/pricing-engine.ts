/**
 * 动态定价引擎
 * Dynamic Pricing Engine
 *
 * 核心算法：
 * 1. 供需定价：P = BasePrice × (1 + elasticity × (demand/supply - 1))
 * 2. 高峰定价：当利用率 > 阈值时，P = P × surgeMultiplier
 * 3. 竞争定价：考虑市场平均价格和价格排名
 */

import type {
  PricingModel,
  PriceCalculation,
  PriceAdjustment,
  MarketMetrics,
  PricingConstraints,
  DynamicPricingConfig,
  SurgePricingConfig,
} from "./pricing-types.js";

/**
 * 计算动态价格
 */
export function calculateDynamicPrice(
  model: PricingModel,
  metrics: MarketMetrics,
): PriceCalculation {
  const adjustments: PriceAdjustment[] = [];
  let currentPrice = model.basePrice;

  // 1. 应用动态供需定价
  if (model.strategy === "dynamic" && model.dynamicConfig?.enabled) {
    const adjustment = applySupplyDemandPricing(currentPrice, model.dynamicConfig, metrics);
    if (adjustment) {
      currentPrice += adjustment.amount;
      adjustments.push(adjustment);
    }
  }

  // 2. 应用高峰定价
  if (model.surgeConfig?.enabled) {
    const adjustment = applySurgePricing(currentPrice, model.surgeConfig, metrics);
    if (adjustment) {
      currentPrice += adjustment.amount;
      adjustments.push(adjustment);
    }
  }

  // 3. 应用分级定价（如果指定了数量）
  if (model.strategy === "tiered" && model.tierConfig?.enabled) {
    // 分级定价需要订单数量，这里暂不处理
    // 将在订单创建时处理
  }

  // 4. 应用竞争定价
  if (metrics.similarOffers > 0 && metrics.avgCompetitorPrice > 0) {
    const adjustment = applyCompetitivePricing(currentPrice, metrics);
    if (adjustment) {
      currentPrice += adjustment.amount;
      adjustments.push(adjustment);
    }
  }

  // 5. 应用价格约束
  if (model.constraints) {
    const constrainedPrice = applyConstraints(currentPrice, model.basePrice, model.constraints);
    if (constrainedPrice !== currentPrice) {
      adjustments.push({
        type: "constraint",
        amount: constrainedPrice - currentPrice,
        percentage: ((constrainedPrice - currentPrice) / currentPrice) * 100,
        reason: "价格约束调整",
      });
      currentPrice = constrainedPrice;
    }
  }

  // 确保价格非负
  currentPrice = Math.max(0, currentPrice);

  return {
    offerId: metrics.offerId,
    originalPrice: model.basePrice,
    calculatedPrice: parseFloat(currentPrice.toFixed(6)),
    adjustments,
    effectiveAt: new Date().toISOString(),
    expiresAt: model.dynamicConfig?.updateInterval
      ? new Date(Date.now() + model.dynamicConfig.updateInterval * 1000).toISOString()
      : undefined,
    metrics,
    reason: adjustments.map((a) => a.reason).join("; "),
  };
}

/**
 * 供需定价算法
 *
 * 公式：ΔP = BasePrice × elasticity × (demandRatio - 1)
 * 其中：demandRatio = (demand × demandWeight) / (supply × supplyWeight)
 */
function applySupplyDemandPricing(
  currentPrice: number,
  config: DynamicPricingConfig,
  metrics: MarketMetrics,
): PriceAdjustment | null {
  // 计算需求指标（归一化）
  const demandRatio = metrics.orderRate > 0 ? metrics.orderRate / 10 : 0.1; // 假设基准为10单/时
  const demand = demandRatio * config.demandWeight;

  // 计算供给指标（归一化）
  const supplyRatio = metrics.availableCapacity / Math.max(metrics.totalCapacity, 1);
  const supply = supplyRatio * config.supplyWeight;

  // 避免除零
  if (supply === 0) {
    return {
      type: "supply_demand",
      amount: currentPrice * 0.5, // 供给不足，价格上涨50%
      percentage: 50,
      reason: "供给严重不足",
    };
  }

  // 计算价格调整
  const demandSupplyRatio = demand / supply;
  const priceChange = currentPrice * config.elasticity * (demandSupplyRatio - 1);

  if (Math.abs(priceChange) < currentPrice * 0.01) {
    // 变化小于1%，忽略
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
 * 高峰定价算法
 *
 * 当利用率超过阈值时，应用高峰倍数
 */
function applySurgePricing(
  currentPrice: number,
  config: SurgePricingConfig,
  metrics: MarketMetrics,
): PriceAdjustment | null {
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
 *
 * 考虑市场平均价格，保持竞争力
 */
function applyCompetitivePricing(
  currentPrice: number,
  metrics: MarketMetrics,
): PriceAdjustment | null {
  const avgPrice = metrics.avgCompetitorPrice;
  const priceDiff = avgPrice - currentPrice;

  // 如果当前价格远高于市场平均（>20%），适度降价
  if (currentPrice > avgPrice * 1.2) {
    const adjustment = priceDiff * 0.3; // 调整30%的差距
    return {
      type: "competitive",
      amount: adjustment,
      percentage: (adjustment / currentPrice) * 100,
      reason: `竞争调价（市场均价: ${avgPrice.toFixed(2)}）`,
    };
  }

  // 如果当前价格远低于市场平均（<-20%），可以适度涨价
  if (currentPrice < avgPrice * 0.8 && metrics.priceRank <= 3) {
    const adjustment = priceDiff * 0.2; // 调整20%的差距
    return {
      type: "competitive",
      amount: adjustment,
      percentage: (adjustment / currentPrice) * 100,
      reason: `价格优化（排名: ${metrics.priceRank}）`,
    };
  }

  return null;
}

/**
 * 应用价格约束
 */
function applyConstraints(
  calculatedPrice: number,
  basePrice: number,
  constraints: PricingConstraints,
): number {
  let price = calculatedPrice;

  // 应用最低/最高价格
  if (constraints.minPrice !== undefined) {
    price = Math.max(price, constraints.minPrice);
  }
  if (constraints.maxPrice !== undefined) {
    price = Math.min(price, constraints.maxPrice);
  }

  // 应用价格变动限制
  if (constraints.priceChangeLimit !== undefined) {
    const maxChange = basePrice * (constraints.priceChangeLimit / 100);
    const change = price - basePrice;
    if (Math.abs(change) > maxChange) {
      price = basePrice + (change > 0 ? maxChange : -maxChange);
    }
  }

  // 应用最大折扣限制
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
  if (!model.tierConfig?.enabled || !model.tierConfig.tiers.length) {
    return {
      offerId: "",
      originalPrice: model.basePrice,
      calculatedPrice: model.basePrice * quantity,
      adjustments: [],
      effectiveAt: new Date().toISOString(),
    };
  }

  // 找到适用的价格梯度
  const tier =
    model.tierConfig.tiers.find(
      (t: any) =>
        quantity >= t.minQuantity && (t.maxQuantity === undefined || quantity <= t.maxQuantity),
    ) || model.tierConfig.tiers[model.tierConfig.tiers.length - 1];

  const pricePerUnit = tier.pricePerUnit;
  const totalPrice = pricePerUnit * quantity;
  const originalTotal = model.basePrice * quantity;
  const discount = originalTotal - totalPrice;

  const adjustments: PriceAdjustment[] = [];
  if (discount > 0) {
    adjustments.push({
      type: "tier_discount",
      amount: -discount,
      percentage: -(discount / originalTotal) * 100,
      reason: `批量折扣（数量: ${quantity}）`,
    });
  }

  return {
    offerId: "",
    originalPrice: originalTotal,
    calculatedPrice: totalPrice,
    adjustments,
    effectiveAt: new Date().toISOString(),
  };
}

/**
 * 收集市场指标
 */
export function collectMarketMetrics(
  offerId: string,
  orders: Array<{ status: string; createdAt: string }>,
  providers: Array<{ active: boolean; capacity: number; available: number }>,
  competitorOffers: Array<{ price: number }>,
): MarketMetrics {
  const now = Date.now();
  const oneHourAgo = now - 3600000;

  // 统计供给
  const activeProviders = providers.filter((p) => p.active).length;
  const totalCapacity = providers.reduce((sum, p) => sum + p.capacity, 0);
  const availableCapacity = providers.reduce((sum, p) => sum + p.available, 0);
  const utilizationRate =
    totalCapacity > 0 ? (totalCapacity - availableCapacity) / totalCapacity : 0;

  // 统计需求
  const recentOrders = orders.filter((o) => new Date(o.createdAt).getTime() > oneHourAgo);
  const completedOrders = orders.filter((o) => o.status === "settlement_completed").length;
  const orderRate = recentOrders.length; // 每小时订单数

  // 统计竞争
  const sortedPrices = [...competitorOffers].map((o) => o.price).sort((a, b) => a - b);
  const avgCompetitorPrice =
    sortedPrices.length > 0 ? sortedPrices.reduce((sum, p) => sum + p, 0) / sortedPrices.length : 0;

  return {
    timestamp: new Date().toISOString(),
    offerId,
    totalProviders: providers.length,
    activeProviders,
    totalCapacity,
    availableCapacity,
    utilizationRate,
    totalOrders: orders.length,
    pendingOrders: orders.filter(
      (o) => o.status === "order_created" || o.status === "payment_locked",
    ).length,
    completedOrders,
    orderRate,
    similarOffers: competitorOffers.length,
    avgCompetitorPrice,
    priceRank: 0, // 需要外部计算
  };
}

/**
 * 时间衰减权重
 *
 * 用于历史数据加权，越近期的数据权重越高
 */
export function timeDecayWeight(timestamp: string, halfLife: number = 86400000): number {
  const age = Date.now() - new Date(timestamp).getTime();
  return Math.exp(-age / halfLife);
}

/**
 * 计算价格波动率
 */
export function calculateVolatility(prices: Array<{ price: number; timestamp: string }>): number {
  if (prices.length < 2) return 0;

  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    const ret = (prices[i].price - prices[i - 1].price) / prices[i - 1].price;
    returns.push(ret);
  }

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
}
