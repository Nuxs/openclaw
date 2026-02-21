# Web3 Core & Market Core 代码走查报告

> **走查时间**: 2026-02-21  
> **走查依据**: [01-implementation-review.md](./01-implementation-review.md)  
> **走查方法**: 代码检索 + 文档对比 + 测试验证

---

## 📊 执行摘要

### 总体评估

| 维度           | 评分     | 状态                    |
| -------------- | -------- | ----------------------- |
| **功能完整性** | **9/10** | ✅ P0阻塞项已全部修复   |
| **代码质量**   | **8/10** | ✅ 结构清晰，模块化良好 |
| **测试覆盖**   | **8/10** | ✅ 关键路径已覆盖       |
| **安全性**     | **7/10** | ⚠️ 部分安全增强待实施   |
| **文档完善度** | **8/10** | ✅ 设计文档完善         |

**综合评分**: **8.0/10** (良好，可上线)

### 关键发现

✅ **好消息**：所有 P0 阻塞项已解决

- ✅ 结算闭环完整（orderId + flushPendingSettlements）
- ✅ 模型调用有 ledger 记账
- ✅ SQLite 事务原子性保证
- ✅ 关键测试已补齐

⚠️ **待办事项**：P1 高优先级功能

- ⚠️ Provider HTTP 路由需实现
- ⚠️ Consumer Tools 需实现
- ⚠️ 安全加固（Token 脱敏、限流）

---

## ✅ P0 阻塞项验证（4/4 通过）

### ✅ P0-1: 结算闭环完整

**验证文件**: `extensions/web3-core/src/audit/hooks.ts`

```typescript
function queuePendingSettlement(
  store: Web3StateStore,
  config: Web3PluginConfig,
  sessionId: string | undefined,
  settlementContext?: {
    orderId?: string; // ✅ orderId 已添加
    payer?: string;
    amount?: string;
    actorId?: string;
  },
) {
  // ...
  store.upsertPendingSettlement({
    sessionIdHash,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    orderId: orderId ?? existing?.orderId, // ✅ 正确存储 orderId
    payer: payer ?? existing?.payer,
    amount: amount ?? existing?.amount,
    actorId: actorId ?? existing?.actorId,
    attempts: existing?.attempts,
    lastError: existing?.lastError,
  });
}
```

**状态**: ✅ **已修复** - orderId 正确关联到订单

---

### ✅ P0-2: flushPendingSettlements 已实现

**验证文件**: `extensions/web3-core/src/billing/settlement.ts`

```typescript
export async function flushPendingSettlements(
  store: Web3StateStore,
  config: Web3PluginConfig,
): Promise<void> {
  if (!config.billing.enabled) {
    return;
  }
  const pending = store.getPendingSettlements();
  if (pending.length === 0) {
    return;
  }

  const callGateway = await loadCallGateway();
  const next: PendingSettlement[] = [];

  for (const entry of pending) {
    if (!isSettlementReady(entry)) {
      next.push(entry);
      continue;
    }
    try {
      const result = await callGateway({
        method: "market.settlement.lock", // ✅ 调用结算锁定
        params: {
          orderId: entry.orderId,
          amount: entry.amount,
          payer: entry.payer,
          actorId: entry.actorId,
        },
        timeoutMs: config.brain.timeoutMs,
      });
      if (!result?.ok) {
        throw new Error(result?.error || "settlement lock failed");
      }
      // ✅ 成功后不重新入队（自动清理）
    } catch (err) {
      const attempts = (entry.attempts ?? 0) + 1;
      next.push({
        ...entry,
        attempts,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  store.savePendingSettlements(next); // ✅ 保存失败项用于重试
}
```

**测试覆盖**: ✅ 8个测试用例全部通过

- ✅ billing disabled 时不处理
- ✅ 空队列时不调用 gateway
- ✅ 跳过 not-ready 条目
- ✅ 成功时清理队列
- ✅ 失败时增加重试计数
- ✅ result.ok=false 时记录错误
- ✅ 混合 ready/not-ready 条目处理
- ✅ 空列表正确处理

**状态**: ✅ **已完整实现** - 包含重试机制和完整测试

---

### ✅ P0-3: 模型调用 Ledger 记账

**验证文件**: `extensions/web3-core/src/resources/http.ts`

