# 快速开始指南 - OpenClaw Web3 算力市场开发

> **目标读者**: 开发人员  
> **预计时间**: 30 分钟设置完成  
> **前置要求**: Node.js 18+, Git

---

## 🚀 5 分钟快速体验

### 1. 克隆项目并安装依赖

```bash
# 克隆仓库
git clone https://github.com/your-org/openclaw.git
cd openclaw

# 安装依赖
npm install

# 构建项目
npm run build
```

### 2. 启动基础服务

```bash
# 启动 OpenClaw Gateway
npm run gateway

# 新终端: 启动 Web UI (可选)
npm run web
```

### 3. 测试 market-core 功能

```bash
# 进入 OpenClaw 控制台
$ openclaw

# 发布一个资源
> await gateway.callMethod("market.resource.publish", {
    kind: "model",
    label: "Test Model",
    providerActorId: "0x123...",
    metadata: {
      backend: "ollama",
      policy: { maxTokens: 4096 }
    },
    pricing: { unit: "token", amount: 0.01, currency: "USDC" }
  })
{ success: true, data: { resourceId: "res-123" } }

# 查询资源列表
> await gateway.callMethod("market.resource.list")
{ success: true, data: { resources: [ /* ... */ ] } }
```

✅ 恭喜！market-core 基础功能运行正常。

---

## 📋 Phase 0: 修复阻塞项（开发第一周）

### 任务概览

| 任务                 | 优先级 | 预计时间 | 负责人 |
| -------------------- | ------ | -------- | ------ |
| Task 0.1: 结算闭环   | P0     | 3-5天    | Dev 1  |
| Task 0.2: 模型记账   | P0     | 2-3天    | Dev 2  |
| Task 0.3: 原子性保证 | P0     | 3-4天    | Dev 1  |
| Task 0.4: 测试补齐   | P0     | 2-3天    | QA     |

### Step-by-Step 开发指南

#### Task 0.1: 结算闭环

**1. 创建功能分支**

```bash
git checkout -b feature/settlement-closure
```

**2. 修改 `queuePendingSettlement` 签名**

编辑文件: `extensions/web3-core/src/billing/settlement.ts`

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
    orderId, // ✅ 添加
    payer,
    amount,
    queuedAt: nowIso(),
  });
}
```

**3. 实现 `flushPendingSettlements`**

在同一文件中添加:

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
      const lockResult = await gateway.callMethod("market.settlement.lock", {
        orderId: item.orderId,
        payer: item.payer,
        amount: item.amount,
      });

      if (lockResult.success) {
        store.removePendingSettlement(item.orderId);
        results.succeeded++;
      } else {
        results.failed++;
      }
    } catch (err) {
      log.error(`Settlement flush failed: ${err}`);
      results.failed++;
    }
  }

  return results;
}
```

**4. 更新调用点**

搜索所有调用 `queuePendingSettlement` 的地方:

```bash
rg "queuePendingSettlement" --type ts
```

逐个添加 `orderId` 参数。

**5. 添加测试**

创建文件: `extensions/web3-core/tests/billing/settlement.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { flushPendingSettlements } from "../../src/billing/settlement.js";

describe("flushPendingSettlements", () => {
  let gateway: MockGateway;
  let store: MockStore;
  let config: Web3PluginConfig;

  beforeEach(() => {
    // 初始化 mocks
  });

  it("processes ready settlements", async () => {
    // 准备数据
    store.savePendingSettlement({
      orderId: "order-123",
      payer: "0xABC",
      amount: 100,
    });

    // 执行
    const result = await flushPendingSettlements(gateway, store, config);

    // 验证
    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(store.listPendingSettlements()).toHaveLength(0);
  });

  it("skips not-ready settlements", async () => {
    // TODO: 实现测试
  });
});
```

**6. 运行测试**

```bash
npm test -- settlement.test.ts
```

**7. 提交代码**

```bash
git add .
git commit -m "feat(settlement): add orderId to queuePendingSettlement and implement flushPendingSettlements"
git push origin feature/settlement-closure
```

**8. 创建 PR**

在 GitHub 上创建 Pull Request，等待代码评审。

---

#### Task 0.2: 模型记账

**1. 创建 Provider HTTP 路由模块**

