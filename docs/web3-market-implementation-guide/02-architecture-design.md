# 2. 核心架构设计

> **设计版本**: v2.0  
> **设计原则**: 模块化、渐进式、安全优先

---

## 🏗️ 系统整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         OpenClaw 用户                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │ HTTP/Gateway
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                      OpenClaw Core                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Agent Runner │  │   Gateway    │  │  Plugin SDK  │         │
│  └──────┬───────┘  └──────────────┘  └──────────────┘         │
│         │                                                        │
│         │ resolve_stream_fn hook                                │
│         └──────────────────────────────────┐                    │
└────────────────────────────────────────────┼────────────────────┘
                                             │
          ┌──────────────────────────────────┼──────────────────────────┐
          │                                  │                          │
┌─────────▼──────────┐           ┌──────────▼────────┐   ┌──────────▼────────┐
│   market-core      │           │   web3-core       │   │   其他插件         │
│                    │           │                   │   └────────────────────┘
│ ┌────────────────┐ │           │ ┌───────────────┐ │
│ │Offer/Order     │ │           │ │Brain Switch   │ │
│ │Settlement      │ │           │ │(B-1)          │ │
│ └────────────────┘ │           │ └───────────────┘ │
│ ┌────────────────┐ │           │ ┌───────────────┐ │
│ │Resource/Lease  │ │◄─────────►│ │Provider HTTP  │ │
│ │Ledger          │ │           │ │Consumer Tools │ │
│ └────────────────┘ │           │ │(B-2)          │ │
│ ┌────────────────┐ │           │ └───────────────┘ │
│ │State Store     │ │           │ ┌───────────────┐ │
│ │ ├─File         │ │           │ │Wallet/SIWE    │ │
│ │ └─SQLite       │ │           │ │Audit/Billing  │ │
│ └────────────────┘ │           │ └───────────────┘ │
└────────────────────┘           └───────────────────┘
          │                                  │
          │                                  │
          └──────────────────┬───────────────┘
                             │
                    ┌────────▼────────┐
                    │   区块链层       │
                    │ ┌──────────────┐│
                    │ │Escrow合约    ││
                    │ │ERC-20 Token  ││
                    │ └──────────────┘│
                    └─────────────────┘
```

---

## 📦 模块职责划分

### 2.1 market-core 插件

**职责**: 市场基础设施 (去中心化撮合、资源管理、账本)

#### 核心功能

**Offer/Order/Settlement** (传统市场)

- Offer: 服务/数据/资产的发布
- Order: 用户下单
- Settlement: 链上结算

**Resource/Lease/Ledger** (算力共享 B-2)

- Resource: 算力资源元数据 (model/search/storage)
- Lease: 租约管理 (issue/revoke/expire)
- Ledger: 权威账本 (append-only)

#### 数据模型

```typescript
// Resource (资源)
type MarketResource = {
  id: string;
  kind: "model" | "search" | "storage"; // 资源类型
  status: "resource_draft" | "resource_published" | "resource_unpublished";
  providerActorId: string; // Provider 地址
  label: string; // 显示名称
  metadata: {
    backend: string; // 后端类型 (ollama/searxng/s3/...)
    backendConfig: object; // 后端配置
    policy: {
      // 策略
      maxConcurrent?: number;
      maxTokens?: number;
      maxBytes?: number;
      allowTools?: boolean;
    };
  };
  pricing: {
    unit: "token" | "call" | "query" | "gb_day" | "put" | "get";
    amount: number; // 价格
    currency: string; // USDC / CLAW
  };
  tags: string[]; // 标签 (用于过滤)
  created: string;
  updated: string;
};

// Lease (租约)
type MarketLease = {
  id: string;
  resourceId: string; // 关联资源
  status: "lease_active" | "lease_expired" | "lease_revoked";
  consumerActorId: string; // Consumer 地址
  providerActorId: string; // Provider 地址
  accessToken: string; // 访问令牌 (UUID)
  accessTokenHash: string; // Token Hash (用于验证)
  expiresAt: string; // 过期时间
  policy: {
    maxRequests?: number; // 最大请求数
    rateLimit?: number; // 速率限制 (req/min)
  };
  created: string;
};

