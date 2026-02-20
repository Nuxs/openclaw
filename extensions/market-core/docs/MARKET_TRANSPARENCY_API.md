# 市场透明度API设计文档

# Market Transparency API Design

## 核心原则

### ✅ 自由市场三大原则

1. **卖方完全自主定价**
   - 系统不干预价格决策
   - Provider设定的价格就是最终价格
   - 任何"算法定价"都是建议性质，非强制

2. **信息透明化**
   - 买卖双方都能看到完整的市场行情
   - 价格、供需、趋势等数据公开可查
   - 帮助参与者做出明智决策

3. **可选的自动化**
   - Provider可以选择启用自动调价助手
   - 所有参数由Provider设定
   - Provider随时可以禁用

---

## API接口设计

### 一、市场信息查询（Public API）

这些接口提供市场行情的客观数据，面向所有用户。

#### 1.1 获取市场价格统计

```typescript
namespace market.transparency {
  async getMarketStats(args: {
    resourceType: string      // 资源类型（如 "llm-api"）
    capability?: string       // 可选：特定能力筛选（如 "gpt-4"）
  }): Promise<{
    resourceType: string
    timestamp: string
    offerCount: number

    priceStats: {
      min: number             // 最低价
      max: number             // 最高价
      median: number          // 中位价
      p25: number             // 25分位
      p75: number             // 75分位
      avg: number             // 平均价
    }

    volatility: number        // 价格波动率 (0-1)
  }>
}
```

**使用场景**：

- Consumer查看："这类服务一般多少钱？"
- Provider查看："市场行情如何？我的价格竞争力怎样？"

**示例调用**：

```typescript
const stats = await market.transparency.getMarketStats({
  resourceType: "llm-api",
  capability: "gpt-4-turbo",
});

console.log(`市场中位价: ${stats.priceStats.median} USD`);
console.log(`价格范围: ${stats.priceStats.min} - ${stats.priceStats.max}`);
```

---

#### 1.2 获取价格分布详情

```typescript
namespace market.transparency {
  async getPriceDistribution(args: {
    resourceType: string
    capability?: string
    sortBy?: "price" | "reputation"  // 排序方式
  }): Promise<{
    resourceType: string
    timestamp: string

    offers: Array<{
      offerId: string
      providerId: string      // Provider身份
      price: number
      capability: string
      reputation: number      // 信誉评分
    }>
  }>
}
```

**使用场景**：

- Consumer对比："这些Provider的价格和信誉如何？"
- Provider分析："我的竞争对手定价多少？"

---

#### 1.3 获取市场趋势

```typescript
namespace market.transparency {
  async getMarketTrends(args: {
    resourceType: string
    period: "24h" | "7d" | "30d"
  }): Promise<{
    resourceType: string
    period: string

    priceChange: number       // 价格变化百分比
    volumeChange: number      // 交易量变化百分比
    providerChange: number    // Provider数量变化

    trendDirection: "up" | "down" | "stable"

    historicalPrices: Array<{
      timestamp: string
      avgPrice: number
      volume: number
    }>
  }>
}
```

**使用场景**：

- 了解市场是否处于涨价/降价趋势
- 判断进入市场的时机

---

### 二、定价建议API（Advisory Only）

这些接口提供建议，但**不强制**Provider接受。

#### 2.1 获取定价建议

```typescript
namespace market.transparency {
  async getPricingRecommendation(args: {
    myResourceType: string
    myCapability: string
    myReputation: number      // 我的信誉评分
  }): Promise<{
    recommendedPrice: number
    priceRange: {
      min: number
      max: number
    }
    confidence: number        // 建议的置信度 (0-1)

    reasoning: string         // 建议理由（透明化）

    marketContext: {
      totalOffers: number
      similarOffers: number
      yourCompetitivePosition: "first-mover" | "premium" | "mid-tier" | "budget"
    }
  }>
}
```

**使用场景**：

- 新Provider："我该定什么价？"
- 现有Provider："我的价格是否合理？"

**示例调用**：

```typescript
const recommendation = await market.transparency.getPricingRecommendation({
  myResourceType: "llm-api",
  myCapability: "gpt-4-turbo",
  myReputation: 85,
});

console.log(`建议价格: ${recommendation.recommendedPrice}`);
console.log(`理由: ${recommendation.reasoning}`);
// 输出："您的信誉评分为 85，处于市场前列。建议定价在市场75分位以上..."

// Provider可以接受或忽略这个建议
await market.resource.updatePrice({
  offerId: "my-offer-123",
  newPrice: recommendation.recommendedPrice, // 或者自己设定的价格
});
```

---

### 三、自动化助手API（Optional Automation）

这些接口用于Provider**可选的**自动调价功能。

#### 3.1 启用自动调价

