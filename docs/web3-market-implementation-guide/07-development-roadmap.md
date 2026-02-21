# 7. 详细开发计划与路线图

> **总工期**: 21 周 (约 5 个月)  
> **团队规模**: 2-3 名全职开发 + 1 名测试  
> **里程碑**: 6 个主要阶段

---

## 📅 整体时间线

```
Week 0     Week 5     Week 10    Week 15    Week 20    Week 25
  │─────────│─────────│─────────│─────────│─────────│
  │ Phase 0 │ Phase 1 │ Phase 2 │ Phase 3 │ Phase 4 │ Phase 5
  │ 修复    │Provider │  P2P    │ 沙箱    │ 争议    │ 本地模型
  │ 阻塞项  │Consumer │ 网络    │ 隔离    │ 仲裁    │ + UI
  │ 1-2周   │ 2-3周   │ 3-4周   │ 2-3周   │ 2-3周   │ 2-3周
  │         │         │         │         │         │
  ▼         ▼         ▼         ▼         ▼         ▼
 MVP 0     MVP 1     MVP 2     MVP 3     MVP 4    MVP 5
 可测试    可用      可发现    安全      可信      完整
```

---

## 🚨 Phase 0: 修复阻塞项 (1-2周) ⚠️ **最高优先级**

### 目标

修复所有 Gate-\* 上线阻塞项，确保基础功能完整可用。

### 任务清单

#### Task 0.1: 补齐结算闭环 (3-5天)

**子任务**:

1. **修改 `queuePendingSettlement` 签名**

   ```typescript
   // 修改前
   export function queuePendingSettlement(store: MarketStateStore, payer: string, amount: number) {
     /* ... */
   }

   // 修改后
   export function queuePendingSettlement(
     store: MarketStateStore,
     orderId: string, // ✅ 新增
     payer: string,
     amount: number,
   ) {
     store.savePendingSettlement({
       orderId, // ✅ 保存 orderId
       payer,
       amount,
       queuedAt: nowIso(),
     });
   }
   ```

2. **实现 `flushPendingSettlements`**

   ```typescript
   export async function flushPendingSettlements(
     gateway: GatewayInstance,
     store: Web3StateStore,
     config: Web3PluginConfig,
   ): Promise<{ processed: number; succeeded: number; failed: number }> {
     const pending = store.listPendingSettlements();
     const results = { processed: 0, succeeded: 0, failed: 0 };

     for (const item of pending) {
       results.processed++;

       try {
         // 检查是否满足结算条件
         const order = await gateway.callMethod("market.order.get", {
           orderId: item.orderId,
         });

         if (!order || order.status !== "order_ready") {
           continue; // 跳过未就绪的订单
         }

         // 调用 settlement.lock
         const lockResult = await gateway.callMethod("market.settlement.lock", {
           orderId: item.orderId,
           payer: item.payer,
           amount: item.amount,
         });

         if (lockResult.success) {
           // 移除队列
           store.removePendingSettlement(item.orderId);
           results.succeeded++;
         } else {
           results.failed++;
         }
       } catch (err) {
         log.error(`Settlement flush failed for ${item.orderId}: ${err}`);
         results.failed++;
       }
     }

     return results;
   }
   ```

3. **更新所有调用 `queuePendingSettlement` 的地方**
   - 搜索代码库找到所有调用点
   - 添加 `orderId` 参数

4. **添加单元测试**

   ```typescript
   // tests/billing/settlement.test.ts
   describe("flushPendingSettlements", () => {
     it("processes ready settlements", async () => {
       // 准备测试数据
       store.savePendingSettlement({
         orderId: "order-123",
         payer: "0xABC",
         amount: 100,
       });

       // 执行刷新
       const result = await flushPendingSettlements(gateway, store, config);

       // 验证结果
       expect(result.processed).toBe(1);
       expect(result.succeeded).toBe(1);
       expect(store.listPendingSettlements()).toHaveLength(0);
     });

     it("skips not-ready settlements", async () => {
       // 订单状态不是 order_ready
       // 验证不会调用 settlement.lock
     });

     it("handles settlement.lock failures", async () => {
       // mock settlement.lock 失败
       // 验证 failed 计数增加
     });
   });
   ```

