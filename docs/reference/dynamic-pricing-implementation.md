## 动态定价功能实现文档

# Dynamic Pricing Implementation Guide

## 🎯 概览

本次更新为 OpenClaw Market Core 扩展添加了完整的动态定价系统，实现从"计划经济"到"自由市场"的转型。

### ⚠️ 重要声明：卖方定价自主权

**定价权完全属于卖方（Provider）！**

- ✅ 动态定价是**可选工具**，不是强制要求
- ✅ 卖方可以选择固定价格，完全自主定价
- ✅ 使用动态定价时，所有参数（基准价、价格范围、弹性系数）由卖方设定
- ✅ 算法只提供**定价建议**，不强制执行
- ✅ 卖方可以随时启用/关闭动态定价
- ✅ 订单簿模式下，买卖双方自由报价，市场自动撮合

**系统的角色**：提供工具和数据，帮助卖方做出更好的定价决策，而不是替代卖方决策。

### 核心功能

1. **多种定价策略**
   - 固定定价（Fixed）
   - 动态定价（Dynamic - 基于供需）
   - 高峰定价（Surge）
   - 分级定价（Tiered - 批量折扣）
   - 竞价模式（Auction）
   - 可协商价格（Negotiable）

2. **订单簿系统**
   - 买单/卖单撮合
   - 实时价格发现
   - 深度展示

3. **市场分析**
   - 价格历史追踪
   - 市场统计指标
   - 价格波动率

---

## 📁 新增文件

### 1. 类型定义

**文件**: `src/market/pricing-types.ts`

定义了完整的动态定价类型系统：

- `PricingStrategy`: 6种定价策略
- `PricingModel`: 定价模型配置
- `MarketMetrics`: 市场供需指标
- `PriceCalculation`: 价格计算结果
- `OrderBook`: 订单簿数据结构
- `MarketStatistics`: 市场统计信息

### 2. 定价引擎

**文件**: `src/market/pricing-engine.ts`

核心定价算法实现：

- `calculateDynamicPrice()`: 动态价格计算
- `calculateTieredPrice()`: 分级定价计算
- `collectMarketMetrics()`: 市场指标收集
- `calculateVolatility()`: 价格波动率计算

**关键算法**:

```typescript
// 供需定价公式
ΔP = BasePrice × elasticity × (demand/supply - 1)

// 高峰定价
if (utilizationRate > threshold) {
  P = P × surgeMultiplier
}

// 竞争定价
adjustment = (avgCompetitorPrice - currentPrice) × factor
```

### 3. 请求处理器

**文件**: `src/market/handlers/pricing.ts`

提供 7 个新的 Gateway 方法：

- `market.pricing.setModel` - 设置定价模型
- `market.pricing.getModel` - 获取定价模型
- `market.pricing.calculate` - 计算实时价格
- `market.pricing.history` - 查询价格历史
- `market.pricing.statistics` - 市场统计
- `market.orderbook.create` - 创建买单/卖单
- `market.orderbook.get` - 查询订单簿

### 4. 状态存储扩展

**文件**: `src/state/pricing-store-extensions.ts`

为状态存储添加新的数据类型支持：

- 定价模型存储
- 价格历史存储
- 订单簿存储

---

## 🚀 使用指南

### 1. 设置动态定价模型

```javascript
// 为 Offer 设置动态定价
const response = await openclaw.callGatewayMethod("market.pricing.setModel", {
  offerId: "offer-123",
  strategy: "dynamic",
  basePrice: 10.0,
  currency: "USD",
  dynamicConfig: {
    enabled: true,
    demandWeight: 0.6,
    supplyWeight: 0.4,
    elasticity: 0.3,
    updateInterval: 300, // 5分钟更新
    lookbackWindow: 3600, // 回溯1小时
  },
  surgeConfig: {
    enabled: true,
    surgeMultiplier: 1.5,
    thresholdUtilization: 0.8, // 80%利用率触发
    cooldownPeriod: 1800,
  },
  constraints: {
    minPrice: 5.0,
    maxPrice: 50.0,
    maxDiscount: 20, // 最多8折
    priceChangeLimit: 30, // 单次变动不超过30%
  },
});
```

