# 1. 现有实现评审报告

> **评审时间**: 2026-02-20  
> **评审范围**: market-core + web3-core + 核心 hooks  
> **评审方法**: 代码审查 + 文档对比 + 功能测试

---

## 📊 总体评分

| 维度           | 评分 | 说明                       |
| -------------- | ---- | -------------------------- |
| **功能完整性** | 6/10 | 基础框架完整，关键功能缺失 |
| **代码质量**   | 8/10 | 结构清晰，模块化良好       |
| **测试覆盖**   | 5/10 | 基础测试存在，E2E 缺失     |
| **安全性**     | 6/10 | 有安全意识，实现不够       |
| **文档完善度** | 7/10 | 设计文档完善，实施文档不足 |

**综合评分**: **6.4/10** (及格但需改进)

---

## ✅ 已实现功能盘点

### 1.1 market-core 插件 (80% 完成)

#### ✅ 完整实现

**Offer 管理** (`market.offer.*`)

```typescript
// 已实现 handlers
✅ market.offer.create    // 创建 offer
✅ market.offer.publish   // 发布 offer
✅ market.offer.update    // 更新 offer
✅ market.offer.close     // 关闭 offer
```

**Order 管理** (`market.order.*`)

```typescript
✅ market.order.create    // 创建订单
✅ market.order.cancel    // 取消订单
```

**Settlement 管理** (`market.settlement.*`)

```typescript
✅ market.settlement.lock     // 锁定资金
✅ market.settlement.release  // 释放资金
✅ market.settlement.refund   // 退款
✅ market.settlement.status   // 查询状态
```

**Resource 管理** (`market.resource.*`)

```typescript
✅ market.resource.publish    // 发布资源
✅ market.resource.unpublish  // 下线资源
✅ market.resource.get        // 查询资源
✅ market.resource.list       // 资源列表 (支持过滤)
```

**Lease 管理** (`market.lease.*`)

```typescript
✅ market.lease.issue         // 发放租约
✅ market.lease.revoke        // 撤销租约
✅ market.lease.get           // 查询租约
✅ market.lease.list          // 租约列表
✅ market.lease.expireSweep   // 清理过期租约
```

**Ledger 管理** (`market.ledger.*`)

```typescript
✅ market.ledger.append       // 追加账本记录
✅ market.ledger.list         // 查询账本
✅ market.ledger.summary      // 账本汇总
```

**透明度与审计** (`market.transparency.*`)

```typescript
✅ market.status.summary      // 状态汇总
✅ market.audit.query         // 审计事件查询
✅ market.transparency.summary // 透明度摘要
✅ market.transparency.trace  // 追溯查询
```

**运维修复** (`market.repair.*`)

```typescript
✅ market.repair.retry        // 重试失败操作
✅ market.revocation.retry    // 重试撤销操作
```

#### ✅ 存储层实现

**双模式支持**

```typescript
// File 模式
✅ offers.json
✅ orders.json
✅ settlements.json
✅ consents.json
✅ deliveries.json
✅ resources.json       // ✅ 已添加
✅ leases.json          // ✅ 已添加
✅ ledger.jsonl         // ✅ 已添加 (append-only)
✅ revocations.json

// SQLite 模式
✅ CREATE TABLE offers
✅ CREATE TABLE orders
✅ CREATE TABLE settlements
✅ CREATE TABLE consents
✅ CREATE TABLE deliveries
✅ CREATE TABLE resources      // ✅ 已添加
✅ CREATE TABLE leases         // ✅ 已添加
✅ CREATE TABLE ledger         // ✅ 已添加
✅ CREATE TABLE revocations

// 数据迁移
✅ migrateFromFile()  // 从 File 模式迁移到 SQLite
```

**状态机**

```typescript
✅ assertOfferTransition(from, to)
✅ assertOrderTransition(from, to)
✅ assertSettlementTransition(from, to)
✅ assertDeliveryTransition(from, to)
✅ assertResourceTransition(from, to)    // ✅ 已添加
✅ assertLeaseTransition(from, to)       // ✅ 已添加
```

**校验器**

```typescript
✅ requireString()
✅ requireNumber()
✅ requireAddress()
✅ requireEnum()
✅ requireStringArray()
✅ requireBigNumberishString()
✅ requireLimit()
✅ requireOptionalAddress()
✅ requireOptionalEnum()
```

---

