---
summary: "Historical free-market design document mixing vision, UX drafts, and technical gates for OpenClaw Web3"
read_when:
  - You are reviewing historical free-market design ideas or earlier gate definitions
  - You need context on superseded Web3 market plans and drafts
  - You want non-normative background for current Web3 market reference docs
title: "OpenClaw Web3 自由市场技术文档"
doc_family: "web3"
doc_layer: "historical"
normative: false
---

# OpenClaw Web3 自由市场技术文档

> 重要提示：本文是“自由市场”方向的**设计/愿景 + 可执行 Gate**混合文档，其中部分 UX/CLI 示例为概念草案，不代表当前实现已完整具备。
>
> - 当前可用的权威接口与安全契约：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
> - 当前可用的插件与能力清单：[/plugins/web3-core](/plugins/web3-core)、[/plugins/market-core](/plugins/market-core)
> - 当前可用的市场开发口径（结算/争议等）：[/reference/web3-market-dev](/reference/web3-market-dev)

**版本**: v2.0  
**最后更新**: 2026-02-20  
**作者**: OpenClaw Team

---

## 目录

1. 概述
2. 核心理念
3. 系统架构
4. 核心功能
5. 信誉评分系统
6. 市场仪表盘 UI
7. API 接口文档
8. 智能合约设计
9. 安全与防作弊机制
10. 部署指南
11. 开发路线图
12. 常见问题

---

## 1. 概述

### 1.1 项目背景

OpenClaw Web3 扩展旨在构建一个**真正的自由市场**，让 AI 算力提供者(Provider)和消费者(Consumer)能够：

- 🔓 **自由定价**: Provider 自主设定价格策略
- 📊 **信息透明**: 实时市场行情、历史数据、用户评价
- ⚡ **自由竞争**: 多维度评分、质量竞争
- 🚪 **低门槛**: 3 分钟上架，1 分钟使用
- 🔗 **去中心化（最小披露）**: 链上身份/回执/锚定不可篡改，但 endpoint/token/调用明细永不上链、永不对外输出

### 1.2 核心价值主张

| 维度     | 传统中心化平台     | OpenClaw 自由市场 |
| -------- | ------------------ | ----------------- |
| **定价** | 平台统一定价       | Provider 自主定价 |
| **选择** | 无法选择服务商     | 根据价格/质量筛选 |
| **竞争** | 无竞争             | Provider 竞争客户 |
| **信息** | 不透明             | 实时市场行情      |
| **费用** | 高额中介费(20-30%) | 低手续费(2-5%)    |
| **审查** | 平台可随意下架     | 无法审查          |

### 1.3 技术栈（按当前仓库现实 + 统一口径）

- **权威实现口径**：`web3-core` + `market-core` 作为 OpenClaw Gateway 内的插件；状态默认落盘（SQLite/file）；链上锚定与归档为可选能力。
- **双栈口径**：TON+EVM 的支付/回执/对账输出以 `docs/web3/WEB3_DUAL_STACK_STRATEGY.md` 与 `docs/reference/web3-dual-stack-payments-and-settlement.md` 为准。
- **自由市场短板补强**：自由市场的核心短板与补强路线见 `docs/web3/WEB3_DUAL_STACK_STRATEGY.md`（第 10 节）。
- **资源共享契约**：租约/账本/Provider routes 的安全约束以 `docs/reference/web3-resource-market-api.md` 为准。

```
运行时: OpenClaw Gateway（内置 pi agent）+ 插件系统
市场内核: extensions/market-core（Offer/Order/Settlement + Resource/Lease/Ledger + Dispute）
编排入口: extensions/web3-core（web3.* 单入口、审计/归档/锚定、工具脱敏）
链: EVM（默认 Base）+ TON（双栈支付入口）
存储: IPFS/Arweave/Filecoin（可选），本地状态: SQLite/file
监控/UI: Week3-5 规划（metrics + web3-ui）
```

---

## 2. 核心理念（与 OpenClaw 核心思想对齐）

OpenClaw 的核心思想（贯穿自由市场与双栈策略）：

- **用户极简决策**：用户只决定“买/卖什么、预算/规则、可选的支付链”。
- **AI 管家代办复杂执行**：租约签发、一次性 token 代管（不回显）、消费路由、权威记账、争议、结算与可分享对账摘要。
- **最小披露与可审计可仲裁**：链上仅 hash/承诺/汇总/回执；对外输出默认脱敏且可复制粘贴传播。

### 2.1 真正的自由市场需要什么？

#### ✅ 1. 价格自由 (Free Pricing)

**现状**: 基础定价已经支持“Provider 自由定价”（资源发布时定义 price/unit/policy），这使市场具备了最小的价格发现基础。

**短板**: 缺少“可运营的动态定价/市场行情/撮合排序/风险溢价”闭环，导致自由市场的效率与抗作弊能力不足。

**解决方案**: **动态定价机制（增量能力）**

```typescript
interface DynamicPricing {
  basePrice: number; // 基础价格
  surgeMultiplier: {
    // 动态加价
    highDemand: number; // 高需求时(如 1.5x)
    lowLatency: number; // 承诺低延迟(如 1.3x)
    guaranteedSLA: number; // 提供 SLA(如 1.2x)
  };
  discounts: {
    // 折扣策略
    bulkOrder: number; // 大单折扣(如 0.9x)
    loyalCustomer: number; // 老客户折扣(如 0.95x)
  };
}
```