### 2. 计算实时价格

```javascript
// 获取当前价格
const priceResult = await openclaw.callGatewayMethod("market.pricing.calculate", {
  offerId: "offer-123",
  quantity: 10,
});

console.log(priceResult);
/*
{
  offerId: "offer-123",
  originalPrice: 10.0,
  calculatedPrice: 12.5,
  adjustments: [
    {
      type: "supply_demand",
      amount: 1.5,
      percentage: 15,
      reason: "供需比率: 1.25"
    },
    {
      type: "surge",
      amount: 1.0,
      percentage: 10,
      reason: "高峰期（利用率: 85.0%）"
    }
  ],
  effectiveAt: "2026-02-21T00:00:00Z",
  expiresAt: "2026-02-21T00:05:00Z"
}
*/
```

### 3. 设置分级定价（批量折扣）

```javascript
const response = await openclaw.callGatewayMethod("market.pricing.setModel", {
  offerId: "offer-456",
  strategy: "tiered",
  basePrice: 100.0,
  currency: "USD",
  tierConfig: {
    enabled: true,
    tiers: [
      { minQuantity: 1, maxQuantity: 10, pricePerUnit: 100.0 },
      { minQuantity: 11, maxQuantity: 50, pricePerUnit: 90.0, discount: 10 },
      { minQuantity: 51, maxQuantity: 100, pricePerUnit: 80.0, discount: 20 },
      { minQuantity: 101, pricePerUnit: 70.0, discount: 30 }, // 101+无上限
    ],
  },
});

// 计算批量价格
const bulkPrice = await openclaw.callGatewayMethod("market.pricing.calculate", {
  offerId: "offer-456",
  quantity: 60,
});
// 结果: 60 × $80 = $4,800 (节省 $1,200)
```

### 4. 使用订单簿交易

```javascript
// 卖家挂卖单
await openclaw.callGatewayMethod("market.orderbook.create", {
  offerId: "offer-789",
  side: "sell",
  price: 15.0,
  quantity: 100,
  expiresIn: 3600, // 1小时后过期
});

// 买家挂买单
await openclaw.callGatewayMethod("market.orderbook.create", {
  offerId: "offer-789",
  side: "buy",
  price: 14.5,
  quantity: 50,
  expiresIn: 3600,
});

// 查询订单簿
const orderbook = await openclaw.callGatewayMethod("market.orderbook.get", {
  offerId: "offer-789",
});

console.log(orderbook);
/*
{
  offerId: "offer-789",
  assetType: "service",
  timestamp: "2026-02-21T00:00:00Z",
  bids: [
    { entryId: "...", side: "buy", price: 14.5, quantity: 50, ... }
  ],
  asks: [
    { entryId: "...", side: "sell", price: 15.0, quantity: 100, ... }
  ],
  spread: 0.5,
  midPrice: 14.75
}
*/
```

### 5. 查询市场统计

```javascript
const stats = await openclaw.callGatewayMethod("market.pricing.statistics", {
  assetType: "service",
});

console.log(stats);
/*
{
  assetType: "service",
  timestamp: "2026-02-21T00:00:00Z",
  avgPrice: 12.5,
  minPrice: 8.0,
  maxPrice: 20.0,
  medianPrice: 12.0,
  priceVolatility: 0.15,
  totalVolume: 1500,
  totalOrders: 120,
  avgOrderSize: 12.5,
  priceChange24h: 5.2,  // 上涨5.2%
  volumeChange24h: -2.8, // 下跌2.8%
  trendDirection: "up"
}
*/
```

---

## 🔧 集成到现有系统

### 更新状态存储

当前的 `MarketStateStore` 需要添加新方法。有两种方式：

#### 方式 1: 直接修改 store.ts（推荐）

在 `MarketFileStore` 类中添加：

