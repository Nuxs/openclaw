# AI 管家集成指南

## 设计理念

### 用户体验层次

```
用户 → 自然语言 → AI 管家 → API 调用 → 市场核心
```

- **用户层**：只需看板 + 自然语言指令
- **AI 管家**：理解意图、编排 API、自动化处理
- **API 层**：提供完整功能（47 个方法）

---

## AI 管家核心能力

### 1. 意图识别与 API 映射

#### 场景 1：卖东西

```
用户输入：
"帮我把闲置的 GPU 卖掉，价格 $10/小时"

AI 管家处理流程：
1. 识别意图：发布服务
2. 提取参数：
   - resourceType: "GPU"
   - basePrice: 10
   - unit: "per_hour"
3. 调用 API：
   market.resource.publish({
     name: "GPU 算力",
     resourceType: "compute_gpu",
     basePrice: 10.0,
     unit: "per_hour",
     pricingModel: {
       strategy: "dynamic",
       constraints: { min: 8, max: 15 }
     }
   })
4. 返回用户：
   "✅ 已发布 GPU 服务，当前市场价 $12，建议定价 $11"
```

#### 场景 2：查询状态

```
用户输入：
"库存还剩多少？"

AI 管家处理流程：
1. 识别意图：查询资源状态
2. 调用 API：
   market.resource.list({ status: "available" })
   market.order.list({ status: "active" })
3. 计算剩余：
   总库存 - 已使用 = 剩余
4. 返回用户：
   "GPU-A100 剩余 80 小时可用时间
    有 2 个订单正在运行，预计明天 10:00 结束"
```

#### 场景 3：设置策略

```
用户输入：
"有新订单自动接单，但价格不能低于 $8"

AI 管家处理流程：
1. 识别意图：配置自动化规则
2. 调用 API：
   market.automation.setRule({
     trigger: "new_order",
     action: "auto_accept",
     conditions: {
       minPrice: 8.0
     }
   })
3. 启用智能定价：
   market.pricing.setModel({
     strategy: "dynamic",
     constraints: { min: 8, max: 999 }
   })
4. 返回用户：
   "✅ 已设置：自动接单，最低价格 $8"
```

---

## 常见用户指令 → API 映射表

| 用户指令         | AI 意图  | 调用的 API                    | 参数                    |
| ---------------- | -------- | ----------------------------- | ----------------------- |
| "卖掉我的 GPU"   | 发布资源 | `market.resource.publish`     | resourceType, basePrice |
| "改成 $15"       | 调整价格 | `market.pricing.setModel`     | basePrice: 15           |
| "现在什么价格？" | 查询定价 | `market.query`                | type: "currentPrice"    |
| "今天赚了多少？" | 查询收入 | `market.settlement.query`     | dateRange: "today"      |
| "有人买吗？"     | 查询订单 | `market.order.list`           | status: "active"        |
| "取消所有订单"   | 批量取消 | `market.order.cancel`         | cancelAll: true         |
| "自动接单"       | 设置规则 | `market.automation.setRule`   | action: "auto_accept"   |
| "库存还剩多少？" | 查询库存 | `market.resource.list` + 计算 | -                       |

---

## AI 管家实现示例

### 方式 1：基于 OpenClaw Agent 系统

```typescript
// extensions/market-agent/src/market-assistant.ts
export class MarketAssistant {
  private openclaw: OpenClawRuntime;

  async handleUserMessage(message: string): Promise<string> {
    // 1. 使用 LLM 理解意图
    const intent = await this.parseIntent(message);

    // 2. 根据意图编排 API 调用
    switch (intent.type) {
      case "sell_resource":
        return this.handleSell(intent.params);
      case "query_inventory":
        return this.handleInventoryQuery();
      case "set_automation":
        return this.handleAutomation(intent.params);
      default:
        return "抱歉，我不理解您的指令";
    }
  }

  private async handleSell(params: any) {
    // 调用市场 API
    const result = await this.openclaw.callGatewayMethod("market.resource.publish", {
      name: params.resourceName,
      resourceType: this.inferResourceType(params.resourceName),
      basePrice: params.price,
      pricingModel: {
        strategy: "dynamic",
        constraints: {
          min: params.price * 0.8,
          max: params.price * 1.5,
        },
      },
    });

    // 查询市场行情
    const marketPrice = await this.openclaw.callGatewayMethod("market.query", {
      type: "marketStats",
      resourceType: result.resourceType,
    });

    // 生成友好回复
    return `✅ 已发布 ${params.resourceName} 服务
当前市场价：$${marketPrice.avgPrice}/小时
您的定价：$${params.price}/小时
建议：${this.generatePricingSuggestion(params.price, marketPrice)}`;
  }

  private async handleInventoryQuery() {
    // 查询资源列表
    const resources = await this.openclaw.callGatewayMethod("market.resource.list", {
      status: "available",
    });

    // 查询活跃订单
    const orders = await this.openclaw.callGatewayMethod("market.order.list", { status: "active" });

    // 计算剩余库存
    const inventory = this.calculateInventory(resources, orders);

    return `📦 当前库存：
${inventory.map((i) => `• ${i.name}: 剩余 ${i.remaining} ${i.unit}`).join("\n")}