**示例**:

- Provider A: $0.008/1K tokens (高质量服务器)
- Provider B: $0.012/1K tokens (更快响应 + SLA)
- Provider C: $0.005/1K tokens (便宜但不稳定)

Consumer 根据需求选择，市场自动平衡供需。

---

#### ✅ 2. 信息透明 (Information Transparency)

**实时市场数据**:

```typescript
interface MarketData {
  resource: string; // 资源类型(如 "llama-3-70b")
  priceRange: {
    min: number;
    max: number;
    average: number;
    median: number;
  };
  availableProviders: number; // 可用 Provider 数
  avgResponseTime: number; // 平均响应时间
  avgSuccessRate: number; // 平均成功率
  priceHistory24h: PricePoint[]; // 24h 价格历史
  volumeHistory24h: VolumePoint[]; // 24h 交易量
}
```

**Provider 透明度**:

```typescript
interface ProviderProfile {
  // 基本信息
  providerId: string;
  name: string;
  region: string;
  accountAge: number; // 账户年龄(天)

  // 性能指标
  metrics: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    avgResponseTime: number;
    uptimePercent: number;
  };

  // 信誉评分
  reputation: {
    overallScore: number; // 0-100
    tier: ReputationTier; // 等级
    breakdown: {
      reliability: number;
      quality: number;
      performance: number;
      trust: number;
    };
  };

  // 用户评价
  reviews: {
    averageRating: number; // 平均评分(1-5)
    totalReviews: number;
    recentReviews: Review[];
  };

  // 争议记录
  disputes: {
    initiated: number;
    lost: number;
    lostRate: number;
  };
}
```

---

#### ✅ 3. 自由竞争 (Free Competition)

**多维度排序**:

```typescript
enum SortBy {
  REPUTATION = "reputation", // 按信誉排序
  PRICE = "price", // 按价格排序
  RESPONSE_TIME = "response_time", // 按响应时间排序
  SUCCESS_RATE = "success_rate", // 按成功率排序
  BALANCED = "balanced", // 综合排序
}

// 综合评分算法
function calculateBalancedScore(provider: Provider): number {
  const reputationScore = provider.reputation.overallScore;
  const priceScore = (1 - provider.pricing.basePrice / maxPrice) * 100;
  const performanceScore = (benchmarkResponseTime / provider.metrics.avgResponseTime) * 100;

  return reputationScore * 0.4 + priceScore * 0.3 + performanceScore * 0.3;
}
```

**竞争激励**:

| 信誉等级  | 评分范围 | 平台手续费 | 搜索优先级 | 特权               |
| --------- | -------- | ---------- | ---------- | ------------------ |
| 🏆 传奇   | 95-100   | 2.5%       | 最高       | 认证徽章、优先推荐 |
| 💎 卓越   | 85-94    | 3.5%       | 高         | 认证徽章           |
| ⭐ 良好   | 70-84    | 5.0%       | 中         | -                  |
| 👍 一般   | 50-69    | 5.0%       | 低         | -                  |
| ⚠️ 较差   | 30-49    | 7.0%       | 最低       | 警告标识           |
| 🚫 不可信 | 0-29     | 10.0%      | 隐藏       | 限制服务           |

---

#### ✅ 4. 低门槛 (Low Barrier)

**Provider 上架流程** (当前实现口径):

当前仓库实现中，Provider 通过在运行 Gateway 的机器上启用 `web3-core`/`market-core` 插件，并由 `web3-core` 暴露 Provider HTTP routes（模型/搜索/存储）对外提供服务；并不依赖单独的 `openclaw-provider` CLI。

Repo dev 示例（仅示意）：

```bash
openclaw plugins install ./extensions/web3-core
openclaw plugins install ./extensions/market-core

cd ./extensions/web3-core && pnpm install
cd ./extensions/market-core && pnpm install

# 然后：在 plugins.entries.*.config 中完成配置，并重启 Gateway
```

**Consumer 使用流程** (当前实现口径):

当前实现中，Consumer 通常通过 Agent tools 使用已租用的资源（例如 `web3.search.query`、`web3.storage.*`），或通过 Provider routes 调用（一次性 `accessToken` 由管家代管，不回显）。

详见：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)（Consumer tools + Provider routes + 脱敏规则）。

---

#### ✅ 5. 去中心化 (Decentralization)

**链上数据** (不可篡改):

```solidity
contract OpenClawMarket {
  // Provider 注册
  mapping(address => Provider) public providers;

  // 订单记录
  mapping(bytes32 => Order) public orders;

  // 信誉评分(简化版)
  mapping(address => uint8) public reputationScores;

  // 争议仲裁
  mapping(bytes32 => Dispute) public disputes;

  // 事件日志
  event ProviderRegistered(address indexed provider, string resourceId);
  event OrderCreated(bytes32 indexed orderId, address consumer, address provider);
  event OrderCompleted(bytes32 indexed orderId, bool success);
  event DisputeInitiated(bytes32 indexed disputeId, bytes32 orderId);
}
```

**链下数据** (性能优化):

- Provider 详细信息(IPFS)
- 用户评价(PostgreSQL + IPFS hash)
- 市场行情(Redis cache)
- 性能指标(时序数据库)

---

## 3. 系统架构

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Provider        │  │ Consumer        │  │ Market          │ │
│  │ Dashboard       │  │ Search Page     │  │ Dashboard       │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└──────────────┬──────────────────────────────────────────────────┘
               │ HTTP / WebSocket