**验收标准**:

- ✅ `queuePendingSettlement` 包含 `orderId` 参数
- ✅ `flushPendingSettlements` 实现完整
- ✅ 单元测试覆盖率 > 80%
- ✅ 手动测试通过 (双存储模式)

---

#### Task 0.2: 模型调用记账 (2-3天)

**子任务**:

1. **在 `/web3/resources/model/chat` 路由中添加记账逻辑**

   ```typescript
   // web3-core/src/resources/http.ts (待创建)

   export function createModelChatRoute(
     store: Web3StateStore,
     config: Web3PluginConfig,
   ): RequestHandler {
     return async (req, res) => {
       // 1. 验证 token ✅ (已有逻辑)
       const leaseToken = req.headers["x-lease-token"];
       const lease = await verifyLease(leaseToken);

       // 2. 调用上游模型 ✅ (已有逻辑)
       const response = await fetch(upstreamEndpoint, {
         method: "POST",
         body: JSON.stringify(req.body),
       });

       // 3. 流式返回结果 ✅ (已有逻辑)
       for await (const chunk of response.body) {
         res.write(chunk);
       }

       // 4. ✅ 新增：记账到 ledger
       const usage = extractUsage(response); // 从响应提取 usage

       try {
         await gateway.callMethod("market.ledger.append", {
           leaseId: lease.id,
           kind: "model",
           unit: "token",
           quantity: usage.totalTokens || 1, // 回退为 1
           actorId: config.identity.providerActorId,
           metadata: {
             requestId: req.headers["x-request-id"],
             duration: Date.now() - startTime,
           },
         });
       } catch (ledgerErr) {
         // ⚠️ 记账失败不影响响应 (已返回给用户)
         log.warn(`Ledger append failed: ${ledgerErr}`);
       }

       res.end();
     };
   }
   ```

2. **实现 `extractUsage` 工具函数**

   ```typescript
   function extractUsage(response: Response): { totalTokens: number } {
     // 从 OpenAI 兼容响应中提取 usage
     // 支持流式和非流式

     if (response.body) {
       // 流式: 最后一个 chunk 包含 usage
       // data: {"usage":{"prompt_tokens":10,"completion_tokens":20}}
     } else {
       // 非流式: 直接在响应体中
       // { "usage": { "total_tokens": 30 } }
     }

     return { totalTokens: usage?.total_tokens || 1 };
   }
   ```

3. **添加集成测试**

   ```typescript
   // tests/e2e/model-chat-ledger.test.ts
   describe("Model chat ledger integration", () => {
     it("records usage to ledger after streaming", async () => {
       // 1. 创建租约
       const lease = await createTestLease();

       // 2. 调用模型接口
       const response = await fetch("/web3/resources/model/chat", {
         method: "POST",
         headers: { "X-Lease-Token": lease.accessToken },
         body: JSON.stringify({
           messages: [
             /*...*/
           ],
         }),
       });

       // 3. 验证 ledger 有记录
       await waitFor(1000); // 等待异步记账

       const entries = await gateway.callMethod("market.ledger.list", {
         leaseId: lease.id,
       });

       expect(entries).toHaveLength(1);
       expect(entries[0].kind).toBe("model");
       expect(entries[0].unit).toBe("token");
       expect(entries[0].quantity).toBeGreaterThan(0);
     });
   });
   ```

**验收标准**:

- ✅ 每次模型调用都有 ledger 记录
- ✅ `quantity` 取自上游 usage (回退为 1)
- ✅ 记账失败不影响响应返回
- ✅ 集成测试通过

---

#### Task 0.3: 原子性保证 (3-4天)

