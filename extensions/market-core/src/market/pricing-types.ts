/**
 * 动态定价系统类型定义
 * Dynamic Pricing System Type Definitions
 */

/**
 * 定价策略类型
 */
export type PricingStrategy =
  | "fixed" // 固定价格
  | "dynamic" // 动态定价（基于供需）
  | "surge" // 高峰定价
  | "tiered" // 分级定价（基于用量）
  | "auction" // 竞价模式
  | "negotiable"; // 可协商价格

/**
 * 定价模型配置
 */
export type PricingModel = {
  strategy: PricingStrategy;
  basePrice: number; // 基础价格
  currency: string; // 货币单位
  dynamicConfig?: DynamicPricingConfig; // 动态定价配置
  tierConfig?: TierPricingConfig; // 分级定价配置
  surgeConfig?: SurgePricingConfig; // 高峰定价配置
  auctionConfig?: AuctionConfig; // 竞价配置
  constraints?: PricingConstraints; // 价格约束
};

/**
 * 动态定价配置（基于供需关系）
 */
export type DynamicPricingConfig = {
  enabled: boolean;
  demandWeight: number; // 需求权重 (0-1)
  supplyWeight: number; // 供给权重 (0-1)
  elasticity: number; // 价格弹性系数
  updateInterval: number; // 价格更新间隔（秒）
  lookbackWindow: number; // 回溯窗口（秒）
};

/**
 * 分级定价配置
 */
export type TierPricingConfig = {
  enabled: boolean;
  tiers: PriceTier[];
};

export type PriceTier = {
  minQuantity: number; // 最小数量
  maxQuantity?: number; // 最大数量（可选）
  pricePerUnit: number; // 单价
  discount?: number; // 折扣百分比
};

/**
 * 高峰定价配置
 */
export type SurgePricingConfig = {
  enabled: boolean;
  surgeMultiplier: number; // 高峰倍数
  thresholdUtilization: number; // 触发阈值（利用率）
  cooldownPeriod: number; // 冷却期（秒）
};

/**
 * 竞价配置
 */
export type AuctionConfig = {
  enabled: boolean;
  startingPrice: number; // 起拍价
  reservePrice?: number; // 保留价（最低成交价）
  bidIncrement: number; // 加价幅度
  auctionDuration: number; // 竞价时长（秒）
  autoExtend: boolean; // 是否自动延时
};

/**
 * 价格约束条件
 */
export type PricingConstraints = {
  minPrice?: number; // 最低价格
  maxPrice?: number; // 最高价格
  maxDiscount?: number; // 最大折扣（百分比）
  priceChangeLimit?: number; // 单次价格变动限制（百分比）
};

/**
 * 市场指标（用于计算动态价格）
 */
export type MarketMetrics = {
  timestamp: string;
  offerId: string;

  // 供给指标
  totalProviders: number; // 总供应商数量
  activeProviders: number; // 活跃供应商数量
  totalCapacity: number; // 总容量
  availableCapacity: number; // 可用容量
  utilizationRate: number; // 利用率 (0-1)

  // 需求指标
  totalOrders: number; // 总订单数
  pendingOrders: number; // 待处理订单数
  completedOrders: number; // 已完成订单数
  orderRate: number; // 订单速率（单位时间）

  // 竞争指标
  similarOffers: number; // 相似服务数量
  avgCompetitorPrice: number; // 竞争对手平均价格
  priceRank: number; // 价格排名（1=最低）
};

/**
 * 价格计算结果
 */
export type PriceCalculation = {
  offerId: string;
  originalPrice: number;
  calculatedPrice: number;
  adjustments: PriceAdjustment[];
  effectiveAt: string;
  expiresAt?: string;
  metrics?: MarketMetrics;
  reason?: string;
};

/**
 * 价格调整项
 */
export type PriceAdjustment = {
  type: string; // 调整类型
  amount: number; // 调整金额
  percentage: number; // 调整百分比
  reason: string; // 调整原因
};

/**
 * 订单簿条目
 */
export type OrderBookEntry = {
  entryId: string;
  offerId: string;
  side: "buy" | "sell"; // 买单/卖单
  price: number;
  quantity: number;
  buyerId?: string;
  sellerId?: string;
  status: "pending" | "partial" | "filled" | "cancelled";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

/**
 * 订单簿快照
 */
export type OrderBook = {
  offerId: string;
  assetType: string;
  timestamp: string;
  bids: OrderBookEntry[]; // 买单（按价格降序）
  asks: OrderBookEntry[]; // 卖单（按价格升序）
  spread?: number; // 买卖价差
  midPrice?: number; // 中间价
};

/**
 * 价格历史记录
 */
export type PriceHistory = {
  historyId: string;
  offerId: string;
  price: number;
  volume: number; // 交易量
  timestamp: string;
  source: "system" | "manual" | "market";
};

/**
 * 市场行情统计
 */
export type MarketStatistics = {
  assetType: string;
  timestamp: string;

  // 价格统计
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  priceVolatility: number; // 价格波动率

  // 交易统计
  totalVolume: number;
  totalOrders: number;
  avgOrderSize: number;

  // 趋势指标
  priceChange24h: number; // 24小时价格变化
  volumeChange24h: number; // 24小时交易量变化
  trendDirection: "up" | "down" | "stable";
};
