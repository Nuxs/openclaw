/**
 * 动态定价状态存储扩展
 * Pricing State Store Extensions
 */

import type { PricingModel, PriceHistory, OrderBookEntry } from "../market/pricing-types.js";
import type { Order } from "../market/types.js";

/**
 * 扩展 MarketStateStore 以支持动态定价数据
 *
 * 注意：这些方法需要添加到 MarketStateStore 类中
 */
export interface PricingStateStoreExtensions {
  // 定价模型
  savePricingModel(offerId: string, model: PricingModel): void;
  getPricingModel(offerId: string): PricingModel | undefined;
  listPricingModels(): Array<{ offerId: string; model: PricingModel }>;

  // 价格历史
  savePriceHistory(history: PriceHistory): void;
  getPriceHistory(offerId: string, limit?: number): PriceHistory[];

  // 订单簿
  saveOrderBookEntry(entry: OrderBookEntry): void;
  getOrderBookEntry(entryId: string): OrderBookEntry | undefined;
  getOrderBookEntries(offerId: string): OrderBookEntry[];

  // 辅助查询方法
  getOrdersByOffer(offerId: string): Order[];
  getOffersByAssetType(
    assetType: string,
  ): Array<{ offerId: string; price: number; assetType: string }>;

  // Provider 相关（可选，用于供需计算）
  getProvidersByOffer?(offerId: string): Array<{
    active: boolean;
    capacity: number;
    available: number;
  }>;

  // 竞争对手 Offers（可选，用于竞争定价）
  getCompetitorOffers?(offerId: string): Array<{ price: number }>;
}

/**
 * 文件存储实现的扩展方法
 *
 * 使用方法：将这些方法添加到 MarketFileStore 类中
 */