┌──────────────▼──────────────────────────────────────────────────┐
│                      API Gateway (Node.js)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Auth         │  │ Rate Limit   │  │ Load Balance │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└──────────────┬──────────────────────────────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────────────────────────────────────────┐
│ Blockchain  │  │         Backend Services                         │
│ (Ethereum)  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│             │  │  │ Market   │  │ Reputa-  │  │ Payment  │      │
│ Smart       │  │  │ Service  │  │ tion     │  │ Service  │      │
│ Contracts   │  │  │          │  │ Service  │  │          │      │
│             │  │  └──────────┘  └──────────┘  └──────────┘      │
└─────────────┘  │                                                  │
                 │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
                 │  │ Order    │  │ Dispute  │  │ Analytics│      │
                 │  │ Matching │  │ Service  │  │ Service  │      │
                 │  └──────────┘  └──────────┘  └──────────┘      │
                 └────────┬────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐  ┌──────▼──────┐  ┌────▼────┐
    │PostgreSQL │  │   Redis     │  │  IPFS   │
    │(Orders,   │  │  (Cache,    │  │(Metadata│
    │ Profiles) │  │   Queue)    │  │ Storage)│
    └───────────┘  └─────────────┘  └─────────┘
```

### 3.2 核心组件

#### 3.2.1 Market Service (市场服务)

**职责**:

- Provider 搜索和筛选
- 实时市场数据聚合
- 价格趋势分析
- 订单撮合

**关键接口**:

```typescript
class MarketService {
  // 搜索 Provider
  async searchProviders(params: SearchParams): Promise<Provider[]> {
    const { model, maxPrice, minScore, sortBy } = params;

    // 1. 从数据库查询符合条件的 Provider
    let providers = await this.db.providers.findMany({
      where: {
        "resources.model": model,
        "pricing.basePrice": { lte: maxPrice },
        "reputation.overallScore": { gte: minScore },
      },
    });

    // 2. 应用排序
    providers = this.sortProviders(providers, sortBy);

    // 3. 返回结果
    return providers;
  }

  // 获取市场行情
  async getMarketData(resource: string): Promise<MarketData> {
    // 从缓存或数据库获取
    const cached = await this.redis.get(`market:${resource}`);
    if (cached) return JSON.parse(cached);

    // 计算市场数据
    const data = await this.calculateMarketData(resource);

    // 缓存 5 分钟
    await this.redis.setex(`market:${resource}`, 300, JSON.stringify(data));

    return data;
  }

  // 订单撮合
  async matchOrder(bid: ConsumerBid): Promise<Provider | null> {
    // 1. 获取符合要求的 Provider
    const asks = await this.getAvailableAsks(bid.resource);

    // 2. 价格匹配
    const matchedAsk = asks.find(
      (ask) => ask.price <= bid.maxPrice && ask.reputation >= bid.minReputation,
    );

    if (!matchedAsk) return null;

    // 3. 创建订单
    await this.createOrder(bid.consumerId, matchedAsk.providerId, matchedAsk.price);

    return matchedAsk.provider;
  }
}
```

---

#### 3.2.2 Reputation Service (信誉服务)

详见 [第 5 章: 信誉评分系统](#5-信誉评分系统)

---

#### 3.2.3 Payment Service (支付服务)

**支付流程**:

```typescript
class PaymentService {
  async processPayment(order: Order): Promise<PaymentResult> {
    // 1. Consumer 预授权
    const escrow = await this.lockFunds(order.consumerId, order.estimatedCost);

    // 2. Provider 执行任务
    const result = await this.provider.executeTask(order.taskParams);

    // 3. 计算实际费用
    const actualCost = this.calculateCost(result.tokensUsed, order.pricing);

    // 4. 释放资金
    if (result.success) {
      // 成功: 支付给 Provider
      await this.transferFunds(escrow, order.providerId, actualCost);

      // 退还多余资金
      if (actualCost < order.estimatedCost) {
        await this.refund(escrow, order.consumerId, order.estimatedCost - actualCost);
      }
    } else {
      // 失败: 全额退款
      await this.refund(escrow, order.consumerId, order.estimatedCost);
    }

    return { success: result.success, actualCost };
  }
}
```

---

## 4. 核心功能

### 4.1 动态定价

#### 4.1.1 定价策略配置

Provider 可配置多种定价策略:

```typescript
interface PricingStrategy {
  type: "fixed" | "dynamic" | "auction";

  // 固定定价
  fixedPrice?: {
    inputPerToken: number;
    outputPerToken: number;
  };

  // 动态定价
  dynamicPrice?: {
    basePrice: number;
    rules: PricingRule[];
  };

  // 拍卖模式
  auctionPrice?: {
    minPrice: number;
    bidIncrement: number;
    auctionDuration: number;
  };
}