### 1.2 web3-core 插件 (70% 完成)

#### ✅ 完整实现

**钱包身份管理**

```typescript
✅ /bind_wallet      // 绑定 EVM 钱包
✅ /unbind_wallet    // 解绑钱包
✅ /whoami_web3      // 查询身份
✅ web3.siwe.challenge  // SIWE 挑战
✅ web3.siwe.verify     // SIWE 验证
```

**账单与配额**

```typescript
✅ /credits          // 查询配额
✅ /pay_status       // 支付状态
✅ web3.billing.status  // 账单详情
✅ before_tool_call hook (billing guard)
✅ llm_output hook (usage tracking)
```

**审计追踪**

```typescript
✅ /audit_status     // 审计状态
✅ web3.audit.query  // 审计查询
✅ llm_input hook    // 记录输入
✅ llm_output hook   // 记录输出
✅ after_tool_call hook  // 记录工具调用
✅ session_end hook  // 记录会话结束
✅ flushPendingAnchors()  // 刷新待锚定事件
✅ flushPendingArchives() // 刷新待归档事件
```

**去中心化脑切换 (B-1)**

```typescript
✅ resolve_stream_fn hook  // 核心 hook
✅ createWeb3StreamFn()    // StreamFn 工厂
✅ resolveBrainModelOverride()  // 模型选择
✅ setConsumerLeaseAccess()  // 租约注入
✅ clearConsumerLeaseAccess()  // 租约清理
```

**配置管理**

```typescript
✅ BrainConfig
✅ ResourceSharingConfig
✅ ResourceProviderConfig
✅ ResourceConsumerConfig
✅ ResourceModelOffer
✅ ResourceSearchOffer
✅ ResourceStorageOffer
```

---

### 1.3 核心 Hooks (100% 完成)

#### ✅ resolve_stream_fn Hook 实现

```typescript
// src/plugins/types.ts
✅ PluginHookResolveStreamFnEvent
✅ PluginHookResolveStreamFnResult

// src/plugins/hooks.ts
✅ runResolveStreamFn()
✅ mergeResolveStreamFn()

// src/agents/pi-embedded-runner/run/attempt.ts
✅ 在默认 streamFn 分配前调用 hook
✅ 错误隔离 (hook 失败不影响回退)

// 测试覆盖
✅ src/plugins/hooks.resolve-stream-fn.test.ts
   ✅ 高优先级 streamFn 胜出
   ✅ 不覆盖空结果
   ✅ 错误隔离测试
   ✅ 无 hook 返回 undefined
```

**评价**: 这是 B-1 的核心，实现非常完善！✨

---

## ⚠️ 缺失功能清单

### 2.1 market-core 缺失 (20%)

#### ❌ 结算闭环不完整

**问题**: `queuePendingSettlement` 缺少关键字段

```typescript
// 当前实现 (错误)
export function queuePendingSettlement(store: MarketStateStore, payer: string, amount: number) {
  store.savePendingSettlement({
    payer,
    amount,
    queuedAt: nowIso(),
  });
}

// ❌ 缺少 orderId 字段！无法追溯是哪个订单的结算
```

**修复方案**:

```typescript
export function queuePendingSettlement(
  store: MarketStateStore,
  orderId: string, // ✅ 必须添加
  payer: string,
  amount: number,
) {
  store.savePendingSettlement({
    orderId, // ✅ 关联订单
    payer,
    amount,
    queuedAt: nowIso(),
  });
}
```

**影响**: 🔴 **上线阻塞** - 无法追溯结算来源

---

#### ❌ 结算刷新未实现

**问题**: `flushPendingSettlements` 只是占位符

```typescript
// web3-core/src/billing/settlement.ts
export async function flushPendingSettlements(/* ... */) {
  // ❌ TODO: 实现逻辑
}
```

**预期实现**:

```typescript
export async function flushPendingSettlements(
  gateway: GatewayInstance,
  store: Web3StateStore,
  config: Web3PluginConfig,
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const pending = store.listPendingSettlements();
  let succeeded = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      // 1. 调用 market.settlement.lock
      const result = await gateway.callMethod("market.settlement.lock", {
        orderId: item.orderId,
        payer: item.payer,
        amount: item.amount,
      });

      if (result.success) {
        // 2. 移除队列
        store.removePendingSettlement(item.orderId);
        succeeded++;
      } else {
        failed++;
      }
    } catch (err) {
      log.error(`Settlement flush failed for ${item.orderId}: ${err}`);
      failed++;
    }
  }

  return { processed: pending.length, succeeded, failed };
}
```