// Ledger Entry (账本记录)
type MarketLedgerEntry = {
  leaseId: string; // 关联租约
  kind: "model" | "search" | "storage";
  unit: "token" | "call" | "query" | "byte";
  quantity: number; // 消耗量
  timestamp: string; // 记录时间
  actorId: string; // 记账者 (必须是 Provider)
  metadata?: {
    // 额外信息
    requestId?: string;
    duration?: number;
  };
};
```

#### 关键 API

```typescript
// 资源管理
market.resource.publish(resource)    → { resourceId }
market.resource.unpublish(resourceId)
market.resource.get(resourceId)      → { resource }
market.resource.list(filter)         → { resources[] }

// 租约管理
market.lease.issue(lease)            → { leaseId, accessToken }
market.lease.revoke(leaseId)
market.lease.get(leaseId)            → { lease }
market.lease.list(filter)            → { leases[] }
market.lease.expireSweep()           → { expired: number }

// 账本管理
market.ledger.append(entry)          → { success }
market.ledger.list(filter)           → { entries[] }
market.ledger.summary(leaseId)       → { totalUsage }

// 结算管理
market.settlement.lock(orderId, payer, amount)
market.settlement.release(settlementId)
market.settlement.refund(settlementId)
```

---

### 2.2 web3-core 插件

**职责**: Web3 集成层 (身份、审计、账单、算力市场编排)

#### B-1: 去中心化脑切换

**核心机制**: `resolve_stream_fn` hook

```typescript
// 1. 注册 hook
api.registerHook("resolve_stream_fn", async (event, ctx) => {
  const { provider, modelId } = event;

  // 2. 检查是否启用去中心化脑
  if (!config.brain.enabled) return;

  // 3. 检查模型是否在白名单
  if (!config.brain.allowlist.includes(modelId)) return;

  // 4. 优先使用租约 (如果存在)
  const lease = getConsumerLeaseAccess(modelId);
  if (lease) {
    return {
      streamFn: createLeaseStreamFn(lease), // ✅ 使用租约
    };
  }

  // 5. 回退到配置的 endpoint
  if (config.brain.endpoint) {
    return {
      streamFn: createOpenAICompatStreamFn(config.brain.endpoint),
    };
  }

  // 6. 回退到中心化模型
  return undefined; // ✅ 使用默认 ollama/openai
});
```

**工作流程**:

```
用户输入 "帮我写代码"
  ↓
Agent Runner 准备执行
  ↓
调用 resolve_stream_fn hook
  ↓
web3-core 返回 streamFn
  ├─ 有租约 → 使用 Provider 的模型
  ├─ 无租约但有 endpoint → 使用配置的去中心化模型
  └─ 都没有 → 回退到 ollama/openai
  ↓
执行推理
  ↓
返回结果
```

---

#### B-2: 资源共享编排

**Provider 侧**: 暴露 HTTP 服务

```typescript
// web3-core/src/resources/http.ts

// 1. 资源列表
GET /web3/resources/list
→ 返回本地发布的资源

// 2. 模型推理
POST /web3/resources/model/chat
Headers:
  X-Lease-Token: <accessToken>
Body:
  { messages, model, stream }
Response:
  Stream<{ delta, usage }>

// 后台操作:
// - 验证 token hash
// - 检查租约状态
// - 检查 policy (maxTokens, allowTools)
// - 调用本地模型 (ollama/lmstudio)
// - 记录 usage 到 ledger

// 3. 搜索服务
POST /web3/resources/search/query
Headers:
  X-Lease-Token: <accessToken>
Body:
  { query, engines }
Response:
  { results[] }

// 4. 存储服务
POST /web3/resources/storage/put
PUT  /web3/resources/storage/get
GET  /web3/resources/storage/list
```

**Consumer 侧**: 注册 Gateway Tools

```typescript
// web3-core/src/resources/tools.ts