**子任务**:

1. **SQLite 事务包裹**

   ```typescript
   // market-core/src/state/sqlite-store.ts

   export class MarketSqliteStore implements MarketStore {
     private db: Database;

     // 通用事务包裹器
     private transaction<T>(fn: () => T): T {
       this.db.prepare("BEGIN").run();
       try {
         const result = fn();
         this.db.prepare("COMMIT").run();
         return result;
       } catch (err) {
         this.db.prepare("ROLLBACK").run();
         throw err;
       }
     }

     // 修改所有 save* 方法
     saveResource(resource: MarketResource): void {
       this.transaction(() => {
         // 1. 插入资源
         this.db.prepare(`
           INSERT INTO resources (id, kind, status, ...) VALUES (?, ?, ?, ...)
         `).run(resource.id, resource.kind, resource.status, ...);

         // 2. 插入审计事件
         this.db.prepare(`
           INSERT INTO audit_events (entityType, entityId, action, ...)
           VALUES ('resource', ?, 'publish', ...)
         `).run(resource.id, ...);
       });
     }

     // 类似地修改其他方法
     saveLease(lease: MarketLease): void {
       this.transaction(() => { /* ... */ });
     }

     saveSettlement(settlement: Settlement): void {
       this.transaction(() => { /* ... */ });
     }
   }
   ```

2. **File 模式加锁**

   ```typescript
   // market-core/src/state/file-store.ts

   import { withFileLock } from "./file-lock.js";

   export class MarketFileStore implements MarketStore {
     private stateDir: string;

     saveResource(resource: MarketResource): void {
       const lockPath = path.join(this.stateDir, ".resources.lock");

       withFileLock(lockPath, async () => {
         // 1. 读取现有数据
         const data = await readJSON(path.join(this.stateDir, "resources.json"));

         // 2. 更新数据
         const index = data.resources.findIndex((r) => r.id === resource.id);
         if (index >= 0) {
           data.resources[index] = resource;
         } else {
           data.resources.push(resource);
         }

         // 3. 写入文件 (原子性: 先写临时文件再 rename)
         const tmpPath = path.join(this.stateDir, "resources.json.tmp");
         await writeJSON(tmpPath, data);
         await fs.rename(tmpPath, path.join(this.stateDir, "resources.json"));
       });
     }
   }
   ```

3. **实现文件锁工具**

   ```typescript
   // market-core/src/state/file-lock.ts

   import lockfile from "proper-lockfile";

   export async function withFileLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
     const release = await lockfile.lock(lockPath, {
       stale: 10000, // 10秒后认为锁失效
       retries: {
         retries: 5,
         minTimeout: 100,
         maxTimeout: 1000,
       },
     });

     try {
       return await fn();
     } finally {
       await release();
     }
   }
   ```

4. **添加原子性测试**

   ```typescript
   // tests/market-core/atomicity.test.ts

   describe("Atomicity", () => {
     describe("SQLite mode", () => {
       it("rolls back on error", async () => {
         const store = new MarketSqliteStore(stateDir, config);

         // Mock 第二个 SQL 失败
         const originalRun = store.db.prepare.bind(store.db);
         let callCount = 0;
         vi.spyOn(store.db, "prepare").mockImplementation((sql) => {
           callCount++;
           if (callCount === 2) {
             throw new Error("Mocked SQL error");
           }
           return originalRun(sql);
         });

         // 尝试保存资源
         expect(() => store.saveResource(mockResource)).toThrow();

         // 验证数据库为空 (已回滚)
         const resources = store.listResources();
         expect(resources).toHaveLength(0);
       });
     });

     describe("File mode", () => {
       it("does not partial write on error", async () => {
         const store = new MarketFileStore(stateDir);

         // Mock fs.rename 失败
         vi.spyOn(fs, "rename").mockRejectedValue(new Error("Disk full"));

         // 尝试保存资源
         await expect(store.saveResource(mockResource)).rejects.toThrow();

         // 验证原文件未被覆写
         const data = await readJSON(path.join(stateDir, "resources.json"));
         expect(data.resources).toHaveLength(0);
       });
     });
   });
   ```