```typescript
namespace market.transparency.automation {
  async enableAutoPricing(args: {
    resourceId: string

    // Provider选择策略
    strategy: "match_market" | "undercut_by_percent" | "premium"

    // Provider设定所有参数
    parameters: {
      // 策略参数
      targetPercentile?: number   // 用于 match_market，如 50（跟随中位价）
      undercutPercent?: number    // 用于 undercut_by_percent，如 5（比最低价低5%）
      premiumPercent?: number     // 用于 premium，如 20（比中位价高20%）

      // 价格边界（Provider的绝对控制）
      minPrice: number            // 算法不能突破的底线
      maxPrice: number            // 算法不能突破的上限
    }

    // 更新频率
    updateInterval: "hourly" | "daily"
  }): Promise<{
    configId: string
    status: "enabled"
    nextUpdateAt: string
  }>
}
```

**重要说明**：

- ✅ Provider主动启用
- ✅ Provider设定所有参数
- ✅ Provider可以随时禁用

**策略说明**：

| 策略                  | 适用场景                       | 参数                                  |
| --------------------- | ------------------------------ | ------------------------------------- |
| `match_market`        | 跟随市场，保持中等位置         | `targetPercentile: 50`（中位价）      |
| `undercut_by_percent` | 吸引价格敏感客户，快速获取订单 | `undercutPercent: 5`（比最低价低5%）  |
| `premium`             | 定位高端市场，强调服务质量     | `premiumPercent: 20`（比中位价高20%） |

**示例调用**：

```typescript
// 场景1：新Provider，希望快速吸引客户
await market.transparency.automation.enableAutoPricing({
  resourceId: "my-resource-123",
  strategy: "undercut_by_percent",
  parameters: {
    undercutPercent: 5,
    minPrice: 0.04, // 绝对底线：不能低于0.04
    maxPrice: 0.1, // 绝对上限：不能高于0.10
  },
  updateInterval: "hourly",
});

// 场景2：高信誉Provider，定位高端
await market.transparency.automation.enableAutoPricing({
  resourceId: "premium-resource-456",
  strategy: "premium",
  parameters: {
    premiumPercent: 25,
    minPrice: 0.08,
    maxPrice: 0.2,
  },
  updateInterval: "daily",
});
```

---

#### 3.2 禁用自动调价

```typescript
namespace market.transparency.automation {
  async disableAutoPricing(args: {
    resourceId: string
  }): Promise<{
    status: "disabled"
    lastPrice: number
  }>
}
```

**使用场景**：

- Provider发现自动调价效果不好
- Provider希望手动控制价格

---

#### 3.3 暂停自动调价

```typescript
namespace market.transparency.automation {
  async pauseAutoPricing(args: {
    resourceId: string
    pauseUntil: string    // ISO时间戳
  }): Promise<{
    status: "paused"
    resumeAt: string
  }>
}
```

**使用场景**：

- 临时暂停（如：服务升级期间希望固定价格）
- 特定时段手动控制

---

#### 3.4 查看自动调价效果

```typescript
namespace market.transparency.automation {
  async getAutoPricingReport(args: {
    resourceId: string
    period: "24h" | "7d" | "30d"
  }): Promise<{
    resourceId: string
    reportPeriod: { start: string, end: string }

    // 价格变化历史
    priceChanges: Array<{
      price: number
      timestamp: string
      reason: string
    }>

    // 收入影响
    revenueImpact: {
      before: number      // 启用前的收入
      after: number       // 启用后的收入
      change: number
      changePercent: number
    }

    // 订单影响
    orderImpact: {
      before: number
      after: number
      change: number
      changePercent: number
    }
  }>
}
```

**使用场景**：

- Provider评估自动调价是否值得继续使用
- 数据驱动的决策

---

### 四、订单簿模式API（最自由的市场机制）

订单簿模式是真正的去中心化定价：买卖双方自由报价，系统撮合成交。

#### 4.1 提交买单/卖单

```typescript
namespace market.orderbook {
  async submitOrder(args: {
    resourceType: string
    side: "buy" | "sell"
    price: number         // 出价/要价
    quantity: number
    expiresAt?: string    // 可选：过期时间
  }): Promise<{
    orderId: string
    status: "pending" | "filled" | "partial"
    matchedOrders?: Array<{
      matchId: string
      quantity: number
      price: number
      counterpartyId: string
    }>
  }>
}
```

**示例**：

```typescript
// Consumer挂买单："我愿意以0.045 USD购买1M tokens的LLM服务"
await market.orderbook.submitOrder({
  resourceType: "llm-api",
  side: "buy",
  price: 0.045,
  quantity: 1000000,
});

// Provider挂卖单："我以0.048 USD出售LLM服务"
await market.orderbook.submitOrder({
  resourceType: "llm-api",
  side: "sell",
  price: 0.048,
  quantity: 2000000,
});

// 系统自动撮合：当买价≥卖价时成交
```

---

#### 4.2 查看订单簿