interface PricingRule {
  condition: {
    type: "load" | "time" | "customer_tier" | "order_size";
    operator: ">" | "<" | "==" | "between";
    value: number | [number, number];
  };
  adjustment: {
    type: "multiply" | "add";
    value: number;
  };
}
```

**示例配置**:

```json
{
  "type": "dynamic",
  "dynamicPrice": {
    "basePrice": 0.008,
    "rules": [
      {
        "condition": { "type": "load", "operator": ">", "value": 0.8 },
        "adjustment": { "type": "multiply", "value": 1.5 }
      },
      {
        "condition": { "type": "load", "operator": "<", "value": 0.3 },
        "adjustment": { "type": "multiply", "value": 0.8 }
      },
      {
        "condition": { "type": "customer_tier", "operator": "==", "value": "vip" },
        "adjustment": { "type": "multiply", "value": 0.9 }
      },
      {
        "condition": { "type": "order_size", "operator": ">", "value": 100000 },
        "adjustment": { "type": "multiply", "value": 0.85 }
      }
    ]
  }
}
```

#### 4.1.2 实时价格计算

```typescript
class PricingEngine {
  calculatePrice(strategy: PricingStrategy, context: PricingContext): number {
    if (strategy.type === "fixed") {
      return strategy.fixedPrice.inputPerToken;
    }

    let price = strategy.dynamicPrice.basePrice;

    // 应用所有匹配的规则
    for (const rule of strategy.dynamicPrice.rules) {
      if (this.matchesCondition(rule.condition, context)) {
        price = this.applyAdjustment(price, rule.adjustment);
      }
    }

    return price;
  }

  private matchesCondition(condition: Condition, context: PricingContext): boolean {
    const value = context[condition.type];

    switch (condition.operator) {
      case ">":
        return value > condition.value;
      case "<":
        return value < condition.value;
      case "==":
        return value === condition.value;
      case "between":
        return value >= condition.value[0] && value <= condition.value[1];
    }
  }

  private applyAdjustment(price: number, adjustment: Adjustment): number {
    switch (adjustment.type) {
      case "multiply":
        return price * adjustment.value;
      case "add":
        return price + adjustment.value;
    }
  }
}
```

---

### 4.2 订单簿 (Order Book)

#### 4.2.1 订单簿数据结构

```typescript
interface OrderBook {
  resource: string;

  // 卖单 (Provider 报价)
  asks: Ask[];

  // 买单 (Consumer 需求)
  bids: Bid[];

  // 最后更新时间
  lastUpdated: number;
}

interface Ask {
  providerId: string;
  price: number;
  quantity: number; // 可用计算时长(小时)
  minOrderSize: number; // 最小订单(tokens)
  expiry: number; // 报价过期时间
  reputation: number; // 信誉评分
}

interface Bid {
  consumerId: string;
  maxPrice: number;
  quantity: number; // 需求计算时长(小时)
  requirements: {
    minScore: number;
    maxLatency: number;
    region?: string;
  };
  expiry: number;
}
```

#### 4.2.2 撮合引擎

```typescript
class MatchingEngine {
  async matchOrders(orderBook: OrderBook): Promise<Match[]> {
    const matches: Match[] = [];

    // 按价格排序
    const sortedAsks = orderBook.asks.sort((a, b) => a.price - b.price);
    const sortedBids = orderBook.bids.sort((a, b) => b.maxPrice - a.maxPrice);

    // 撮合交易
    for (const bid of sortedBids) {
      for (const ask of sortedAsks) {
        // 价格匹配
        if (ask.price > bid.maxPrice) continue;

        // 要求匹配
        if (!this.meetsRequirements(ask, bid.requirements)) continue;

        // 创建匹配
        const matchedQuantity = Math.min(ask.quantity, bid.quantity);

        matches.push({
          askId: ask.id,
          bidId: bid.id,
          price: ask.price,
          quantity: matchedQuantity,
        });

        // 更新订单簿
        ask.quantity -= matchedQuantity;
        bid.quantity -= matchedQuantity;

        if (bid.quantity === 0) break;
      }
    }

    return matches;
  }

  private meetsRequirements(ask: Ask, requirements: Requirements): boolean {
    if (ask.reputation < requirements.minScore) return false;
    if (ask.avgLatency > requirements.maxLatency) return false;
    if (requirements.region && ask.region !== requirements.region) return false;

    return true;
  }
}
```

---

### 4.3 争议仲裁

#### 4.3.1 争议类型

```typescript
enum DisputeType {
  SERVICE_NOT_PROVIDED = "service_not_provided", // 服务未提供
  POOR_QUALITY = "poor_quality", // 质量不达标
  OVERCHARGE = "overcharge", // 收费过高
  DELAYED_RESPONSE = "delayed_response", // 响应延迟
  DATA_BREACH = "data_breach", // 数据泄露
}
```

#### 4.3.2 争议处理流程

```typescript
class DisputeService {
  async initiateDispute(params: InitiateDisputeParams): Promise<Dispute> {
    // 1. 验证争议合法性
    const order = await this.getOrder(params.orderId);
    if (!this.canInitiateDispute(order, params.initiator)) {
      throw new Error("Cannot initiate dispute");
    }

    // 2. 创建争议
    const dispute = await this.db.disputes.create({
      orderId: params.orderId,
      initiator: params.initiator,
      type: params.type,
      description: params.description,
      evidence: params.evidence,
      status: "pending",
      createdAt: Date.now(),
    });

    // 3. 锁定相关资金
    await this.paymentService.lockDisputeFunds(order);

    // 4. 通知双方
    await this.notifyParties(dispute);

    return dispute;
  }

