### OpenClaw Web3 资源共享测试计划（B-2 附录）

> 本文档是 `web3-brain-architecture.md` 的子文档，聚焦 **单元/集成/e2e/负载/安全测试**，让 AI 能直接写测试文件与 mock。

---

## 1. 测试分层

- **Unit**：validators、状态机断言、hashCanonical、store 读写（file/sqlite）
- **Integration**：handlers（market-core）+ store、web3-core tools + http routes
- **E2E**：发布→租约→调用→记账→撤销→过期 sweep
- **Security**：token 脱敏、路径穿越、ledger 伪造

---

## 2. 必测矩阵（补充主文档 12.11.10）

- 双模式必跑：`store.mode=file` 与 `store.mode=sqlite`
- 并发：maxConcurrent 生效
- 大包：413
- 过期：expireSweep 后立即拒绝

---

## 3. Mock 策略

- Provider HTTP：本地起一个 server（可用 node http）
- 模型流：提供最小 SSE/NDJSON 模拟
- storage：临时目录 + 虚拟根

---

## 4. 负载与 SLO（建议）

- `p95` 延迟阈值（模型/搜索/存储分别设定）
- 单 Provider 最大并发与降级策略

---

## 5. 回归清单

- `/pay_status` 不受影响
- market 既有 offer/order/settlement/consent/delivery 流程不回归

---

## 6. 上线阻断项专项测试（必须补齐）

> 以下测试条目对应评审发现的4个上线阻断项，每项必须有至少一个通过的测试用例方可上线。

### 6.1 `web3.status.summary` handler 测试

- **文件**：`extensions/web3-core/src/index.test.ts`（扩展现有）
- **测试要点**：
  - 返回 `brain.source` / `brain.provider` / `brain.model` / `brain.availability` 字段
  - 返回 `billing.status` / `billing.credits` 字段
  - 返回 `settlement.pending`（待结算条目数，应与 `pendingSettlements` 队列长度一致）
  - 主脑未启用时，brain 字段为 null / unavailable
  - 不泄露 token、endpoint、真实路径

### 6.2 `flushPendingSettlements` 测试

- **文件**：`extensions/web3-core/src/billing/settlement.test.ts`（扩展现有）
- **测试要点**：
  - **ready 条目**（orderId/payer/amount 齐全）：调用 `market.settlement.lock` 并从队列移除
  - **not-ready 条目**（缺少必要字段）：跳过，保留在队列中
  - **重试计数**：每次 flush 失败后 `attempts` 递增，`lastError` 更新
  - **成功清除**：settlement.lock 返回成功后，条目从持久化队列移除
  - **空队列**：无条目时 flush 立即返回，不调用 gateway

### 6.3 Model chat ledger 记账测试

- **文件**：`extensions/web3-core/src/resources/http.test.ts`（扩展现有）
- **测试要点**：
  - pipeline 完成后调用 `market.ledger.append`，kind 为 `"model"`，unit 为 `"token"`
  - 上游返回 `usage.total_tokens` 时，quantity 取该值
  - 上游无 usage 信息时，quantity 回退为 `1`
  - ledger append 失败不影响已返回的 200 响应

### 6.4 原子性事务回滚测试

- **文件**：`extensions/market-core/src/state/store.test.ts`（扩展现有）
- **测试要点（SQLite 模式）**：
  - `runInTransaction` 中途抛错：验证所有写入完全回滚（读取确认无脏数据）
  - `runInTransaction` 正常完成：验证所有写入均持久化
  - 嵌套调用行为：不支持嵌套事务时应抛出明确错误或透传
- **测试要点（File 模式）**：
  - `withLock` 内中途抛错：验证文件未被部分覆写
  - 并发写入：两个 withLock 调用串行执行，不产生数据竞争