// 1. 搜索工具
api.registerGatewayTool({
  name: "web3.search.query",
  description: "Search the web using decentralized providers",
  schema: {
    query: { type: "string", required: true },
    engines: { type: "array" },
  },
  handler: async (params) => {
    // 1. 查找可用的 search 资源
    const resources = await gateway.callMethod("market.resource.list", {
      kind: "search",
      status: "resource_published",
    });

    // 2. 获取租约 (或创建新租约)
    const lease = await ensureLease(resources[0].id);

    // 3. 调用 Provider HTTP 接口
    const response = await fetch(`${lease.endpoint}/web3/resources/search/query`, {
      method: "POST",
      headers: {
        "X-Lease-Token": lease.accessToken,
      },
      body: JSON.stringify({ query: params.query }),
    });

    // 4. 返回结果 (脱敏 token)
    return response.json();
  },
});

// 2. 存储工具
api.registerGatewayTool({
  name: "web3.storage.put",
  description: "Upload a file to decentralized storage",
  schema: {
    /* ... */
  },
  handler: async (params) => {
    /* 类似逻辑 */
  },
});
```

---

#### 关键配置

```typescript
// web3-core config
{
  // B-1: 去中心化脑
  brain: {
    enabled: true,
    providerId: "provider-123",
    defaultModel: "llama-3.3-70b",
    allowlist: ["llama-3.3-70b", "gpt-4o"],
    endpoint: "https://brain.example.com",  // 可选
    protocol: "openai-compat",
    fallback: "centralized",  // 回退策略
    timeoutMs: 30000,
  },

  // B-2: 资源共享
  resources: {
    enabled: true,
    advertiseToMarket: true,  // 是否发布到市场

    // Provider 配置
    provider: {
      listen: {
        enabled: true,
        bind: "loopback",  // loopback | lan
        port: 8545,
        publicBaseUrl: "https://my-provider.example.com",
      },
      auth: {
        mode: "token",  // siwe | token
        tokenTtlMs: 3600000,  // 1 hour
        allowedConsumers: ["0xABC..."],  // 白名单
      },
      offers: {
        models: [
          {
            id: "my-llama3",
            label: "Llama 3.3 70B (Local)",
            backend: "ollama",
            backendConfig: { host: "http://localhost:11434" },
            price: { unit: "token", amount: 0.01, currency: "USDC" },
            policy: { maxConcurrent: 2, maxTokens: 4096, allowTools: true },
          },
        ],
        search: [ /* ... */ ],
        storage: [ /* ... */ ],
      },
    },

    // Consumer 配置
    consumer: {
      enabled: true,
      preferLocalFirst: true,  // 优先使用本地资源
    },
  },
}
```

---

## 🔄 数据流设计

### 3.1 算力资源发布流程

```
Provider 启动
  ↓
1. 读取 config.resources.provider.offers
  ↓
2. 遍历每个 offer (model/search/storage)
  ↓
3. 调用 market.resource.publish
  {
    kind: "model",
    label: "Llama 3.3 70B",
    providerActorId: "0x123...",
    metadata: { backend: "ollama", ... },
    pricing: { unit: "token", amount: 0.01 },
  }
  ↓
4. market-core 保存资源
  - 生成 resourceId
  - 状态: resource_published
  - 写入 resources.json / resources 表
  ↓
5. (可选) 发布到 DHT
  - DHT["task-capability-llama3-70b"] += self.peerId
  ↓
