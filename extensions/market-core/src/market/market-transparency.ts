/**
 * 市场透明度工具
 * Market Transparency Tools
 *
 * 核心理念：
 * ✅ 卖方完全自主定价 - 系统不干预价格决策
 * ✅ 提供市场信息 - 帮助买卖双方了解行情
 * ✅ 可选自动化助手 - 卖方可选择启用/禁用
 *
 * 本模块提供：
 * 1. 市场行情查询 - 让卖方了解竞争环境
 * 2. 定价建议 - 提供参考（不强制）
 * 3. 自动化助手 - 可选的自动调价工具
 */

import type {
  MarketMetrics,
  PriceRecommendation,
  MarketStatistics,
  PriceDistribution,
  AutoPricingConfig,
  AutoPricingReport,
} from "./pricing-types.js";

// ============================================================================
// 一、市场信息查询（Public Information）
// ============================================================================

/**
 * 获取市场价格统计
 *
 * 用途：让买卖双方了解市场行情
 * 谁使用：Consumer查看价格分布 / Provider了解竞争情况
 */
export function getMarketStatistics(
  resourceType: string,
  allOffers: Array<{
    offerId: string;
    price: number;
    provider: string;
    capability?: string;
  }>,
): MarketStatistics {
  if (allOffers.length === 0) {
    return {
      resourceType,
      timestamp: new Date().toISOString(),
      offerCount: 0,
      priceStats: {
        min: 0,
        max: 0,
        median: 0,
        p25: 0,
        p75: 0,
        avg: 0,
      },
      volatility: 0,
    };
  }

  const prices = allOffers.map((o) => o.price).sort((a, b) => a - b);

  return {
    resourceType,
    timestamp: new Date().toISOString(),
    offerCount: allOffers.length,
    priceStats: {
      min: prices[0],
      max: prices[prices.length - 1],
      median: calculatePercentile(prices, 50),
      p25: calculatePercentile(prices, 25),
      p75: calculatePercentile(prices, 75),
      avg: prices.reduce((sum, p) => sum + p, 0) / prices.length,
    },
    volatility: calculateVolatility(prices),
  };
}

/**
 * 获取价格分布详情
 *
 * 用途：查看每个Provider的具体定价
 */
export function getPriceDistribution(
  resourceType: string,
  allOffers: Array<{
    offerId: string;
    price: number;
    provider: string;
    capability?: string;
    reputation?: number;
  }>,
): PriceDistribution {
  const distribution = allOffers
    .map((offer) => ({
      offerId: offer.offerId,
      providerId: offer.provider,
      price: offer.price,
      capability: offer.capability || "standard",
      reputation: offer.reputation || 0,
    }))
    .sort((a, b) => a.price - b.price);

  return {
    resourceType,
    timestamp: new Date().toISOString(),
    offers: distribution,
  };
}

// ============================================================================
// 二、定价建议（Advisory Only - Not Mandatory）
// ============================================================================

/**
 * 获取定价建议
 *
 * 重要：这是**建议**而非**决定**
 * - Provider可以接受或忽略建议
 * - 最终价格由Provider自己设定
 *
 * 用途：帮助新Provider了解应该定什么价
 */
export function getPricingRecommendation(
  myResourceType: string,
  myCapability: string,
  myReputation: number,
  marketStats: MarketStatistics,
  allOffers: Array<{
    offerId: string;
    price: number;
    capability?: string;
    reputation?: number;
  }>,
): PriceRecommendation {
  // 过滤相似的竞品
  const similarOffers = allOffers.filter(
    (o) =>
      o.capability === myCapability || (o.capability === undefined && myCapability === "standard"),
  );

  if (similarOffers.length === 0) {
    // 市场上没有类似服务，建议使用市场平均价
    return {
      recommendedPrice: marketStats.priceStats.avg,
      priceRange: {
        min: marketStats.priceStats.p25,
        max: marketStats.priceStats.p75,
      },
      confidence: 0.3, // 低置信度
      reasoning: `市场上暂无类似服务。建议参考市场平均价 ${marketStats.priceStats.avg.toFixed(4)}。您可以根据服务质量自行调整。`,
      marketContext: {
        totalOffers: marketStats.offerCount,
        similarOffers: 0,
        yourCompetitivePosition: "first-mover",
      },
    };
  }

  // 计算相似服务的价格统计
  const similarPrices = similarOffers.map((o) => o.price).sort((a, b) => a - b);
  const similarMedian = calculatePercentile(similarPrices, 50);
  const similarP25 = calculatePercentile(similarPrices, 25);
  const similarP75 = calculatePercentile(similarPrices, 75);

  // 基于信誉调整建议价格
  let recommendedPrice = similarMedian;
  let reasoning = "";

  if (myReputation >= 80) {
    // 高信誉 -> 可以定高价
    recommendedPrice = similarP75 * 1.1;
    reasoning = `您的信誉评分为 ${myReputation}，处于市场前列。建议定价在市场75分位以上（${recommendedPrice.toFixed(4)}），体现优质服务价值。`;
  } else if (myReputation >= 60) {
    // 中等信誉 -> 中位价
    recommendedPrice = similarMedian;
    reasoning = `您的信誉评分为 ${myReputation}，属于中等水平。建议定价接近市场中位价（${recommendedPrice.toFixed(4)}），保持竞争力。`;
  } else {
    // 低信誉/新Provider -> 略低于中位价
    recommendedPrice = similarP25;
    reasoning = `作为新Provider或信誉评分较低（${myReputation}），建议初期定价略低于市场中位（${recommendedPrice.toFixed(4)}），以吸引首批用户建立信誉。`;
  }

  return {
    recommendedPrice,
    priceRange: {
      min: similarP25,
      max: similarP75,
    },
    confidence: 0.8,
    reasoning,
    marketContext: {
      totalOffers: marketStats.offerCount,
      similarOffers: similarOffers.length,
      yourCompetitivePosition:
        myReputation >= 70 ? "premium" : myReputation >= 50 ? "mid-tier" : "budget",
    },
  };
}