**验收标准**:

- ✅ SQLite 所有写操作在事务中
- ✅ File 模式所有写操作有锁保护
- ✅ 原子性测试通过 (双模式)
- ✅ 回滚测试通过

---

#### Task 0.4: 关键测试补齐 (2-3天)

**子任务**:

1. **`web3.status.summary` 测试**

   ```typescript
   // tests/web3-core/status.test.ts

   describe("web3.status.summary", () => {
     it("returns complete status", async () => {
       const result = await gateway.callMethod("web3.status.summary");

       expect(result.success).toBe(true);
       expect(result.data).toMatchObject({
         brain: {
           enabled: true,
           availability: "ok",
           defaultModel: "llama-3.3-70b",
         },
         billing: {
           status: "active",
           credits: 100,
         },
         settlement: {
           pending: 0,
           completed: 0,
         },
       });
     });

     it("returns degraded when brain endpoint missing", async () => {
       // config.brain.endpoint = ""
       const result = await gateway.callMethod("web3.status.summary");
       expect(result.data.brain.availability).toBe("degraded");
     });
   });
   ```

2. **结算刷新测试** (见 Task 0.1)

3. **模型调用记账测试** (见 Task 0.2)

4. **原子性测试** (见 Task 0.3)

**验收标准**:

- ✅ 所有 Gate-\* 阻塞项有测试
- ✅ 测试覆盖率 > 80%
- ✅ CI 运行通过

---

### 交付物

- ✅ 结算闭环完整可用
- ✅ 模型调用有 ledger 记录
- ✅ 原子性事务/锁保证
- ✅ 关键路径测试覆盖
- ✅ 所有 Gate-\* 验收通过

### 验收标准

运行以下检查脚本：

```bash
#!/bin/bash
# scripts/verify-phase0.sh

echo "🔍 Phase 0 验收检查"

# 1. 结算闭环
echo "1. 检查 queuePendingSettlement 签名..."
grep -q "orderId: string" extensions/web3-core/src/billing/settlement.ts && echo "✅" || echo "❌"

# 2. 模型记账
echo "2. 检查模型调用记账..."
grep -q "market.ledger.append" extensions/web3-core/src/resources/http.ts && echo "✅" || echo "❌"

# 3. 原子性
echo "3. 检查 SQLite 事务..."
grep -q "BEGIN.*COMMIT.*ROLLBACK" extensions/market-core/src/state/sqlite-store.ts && echo "✅" || echo "❌"

# 4. 测试覆盖
echo "4. 运行测试..."
npm test -- --coverage --run && echo "✅" || echo "❌"

echo "🎉 Phase 0 验收完成！"
```

---

## 🛠️ Phase 1: Provider 路由与 Consumer 工具 (2-3周)

### 目标

实现 Provider HTTP 服务和 Consumer Gateway Tools，让用户可以发布/调用资源。

### Week 1: Provider HTTP 路由 (5-7天)

#### Task 1.1: 基础设施搭建

**子任务**:

1. **创建 HTTP 服务器**

   ```typescript
   // web3-core/src/resources/server.ts

   import express from "express";
   import type { Web3PluginConfig } from "../config.js";
   import { createModelChatRoute } from "./routes/model.js";
   import { createSearchQueryRoute } from "./routes/search.js";
   import { createStorageRoutes } from "./routes/storage.js";

   export function startProviderServer(config: Web3PluginConfig) {
     if (!config.resources.enabled || !config.resources.provider.listen.enabled) {
       return;
     }

     const app = express();
     app.use(express.json());

     // 中间件: Token 验证
     app.use("/web3/resources/*", createTokenVerifyMiddleware(config));

     // 中间件: 限流
     app.use("/web3/resources/*", createRateLimiter(config));

     // 路由
     app.get("/web3/resources/list", createResourceListRoute(config));
     app.post("/web3/resources/model/chat", createModelChatRoute(config));
     app.post("/web3/resources/search/query", createSearchQueryRoute(config));
     app.post("/web3/resources/storage/put", createStorageRoutes(config).put);
     app.get("/web3/resources/storage/get", createStorageRoutes(config).get);
     app.get("/web3/resources/storage/list", createStorageRoutes(config).list);

     // 启动服务器
     const { bind, port } = config.resources.provider.listen;
     const host = bind === "loopback" ? "127.0.0.1" : "0.0.0.0";

     app.listen(port, host, () => {
       console.log(`Provider server listening on ${host}:${port}`);
     });
   }
   ```

2. **Token 验证中间件**

   ```typescript
   // web3-core/src/resources/middleware/auth.ts

   export function createTokenVerifyMiddleware(config: Web3PluginConfig): RequestHandler {
     return async (req, res, next) => {
       const leaseToken = req.headers["x-lease-token"];

       if (!leaseToken) {
         return res.status(401).json({ error: "Missing X-Lease-Token" });
       }

       // 1. 计算 token hash
       const tokenHash = crypto.createHash("sha256").update(leaseToken).digest("hex");

       // 2. 查找租约
       const leases = await gateway.callMethod("market.lease.list", {
         accessTokenHash: tokenHash,
       });

       if (leases.length === 0) {
         return res.status(401).json({ error: "Invalid token" });
       }

       const lease = leases[0];

       // 3. 检查租约状态
       if (lease.status !== "lease_active") {
         return res.status(403).json({ error: "Lease not active" });
       }

       // 4. 检查过期时间
       if (new Date(lease.expiresAt) < new Date()) {
         return res.status(403).json({ error: "Lease expired" });
       }

       // 5. 检查 policy
       if (lease.policy.maxRequests) {
         const usage = await gateway.callMethod("market.ledger.summary", {
           leaseId: lease.id,
         });

         if (usage.totalRequests >= lease.policy.maxRequests) {
           return res.status(429).json({ error: "Rate limit exceeded" });
         }
       }

       // ✅ 通过验证
       req.lease = lease; // 附加到请求对象
       next();
     };
   }
   ```

3. **限流中间件**

   ```typescript
   // web3-core/src/resources/middleware/rate-limit.ts

   import rateLimit from "express-rate-limit";

   export function createRateLimiter(config: Web3PluginConfig): RequestHandler {
     return rateLimit({
       windowMs: 60 * 1000, // 1 分钟
       max: 100, // 最多 100 次请求
       keyGenerator: (req) => req.headers["x-lease-token"] as string,
       handler: (req, res) => {
         res.status(429).json({
           error: "Too many requests, please try again later",
         });
       },
     });
   }
   ```

**时间**: 2-3天

---

#### Task 1.2: 模型推理路由

**实现** (见 Task 0.2，添加完整的流式支持)

**时间**: 2-3天

---

#### Task 1.3: 搜索/存储路由

**实现省略** (类似模型路由)

**时间**: 2-3天

---

### Week 2: Consumer Tools (5-7天)

#### Task 1.4: web3.search.query 工具

**实现省略** (见架构设计文档)

**时间**: 2天

---

#### Task 1.5: web3.storage.\* 工具

**实现省略**

**时间**: 3天

---

### Week 3: 集成测试 (3-5天)

#### Task 1.6: E2E 测试

**测试场景**:

1. 本地双实例测试 (Provider + Consumer)
2. Token 认证与租约验证
3. 账本记录完整性
4. 限流机制测试
5. 错误处理测试

**时间**: 3-5天

---

### 交付物

- ✅ Provider 可启动 HTTP 服务
- ✅ Consumer 可调用远程资源
- ✅ Token 认证工作正常
- ✅ 限流机制生效
- ✅ E2E 测试通过