  async resolveDispute(disputeId: string, resolution: Resolution): Promise<void> {
    const dispute = await this.db.disputes.findOne({ id: disputeId });

    // 1. 更新争议状态
    dispute.status = "resolved";
    dispute.resolution = resolution;
    dispute.resolvedAt = Date.now();

    await this.db.disputes.update(dispute);

    // 2. 执行裁决
    if (resolution.winner === dispute.initiator) {
      // Initiator 胜诉
      await this.paymentService.refund(dispute.orderId);
      await this.reputationService.penalizeProvider(dispute.providerId);
    } else {
      // Provider 胜诉
      await this.paymentService.releasePayment(dispute.orderId);
      await this.reputationService.penalizeConsumer(dispute.consumerId);
    }

    // 3. 通知双方
    await this.notifyParties(dispute);
  }
}
```

---

## 5. 信誉评分系统

详见独立文档: [reputation-scoring-algorithm](/reference/reputation-scoring-algorithm)

**核心要点**:

1. **多维度评分**: 可靠性(35%) + 质量(30%) + 性能(20%) + 信任度(15%)
2. **时间衰减**: 70% 权重给近期表现，30% 给历史
3. **防刷分机制**: Sybil Attack 检测、Wash Trading 检测
4. **冷启动保护**: 新 Provider 获得初始加分
5. **评分等级**: 传奇(95-100)、卓越(85-94)、良好(70-84)、一般(50-69)、较差(30-49)、不可信(0-29)

---

## 6. 市场仪表盘 UI

详见演示文稿: [OpenClaw_Market_Dashboard_Prototype.pptx](./OpenClaw_Market_Dashboard_Prototype.pptx)

### 6.1 核心界面

#### 6.1.1 Provider 市场搜索页 (Consumer 视角)

**功能**:

- 搜索和筛选 Provider
- 多维度排序(价格、评分、响应时间)
- 实时可用性显示
- 一键选择服务

**关键元素**:

```
┌────────────────────────────────────────────────────────────┐
│  🔍 搜索模型: llama-3-70b  |  最高价格: $0.01  |  排序: 综合 ▼ │
├────────────────────────────────────────────────────────────┤
│  找到 23 个 Provider                                        │
├────────────────────────────────────────────────────────────┤
│  🥇 prov_fast        $0.009  |  0.8s  |  99.5%  |  95 💎   [选择]│
│  🥈 prov_cheap       $0.006  |  2.1s  |  97.2%  |  88 ⭐  [选择]│
│  🥉 prov_stable      $0.010  |  1.2s  |  98.9%  |  92 💎   [选择]│
└────────────────────────────────────────────────────────────┘
```

---

#### 6.1.2 Provider 详情页

**功能**:

- 详细性能指标
- 用户评价历史
- 定价策略说明
- 服务历史记录

**关键元素**:

```
┌───────────────────────────────────────────────────────────┐
│  prov_fast                               💎 卓越 (评分 95) │
│  📍 美国西部  |  🔒 质押 10 ETH  |  📅 运营 6 个月        │
├───────────────────────────────────────────────────────────┤
│  性能指标:                                                 │
│  响应时间: 0.8s (↓15%)  |  成功率: 99.5% (↑2%)           │
│  在线率: 99.8% (稳定)                                      │
├───────────────────────────────────────────────────────────┤
│  定价: $0.008 基础价  |  高峰+50%  |  闲时-20%  |  VIP-10% │
├───────────────────────────────────────────────────────────┤
│  用户评价 (48 条):  ⭐⭐⭐⭐⭐ 4.8 / 5.0                   │
└───────────────────────────────────────────────────────────┘
```

---

#### 6.1.3 市场行情仪表盘

**功能**:

- 实时价格监控
- 价格分布图
- 24h 趋势图
- 供需统计

**关键元素**:

```
┌───────────────────────────────────────────────────────────┐
│  Llama-3-70B 市场行情                                      │
├───────────────────────────────────────────────────────────┤
│  当前平均价格: $0.0089 (↑12%)  |  可用 Provider: 47 个    │
│  价格范围: $0.005 - $0.015     |  平均响应: 1.2s (↓0.2s) │
├───────────────────────────────────────────────────────────┤
│  价格分布:        │  24h 趋势:                             │
│  ████ $0.005-0.007│  ╱╲                                    │
│  ████████ $0.007-0.010│  ╱  ╲╱╲                            │
│  ███ $0.010-0.015 │      ╱    ╲                            │
└───────────────────────────────────────────────────────────┘
```

---

#### 6.1.4 Provider 管理后台

**功能**:

- 收入统计
- 性能监控
- 订单管理
- 定价策略配置

**关键元素**:

```
┌───────────────────────────────────────────────────────────┐
│  💰 今日收入: $234.50  |  📈 本月: $6,890  |  🏆 总计: $48K│
│  💎 信誉评分: 95                                           │
├───────────────────────────────────────────────────────────┤
│  最近订单:                                                 │
│  order_abc  |  0xABC...789  |  $12.50  |  ✅ 完成         │
│  order_def  |  0xDEF...012  |  $8.20   |  ⏳ 进行中       │
├───────────────────────────────────────────────────────────┤
│  性能趋势 (7天):                                           │
│  成功率: ▁▂▃▄▅▆▇ 99.5%                                    │
└───────────────────────────────────────────────────────────┘
```

---

## 7. API 接口文档

### 7.1 Provider 相关 API

#### 7.1.1 搜索 Provider

```http
GET /api/v1/providers/search
```

**请求参数**:

| 参数     | 类型   | 必需 | 说明                                              |
| -------- | ------ | ---- | ------------------------------------------------- |
| model    | string | 是   | 模型名称(如 "llama-3-70b")                        |
| maxPrice | number | 否   | 最高价格                                          |
| minScore | number | 否   | 最低信誉评分                                      |
| sortBy   | string | 否   | 排序方式(reputation/price/response_time/balanced) |
| page     | number | 否   | 页码(默认 1)                                      |
| pageSize | number | 否   | 每页数量(默认 20)                                 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "providerId": "prov_fast",
        "name": "FastAI Provider",
        "region": "us-west",
        "pricing": {
          "basePrice": 0.009,
          "currentPrice": 0.009
        },
        "metrics": {
          "avgResponseTime": 800,
          "successRate": 0.995,
          "uptimePercent": 99.8
        },
        "reputation": {
          "overallScore": 95,
          "tier": "excellent"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 23
    }
  }
}
```