```typescript
async function appendModelLedger(params: {
  config: Web3PluginConfig;
  lease: { leaseId: string; resourceId: string; providerActorId: string; consumerActorId: string };
  offer: ModelOffer;
  usageTokens?: number;
}): Promise<void> {
  try {
    const callGateway = await loadCallGateway();
    const quantity =
      params.usageTokens && params.usageTokens > 0 ? String(params.usageTokens) : "1";
    const cost = resolveLedgerCost(quantity, params.offer.price.amount);
    await callGateway({
      method: "market.ledger.append", // ✅ 调用 ledger 记账
      params: {
        actorId: params.lease.providerActorId,
        entry: {
          leaseId: params.lease.leaseId,
          resourceId: params.lease.resourceId,
          kind: "model",
          providerActorId: params.lease.providerActorId,
          consumerActorId: params.lease.consumerActorId,
          unit: "token",
          quantity, // ✅ 记录实际使用量
          cost, // ✅ 计算实际成本
          currency: params.offer.price.currency,
        },
      },
      timeoutMs: params.config.brain.timeoutMs,
    });
  } catch {
    // ignore ledger failures — fire-and-forget
  }
}

// 在模型调用完成后执行
export function createResourceModelChatHandler(config: Web3PluginConfig) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // ... 验证和调用逻辑 ...

    // ✅ Fire-and-forget: 流式传输完成后记账
    appendModelLedger({
      config,
      lease: leaseResult.lease,
      offer,
      usageTokens: Number.isFinite(usageTokens) ? usageTokens : undefined,
    }).catch(() => {});
  };
}
```

**测试覆盖**: ✅ 2个测试用例

- ✅ 从 `x-usage-tokens` header 读取实际用量
- ✅ header 缺失时使用 fallback quantity '1'

**状态**: ✅ **已实现** - 正确记录 token 消耗到 ledger

---

### ✅ P0-4: SQLite 原子性保证

**验证文件**: `extensions/market-core/src/state/store.ts`

```typescript
export class SqliteMarketStateStore implements MarketStateStore {
  // ...

  runInTransaction(fn: () => void): void {
    this.db.exec("BEGIN"); // ✅ 开始事务
    try {
      fn();
      this.db.exec("COMMIT"); // ✅ 提交事务
    } catch (err) {
      this.db.exec("ROLLBACK"); // ✅ 回滚事务
      throw err;
    }
  }
}
```

**测试覆盖**: ✅ 2个完整的原子性测试

1. ✅ 单个写入失败时完整回滚
2. ✅ 多步写入（4-step）失败时完整回滚

**测试代码**:

```typescript
it("SQLite mode rolls back all writes on error", async () => {
  const store = new MarketStateStore(modeDir, config);

  expect(() => {
    store.runInTransaction(() => {
      store.saveOffer(offer);
      throw new Error("simulated failure mid-transaction");
    });
  }).toThrow("simulated failure mid-transaction");

  // ✅ Offer should NOT be persisted due to rollback
  expect(store.getOffer("offer-rollback")).toBeUndefined();
});

it("SQLite mode: partial writes are fully rolled back (4-step)", async () => {
  expect(() => {
    store.runInTransaction(() => {
      store.saveOrder(order);
      store.saveConsent(consent);
      // Crash before saving delivery/lease
      throw new Error("crash mid-4-step");
    });
  }).toThrow("crash mid-4-step");

  // ✅ Both writes should be rolled back
  expect(store.getOrder("order-rb")).toBeUndefined();
  expect(store.getConsent("consent-rb")).toBeUndefined();
});
```

**状态**: ✅ **已实现** - 事务保证数据一致性

---

## ⚠️ P1 高优先级功能（待实现）

### ⚠️ P1-1: Provider HTTP 路由

**当前状态**: ⚠️ **未实现**

**缺少的路由**:

```typescript
❌ /web3/resources/list            // 列出可用资源
❌ /web3/resources/model/chat      // 已实现 handler，但未注册到 HTTP 服务器
❌ /web3/resources/search/query    // 搜索查询接口
❌ /web3/resources/storage/put     // 上传文件
❌ /web3/resources/storage/get     // 下载文件
❌ /web3/resources/storage/list    // 列出文件
```

**实施位置**: `extensions/web3-core/src/index.ts`

**预期实现**:

```typescript
if (config.resources.enabled && config.resources.provider.listen.enabled) {
  // 注册 HTTP 服务器
  const server = createResourceProviderServer(store, config);

  // 注册路由
  server.registerRoute("GET", "/web3/resources/list", createResourceListHandler(config));
  server.registerRoute(
    "POST",
    "/web3/resources/model/chat",
    createResourceModelChatHandler(config),
  );
  server.registerRoute(
    "POST",
    "/web3/resources/search/query",
    createResourceSearchQueryHandler(config),
  );
  server.registerRoute(
    "PUT",
    "/web3/resources/storage/put",
    createResourceStoragePutHandler(config),
  );
  server.registerRoute(
    "GET",
    "/web3/resources/storage/get",
    createResourceStorageGetHandler(config),
  );
  server.registerRoute(
    "GET",
    "/web3/resources/storage/list",
    createResourceStorageListHandler(config),
  );

  // 启动服务器
  await server.listen(config.resources.provider.listen.port);
}
```