6. 启动 HTTP 服务
  - 监听 0.0.0.0:8545
  - 注册路由 /web3/resources/*
  ↓
Provider 就绪，等待 Consumer 请求
```

---

### 3.2 算力资源调用流程 (Consumer → Provider)

```
Consumer 执行任务 "搜索最新新闻"
  ↓
Agent 识别需要搜索工具
  ↓
1. 调用 web3.search.query
  {
    query: "AI 最新进展",
    engines: ["google", "bing"],
  }
  ↓
2. 查找可用资源
  market.resource.list({
    kind: "search",
    status: "resource_published",
  })
  → 返回 [{ id: "search-1", providerActorId: "0x456..." }]
  ↓
3. 检查是否有现成租约
  market.lease.list({
    resourceId: "search-1",
    consumerActorId: currentUser,
    status: "lease_active",
  })
  ├─ 有 → 复用租约
  └─ 无 → 创建新租约
  ↓
4. 创建租约 (如果需要)
  market.lease.issue({
    resourceId: "search-1",
    consumerActorId: "0xABC...",
    providerActorId: "0x456...",
    expiresAt: now + 1 hour,
    policy: { maxRequests: 100 },
  })
  → 返回 { leaseId, accessToken }
  ↓
5. 调用 Provider HTTP 接口
  POST https://provider.example.com/web3/resources/search/query
  Headers:
    X-Lease-Token: <accessToken>
  Body:
    { query: "AI 最新进展", engines: ["google"] }
  ↓
6. Provider 验证请求
  ├─ 验证 token hash
  ├─ 检查租约状态 (active? expired?)
  ├─ 检查 policy (超出 maxRequests?)
  └─ ✅ 通过
  ↓
7. Provider 执行搜索
  - 调用后端 (searxng)
  - 返回结果
  ↓
8. Provider 记账
  market.ledger.append({
    leaseId,
    kind: "search",
    unit: "query",
    quantity: 1,
    actorId: "0x456...",  // Provider 自己
  })
  ↓
9. 返回结果给 Consumer
  {
    results: [ /* ... */ ],
    usage: { queries: 1 },
  }
  ↓
10. Consumer 工具返回结果
  - ⚠️ 脱敏 accessToken (tool_result_persist hook)
  - 显示搜索结果给用户
  ↓
完成
```

---

### 3.3 结算流程 (后台异步)

```
定时任务 (每 5 分钟)
  ↓
1. 读取 pending settlements
  store.listPendingSettlements()
  → [{ orderId, payer, amount }]
  ↓
2. 遍历每个待结算项
  for (const item of pending) {
    ↓
    3. 汇总 ledger 数据
      market.ledger.summary(item.leaseId)
      → { totalTokens: 5000 }
    ↓
    4. 计算应付金额
      const cost = totalTokens * pricePerToken;
    ↓
    5. 检查是否满足结算条件
      if (cost >= MIN_SETTLEMENT_AMOUNT) {
        ↓
        6. 调用 escrow 合约
          await escrowContract.transferFrom(
            payer,
            provider,
            cost,
          );
        ↓
        7. 更新 settlement 状态
          market.settlement.release(settlementId);
        ↓
        8. 移除 pending 队列
          store.removePendingSettlement(orderId);
      }
  }
  ↓
完成
```

---

## 🔐 接口规范

### 4.1 Provider HTTP API

#### GET /web3/resources/list

**请求**:

```http
GET /web3/resources/list HTTP/1.1
Host: provider.example.com:8545
```

**响应**:

```json
{
  "resources": [
    {
      "id": "model-llama3-70b",
      "kind": "model",
      "label": "Llama 3.3 70B (Local)",
      "pricing": {
        "unit": "token",
        "amount": 0.01,
        "currency": "USDC"
      },
      "policy": {
        "maxTokens": 4096,
        "allowTools": true
      }
    }
  ]
}
```

---

#### POST /web3/resources/model/chat

**请求**:

```http
POST /web3/resources/model/chat HTTP/1.1
Host: provider.example.com:8545
X-Lease-Token: abc-123-uuid
Content-Type: application/json

{
  "model": "llama-3.3-70b",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "stream": true,
  "max_tokens": 1000
}
```

**响应** (流式):

```
data: {"delta":{"role":"assistant","content":"Hello"},"usage":null}

data: {"delta":{"content":"! How"},"usage":null}

data: {"delta":{"content":" can I help"},"usage":null}

data: {"delta":{"content":" you?"},"usage":{"prompt_tokens":10,"completion_tokens":8,"total_tokens":18}}