```typescript
// 在 MarketFileStore 类中添加
private get pricingModelsPath() {
  return "pricing-models.json";
}

savePricingModel(offerId: string, model: PricingModel): void {
  const map = this.readMap<PricingModel>(this.pricingModelsPath);
  map[offerId] = model;
  this.writeMap(this.pricingModelsPath, map);
}

getPricingModel(offerId: string): PricingModel | undefined {
  return this.readMap<PricingModel>(this.pricingModelsPath)[offerId];
}

// ... 其他方法参见 pricing-store-extensions.ts
```

在 `MarketSqliteStore` 的 `ensureSchema()` 方法中添加：

```typescript
private ensureSchema() {
  this.db.exec(
    // ... 现有表 ...
    "CREATE TABLE IF NOT EXISTS pricing_models (offer_id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
    "CREATE TABLE IF NOT EXISTS price_history (id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, timestamp TEXT NOT NULL, data TEXT NOT NULL);" +
    "CREATE INDEX IF NOT EXISTS price_history_offer ON price_history(offer_id);" +
    "CREATE TABLE IF NOT EXISTS order_book (id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, side TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);" +
    "CREATE INDEX IF NOT EXISTS order_book_offer ON order_book(offer_id);"
  );
}
```

#### 方式 2: 使用 TypeScript 声明合并

在 `pricing-store-extensions.ts` 中声明接口扩展，然后在运行时混入方法。

---

## 🧪 测试用例

### 单元测试示例

```typescript
import { calculateDynamicPrice, collectMarketMetrics } from "./pricing-engine.js";

describe("Dynamic Pricing", () => {
  it("应根据供需调整价格", () => {
    const model: PricingModel = {
      strategy: "dynamic",
      basePrice: 10.0,
      currency: "USD",
      dynamicConfig: {
        enabled: true,
        demandWeight: 0.6,
        supplyWeight: 0.4,
        elasticity: 0.3,
        updateInterval: 300,
        lookbackWindow: 3600,
      },
    };

    const metrics: MarketMetrics = {
      timestamp: new Date().toISOString(),
      offerId: "test-offer",
      totalProviders: 10,
      activeProviders: 8,
      totalCapacity: 1000,
      availableCapacity: 200, // 80% 利用率
      utilizationRate: 0.8,
      totalOrders: 100,
      pendingOrders: 20,
      completedOrders: 80,
      orderRate: 15, // 高需求
      similarOffers: 5,
      avgCompetitorPrice: 12.0,
      priceRank: 1,
    };

    const result = calculateDynamicPrice(model, metrics);

    expect(result.calculatedPrice).toBeGreaterThan(model.basePrice);
    expect(result.adjustments.length).toBeGreaterThan(0);
  });

  it("应用价格约束", () => {
    const model: PricingModel = {
      strategy: "dynamic",
      basePrice: 10.0,
      currency: "USD",
      dynamicConfig: {
        /* ... */
      },
      constraints: {
        minPrice: 8.0,
        maxPrice: 15.0,
      },
    };

    // 极端供需情况
    const metrics: MarketMetrics = {
      // ... 极高需求，极低供给 ...
    };

    const result = calculateDynamicPrice(model, metrics);

    expect(result.calculatedPrice).toBeLessThanOrEqual(15.0);
    expect(result.calculatedPrice).toBeGreaterThanOrEqual(8.0);
  });
});
```

---

## 📊 性能考虑

### 缓存策略

建议为频繁访问的价格计算添加缓存：

```typescript
// 简单的内存缓存示例
const priceCache = new Map<string, { price: PriceCalculation; expiresAt: number }>();

function getCachedPrice(offerId: string): PriceCalculation | null {
  const cached = priceCache.get(offerId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.price;
  }
  return null;
}

function setCachedPrice(offerId: string, price: PriceCalculation, ttl: number) {
  priceCache.set(offerId, {
    price,
    expiresAt: Date.now() + ttl * 1000,
  });
}
```

### 批量查询优化

对于市场统计等批量查询，考虑：

- 使用数据库索引（已在 SQLite schema 中添加）
- 定期预计算汇总数据
- 使用消息队列异步更新

---

## 🔄 迁移路径

### 从固定价格迁移

现有的固定价格 Offers 无需修改，自动兼容：