```typescript
namespace market.orderbook {
  async getOrderBook(args: {
    resourceType: string
    depth?: number        // 显示前N档价格
  }): Promise<{
    resourceType: string
    timestamp: string

    bids: Array<{         // 买单（按价格降序）
      price: number
      quantity: number
      orderCount: number
    }>

    asks: Array<{         // 卖单（按价格升序）
      price: number
      quantity: number
      orderCount: number
    }>

    spread: number        // 买卖价差
    midPrice: number      // 中间价
    lastTradePrice: number // 最新成交价
  }>
}
```

---

## API使用流程示例

### 场景1：Consumer寻找服务

```typescript
// 1. 查看市场行情
const stats = await market.transparency.getMarketStats({
  resourceType: "llm-api",
  capability: "gpt-4",
});
console.log(`市场中位价: ${stats.priceStats.median}`);

// 2. 查看具体Provider
const distribution = await market.transparency.getPriceDistribution({
  resourceType: "llm-api",
  sortBy: "price",
});

// 3. 选择性价比最高的
const bestOffer = distribution.offers.find(
  (o) => o.price <= stats.priceStats.p25 && o.reputation >= 70,
);

// 4. 创建订单
await market.lease.create({
  offerId: bestOffer.offerId,
  duration: 3600,
});
```

---

### 场景2：新Provider定价

```typescript
// 1. 获取定价建议
const recommendation = await market.transparency.getPricingRecommendation({
  myResourceType: "llm-api",
  myCapability: "gpt-4",
  myReputation: 0, // 新Provider
});

console.log(recommendation.reasoning);
// 输出："作为新Provider，建议初期定价略低于市场中位（0.042），以吸引首批用户建立信誉。"

// 2. Provider自主决定价格
const myPrice = recommendation.recommendedPrice * 0.95; // 决定再便宜5%

// 3. 发布资源
await market.resource.publish({
  name: "My LLM Service",
  type: "llm-api",
  endpoint: "https://my-service.com",
  pricing: {
    basePrice: myPrice,
    currency: "USD",
    billingUnit: "1K-tokens",
  },
});
```

---

### 场景3：Provider启用自动调价

```typescript
// 1. 手动定价一段时间后，想尝试自动调价
await market.transparency.automation.enableAutoPricing({
  resourceId: "my-resource-123",
  strategy: "match_market",
  parameters: {
    targetPercentile: 40, // 保持在市场40分位（略低于中位）
    minPrice: 0.04,
    maxPrice: 0.08,
  },
  updateInterval: "daily",
});

// 2. 一周后查看效果
const report = await market.transparency.automation.getAutoPricingReport({
  resourceId: "my-resource-123",
  period: "7d",
});

if (report.revenueImpact.changePercent > 0) {
  console.log(`自动调价增加收入 ${report.revenueImpact.changePercent.toFixed(1)}%`);
} else {
  // 效果不好，禁用
  await market.transparency.automation.disableAutoPricing({
    resourceId: "my-resource-123",
  });
}
```

---

## 与原有API的对比

### ❌ 旧设计（违背自由市场）

```typescript
// 系统决定价格
market.pricing.setDynamic({ ... })
market.pricing.applyStrategy({ ... })
market.pricing.calculatePrice({ ... })  // 系统计算
```

**问题**：

- 暗示系统控制价格
- Provider没有自主权
- "计划经济"思维

---

### ✅ 新设计（真正的自由市场）

```typescript
// 系统提供信息
market.transparency.getMarketStats({ ... })       // 查询行情
market.transparency.getPricingRecommendation({ ... })  // 获取建议

// Provider自主决策
market.resource.updatePrice({ ... })              // Provider更新价格

// Provider可选的自动化
market.transparency.automation.enableAutoPricing({ ... })  // 明确是"助手"
market.transparency.automation.disableAutoPricing({ ... }) // 随时可关闭
```

**优点**：

- ✅ 卖方完全自主定价
- ✅ 系统角色清晰（信息提供者）
- ✅ 真正的自由市场

---

## 总结

### 核心改变

| 维度         | 旧设计                            | 新设计                                |
| ------------ | --------------------------------- | ------------------------------------- |
| **定价权**   | 系统算法决定 ❌                   | Provider完全自主 ✅                   |
| **系统角色** | 价格制定者 ❌                     | 信息提供者 ✅                         |
| **接口命名** | `calculatePrice`, `applyStrategy` | `getMarketStats`, `getRecommendation` |
| **自动化**   | 默认开启 ❌                       | 可选开启，随时关闭 ✅                 |
| **透明度**   | 算法黑盒 ❌                       | 提供reasoning说明 ✅                  |

### 设计哲学

```
❌ 旧哲学：系统知道最优价格
✅ 新哲学：系统提供信息，市场发现价格

❌ 旧模式：计划经济（系统定价）
✅ 新模式：自由市场（供需决定）
```

---

## 下一步

1. ✅ 重构代码（已完成）
2. ✅ 更新API设计（本文档）
3. ⏳ 更新handlers实现
4. ⏳ 编写单元测试
5. ⏳ 更新用户文档