创建文件: `extensions/web3-core/src/resources/http.ts`

```typescript
import express from "express";
import type { Web3PluginConfig } from "../config.js";

export function startProviderServer(gateway: GatewayInstance, config: Web3PluginConfig) {
  if (!config.resources.enabled || !config.resources.provider.listen.enabled) {
    return;
  }

  const app = express();
  app.use(express.json());

  // 路由: 模型推理
  app.post("/web3/resources/model/chat", createModelChatRoute(gateway, config));

  // 启动服务器
  const { bind, port } = config.resources.provider.listen;
  const host = bind === "loopback" ? "127.0.0.1" : "0.0.0.0";

  app.listen(port, host, () => {
    console.log(`Provider server listening on ${host}:${port}`);
  });
}

function createModelChatRoute(gateway: GatewayInstance, config: Web3PluginConfig): RequestHandler {
  return async (req, res) => {
    const startTime = Date.now();

    // 1. 验证 token (TODO: 实现)
    const leaseToken = req.headers["x-lease-token"];
    const lease = await verifyLease(gateway, leaseToken);

    // 2. 调用上游模型
    const upstreamUrl = "http://localhost:11434/v1/chat/completions";
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    // 3. 流式返回
    let usage = { totalTokens: 1 };
    for await (const chunk of response.body) {
      res.write(chunk);
      // 解析最后一个 chunk 获取 usage
      if (chunk.includes('"usage"')) {
        usage = JSON.parse(chunk).usage;
      }
    }
    res.end();

    // 4. ✅ 记账到 ledger
    try {
      await gateway.callMethod("market.ledger.append", {
        leaseId: lease.id,
        kind: "model",
        unit: "token",
        quantity: usage.totalTokens,
        actorId: config.identity.providerActorId,
        metadata: {
          duration: Date.now() - startTime,
        },
      });
    } catch (err) {
      log.warn(`Ledger append failed: ${err}`);
    }
  };
}
```

**2. 在 web3-core 插件中启动服务器**

编辑文件: `extensions/web3-core/src/index.ts`

```typescript
// 在 register() 函数中添加:
import { startProviderServer } from "./resources/http.js";

// ...
register(api) {
  // ...

  // 启动 Provider HTTP 服务器
  startProviderServer(api.gateway, config);
}
```

**3. 添加集成测试**

创建文件: `extensions/web3-core/tests/e2e/model-chat-ledger.test.ts`

```typescript
describe("Model chat ledger integration", () => {
  it("records usage to ledger", async () => {
    // 1. 创建租约
    const lease = await gateway.callMethod("market.lease.issue", {
      resourceId: "model-test",
      consumerActorId: "0xABC",
      providerActorId: "0xDEF",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    // 2. 调用模型接口
    const response = await fetch("http://localhost:8545/web3/resources/model/chat", {
      method: "POST",
      headers: {
        "X-Lease-Token": lease.data.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      }),
    });

    // 3. 等待响应完成
    await response.text();

    // 4. 验证 ledger 有记录
    await new Promise((r) => setTimeout(r, 1000)); // 等待异步记账

    const ledger = await gateway.callMethod("market.ledger.list", {
      leaseId: lease.data.leaseId,
    });

    expect(ledger.data.entries).toHaveLength(1);
    expect(ledger.data.entries[0].kind).toBe("model");
    expect(ledger.data.entries[0].quantity).toBeGreaterThan(0);
  });
});
```

**4. 运行测试**

```bash
# 确保 ollama 在运行
ollama serve

# 运行集成测试
npm test -- model-chat-ledger.test.ts --run
```

---

#### Task 0.3: 原子性保证

**1. 修改 SQLite Store 使用事务**

编辑文件: `extensions/market-core/src/state/sqlite-store.ts`