**影响**: 🔴 **上线阻塞** - 结算无法自动化

---

#### ❌ 模型调用无记账

**问题**: `/web3/resources/model/chat` 未调用 `market.ledger.append`

```typescript
// 当前实现 (伪代码)
async function handleModelChat(req, res) {
  // 1. 验证 token ✅
  // 2. 调用上游模型 ✅
  // 3. 流式返回结果 ✅
  // ❌ 4. 缺少：记录 usage 到 ledger
  // 应该调用：
  // await gateway.callMethod("market.ledger.append", {
  //   leaseId,
  //   kind: "model",
  //   unit: "token",
  //   quantity: usage.totalTokens,
  //   actorId: providerActorId,
  // });
}
```

**影响**: 🔴 **上线阻塞** - 无法追溯资源消耗

---

#### ❌ 原子性缺失

**问题**: SQLite 写入未使用事务

```typescript
// 当前实现 (危险)
export function saveResource(resource: MarketResource): void {
  // ❌ 多个 SQL INSERT 不在事务中
  this.db.run(`INSERT INTO resources ...`, ...);
  this.db.run(`INSERT INTO audit_events ...`, ...);
  // 如果第二个失败，第一个已经写入 → 数据不一致
}
```

**修复方案**:

```typescript
export function saveResource(resource: MarketResource): void {
  this.db.run("BEGIN");
  try {
    this.db.run(`INSERT INTO resources ...`, ...);
    this.db.run(`INSERT INTO audit_events ...`, ...);
    this.db.run("COMMIT");
  } catch (err) {
    this.db.run("ROLLBACK");
    throw err;
  }
}
```

**影响**: 🔴 **上线阻塞** - 数据可能不一致

---

### 2.2 web3-core 缺失 (30%)

#### ❌ Provider HTTP 路由未实现

**问题**: 配置中定义了 Provider 路由，但实际未注册

```typescript
// web3-core/src/config.ts
export type ResourceProviderConfig = {
  listen: {
    enabled: boolean; // ✅ 已定义
    bind: "loopback" | "lan";
    port: number;
    publicBaseUrl?: string;
  };
  // ...
};

// ❌ 但在 web3-core/src/index.ts 中未注册路由:
// - /web3/resources/list
// - /web3/resources/model/chat
// - /web3/resources/search/query
// - /web3/resources/storage/put|get|list
```

**预期实现**:

```typescript
// web3-core/src/index.ts
if (config.resources.enabled && config.resources.provider.listen.enabled) {
  // 注册 Provider HTTP 路由
  registerPluginHttpRoute(api, {
    path: "/web3/resources/list",
    method: "GET",
    handler: createResourceListRoute(store, config),
  });

  registerPluginHttpRoute(api, {
    path: "/web3/resources/model/chat",
    method: "POST",
    handler: createModelChatRoute(store, config),
  });

  // ... 其他路由
}
```

**影响**: 🟡 **高优先级** - 无法作为 Provider 提供服务

---

#### ❌ Consumer Tools 未实现

**问题**: 配置中定义了 Consumer 功能，但未注册 Gateway tools

```typescript
// 应该注册的 tools (但实际未实现):
❌ web3.search.query        // 调用搜索资源
❌ web3.storage.put         // 上传文件
❌ web3.storage.get         // 下载文件
❌ web3.storage.list        // 列出文件
❌ web3.model.chat          // 调用模型 (可选)
```

**预期实现**:

```typescript
// web3-core/src/index.ts
if (config.resources.enabled && config.resources.consumer.enabled) {
  api.registerGatewayTool({
    name: "web3.search.query",
    description: "Search using decentralized providers",
    schema: {
      /* ... */
    },
    handler: createSearchQueryTool(store, config),
  });

  // ... 其他 tools
}
```

**影响**: 🟡 **高优先级** - 无法作为 Consumer 使用服务

---

#### ❌ 租约 Token 泄露风险

**问题**: `market.lease.issue` 返回明文 `accessToken`

```typescript
// market-core/src/market/handlers/lease.ts
export function createLeaseIssueHandler(...) {
  return (opts) => {
    // ...
    const accessToken = randomUUID();  // ✅ 生成 token

    // ❌ 直接返回明文 token
    respond(true, {
      lease: {
        id: leaseId,
        accessToken,  // ❌ 危险！可能被记录到日志
        // ...
      }
    });
  };
}
```