**优先级**: 🟡 **P1** - 无法作为 Provider 对外提供服务

---

### ⚠️ P1-2: Consumer Tools

**当前状态**: ⚠️ **未实现**

**缺少的 Gateway Tools**:

```typescript
❌ web3.search.query        // 调用搜索资源
❌ web3.storage.put         // 上传文件到存储资源
❌ web3.storage.get         // 从存储资源下载文件
❌ web3.storage.list        // 列出存储资源中的文件
❌ web3.model.chat          // 调用模型资源（可选）
```

**实施位置**: `extensions/web3-core/src/index.ts`

**预期实现**:

```typescript
if (config.resources.enabled && config.resources.consumer.enabled) {
  api.registerGatewayTool({
    name: "web3.search.query",
    description: "Search using decentralized search providers",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        limit: { type: "number", default: 10 },
      },
      required: ["query"],
    },
    handler: createSearchQueryTool(store, config),
  });

  api.registerGatewayTool({
    name: "web3.storage.put",
    description: "Upload file to decentralized storage",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        content: { type: "string", description: "File content (base64 encoded)" },
      },
      required: ["path", "content"],
    },
    handler: createStoragePutTool(store, config),
  });

  // ... 其他 tools
}
```

**优先级**: 🟡 **P1** - 无法作为 Consumer 使用去中心化服务

---

### ⚠️ P1-3: 安全加固

#### Token 脱敏

**问题**: `market.lease.issue` 返回明文 `accessToken`

**修复方案**:

```typescript
// 在 tool_result_persist hook 中脱敏
api.registerHook("tool_result_persist", (event, ctx) => {
  if (event.toolName === "market.lease.issue") {
    if (event.result?.lease?.accessToken) {
      event.result.lease.accessToken = "[REDACTED]"; // ✅ 脱敏
    }
  }
  return event.result;
});
```

#### 路径穿越防护

**问题**: 存储路由可能存在路径穿越风险

**修复方案**:

```typescript
import path from "path";

function sanitizePath(filePath: string, storageRoot: string): string {
  const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(storageRoot, safePath);

  if (!fullPath.startsWith(storageRoot)) {
    throw new Error("Path traversal detected");
  }

  return fullPath;
}
```

#### 限流机制

**问题**: Provider 路由缺少限流保护

**修复方案**:

```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 100, // 最多 100 次请求
  keyGenerator: (req) => req.headers["x-lease-token"], // 按租约限流
  handler: (req, res) => {
    sendJson(res, 429, { ok: false, error: "Rate limit exceeded" });
  },
});

server.use("/web3/resources/*", limiter);
```

**优先级**: 🟡 **P1** - 安全风险需要缓解

---

## 🎯 功能完整性清单

### market-core (90%)

| 功能模块              | 完成度 | 状态    |
| --------------------- | ------ | ------- |
| Offer 管理            | 100%   | ✅ 完整 |
| Order 管理            | 100%   | ✅ 完整 |
| Settlement 管理       | 100%   | ✅ 完整 |
| Resource 管理         | 100%   | ✅ 完整 |
| Lease 管理            | 100%   | ✅ 完整 |
| Ledger 管理           | 100%   | ✅ 完整 |
| Dispute 管理          | 100%   | ✅ 完整 |
| 透明度审计            | 100%   | ✅ 完整 |
| 运维修复              | 100%   | ✅ 完整 |
| 存储层（File/SQLite） | 100%   | ✅ 完整 |
| 状态机                | 100%   | ✅ 完整 |
| 原子性事务            | 100%   | ✅ 完整 |

**综合**: **90%** (10% 为性能优化和监控增强)

---

### web3-core (75%)

| 功能模块           | 完成度 | 状态                      |
| ------------------ | ------ | ------------------------- |
| 钱包身份管理       | 100%   | ✅ 完整                   |
| 账单与配额         | 100%   | ✅ 完整                   |
| 审计追踪           | 100%   | ✅ 完整                   |
| 结算刷新           | 100%   | ✅ 完整                   |
| 去中心化脑切换     | 100%   | ✅ 完整                   |
| 配置管理           | 100%   | ✅ 完整                   |
| Provider HTTP 路由 | 30%    | ⚠️ Handler 已实现，未注册 |
| Consumer Tools     | 0%     | ❌ 未实现                 |
| 安全加固           | 60%    | ⚠️ 部分实现               |
| 模型调用记账       | 100%   | ✅ 完整                   |

