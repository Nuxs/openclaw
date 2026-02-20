/**
 * 市场透明度与定价系统类型定义
 * Market Transparency & Pricing System Type Definitions
 *
 * ⚠️ 重要原则：卖方完全自主定价
 * - 系统不决定价格，系统提供信息
 * - 所有"定价算法"都是建议性质，非强制
 * - Provider可以选择使用或忽略任何建议
 */

// ============================================================================
// 一、Provider自主定价相关类型
// ============================================================================

/**
 * Provider定价配置
 *
 * 这是Provider在发布资源时设定的价格
 * 系统记录但不修改
 */
export type ProviderPricing = {
  basePrice: number; // Provider设定的价格
  currency: string; // 货币单位（如 "USD", "MATIC"）
  billingUnit: string; // 计费单位（如 "token", "minute", "hour"）
  priceDescription?: string; // 价格说明（如 "0.05 USD per 1K tokens"）
  lastUpdatedBy: "provider"; // 明确标注由Provider更新
  lastUpdatedAt: string;
};

/**
 * Provider可选的自动调价配置
 *
 * 重要：这是完全可选的功能
 * - Provider需要主动启用
 * - Provider设定所有参数
 * - Provider可以随时禁用
 */
export type AutoPricingConfig = {
  enabled: boolean;
  resourceId: string;

  // Provider选择的策略
  strategy: "match_market" | "undercut_by_percent" | "premium";

  // Provider设定的参数
  parameters: {
    targetPercentile?: number; // 目标分位数（用于 match_market）
    undercutPercent?: number; // 削价百分比（用于 undercut_by_percent）
    premiumPercent?: number; // 溢价百分比（用于 premium）

    // 价格边界（Provider的绝对控制）
    minPrice: number; // 绝对底线，算法不能突破
    maxPrice: number; // 绝对上限，算法不能突破
  };

  // 更新频率
  updateInterval: "hourly" | "daily" | "manual";

  // Provider随时可以暂停
  pausedUntil?: string;
};

/**
 * 自动调价报告
 *
 * 用途：让Provider了解自动调价的效果
 */
export type AutoPricingReport = {
  resourceId: string;
  reportPeriod: {
    start: string;
    end: string;
  };

  // 价格变化历史
  priceChanges: Array<{
    price: number;
    timestamp: string;
    reason: string;
  }>;

  // 收入影响
  revenueImpact: {
    before: number; // 启用前的收入
    after: number; // 启用后的收入
    change: number; // 变化量
    changePercent: number; // 变化百分比
  };

  // 订单影响
  orderImpact: {
    before: number;
    after: number;
    change: number;
    changePercent: number;
  };
};

// ============================================================================
// 二、市场信息透明度相关类型
// ============================================================================

/**
 * 市场价格统计
 *
 * 用途：提供市场行情的客观数据
 * 面向：Consumer查看价格分布 / Provider了解竞争
 */
export type MarketStatistics = {
  resourceType: string;
  timestamp: string;
  offerCount: number; // 市场上的总供应数

  // 价格统计
  priceStats: {
    min: number; // 最低价
    max: number; // 最高价
    median: number; // 中位价
    p25: number; // 25分位
    p75: number; // 75分位
    avg: number; // 平均价
  };

  // 价格波动率（帮助判断市场稳定性）
  volatility: number; // 0-1之间，越高越不稳定
};

/**
 * 价格分布详情
 *
 * 用途：查看每个Provider的具体定价
 */
export type PriceDistribution = {
  resourceType: string;
  timestamp: string;

  offers: Array<{
    offerId: string;
    providerId: string;
    price: number;
    capability?: string; // 服务能力标签
    reputation?: number; // 信誉评分
  }>;
};

/**
 * 定价建议
 *
 * 重要：这是**建议**而非**决定**
 * - Provider可以接受或忽略
 * - 最终价格由Provider自己设定
 */
export type PriceRecommendation = {
  recommendedPrice: number;
  priceRange: {
    min: number;
    max: number;
  };
  confidence: number; // 0-1，建议的置信度
  reasoning: string; // 建议的理由（透明化）
  marketContext: {
    totalOffers: number;
    similarOffers: number;
    yourCompetitivePosition: "first-mover" | "premium" | "mid-tier" | "budget";
  };
};

// ============================================================================
// 三、市场指标（用于生成统计和建议）
// ============================================================================