// ============================================================================
// 三、自动化助手（Optional Automation）
// ============================================================================

/**
 * 计算自动调价建议
 *
 * 重要：这是**可选**功能
 * - Provider需要主动启用
 * - Provider可以随时关闭
 * - Provider设定所有参数（最低价、最高价、策略等）
 *
 * 策略说明：
 * - "match_market": 跟随市场中位价
 * - "undercut_by_percent": 比最低价再低X%（吸引价格敏感客户）
 * - "premium": 比中位价高X%（定位高端市场）
 */
export function calculateAutoPrice(
  currentPrice: number,
  config: AutoPricingConfig,
  marketStats: MarketStatistics,
  similarOffers: Array<{ price: number }>,
): {
  suggestedPrice: number;
  reason: string;
  shouldUpdate: boolean;
} {
  let suggestedPrice = currentPrice;
  let reason = "";

  const marketMedian = marketStats.priceStats.median;
  const marketMin = marketStats.priceStats.min;

  switch (config.strategy) {
    case "match_market": {
      const targetPercentile = config.parameters.targetPercentile || 50;
      const prices = similarOffers.map((o) => o.price).sort((a, b) => a - b);
      suggestedPrice = calculatePercentile(prices, targetPercentile);
      reason = `跟随市场第${targetPercentile}分位价格`;
      break;
    }

    case "undercut_by_percent": {
      const undercutPercent = config.parameters.undercutPercent || 5;
      suggestedPrice = marketMin * (1 - undercutPercent / 100);
      reason = `比市场最低价低${undercutPercent}%，吸引价格敏感客户`;
      break;
    }

    case "premium": {
      const premiumPercent = config.parameters.premiumPercent || 20;
      suggestedPrice = marketMedian * (1 + premiumPercent / 100);
      reason = `比市场中位价高${premiumPercent}%，定位高端服务`;
      break;
    }
  }

  // 应用Provider设定的价格边界
  const finalPrice = Math.max(
    config.parameters.minPrice,
    Math.min(config.parameters.maxPrice, suggestedPrice),
  );

  // 判断是否需要更新（避免频繁小幅调整）
  const priceChangePercent = Math.abs((finalPrice - currentPrice) / currentPrice) * 100;
  const shouldUpdate = priceChangePercent >= 2; // 变化超过2%才更新

  if (finalPrice !== suggestedPrice) {
    reason += `（已应用价格边界 [${config.parameters.minPrice}, ${config.parameters.maxPrice}]）`;
  }

  return {
    suggestedPrice: finalPrice,
    reason,
    shouldUpdate,
  };
}

/**
 * 生成自动调价报告
 *
 * 用途：让Provider了解自动调价的效果
 */
export function generateAutoPricingReport(
  resourceId: string,
  priceHistory: Array<{
    price: number;
    timestamp: string;
    reason: string;
  }>,
  orderHistory: Array<{
    price: number;
    quantity: number;
    revenue: number;
    timestamp: string;
  }>,
): AutoPricingReport {
  if (priceHistory.length === 0) {
    return {
      resourceId,
      reportPeriod: {
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      },
      priceChanges: [],
      revenueImpact: {
        before: 0,
        after: 0,
        change: 0,
        changePercent: 0,
      },
      orderImpact: {
        before: 0,
        after: 0,
        change: 0,
        changePercent: 0,
      },
    };
  }

  // 计算启用自动调价前后的对比
  const enabledAt = new Date(priceHistory[0].timestamp).getTime();
  const ordersBefore = orderHistory.filter((o) => new Date(o.timestamp).getTime() < enabledAt);
  const ordersAfter = orderHistory.filter((o) => new Date(o.timestamp).getTime() >= enabledAt);

  const revenueBefore = ordersBefore.reduce((sum, o) => sum + o.revenue, 0);
  const revenueAfter = ordersAfter.reduce((sum, o) => sum + o.revenue, 0);

  return {
    resourceId,
    reportPeriod: {
      start: priceHistory[0].timestamp,
      end: priceHistory[priceHistory.length - 1].timestamp,
    },
    priceChanges: priceHistory,
    revenueImpact: {
      before: revenueBefore,
      after: revenueAfter,
      change: revenueAfter - revenueBefore,
      changePercent: revenueBefore > 0 ? ((revenueAfter - revenueBefore) / revenueBefore) * 100 : 0,
    },
    orderImpact: {
      before: ordersBefore.length,
      after: ordersAfter.length,
      change: ordersAfter.length - ordersBefore.length,
      changePercent:
        ordersBefore.length > 0
          ? ((ordersAfter.length - ordersBefore.length) / ordersBefore.length) * 100
          : 0,
    },
  };
}

// ============================================================================
// 辅助函数
// ============================================================================

function calculatePercentile(sortedPrices: number[], percentile: number): number {
  if (sortedPrices.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedPrices.length) - 1;
  return sortedPrices[Math.max(0, index)];
}

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  return mean > 0 ? stdDev / mean : 0; // 变异系数
}