data: [DONE]
```

**错误响应**:

```json
{
  "error": {
    "code": "E_LEASE_EXPIRED",
    "message": "Lease has expired"
  }
}
```

---

### 4.2 Gateway Tools API

#### web3.search.query

**调用**:

```typescript
await gateway.callTool("web3.search.query", {
  query: "AI latest news",
  engines: ["google", "bing"],
});
```

**响应**:

```json
{
  "success": true,
  "result": {
    "results": [
      {
        "title": "AI breakthrough in 2026",
        "url": "https://example.com/news",
        "snippet": "..."
      }
    ],
    "usage": {
      "queries": 1
    },
    "_lease": {
      "resourceId": "search-1",
      "provider": "0x456...",
      "accessToken": "[REDACTED]"
    }
  }
}
```

---

#### web3.storage.put

**调用**:

```typescript
await gateway.callTool("web3.storage.put", {
  path: "/documents/report.pdf",
  content: base64Data,
  contentType: "application/pdf",
});
```

**响应**:

```json
{
  "success": true,
  "result": {
    "cid": "QmXYZ...",
    "size": 102400,
    "usage": {
      "bytes": 102400
    }
  }
}
```

---

## 🔗 模块交互时序图

### 4.3 完整调用链

```
[Consumer]
    │
    │ 1. 调用工具
    │ web3.search.query({ query })
    │
    ▼
[web3-core/tools.ts]
    │
    │ 2. 查找资源
    │ market.resource.list({ kind: "search" })
    │
    ▼
[market-core/handlers/resource.ts]
    │
    │ 3. 返回资源列表
    │
    ◄─────
    │
    │ 4. 获取/创建租约
    │ market.lease.issue({ resourceId })
    │
    ▼
[market-core/handlers/lease.ts]
    │
    │ 5. 返回 { leaseId, accessToken }
    │
    ◄─────
    │
    │ 6. HTTP 调用 Provider
    │ POST /web3/resources/search/query
    │ Headers: { X-Lease-Token }
    │
    ▼
[Provider HTTP Server]
    │
    │ 7. 验证 token
    │ hash(token) === lease.accessTokenHash?
    │
    │ 8. 检查租约状态
    │ lease.status === "lease_active"?
    │
    │ 9. 执行搜索
    │ backend.query(params)
    │
    │ 10. 记账
    │ market.ledger.append({ quantity: 1 })
    │
    │ 11. 返回结果
    │
    ◄─────
    │
    │ 12. 脱敏 token
    │ tool_result_persist hook
    │
    │ 13. 返回给用户
    │
    ▼
[Consumer]
```

---

## 📝 设计决策记录

### 5.1 为什么选择 Token 认证而非 SIWE？

**决策**: Provider 默认使用 `token` 模式，而非 `siwe`

**理由**:

1. SIWE 需要每次请求签名，延迟高 (~100ms)
2. Token 模式足够安全 (Hash 存储 + HTTPS)
3. 简化 Consumer 实现 (不需要钱包插件)

**权衡**: SIWE 更去中心化，但性能差

---

### 5.2 为什么账本由 Provider 记账？

**决策**: `market.ledger.append` 只允许 Provider 调用

**理由**:

1. Provider 知道真实消耗 (Consumer 可能伪造)
2. Provider 是资源提供者，有记账责任
3. 争议时 Provider 需举证

**权衡**: 如果 Provider 作恶故意少记账怎么办？
→ 引入可验证证明 (zk-SNARK) 或 Consumer 审计

---

### 5.3 为什么支持 File + SQLite 双模式？

**决策**: 同时支持 File 和 SQLite 存储

**理由**:

1. File 模式易于调试 (直接编辑 JSON)
2. SQLite 模式高并发性能好
3. 数据迁移机制确保平滑升级

**权衡**: 维护两套实现增加复杂度

---

## 🎯 下一步

阅读下一节文档了解各技术模块的详细实现方案：

- [03-p2p-discovery.md](./03-p2p-discovery.md) - P2P 网络发现
- [04-sandbox-isolation.md](./04-sandbox-isolation.md) - 沙箱隔离
- [05-dispute-arbitration.md](./05-dispute-arbitration.md) - 争议仲裁
- [06-local-model-integration.md](./06-local-model-integration.md) - 本地模型接入

---

**最后更新**: 2026-02-20  
**下一篇**: [03-p2p-discovery.md](./03-p2p-discovery.md)