```typescript
export class MarketSqliteStore implements MarketStore {
  private db: Database;

  // 添加事务包裹器
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
      this.db
        .prepare(
          `
        INSERT INTO resources (id, kind, status, provider_actor_id, label, metadata, pricing, tags, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          resource.id,
          resource.kind,
          resource.status,
          resource.providerActorId,
          resource.label,
          JSON.stringify(resource.metadata),
          JSON.stringify(resource.pricing),
          JSON.stringify(resource.tags),
          resource.created,
          resource.updated,
        );

      // 2. 插入审计事件
      this.db
        .prepare(
          `
        INSERT INTO audit_events (entity_type, entity_id, action, actor_id, timestamp)
        VALUES ('resource', ?, 'publish', ?, ?)
      `,
        )
        .run(resource.id, resource.providerActorId, resource.created);
    });
  }

  // 类似地修改其他方法...
}
```

**2. 修改 File Store 使用锁**

编辑文件: `extensions/market-core/src/state/file-store.ts`

```typescript
import { withFileLock } from "./file-lock.js";

export class MarketFileStore implements MarketStore {
  saveResource(resource: MarketResource): void {
    const lockPath = path.join(this.stateDir, ".resources.lock");
    const filePath = path.join(this.stateDir, "resources.json");

    withFileLock(lockPath, async () => {
      // 1. 读取现有数据
      const data = await readJSON(filePath);

      // 2. 更新数据
      const index = data.resources.findIndex((r) => r.id === resource.id);
      if (index >= 0) {
        data.resources[index] = resource;
      } else {
        data.resources.push(resource);
      }

      // 3. 原子写入 (先写临时文件再 rename)
      const tmpPath = `${filePath}.tmp`;
      await writeJSON(tmpPath, data);
      await fs.rename(tmpPath, filePath);
    });
  }
}
```

**3. 实现文件锁工具**

创建文件: `extensions/market-core/src/state/file-lock.ts`

```typescript
import lockfile from "proper-lockfile";
import path from "path";
import fs from "fs/promises";

export async function withFileLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  // 确保锁文件存在
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(lockPath, "", { flag: "a" });

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

**4. 添加原子性测试**

创建文件: `extensions/market-core/tests/atomicity.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MarketSqliteStore } from "../src/state/sqlite-store.js";
import { MarketFileStore } from "../src/state/file-store.js";

describe("Atomicity", () => {
  describe("SQLite mode", () => {
    it("rolls back on error", () => {
      const store = new MarketSqliteStore(stateDir, config);

      // Mock 第二个 SQL 失败
      let callCount = 0;
      vi.spyOn(store.db, "prepare").mockImplementation((sql) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Mocked SQL error");
        }
        return originalPrepare(sql);
      });

      // 尝试保存
      expect(() => store.saveResource(mockResource)).toThrow();

      // 验证回滚
      const resources = store.listResources();
      expect(resources).toHaveLength(0);
    });
  });

  describe("File mode", () => {
    it("does not partial write on error", async () => {
      const store = new MarketFileStore(stateDir);

      // Mock rename 失败
      vi.spyOn(fs, "rename").mockRejectedValue(new Error("Disk full"));

      // 尝试保存
      await expect(store.saveResource(mockResource)).rejects.toThrow();

      // 验证原文件未被覆写
      const data = await readJSON(path.join(stateDir, "resources.json"));
      expect(data.resources).toHaveLength(0);
    });
  });
});
```

**5. 运行测试**

```bash
npm test -- atomicity.test.ts
```

---

### Phase 0 验收检查

运行以下脚本验证所有阻塞项已修复:

```bash
#!/bin/bash
# scripts/verify-phase0.sh

echo "🔍 Phase 0 验收检查"
echo ""

# 1. 结算闭环
echo "✅ Task 0.1: 结算闭环"
grep -q "orderId: string" extensions/web3-core/src/billing/settlement.ts && echo "  ✅ queuePendingSettlement 签名正确" || echo "  ❌ 缺少 orderId"
grep -q "flushPendingSettlements" extensions/web3-core/src/billing/settlement.ts && echo "  ✅ flushPendingSettlements 已实现" || echo "  ❌ 未实现"
echo ""

# 2. 模型记账
echo "✅ Task 0.2: 模型记账"
grep -q "market.ledger.append" extensions/web3-core/src/resources/http.ts && echo "  ✅ 模型调用有记账" || echo "  ❌ 缺少记账逻辑"
echo ""

# 3. 原子性
echo "✅ Task 0.3: 原子性保证"
grep -q "BEGIN.*COMMIT.*ROLLBACK" extensions/market-core/src/state/sqlite-store.ts && echo "  ✅ SQLite 使用事务" || echo "  ❌ 缺少事务"
grep -q "withFileLock" extensions/market-core/src/state/file-store.ts && echo "  ✅ File 模式有锁" || echo "  ❌ 缺少锁"
echo ""

# 4. 测试覆盖
echo "✅ Task 0.4: 测试补齐"
npm test -- --coverage --run > /tmp/test-output.txt 2>&1
if [ $? -eq 0 ]; then
  echo "  ✅ 所有测试通过"
else
  echo "  ❌ 测试失败"
  cat /tmp/test-output.txt
fi
echo ""

echo "🎉 Phase 0 验收完成！"
```