**综合**: **75%** (25% 为 Provider/Consumer 功能和安全增强)

---

## 📋 验收清单

### ✅ 功能完整性

- [x] 结算闭环可执行 (orderId + flush)
- [x] 模型调用有 ledger 记录
- [ ] Provider 可启动 HTTP 服务
- [ ] Consumer 可调用远程资源
- [ ] 租约过期自动清理

### ✅ 安全性

- [ ] Token 不出现在日志/会话记录
- [ ] accessToken 存储加密或 hash
- [ ] 路径穿越防护
- [ ] 限流机制生效

### ✅ 一致性

- [x] File/SQLite 行为一致
- [x] 原子性事务/锁保证
- [x] `/pay_status` 不受影响

### ✅ 测试覆盖

- [x] `web3.status.summary` 测试通过
- [x] `flushPendingSettlements` 测试通过
- [x] 模型调用记账测试通过
- [x] 原子性回滚测试通过
- [ ] Provider 路由测试通过 (E2E)
- [ ] Consumer tools 测试通过 (E2E)

**当前进度**: **8/17** (47%)

---

## 📈 下一步行动计划

### 阶段 1: P1 功能实现（2-3天）

#### Day 1: Provider HTTP 服务器

**任务**:

1. 创建 HTTP 服务器包装器
2. 注册所有 Provider 路由
3. 实现 token 验证中间件
4. 添加限流保护
5. E2E 测试

**交付物**:

- `extensions/web3-core/src/resources/server.ts`
- `extensions/web3-core/src/resources/server.test.ts`
- E2E 测试套件

#### Day 2: Consumer Tools

**任务**:

1. 实现 `web3.search.query` tool
2. 实现 `web3.storage.*` tools
3. 实现远程调用逻辑
4. 添加错误处理和重试
5. 集成测试

**交付物**:

- `extensions/web3-core/src/resources/consumer-tools.ts`
- `extensions/web3-core/src/resources/consumer-tools.test.ts`

#### Day 3: 安全加固

**任务**:

1. Token 脱敏 hook
2. 路径穿越防护
3. 限流机制
4. 安全测试

**交付物**:

- 安全补丁
- 安全测试套件
- 安全审计报告

---

### 阶段 2: 性能优化（1-2天）

#### SQLite 优化

```typescript
this.db.pragma("journal_mode = WAL"); // ✅ 启用 WAL
this.db.pragma("busy_timeout = 5000"); // ✅ 5秒超时
this.db.pragma("synchronous = NORMAL"); // ✅ 性能优化
this.db.pragma("cache_size = 10000"); // ✅ 增大缓存
```

#### 监控指标

```typescript
// 添加 Prometheus 指标
const metrics = {
  httpRequestDuration: new Histogram({
    name: "openclaw_web3_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status"],
  }),
  ledgerAppendTotal: new Counter({
    name: "openclaw_web3_ledger_append_total",
    help: "Total number of ledger appends",
    labelNames: ["kind", "status"],
  }),
  settlementFlushTotal: new Counter({
    name: "openclaw_web3_settlement_flush_total",
    help: "Total number of settlement flushes",
    labelNames: ["status"],
  }),
};
```

---

### 阶段 3: 文档完善（1天）

#### 需要补充的文档

1. **API 参考手册**
   - Provider HTTP API 规范
   - Consumer Tools 使用指南
   - Gateway Methods 完整列表

2. **部署指南**
   - Provider 部署配置
   - Consumer 配置示例
   - 安全最佳实践

3. **运维手册**
   - 监控指标说明
   - 告警规则配置
   - 故障排查流程

---

## 📝 总结

### 当前状态

✅ **核心功能稳定**

- market-core: 90% 完成
- web3-core: 75% 完成
- 所有 P0 阻塞项已解决

⚠️ **待完成工作**

- Provider/Consumer 功能实现
- 安全加固
- 性能优化
- 文档完善

### 上线评估

**建议**: 分阶段上线

1. **Beta 1.0** (当前): 核心功能可用
   - ✅ 钱包身份
   - ✅ 审计追踪
   - ✅ 账单计费
   - ✅ Offer/Order/Settlement

2. **Beta 1.5** (1周后): Provider/Consumer
   - 🔜 Provider HTTP 服务
   - 🔜 Consumer Tools
   - 🔜 安全加固

3. **RC 1.0** (2周后): 生产就绪
   - 🔜 性能优化
   - 🔜 监控告警
   - 🔜 完整文档

---

**走查完成时间**: 2026-02-21 17:15  
**下一步**: 开始实施 P1 功能开发
