### OpenClaw Web3 资源共享实施核对清单（B-2 附录）

> 本文档是 `web3-brain-architecture.md` 的子文档。
> 目标：把 B-1/B-2 的落地拆成**按文件可勾验的工业级 checklist**，AI 可以按此逐项实现并自测。

---

## 0. 交付定义（Definition of Done）

- **功能**：
  - Consumer 能发现资源、获取租约、调用 Provider 模型/搜索/存储
  - Provider 能发布/下线资源、撤销租约、写入权威 ledger
  - 主脑可切到 Web3 去中心化模型，并在失败时回退中心化
- **安全**：token/endpoint/真实路径不泄露；ledger 不可由 consumer 伪造
- **一致性**：file/sqlite 两种 store 行为一致；`/pay_status` 不受影响
- **可运维**：expireSweep/revocation.retry/repair.retry 可执行且返回结构化结果
- **测试**：关键路径有 unit + integration + e2e 覆盖（至少主文档 `12.11.10` 的矩阵）

---

## 1. Core 层（B-1）

### 1.1 `src/plugins/types.ts`

- **新增**：`PluginHookResolveStreamEvent/Result` + `PluginHookName` 增加 `resolve_stream_fn`
- **AC**：
  - 只增加类型与 hook name，不影响现有 hook 行为

### 1.2 `src/plugins/hooks.ts`

- **新增**：`runResolveStream`（modifying hook，串行合并，错误隔离）
- **AC**：
  - 多插件返回 `streamFn` 时按 priority 取第一个（与 `before_model_resolve` 合并语义一致）
  - 任一插件抛错不影响后续插件

### 1.3 `src/agents/pi-embedded-runner/run/attempt.ts`

- **修改**：在默认 `streamFn` 分配前调用 `runResolveStream`，若返回则覆盖默认
- **AC**：
  - 没有任何插件实现时行为不变
  - 插件返回 `streamFn` 后，默认 `ollama/streamSimple` 分支不执行

### 1.4 测试（core）

- **修改/新增**：`src/plugins/hooks.test.ts`
- **AC**：
  - 覆盖：priority、错误隔离、空返回

---

## 2. market-core（B-2：resources/leases/ledger）

### 2.1 `extensions/market-core/src/market/resources.ts`

- **新增文件**：导出 `MarketResource/MarketLease/MarketLedgerEntry` types
- **AC**：
  - 不引入破坏性改动到现有 `market/types.ts`

### 2.2 `extensions/market-core/src/state/store.ts`

- **修改**：
  - sqlite `ensureSchema` 增加 `resources/leases/ledger`（ledger 含 timestamp + index）
  - file store 增加 `resources.json`/`leases.json`/`ledger.jsonl` 的读写
  - `migrateFromFile` 扩展导入顺序与幂等
- **AC**：
  - 旧数据（没有 resources 文件）可无错启动
  - sqlite 空库可从 file 导入新三类数据
  - `ledger` append-only：file 为追加写；sqlite 为 insert

### 2.3 `extensions/market-core/src/market/validators.ts`

- **修改**：保留/复用现有基础校验（如 `requireString/requireAddress/...`），避免把资源共享的全部校验器堆进单一文件。
- **新增（建议拆分）**：将资源共享相关校验器放到独立模块（例如 `extensions/market-core/src/market/resources/validators.ts`），集中承载 `requireEnum/requireStringArray/requireBigNumberishString/requireLimit/...`。
- **AC**：
  - 所有新增 methods 入参校验有稳定错误码（推荐 `E_INVALID_ARGUMENT`）

### 2.4 `extensions/market-core/src/market/state-machine.ts`

- **修改**：新增 `assertResourceTransition/assertLeaseTransition`
- **AC**：
  - 非法迁移必须抛错（映射为 `E_CONFLICT`）

### 2.5 `extensions/market-core/src/market/handlers.ts`

- **修改**：新增 gateway methods
  - `market.resource.publish/unpublish/get/list`
  - `market.lease.issue/revoke/get/list/expireSweep`
  - `market.ledger.append/list/summary`
  - `market.repair.retry`（最小闭环）
- **AC**：
  - 所有 write methods：先校验 + 权限 + actor 绑定，再写入
  - `market.ledger.append` 必须拒绝 consumer 伪造（actorId 必须为 provider）
  - 错误不泄露 token/endpoint/真实路径