/**
 * 市场指标快照
 *
 * 用途：系统收集的市场数据，用于生成统计和建议
 */
export type MarketMetrics = {
  timestamp: string;
  resourceType: string;

  // 供给指标
  totalProviders: number;
  activeProviders: number;
  totalCapacity: number;
  availableCapacity: number;
  utilizationRate: number; // 0-1

  // 需求指标
  totalOrders24h: number;
  pendingOrders: number;
  completedOrders24h: number;
  orderRate: number; // 单位时间订单数

  // 价格指标
  avgPrice24h: number;
  priceChange24h: number; // 百分比
};

// ============================================================================
// 四、订单簿模式（真正的自由市场撮合）
// ============================================================================

/**
 * 订单簿条目
 *
 * 用途：买卖双方自由报价，系统撮合
 * 这是真正的去中心化定价机制
 */
export type OrderBookEntry = {
  entryId: string;
  resourceType: string;
  side: "buy" | "sell"; // 买单/卖单
  price: number;
  quantity: number;
  userId: string; // 买方或卖方ID
  status: "pending" | "partial" | "filled" | "cancelled";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

/**
 * 订单簿快照
 */
export type OrderBook = {
  resourceType: string;
  timestamp: string;
  bids: OrderBookEntry[]; // 买单（按价格降序）
  asks: OrderBookEntry[]; // 卖单（按价格升序）
  spread?: number; // 买卖价差
  midPrice?: number; // 中间价
  lastTradePrice?: number; // 最新成交价
};

// ============================================================================
// 五、价格历史记录
// ============================================================================

/**
 * 价格历史记录
 *
 * 用途：追踪价格变化，用于生成趋势分析
 */
export type PriceHistory = {
  historyId: string;
  resourceType: string;
  offerId: string;
  price: number;
  timestamp: string;
  source: "provider_manual" | "provider_auto" | "market_trade"; // 明确标注价格来源
  providerId: string;
};

// ============================================================================
// 六、已废弃的类型（保留用于向后兼容）
// ============================================================================

/**
 * @deprecated 已废弃 - 违背自由市场原则
 *
 * 原因：系统不应该"策略性地"决定价格
 * 替代：Provider自主选择 AutoPricingConfig
 */
export type PricingStrategy =
  | "fixed" // ✅ 保留：Provider固定定价
  | "dynamic" // ❌ 废弃：改为Provider可选的AutoPricing
  | "surge" // ❌ 废弃：改为Provider可选的AutoPricing
  | "tiered" // ✅ 保留：Provider可以设置阶梯价
  | "auction" // ✅ 保留：订单簿模式
  | "negotiable"; // ✅ 保留：协商定价

/**
 * @deprecated 已废弃 - 违背自由市场原则
 *
 * 原因：这个配置暗示系统会"动态计算"价格
 * 替代：使用 AutoPricingConfig（明确是Provider可选的助手）
 */
export type DynamicPricingConfig = {
  enabled: boolean;
  demandWeight: number;
  supplyWeight: number;
  elasticity: number;
  updateInterval: number;
  lookbackWindow: number;
};

/**
 * ✅ 保留 - 阶梯定价由Provider自行设定
 */
export type TierPricingConfig = {
  enabled: boolean;
  tiers: PriceTier[];
};

export type PriceTier = {
  minQuantity: number;
  maxQuantity?: number;
  pricePerUnit: number;
  discount?: number;
};

/**
 * @deprecated 已废弃 - 违背自由市场原则
 *
 * 原因：系统不应该在"高峰时"自动涨价
 * 替代：Provider可以选择启用AutoPricing的premium策略
 */
export type SurgePricingConfig = {
  enabled: boolean;
  surgeMultiplier: number;
  thresholdUtilization: number;
  cooldownPeriod: number;
};

/**
 * ✅ 保留 - 竞价是合理的市场机制
 */
export type AuctionConfig = {
  enabled: boolean;
  startingPrice: number;
  reservePrice?: number;
  bidIncrement: number;
  auctionDuration: number;
  autoExtend: boolean;
};

/**
 * @deprecated 已废弃
 *
 * 原因：价格约束应该由Provider在AutoPricingConfig中设定
 * 替代：AutoPricingConfig.parameters.{minPrice, maxPrice}
 */
export type PricingConstraints = {
  minPrice?: number;
  maxPrice?: number;
  maxDiscount?: number;
  priceChangeLimit?: number;
};