**修复方案**:

```typescript
// 1. 在响应中添加警告标记
respond(true, {
  lease: {
    id: leaseId,
    accessToken,
    _warning: "SENSITIVE: Do not log this token", // ✅ 提醒
  },
});

// 2. 在 tool_result_persist hook 中脱敏
api.registerHook("tool_result_persist", (event, ctx) => {
  if (event.toolName === "market.lease.issue") {
    if (event.result?.lease?.accessToken) {
      event.result.lease.accessToken = "[REDACTED]"; // ✅ 脱敏
    }
  }
  return event.result;
});
```

**影响**: 🟡 **安全风险** - Token 可能泄露到会话记录

---

### 2.3 测试缺失

#### ❌ 关键路径无测试

```typescript
// 缺少的测试:
❌ web3.status.summary 返回值测试
❌ flushPendingSettlements 完整流程测试
❌ 模型调用 ledger 记账测试
❌ SQLite 事务回滚测试
❌ File 模式锁冲突测试
❌ Provider 路由 token 验证测试
❌ Consumer tools 调用流程测试
❌ 租约过期自动清理测试
❌ NAT 穿透成功率测试
❌ 沙箱逃逸防护测试
```

**影响**: 🔴 **上线阻塞** - 质量无法保证

---

## 🐛 发现的问题和风险

### 3.1 安全问题

#### 🔴 P0: Token 明文存储

```typescript
// market-core/src/state/file-store.ts
// leases.json 内容:
{
  "leases": [
    {
      "id": "lease-123",
      "accessToken": "uuid-plain-text",  // ❌ 明文存储
      "resourceId": "model-gpt4",
      // ...
    }
  ]
}
```

**风险**: 如果 `leases.json` 被读取，所有 token 泄露

**修复方案**:

```typescript
// 方案 1: 只存储 hash
const tokenHash = crypto.createHash("sha256").update(accessToken).digest("hex");
lease.accessTokenHash = tokenHash; // 存储 hash
// 验证时: hash(req.token) === stored.accessTokenHash

// 方案 2: 加密存储
const encrypted = encrypt(accessToken, config.encryptionKey);
lease.accessTokenEncrypted = encrypted;
```

---

#### 🟡 P1: 路径穿越风险

```typescript
// 假设的存储路由实现 (未实现，但需防范)
app.get("/web3/resources/storage/get", (req, res) => {
  const filePath = req.query.path; // ❌ 未验证

  // 恶意请求: GET /web3/resources/storage/get?path=../../etc/passwd
  res.sendFile(filePath); // ❌ 可能读取任意文件
});
```

**修复方案**:

```typescript
import path from "path";

const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
if (!safePath.startsWith(config.storageRoot)) {
  throw new Error("Path traversal detected");
}
```

---

#### 🟡 P1: 限流缺失

```typescript
// Provider 路由缺少限流
// 恶意 Consumer 可以发起大量请求 DDoS Provider
```

**修复方案**:

```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 100, // 最多 100 次请求
  keyGenerator: (req) => req.headers["x-lease-token"], // 按租约限流
});

app.use("/web3/resources/*", limiter);
```

---

### 3.2 性能问题

#### 🟡 P1: SQLite 并发写入

```typescript
// SQLite 默认配置不适合高并发
this.db = new Database(dbPath);

// ❌ 未设置 WAL 模式
// ❌ 未设置 busy_timeout
```

**修复方案**:

```typescript
this.db = new Database(dbPath);
this.db.pragma("journal_mode = WAL"); // ✅ 启用 WAL
this.db.pragma("busy_timeout = 5000"); // ✅ 5秒超时
this.db.pragma("synchronous = NORMAL"); // ✅ 性能优化
```

---

#### 🟡 P2: 文件锁性能

```typescript
// File 模式使用文件锁，高并发下性能差
await withFileLock(lockPath, async () => {
  // 写入 resources.json
});

// 并发 10 个请求 → 串行执行 → 延迟高
```

**建议**: 生产环境推荐使用 SQLite 模式

---

### 3.3 兼容性问题

#### 🟢 P3: `/pay_status` 行为变化