---

#### 7.1.2 获取 Provider 详情

```http
GET /api/v1/providers/:providerId
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "providerId": "prov_fast",
    "name": "FastAI Provider",
    "description": "High-performance LLM inference provider",
    "region": "us-west",
    "accountAge": 180,
    "stakeAmount": 10,

    "resources": [
      {
        "resourceId": "res_llama70b",
        "model": "llama-3-70b",
        "hardware": {
          "gpu": "NVIDIA RTX 4090",
          "vram": 24,
          "cpu": "16 cores",
          "ram": 64
        }
      }
    ],

    "pricing": {
      "type": "dynamic",
      "basePrice": 0.008,
      "rules": [...]
    },

    "metrics": {
      "totalJobs": 200,
      "completedJobs": 199,
      "failedJobs": 1,
      "avgResponseTime": 800,
      "uptimePercent": 99.8
    },

    "reputation": {
      "overallScore": 95,
      "breakdown": {
        "reliability": 98,
        "quality": 92,
        "performance": 96,
        "trust": 94
      }
    },

    "reviews": {
      "averageRating": 4.8,
      "totalReviews": 48,
      "recentReviews": [
        {
          "consumerId": "0xABC...789",
          "rating": 5,
          "comment": "Excellent service!",
          "timestamp": 1708492800000
        }
      ]
    }
  }
}
```

---

### 7.2 订单相关 API

#### 7.2.1 创建订单

```http
POST /api/v1/orders
```

**请求体**:

```json
{
  "providerId": "prov_fast",
  "resourceId": "res_llama70b",
  "taskParams": {
    "prompt": "Explain quantum computing",
    "maxTokens": 1000
  },
  "budget": 0.5
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "orderId": "order_abc123",
    "status": "pending",
    "estimatedCost": 0.12,
    "estimatedTime": 800
  }
}
```

---

#### 7.2.2 查询订单状态

```http
GET /api/v1/orders/:orderId
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "orderId": "order_abc123",
    "status": "completed",
    "consumerId": "0xCONSUMER",
    "providerId": "prov_fast",
    "createdAt": 1708492800000,
    "completedAt": 1708492801200,
    "result": {
      "output": "Quantum computing is...",
      "tokensUsed": 13441
    },
    "payment": {
      "estimatedCost": 0.15,
      "actualCost": 0.12,
      "refunded": 0.03
    }
  }
}
```

---

### 7.3 市场数据 API

#### 7.3.1 获取市场行情

```http
GET /api/v1/market/:resource
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "resource": "llama-3-70b",
    "priceRange": {
      "min": 0.005,
      "max": 0.015,
      "average": 0.0089,
      "median": 0.009
    },
    "availableProviders": 47,
    "avgResponseTime": 1200,
    "avgSuccessRate": 0.983,
    "priceHistory24h": [
      { "timestamp": 1708406400000, "price": 0.0079 },
      { "timestamp": 1708428000000, "price": 0.0082 },
      { "timestamp": 1708449600000, "price": 0.0089 }
    ],
    "priceDistribution": [
      { "range": "$0.005-0.007", "count": 15 },
      { "range": "$0.007-0.010", "count": 23 },
      { "range": "$0.010-0.015", "count": 9 }
    ]
  }
}
```

---

## 8. 智能合约设计

### 8.1 核心合约