---

## 🌐 Phase 2: P2P 网络与节点发现 (3-4周)

**详细内容**: 见 [03-p2p-discovery.md](./03-p2p-discovery.md)

**交付物**:

- ✅ 节点自动加入 P2P 网络
- ✅ DHT 节点发现功能
- ✅ NAT 穿透成功率 > 80%

---

## 🛡️ Phase 3: 沙箱隔离与安全加固 (2-3周)

**详细内容**: 见 [04-sandbox-isolation.md](./04-sandbox-isolation.md)

**交付物**:

- ✅ Docker 沙箱执行
- ✅ Seccomp + gVisor 隔离
- ✅ 异常行为监控告警

---

## ⚖️ Phase 4: 争议仲裁 (2-3周)

**详细内容**: 见 [05-dispute-arbitration.md](./05-dispute-arbitration.md)

**交付物**:

- ✅ 自动仲裁引擎
- ✅ DAO 投票机制
- ✅ 争议处理文档

---

## 💻 Phase 5: 本地模型接入 + Web UI (2-3周)

**详细内容**: 见 [06-local-model-integration.md](./06-local-model-integration.md)

**交付物**:

- ✅ llama.cpp 集成
- ✅ vLLM 集成 (可选)
- ✅ 管理界面

---

## 📋 每周检查清单

### 每周一: 计划会议

- [ ] 回顾上周进度
- [ ] 识别阻塞问题
- [ ] 调整本周计划

### 每周五: 演示会议

- [ ] 演示本周成果
- [ ] 更新项目看板
- [ ] 记录技术债务

---

## 🎯 里程碑与验收

### MVP 0: 可测试 (Week 2)

- 所有阻塞项修复
- 基础功能测试通过

### MVP 1: 可用 (Week 5)

- Provider/Consumer 功能完整
- E2E 测试通过

### MVP 2: 可发现 (Week 9)

- P2P 网络运行正常
- DHT 节点发现工作

### MVP 3: 安全 (Week 12)

- 沙箱隔离生效
- 安全测试通过

### MVP 4: 可信 (Week 15)

- 争议仲裁可用
- DAO 投票测试通过

### MVP 5: 完整 (Week 18)

- 本地模型接入
- Web UI 可用
- 完整文档

---

## 📊 资源分配建议

### 人员配置

**开发人员 1** (全栈):

- Phase 0-1: market-core 修复
- Phase 2: P2P 网络
- Phase 5: Web UI

**开发人员 2** (后端):

- Phase 0-1: web3-core Provider 路由
- Phase 3: 沙箱隔离
- Phase 4: 争议仲裁

**测试工程师**:

- 各 Phase E2E 测试
- 性能测试
- 安全测试

---

## 🚧 风险管理

### 技术风险

| 风险             | 概率 | 影响 | 缓解措施          |
| ---------------- | ---- | ---- | ----------------- |
| NAT 穿透失败率高 | 中   | 高   | 提前测试多种方案  |
| 沙箱性能损耗大   | 低   | 中   | 基准测试 + 优化   |
| DAO 投票参与率低 | 高   | 中   | 设计激励机制      |
| 区块链拥堵延迟   | 中   | 中   | 批量结算 + Layer2 |

### 进度风险

| 风险         | 缓解措施             |
| ------------ | -------------------- |
| 关键路径阻塞 | 每周识别并调整优先级 |
| 人员流动     | 文档完善 + 知识分享  |
| 需求变更     | 敏捷迭代 + MVP 交付  |

---

## 📝 下一步

1. ✅ **立即开始 Phase 0** - 修复阻塞项
2. 📅 **设置项目看板** - Jira/GitHub Projects
3. 📋 **创建开发分支** - `feature/web3-market`
4. 🧪 **搭建 CI 流水线** - 自动化测试

---

**最后更新**: 2026-02-20  
**下一篇**: [08-security-compliance.md](./08-security-compliance.md)