### 2.6 测试（market-core）

- **新增/修改**：`extensions/market-core/src/market/handlers.test.ts`
- **AC**：
  - 覆盖：resource publish→lease issue→ledger append→revoke→append拒绝
  - 覆盖：file/sqlite 两模式

---

## 3. web3-core（B-1/B-2 编排 + Provider HTTP routes + tools）

### 3.1 `extensions/web3-core/src/config.ts`

- **修改**：新增 `brain` + `resources` 配置节
- **AC**：默认值不改变现有行为（默认关闭）

### 3.2 `extensions/web3-core/src/index.ts`

- **修改**：
  - 注册 `before_model_resolve`
  - 注册 `resolve_stream_fn`
  - 注册 gateway methods：`web3.resources.*`
  - 注册 tools：`web3.search.query`、`web3.storage.put/get/list`
  - 注册 Provider HTTP routes：`/web3/resources/*`
- **AC**：
  - 资源功能关闭时不暴露 routes/tools
  - route 必须校验 token hash + lease status + expiry + policy

### 3.3 新增模块建议

- **新增**：`extensions/web3-core/src/resources/http.ts`（Provider routes）
- **新增**：`extensions/web3-core/src/resources/tools.ts`（Consumer tools）
- **新增**：`extensions/web3-core/src/brain/stream.ts`（StreamFn）
- **新增**：`extensions/web3-core/src/brain/resolve.ts`（选择与回退）

### 3.4 测试（web3-core）

- **新增/修改**：
  - `brain/resolve.test.ts`（allowlist/回退）
  - `resources/http.test.ts`（token 校验/路径穿越/限流）
  - `resources/tools.test.ts`（脱敏/错误映射）

---

## 4. E2E（跨插件）

- **新增/修改建议**：
  - `src/gateway/tools-invoke-http.test.ts`：覆盖 web3 tools 调用 Provider route
  - 端到端跑两次：file/sqlite
- **AC**：
  - token 不出现在 session transcript（必要时用 `tool_result_persist` 脱敏）
  - revoke/expireSweep 后立即拒绝调用

---

## 5. 风险点与必过 Gate

- **Gate-SEC-01**：token、endpoint、真实路径零泄露
- **Gate-LEDGER-01**：consumer 不能写权威 ledger
- **Gate-COMPAT-01**：`/pay_status` 输出不变
- **Gate-STORE-01**：file/sqlite 行为一致

---

## 6. 上线阻断项 Gate（评审补充，必须全部通过）

> 以下 Gate 对应评审发现的4个上线阻断项，每项均为上线硬性门槛。

### Gate-SETTLE-01：结算闭环可执行

- **验证**：`queuePendingSettlement` 写入的条目包含 `orderId`、`payer`、`amount` 三字段（均非空）
- **验证**：`flushPendingSettlements` 对 ready 条目调用 `market.settlement.lock` 并成功移除
- **验证**：有对应单元测试通过

### Gate-LEDGER-02：模型调用有 Provider 权威记账

- **验证**：`/web3/resources/model/chat` 流式响应完成后调用 `market.ledger.append`
- **验证**：ledger entry 的 `kind="model"`、`unit="token"`、`quantity` 取自上游 usage 或回退为 1
- **验证**：记账失败不影响已返回的响应
- **验证**：有对应单元测试通过

### Gate-ATOMIC-01：多对象写入原子性

- **验证（SQLite）**：`market.resource.publish`、`market.lease.issue`、`market.settlement.lock/release/refund` 的多步写入包裹在 `BEGIN`/`COMMIT`/`ROLLBACK` 事务中
- **验证（File）**：上述操作在 `withFileLock` 锁内执行
- **验证**：SQLite 中途抛错后数据完全回滚（有测试）
- **验证**：File 模式中途抛错后文件未被部分覆写（有测试）

### Gate-TEST-01：关键路径测试覆盖

- **验证**：`web3.status.summary` handler 有测试，覆盖 brain/billing/settlement 字段
- **验证**：`flushPendingSettlements` 有测试，覆盖 ready/not-ready/重试/成功清除
- **验证**：model chat ledger 记账有测试
- **验证**：原子性回滚有测试（sqlite + file 双模式）