```typescript
// 旧代码继续工作
const offer = {
  offerId: "old-offer",
  price: 10.0,
  currency: "USD",
  // ... 其他字段
};

// 如需启用动态定价，额外调用
await openclaw.callGatewayMethod("market.pricing.setModel", {
  offerId: "old-offer",
  strategy: "dynamic",
  basePrice: offer.price,
  currency: offer.currency,
  dynamicConfig: {
    /* ... */
  },
});
```

---

## 🎨 UI/UX 集成建议

### 价格展示组件

```jsx
function PriceDisplay({ offerId }) {
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPrice() {
      const result = await openclaw.callGatewayMethod("market.pricing.calculate", {
        offerId,
        quantity: 1,
      });
      setPrice(result);
      setLoading(false);
    }
    fetchPrice();
    const interval = setInterval(fetchPrice, 30000); // 每30秒刷新
    return () => clearInterval(interval);
  }, [offerId]);

  if (loading) return <Spinner />;

  return (
    <div className="price-display">
      <div className="current-price">${price.calculatedPrice.toFixed(2)}</div>
      {price.adjustments.length > 0 && (
        <div className="price-adjustments">
          {price.adjustments.map((adj, i) => (
            <div key={i} className="adjustment">
              <Badge type={adj.amount > 0 ? "increase" : "decrease"}>
                {adj.percentage > 0 ? "+" : ""}
                {adj.percentage.toFixed(1)}%
              </Badge>
              <span>{adj.reason}</span>
            </div>
          ))}
        </div>
      )}
      <div className="original-price">原价: ${price.originalPrice.toFixed(2)}</div>
    </div>
  );
}
```

### 订单簿可视化

```jsx
function OrderBookWidget({ offerId }) {
  const [orderbook, setOrderbook] = useState(null);

  useEffect(() => {
    async function fetchOrderBook() {
      const result = await openclaw.callGatewayMethod("market.orderbook.get", {
        offerId,
      });
      setOrderbook(result);
    }
    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, 5000);
    return () => clearInterval(interval);
  }, [offerId]);

  if (!orderbook) return null;

  return (
    <div className="orderbook">
      <div className="spread-info">
        买卖价差: ${orderbook.spread?.toFixed(2)}
        中间价: ${orderbook.midPrice?.toFixed(2)}
      </div>
      <div className="orderbook-sides">
        <div className="bids">
          <h4>买单 (Bids)</h4>
          {orderbook.bids.map((bid) => (
            <OrderBookRow key={bid.entryId} entry={bid} type="bid" />
          ))}
        </div>
        <div className="asks">
          <h4>卖单 (Asks)</h4>
          {orderbook.asks.map((ask) => (
            <OrderBookRow key={ask.entryId} entry={ask} type="ask" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## 📈 未来增强

### 短期 (1-2周)

- [ ] 添加价格预警通知
- [ ] 实现订单簿深度图表
- [ ] 提供 CSV 导出功能

### 中期 (1-2月)

- [ ] 机器学习价格预测
- [ ] A/B 测试不同定价策略
- [ ] 多货币支持和汇率转换

### 长期 (3-6月)

- [ ] 链上定价 Oracle
- [ ] 跨平台价格同步
- [ ] 去中心化价格治理

---

## 🤝 贡献指南

欢迎提交 PR 改进动态定价系统！

### 开发流程

1. Fork 仓库
2. 创建功能分支: `git checkout -b feature/pricing-enhancement`
3. 提交变更: `git commit -m 'feat: 添加xxx功能'`
4. 推送分支: `git push origin feature/pricing-enhancement`
5. 提交 Pull Request

### 代码规范

- 使用 TypeScript 严格模式
- 遵循现有的代码风格
- 添加单元测试
- 更新相关文档

---

## 📞 支持

遇到问题？

- 查看 [常见问题](./FAQ.md)
- 提交 [Issue](https://github.com/Nuxs/openclaw/issues)
- 加入 [讨论组](https://github.com/Nuxs/openclaw/discussions)

---

**版本**: 1.0.0  
**更新日期**: 2026-02-21  
**作者**: OpenClaw Team