#### 8.1.1 ProviderRegistry (Provider 注册合约)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ProviderRegistry {
    struct Provider {
        address wallet;
        string metadataURI;      // IPFS hash
        uint256 stakeAmount;
        uint8 reputationScore;
        bool active;
        uint256 registeredAt;
    }

    mapping(address => Provider) public providers;

    event ProviderRegistered(address indexed provider, string metadataURI);
    event ProviderStaked(address indexed provider, uint256 amount);
    event ProviderDeactivated(address indexed provider);

    uint256 public constant MIN_STAKE = 1 ether;

    function registerProvider(string calldata metadataURI) external payable {
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(!providers[msg.sender].active, "Already registered");

        providers[msg.sender] = Provider({
            wallet: msg.sender,
            metadataURI: metadataURI,
            stakeAmount: msg.value,
            reputationScore: 50,
            active: true,
            registeredAt: block.timestamp
        });

        emit ProviderRegistered(msg.sender, metadataURI);
    }

    function addStake() external payable {
        require(providers[msg.sender].active, "Not registered");
        providers[msg.sender].stakeAmount += msg.value;
        emit ProviderStaked(msg.sender, msg.value);
    }

    function withdrawStake(uint256 amount) external {
        Provider storage provider = providers[msg.sender];
        require(provider.active, "Not registered");
        require(provider.stakeAmount - amount >= MIN_STAKE, "Below minimum stake");

        provider.stakeAmount -= amount;
        payable(msg.sender).transfer(amount);
    }

    function updateReputation(address provider, uint8 newScore) external onlyOracle {
        require(providers[provider].active, "Provider not active");
        providers[provider].reputationScore = newScore;
    }
}
```

---

#### 8.1.2 OrderEscrow (订单托管合约)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract OrderEscrow {
    enum OrderStatus { Pending, Completed, Failed, Disputed }

    struct Order {
        bytes32 orderId;
        address consumer;
        address provider;
        uint256 amount;
        OrderStatus status;
        uint256 createdAt;
        uint256 completedAt;
    }

    mapping(bytes32 => Order) public orders;

    event OrderCreated(bytes32 indexed orderId, address consumer, address provider, uint256 amount);
    event OrderCompleted(bytes32 indexed orderId, uint256 actualAmount);
    event OrderFailed(bytes32 indexed orderId);
    event OrderDisputed(bytes32 indexed orderId);

    function createOrder(
        bytes32 orderId,
        address provider
    ) external payable {
        require(orders[orderId].consumer == address(0), "Order exists");

        orders[orderId] = Order({
            orderId: orderId,
            consumer: msg.sender,
            provider: provider,
            amount: msg.value,
            status: OrderStatus.Pending,
            createdAt: block.timestamp,
            completedAt: 0
        });

        emit OrderCreated(orderId, msg.sender, provider, msg.value);
    }

    function completeOrder(
        bytes32 orderId,
        uint256 actualAmount
    ) external onlyOracle {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Pending, "Invalid status");
        require(actualAmount <= order.amount, "Amount exceeds escrowed");

        order.status = OrderStatus.Completed;
        order.completedAt = block.timestamp;

        // 支付 Provider
        payable(order.provider).transfer(actualAmount);

        // 退还多余资金
        if (actualAmount < order.amount) {
            payable(order.consumer).transfer(order.amount - actualAmount);
        }

        emit OrderCompleted(orderId, actualAmount);
    }

    function failOrder(bytes32 orderId) external onlyOracle {
        Order storage order = orders[orderId];
        require(order.status == OrderStatus.Pending, "Invalid status");

        order.status = OrderStatus.Failed;

        // 全额退款
        payable(order.consumer).transfer(order.amount);

        emit OrderFailed(orderId);
    }

    function disputeOrder(bytes32 orderId) external {
        Order storage order = orders[orderId];
        require(msg.sender == order.consumer || msg.sender == order.provider, "Unauthorized");
        require(order.status == OrderStatus.Pending, "Invalid status");

        order.status = OrderStatus.Disputed;

        emit OrderDisputed(orderId);
    }
}
```

---

## 9. 安全与防作弊机制

### 9.1 防 Sybil Attack (女巫攻击)

**问题**: Provider 创建多个假 Consumer 账户刷好评。

**防御措施**:

1. **验证真实交易**

   ```typescript
   // 只有链上可验证的交易才计入评分
   interface VerifiedRating {
     txHash: string; // 交易哈希
     amount: number; // 交易金额
     verified: boolean; // 是否验证
   }
   ```

2. **IP 地址分析**

   ```typescript
   // 检测同一 IP 的异常评价数
   if (ratingsFromSameIP > 3) {
     flagAsSuspicious();
   }
   ```

3. **时间模式检测**

   ```typescript
   // 检测短时间内的集中评价
   const clusters = findTimeClusters(ratings, 3600000); // 1 小时窗口
   if (clusters.some((c) => c.length > 5)) {
     flagAsSuspicious();
   }
   ```

4. **账户年龄权重**

   ```typescript
   // 新账户的评价权重降低
   const weight = Math.min(accountAge / 30, 1.0); // 30 天达到满权重
   ```

---

### 9.2 防 Wash Trading (对敲交易)

**问题**: Provider 和 Consumer 串通，创建假任务刷评分。

**防御措施**:

1. **循环交易检测**

   ```typescript
   // Provider A → Consumer B → Provider B → Consumer A
   function detectCircularPattern(provider: string, consumers: string[]): boolean {
     // 分析交易图谱，检测循环模式
     const graph = buildTransactionGraph(provider);
     return hasCycle(graph);
   }
   ```

2. **单一客户占比限制**

   ```typescript
   const topConsumer = getMostFrequentConsumer(provider);
   const ratio = topConsumer.count / getTotalJobs(provider);

   if (ratio > 0.5) {
     flagAsSuspicious(); // 单一客户占比超过 50%
   }
   ```

3. **交易金额分析**

   ```typescript
   // 检测异常低金额的频繁交易
   const avgAmount = calculateAverageAmount(provider);
   const suspiciousCount = transactions.filter((tx) => tx.amount < avgAmount * 0.1).length;

   if (suspiciousCount > transactions.length * 0.3) {
     flagAsSuspicious();
   }
   ```

---

### 9.3 防价格操纵

**问题**: Provider 串通控制市场价格。

**防御措施**:

1. **异常价格检测**

   ```typescript
   const marketAverage = getMarketAveragePrice(resource);

   if (price > marketAverage * 2 || price < marketAverage * 0.5) {
     flagAsAnomalous();
   }
   ```