```typescript
// 原始行为 (web3-core 未启用时)
/pay_status → { status: "not_configured" }

// web3-core 启用后
/pay_status → { status: "active", credits: 100, ... }

// ✅ 已确认不会破坏现有行为
```

---

## 📐 代码质量评估

### 4.1 优点 ✨

1. **模块化清晰**
   - `market-core` 与 `web3-core` 职责分离
   - Handlers 按领域拆分 (offer/order/settlement/...)
   - 易于维护和测试

2. **类型安全**
   - 完善的 TypeScript 类型定义
   - Gateway 接口类型完整
   - Hook 事件类型清晰

3. **双模式支持**
   - File + SQLite 两种存储
   - 数据迁移机制完善
   - 行为一致性良好

4. **错误处理**
   - 统一的错误码 (`E_INVALID_ARGUMENT`, `E_CONFLICT`)
   - 错误隔离机制 (hook 失败不影响主流程)
   - 日志记录完善

5. **测试意识**
   - 关键 hook 有单元测试
   - 测试工具函数封装良好

---

### 4.2 待改进 📝

1. **函数过长**
   - 部分 handler 超过 100 行
   - 建议拆分为子函数

2. **注释不足**
   - 复杂逻辑缺少注释
   - 建议添加业务背景说明

3. **Magic Number**
   - 硬编码的数字 (如 `limit ?? 50`)
   - 建议提取为常量

4. **日志级别**
   - 部分应该是 `warn` 的用了 `error`
   - 部分应该是 `debug` 的用了 `info`

---

## 🎯 改进优先级

### 🔴 P0 (上线阻塞，必须修复)

1. ✅ **补齐结算闭环**
   - `queuePendingSettlement` 添加 `orderId`
   - 实现 `flushPendingSettlements`
   - 测试覆盖

2. ✅ **模型调用记账**
   - `/web3/resources/model/chat` 调用 `ledger.append`
   - 记录 token usage
   - 测试覆盖

3. ✅ **原子性保证**
   - SQLite 事务包裹
   - File 模式锁保护
   - 回滚测试

4. ✅ **关键测试补齐**
   - `web3.status.summary` 测试
   - 结算刷新测试
   - 原子性测试

---

### 🟡 P1 (高优先级，尽快实施)

1. **Provider 路由实现**
   - `/web3/resources/list`
   - `/web3/resources/model/chat`
   - `/web3/resources/search/query`
   - `/web3/resources/storage/*`

2. **Consumer Tools 实现**
   - `web3.search.query`
   - `web3.storage.put/get/list`

3. **安全加固**
   - Token 脱敏
   - 路径穿越防护
   - 限流机制

---

### 🟢 P2 (中优先级，后续优化)

1. **性能优化**
   - SQLite WAL 模式
   - 文件锁优化

2. **代码质量**
   - 函数拆分
   - 注释补充
   - Magic Number 提取

3. **监控告警**
   - Metrics 指标
   - 告警规则
   - 日志聚合

---

## 📋 检查清单

用于验收的最小可用清单：

### ✅ 功能完整性

- [ ] 结算闭环可执行 (orderId + flush)
- [ ] 模型调用有 ledger 记录
- [ ] Provider 可启动 HTTP 服务
- [ ] Consumer 可调用远程资源
- [ ] 租约过期自动清理

### ✅ 安全性

- [ ] Token 不出现在日志/会话记录
- [ ] accessToken 存储加密或 hash
- [ ] 路径穿越防护
- [ ] 限流机制生效

### ✅ 一致性

- [ ] File/SQLite 行为一致
- [ ] 原子性事务/锁保证
- [ ] `/pay_status` 不受影响

### ✅ 测试覆盖

- [ ] `web3.status.summary` 测试通过
- [ ] `flushPendingSettlements` 测试通过
- [ ] 模型调用记账测试通过
- [ ] 原子性回滚测试通过
- [ ] Provider 路由测试通过 (E2E)
- [ ] Consumer tools 测试通过 (E2E)

---

## 📝 总结

**现有实现质量**: 总体良好，架构清晰，模块化完善

**主要问题**: 缺少关键功能实现，特别是：

- 结算闭环不完整
- Provider/Consumer 未实现
- 测试覆盖不足

**上线阻塞项**: 4 个 Gate 必须全部通过

**建议**: 先修复 P0 阻塞项，再实施 P1 功能开发

---

**下一步**: 阅读 [02-architecture-design.md](./02-architecture-design.md) 了解完整架构设计