运行脚本:

```bash
chmod +x scripts/verify-phase0.sh
./scripts/verify-phase0.sh
```

---

## 🛠️ 开发工具与最佳实践

### 推荐 IDE 配置

**VS Code Extensions**:

- ESLint
- Prettier
- TypeScript Vue Plugin
- Vitest
- GitLens

**VS Code settings.json**:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

### Git 工作流

```bash
# 1. 创建功能分支
git checkout -b feature/your-feature-name

# 2. 定期同步主分支
git fetch origin
git rebase origin/main

# 3. 提交代码 (遵循 Conventional Commits)
git commit -m "feat(module): add feature description"
git commit -m "fix(module): fix bug description"
git commit -m "test(module): add test description"

# 4. 推送并创建 PR
git push origin feature/your-feature-name
```

### 测试策略

**单元测试**:

```bash
# 运行单元测试
npm test

# 运行特定文件
npm test -- settlement.test.ts

# Watch 模式
npm test -- --watch

# 覆盖率报告
npm test -- --coverage
```

**集成测试**:

```bash
# E2E 测试
npm run test:e2e

# 手动测试
npm run gateway  # 启动 Gateway
npm run web      # 启动 Web UI (新终端)
```

### 调试技巧

**调试 TypeScript**:

创建 `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Gateway",
      "program": "${workspaceFolder}/src/gateway/start.ts",
      "preLaunchTask": "npm: build",
      "sourceMaps": true,
      "smartStep": true,
      "internalConsoleOptions": "openOnSessionStart",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
      "args": ["run", "${file}"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

---

## 📚 学习资源

### 必读文档

1. [README.md](./README.md) - 项目导航
2. [01-implementation-review.md](./01-implementation-review.md) - 现有实现评审
3. [02-architecture-design.md](./02-architecture-design.md) - 核心架构
4. [07-development-roadmap.md](./07-development-roadmap.md) - 开发路线图

### 参考项目

- **libp2p**: https://github.com/libp2p/js-libp2p
- **Akash Network**: https://github.com/akash-network/node
- **Golem Network**: https://github.com/golemfactory/yagna

### 社区资源

- **Discord**: #openclaw-dev
- **GitHub Discussions**: 提问与讨论
- **周会**: 每周五 15:00 演示会议

---

## ❓ 常见问题

### Q1: SQLite 还是 File 模式？

**A**: 开发环境推荐 File 模式（易于调试），生产环境推荐 SQLite 模式（性能好）。

### Q2: 如何手动测试租约？

**A**:

```typescript
// 1. 发布资源
const res = await gateway.callMethod("market.resource.publish", {
  /* ... */
});

// 2. 创建租约
const lease = await gateway.callMethod("market.lease.issue", {
  resourceId: res.data.resourceId,
  consumerActorId: "0xABC",
  providerActorId: "0xDEF",
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});

// 3. 使用租约调用 Provider
fetch("http://localhost:8545/web3/resources/model/chat", {
  headers: { "X-Lease-Token": lease.data.accessToken },
  // ...
});
```

### Q3: 如何调试 P2P 网络？

**A**: Phase 2 才涉及 P2P，先完成 Phase 0-1。

---

## 🆘 获取帮助

遇到问题？

1. 📖 **查阅文档**: 先查看详细文档
2. 🔍 **搜索 Issues**: GitHub Issues 搜索类似问题
3. 💬 **提问**: Discord #openclaw-dev 频道
4. 🐛 **报告 Bug**: GitHub Issues 提交 Bug 报告

---

**最后更新**: 2026-02-20  
**下一步**: 开始 Phase 0 开发！🚀