2. **价格历史追踪**

   ```typescript
   // 检测价格突然大幅变动
   const priceChangeRate = (currentPrice - previousPrice) / previousPrice;

   if (Math.abs(priceChangeRate) > 0.5) {
     requireManualReview();
   }
   ```

---

## 10. 部署指南

### 10.1 环境要求

- Node.js >= 18.0
- PostgreSQL >= 14
- Redis >= 6
- IPFS 节点
- Ethereum 节点 (或使用 Infura/Alchemy)

### 10.2 部署步骤

#### 10.2.1 后端服务部署

```bash
# 1. 克隆仓库
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 4. 数据库迁移
npm run db:migrate

# 5. 启动服务
npm run start:prod
```

#### 10.2.2 智能合约部署

```bash
# 1. 编译合约
npm run contracts:compile

# 2. 部署到测试网
npm run contracts:deploy --network sepolia

# 3. 验证合约
npm run contracts:verify --network sepolia
```

#### 10.2.3 前端部署

```bash
# 1. 构建前端
cd ui
npm install
npm run build

# 2. 部署到 CDN (如 Vercel)
vercel deploy
```

---

## 11. 开发路线图

### Phase 0: MVP (2 周) ✅

- [x] 固定定价
- [x] 基础匹配
- [x] 简单支付

### Phase 1: 价格发现 (2 周)

- [ ] Provider 自主定价
- [ ] Consumer 价格筛选
- [ ] 实时价格图表

### Phase 2: 质量评分 (2 周)

- [ ] 自动收集性能指标
- [ ] 用户评价系统
- [ ] 信誉分算法

### Phase 3: 订单簿 (3 周)

- [ ] Asks/Bids 撮合
- [ ] 限价单/市价单
- [ ] 深度图展示

### Phase 4: 激励机制 (2 周)

- [ ] 做市商奖励
- [ ] 推荐返利
- [ ] VIP 会员体系

### Phase 5: 高级功能 (4 周)

- [ ] 争议仲裁系统
- [ ] 高级分析仪表盘
- [ ] API 集成 SDK
- [ ] 移动端 App

---

## 12. 常见问题

### Q1: 如何成为 Provider?

**A**: 只需 3 步:

```bash
# 1. 安装 CLI
npm install -g openclaw-provider

# 2. 注册
openclaw-provider register

# 3. 添加资源
openclaw-provider add-resource
```

详见: [Web3 Market Dev](/reference/web3-market-dev)

---

### Q2: 定价策略如何选择?

**A**: 根据你的目标选择:

- **固定定价**: 稳定可预测，适合新手
- **动态定价**: 收益最大化，需要经验
- **拍卖模式**: 适合稀缺资源

详见: [Dynamic Pricing Implementation Guide](/reference/dynamic-pricing-implementation)

---

### Q3: 如何提升信誉评分?

**A**: 关注 4 个维度:

1. **可靠性**: 保持高成功率和在线率
2. **质量**: 获得用户好评
3. **性能**: 优化响应时间
4. **信任度**: 增加质押、长期运营

详见: [信誉评分算法](/reference/reputation-scoring-algorithm)

---

### Q4: 争议如何处理?

**A**: 3 步流程:

1. Consumer/Provider 发起争议
2. 提交证据(日志、截图)
3. 仲裁员裁决(7 天内)

详见: [Market Core 插件](/plugins/market-core)（`market.dispute.*`）

---

### Q5: 平台手续费是多少?

**A**: 根据信誉等级:

- 🏆 传奇: 2.5%
- 💎 卓越: 3.5%
- ⭐ 良好: 5.0%
- 👍 一般: 5.0%
- ⚠️ 较差: 7.0%

详见: [Web3 Market Dev](/reference/web3-market-dev)（默认结算策略与争议窗口）

---

## 13. 参考资料

### 13.1 相关文档

- [信誉评分算法](/reference/reputation-scoring-algorithm)
- [市场仪表盘原型](./OpenClaw_Market_Dashboard_Prototype.pptx)
- [Web3 Core 插件](/plugins/web3-core)
- [Dual-stack payments reference](/reference/web3-dual-stack-payments-and-settlement)

### 13.2 外部链接

- [OpenClaw 主站](https://openclaw.io)
- [GitHub 仓库](https://github.com/openclaw/openclaw)
- [技术博客](https://blog.openclaw.io)
- [Discord 社区](https://discord.gg/openclaw)

---

## 附录

### A. 术语表

| 术语                 | 说明                                  |
| -------------------- | ------------------------------------- |
| **Provider**         | 算力提供者，提供 AI 推理服务          |
| **Consumer**         | 算力消费者，使用 AI 推理服务          |
| **Reputation Score** | 信誉评分，0-100 分                    |
| **Order Book**       | 订单簿，包含 Asks(卖单) 和 Bids(买单) |
| **Ask**              | 卖单，Provider 的报价                 |
| **Bid**              | 买单，Consumer 的需求                 |
| **Escrow**           | 托管，资金暂时锁定直到任务完成        |
| **Dispute**          | 争议，对订单结果有异议                |
| **Stake**            | 质押，Provider 锁定资金作为信用保证   |

---

**版本历史**:

- v2.0 (2026-02-20): 增加自由市场设计
- v1.0 (2026-02-15): 初始版本

**维护者**: OpenClaw Team ([team@openclaw.io](mailto:team@openclaw.io))

**许可证**: MIT