🔥 活跃订单：${orders.length} 个
${orders.map((o) => `• ${o.resourceName} → @${o.buyerId} ($${o.price}/${o.unit})`).join("\n")}`;
  }
}
```

### 方式 2：基于 LLM Function Calling

```typescript
// extensions/market-agent/src/functions.ts
export const marketFunctions = [
  {
    name: "publish_resource",
    description: "发布资源到市场进行销售",
    parameters: {
      type: "object",
      properties: {
        resourceName: {
          type: "string",
          description: "资源名称，如'我的GPU'、'计算服务'",
        },
        basePrice: {
          type: "number",
          description: "基础价格（美元/小时）",
        },
        autoPrice: {
          type: "boolean",
          description: "是否启用智能定价",
          default: true,
        },
      },
      required: ["resourceName", "basePrice"],
    },
    handler: async (params) => {
      return await openclaw.callGatewayMethod("market.resource.publish", params);
    },
  },

  {
    name: "query_inventory",
    description: "查询当前库存和订单状态",
    parameters: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const resources = await openclaw.callGatewayMethod("market.resource.list", {});
      const orders = await openclaw.callGatewayMethod("market.order.list", { status: "active" });
      return { resources, orders };
    },
  },

  {
    name: "set_auto_accept",
    description: "设置自动接单规则",
    parameters: {
      type: "object",
      properties: {
        minPrice: {
          type: "number",
          description: "最低可接受价格",
        },
        maxConcurrent: {
          type: "number",
          description: "最大并发订单数",
        },
      },
      required: ["minPrice"],
    },
    handler: async (params) => {
      return await openclaw.callGatewayMethod("market.automation.setRule", {
        trigger: "new_order",
        action: "auto_accept",
        conditions: params,
      });
    },
  },
];

// 使用示例
const response = await llm.chat({
  messages: [
    {
      role: "user",
      content: "帮我把 GPU 卖掉，价格 $10/小时，自动接单但不能低于 $8",
    },
  ],
  functions: marketFunctions,
});

// LLM 会自动调用：
// 1. publish_resource({ resourceName: "GPU", basePrice: 10 })
// 2. set_auto_accept({ minPrice: 8 })
```

---

## Web 看板设计

### 简洁的用户界面

```
┌──────────────────────────────────────────────┐
│  OpenClaw 市场                    🔔 通知    │
├──────────────────────────────────────────────┤
│                                              │
│  💬 对话框                                    │
│  ┌────────────────────────────────────────┐ │
│  │ 你: 帮我把 GPU 卖掉，价格 $10/小时      │ │
│  │                                        │ │
│  │ 管家: ✅ 已发布 GPU 服务               │ │
│  │      当前市场价 $12，建议定价 $11      │ │
│  │      已开启智能定价                    │ │
│  │                                        │ │
│  │ [输入指令...]                 [发送]   │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  📊 市场概览                                  │
│  ┌──────────┬──────────┬──────────┬────────┐│
│  │ 在售服务 │ 今日收入 │ 活跃订单 │ 信誉  ││
│  │    3     │ $127.50  │    5     │ 4.8★ ││
│  └──────────┴──────────┴──────────┴────────┘│
│                                              │
│  🔥 实时订单                                  │
│  • GPU-A100 → @buyer123 ($15/h) [进行中]    │
│  • CPU-32核 → @buyer456 ($8/h)  [进行中]    │
│                                              │
│  📦 我的服务                                  │
│  ┌────────────────────────────────────────┐ │
│  │ GPU-A100 算力                          │ │
│  │ 💰 $12.50/h  📈 智能定价开启          │ │
│  │ ⏱ 剩余: 80h  🔥 利用率: 75%          │ │
│  └────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 实现路线图

### Phase 1: AI 管家基础能力（1 周）

- [ ] 实现意图识别（10 个常见指令）
- [ ] 完成 API 映射和编排
- [ ] 基础对话界面

### Phase 2: 自动化规则（2 周）

- [ ] 自动接单/拒单
- [ ] 智能定价自动调整
- [ ] 库存预警和通知

### Phase 3: 高级功能（3 周）

- [ ] 市场分析和建议
- [ ] 收入预测
- [ ] 竞争对手监控

---

## 成功指标

### 用户体验

- ✅ 用户 **0 次** 看到 API 文档
- ✅ 用户 **3 句话** 完成服务发布
- ✅ 管家 **自动处理** 90% 的订单

### 技术指标

- 意图识别准确率 > 95%
- API 调用成功率 > 99.9%
- 平均响应时间 < 500ms

---

## 总结

### 设计哲学

> "The best API is the one users never see."
>
> 最好的 API 是用户永远看不到的 API。

### 关键原则

1. **用户：极简交互**（看板 + 自然语言）
2. **AI 管家：智能编排**（理解意图 + 调用 API）
3. **API 层：完整功能**（细粒度控制 + 容错处理）

### 为什么 47 个 API 不臃肿？

因为它们是 **AI 管家的工具箱**，不是用户的学习负担。

类比：

- **AWS 控制台**：点几下鼠标 ✅
- **AWS API**：几千个方法（用户看不到） ✅
- **OpenClaw 市场**：说几句话 ✅
- **Market Core API**：47 个方法（管家调用） ✅

---

_本文档面向 AI 管家开发者，帮助理解如何将市场 API 封装为用户友好的体验。_