export const fileStoreExtensions = {
  // 定价模型路径
  pricingModelsPath: "pricing-models.json",

  // 保存定价模型
  savePricingModel(offerId: string, model: PricingModel): void {
    // @ts-expect-error - accessing private method
    const map = this.readMap(this.pricingModelsPath) as Record<string, PricingModel>;
    map[offerId] = model;
    // @ts-expect-error - accessing private method
    this.writeMap(this.pricingModelsPath, map);
  },

  // 获取定价模型
  getPricingModel(offerId: string): PricingModel | undefined {
    // @ts-expect-error - accessing private method
    const map = this.readMap(this.pricingModelsPath) as Record<string, PricingModel>;
    return map[offerId];
  },

  // 列出所有定价模型
  listPricingModels(): Array<{ offerId: string; model: PricingModel }> {
    // @ts-expect-error - accessing private method
    const map = this.readMap(this.pricingModelsPath) as Record<string, PricingModel>;
    return Object.entries(map).map(([offerId, model]) => ({ offerId, model }));
  },

  // 价格历史路径
  priceHistoryPath: "price-history.json",

  // 保存价格历史
  savePriceHistory(history: PriceHistory): void {
    // @ts-expect-error - accessing private method
    const map = this.readMap(this.priceHistoryPath) as Record<string, PriceHistory>;
    map[history.historyId] = history;
    // @ts-expect-error - accessing private method
    this.writeMap(this.priceHistoryPath, map);
  },

  // 获取价格历史
  getPriceHistory(offerId: string, limit = 100): PriceHistory[] {
    // @ts-expect-error - accessing private method
    const map = this.readMap(this.priceHistoryPath) as Record<string, PriceHistory>;
    return Object.values(map)
      .filter((h) => h.offerId === offerId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  },

  // 订单簿路径
  orderBookPath: "order-book.json",

  // 保存订单簿条目
  saveOrderBookEntry(entry: OrderBookEntry): void {
    // @ts-expect-error - accessing private method
    const map = this.readMap(this.orderBookPath) as Record<string, OrderBookEntry>;
    map[entry.entryId] = entry;
    // @ts-expect-error - accessing private method
    this.writeMap(this.orderBookPath, map);
  },

  // 获取订单簿条目
  getOrderBookEntry(entryId: string): OrderBookEntry | undefined {
    // @ts-expect-error - accessing private method
    const map = this.readMap(this.orderBookPath) as Record<string, OrderBookEntry>;
    return map[entryId];
  },

  // 获取订单簿所有条目
  getOrderBookEntries(offerId: string): OrderBookEntry[] {
    // @ts-expect-error - accessing private method
    const map = this.readMap(this.orderBookPath) as Record<string, OrderBookEntry>;
    return Object.values(map).filter((e) => e.offerId === offerId);
  },

  // 按 Offer 获取订单
  getOrdersByOffer(offerId: string): Order[] {
    // @ts-expect-error - accessing existing method
    return this.listOrders().filter((o: Order) => o.offerId === offerId);
  },

  // 按资产类型获取 Offers
  getOffersByAssetType(assetType: string) {
    // @ts-expect-error - accessing existing method
    return this.listOffers()
      .filter((o: { assetType: string }) => o.assetType === assetType)
      .map((o: { offerId: string; price: number; assetType: string }) => ({
        offerId: o.offerId,
        price: o.price,
        assetType: o.assetType,
      }));
  },
};

/**
 * SQLite 存储实现的扩展方法
 *
 * 使用方法：将这些方法添加到 MarketSqliteStore 类中，并在 ensureSchema 中添加表创建语句
 */
export const sqliteStoreExtensions = {
  // 在 ensureSchema 中添加：
  extendedSchema: `
    CREATE TABLE IF NOT EXISTS pricing_models (
      offer_id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS price_history_offer ON price_history(offer_id);
    CREATE INDEX IF NOT EXISTS price_history_ts ON price_history(timestamp);
    CREATE TABLE IF NOT EXISTS order_book (
      id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL,
      side TEXT NOT NULL,
      status TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS order_book_offer ON order_book(offer_id);
    CREATE INDEX IF NOT EXISTS order_book_side ON order_book(side, status);
  `,

  // 保存定价模型
  savePricingModel(offerId: string, model: PricingModel): void {
    // @ts-expect-error - accessing db
    this.db
      .prepare("INSERT OR REPLACE INTO pricing_models (offer_id, data) VALUES (?, ?)")
      .run(offerId, JSON.stringify(model));
  },

  // 获取定价模型
  getPricingModel(offerId: string): PricingModel | undefined {
    // @ts-expect-error - accessing db
    const row = this.db
      .prepare("SELECT data FROM pricing_models WHERE offer_id = ?")
      .get(offerId) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as PricingModel) : undefined;
  },

  // 列出所有定价模型
  listPricingModels(): Array<{ offerId: string; model: PricingModel }> {
    // @ts-expect-error - accessing db
    const rows = this.db.prepare("SELECT offer_id, data FROM pricing_models").all() as Array<{
      offer_id: string;
      data: string;
    }>;
    return rows.map((row) => ({
      offerId: row.offer_id,
      model: JSON.parse(row.data) as PricingModel,
    }));
  },

  // 保存价格历史
  savePriceHistory(history: PriceHistory): void {
    // @ts-expect-error - accessing db
    this.db
      .prepare(
        "INSERT OR REPLACE INTO price_history (id, offer_id, timestamp, data) VALUES (?, ?, ?, ?)",
      )
      .run(history.historyId, history.offerId, history.timestamp, JSON.stringify(history));
  },

  // 获取价格历史
  getPriceHistory(offerId: string, limit = 100): PriceHistory[] {
    // @ts-expect-error - accessing db
    const rows = this.db
      .prepare("SELECT data FROM price_history WHERE offer_id = ? ORDER BY timestamp DESC LIMIT ?")
      .all(offerId, limit) as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as PriceHistory);
  },

  // 保存订单簿条目
  saveOrderBookEntry(entry: OrderBookEntry): void {
    // @ts-expect-error - accessing db
    this.db
      .prepare(
        "INSERT OR REPLACE INTO order_book (id, offer_id, side, status, data) VALUES (?, ?, ?, ?, ?)",
      )
      .run(entry.entryId, entry.offerId, entry.side, entry.status, JSON.stringify(entry));
  },

  // 获取订单簿条目
  getOrderBookEntry(entryId: string): OrderBookEntry | undefined {
    // @ts-expect-error - accessing db
    const row = this.db.prepare("SELECT data FROM order_book WHERE id = ?").get(entryId) as
      | { data: string }
      | undefined;
    return row ? (JSON.parse(row.data) as OrderBookEntry) : undefined;
  },

  // 获取订单簿所有条目
  getOrderBookEntries(offerId: string): OrderBookEntry[] {
    // @ts-expect-error - accessing db
    const rows = this.db
      .prepare("SELECT data FROM order_book WHERE offer_id = ?")
      .all(offerId) as Array<{
      data: string;
    }>;
    return rows.map((row) => JSON.parse(row.data) as OrderBookEntry);
  },

  // 按 Offer 获取订单
  getOrdersByOffer(offerId: string): Order[] {
    // @ts-expect-error - accessing existing method
    return this.listOrders().filter((o: Order) => o.offerId === offerId);
  },

  // 按资产类型获取 Offers
  getOffersByAssetType(assetType: string) {
    // @ts-expect-error - accessing existing method
    return this.listOffers()
      .filter((o: { assetType: string }) => o.assetType === assetType)
      .map((o: { offerId: string; price: number; assetType: string }) => ({
        offerId: o.offerId,
        price: o.price,
        assetType: o.assetType,
      }));
  },
};
