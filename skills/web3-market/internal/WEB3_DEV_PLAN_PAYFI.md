# OpenClaw Web3 Agentic PayFi 开发计划 (Phased Roadmap)

> **版本**：v1.2 (Plan Extended)
> **目标**：以 **Agentic Commerce** 为核心，分阶段实现 KYA、PayFi 流支付与 x402 自动支付。

---

## 📅 阶段一：KYA 策略引擎 (Agent Identity MVP)

**时间**：Week 6
**核心目标**：收回 Agent Wallet 的“上帝权限”，实现基于策略的签名控制。
**状态**：✅ 已完成 (Phase 1.0)

### 1.1 `WalletPolicy` 定义与加载

- [x] 创建 `extensions/agent-wallet/src/policy.ts`，定义 `WalletPolicy` 接口（Budget, Allowlist, Scope）。
- [x] 实现 `loadPolicy()`：从 `config.ts` 或 `policy.json` 加载策略，支持热更新。
- [x] 编写单元测试：验证 JSON 策略解析与默认值。

### 1.2 `PolicyEngine` 拦截逻辑

- [x] 实现 `checkPolicy(intent)`：输入 `(to, amount, data)`，输出 `Decision` (Approved/Rejected)。
- [x] 在 `extensions/agent-wallet/src/handlers.ts` 的 `sign/send` 处注入拦截逻辑。
- [x] 实现 `DecisionLog`：记录每次决策结果（JSONL 或内存），供审计查询。

### 1.3 验证

- [x] 测试用例：尝试超额转账 -> 被拦截。
- [x] 测试用例：尝试调用非白名单合约 -> 被拦截。

---

## 📅 阶段 1.5：KYA 状态持久化 (State Persistence)

**时间**：Week 6.5
**核心目标**：补齐 Daily Cap 的状态累积与重置逻辑，确保 Budget 策略真实生效。

### 1.5.1 状态存储 (KV Store)

- [x] 实现轻量级 KV 存储（复用 `store.ts` 或新增 `state.ts`），用于记录 `dailySpent`。
- [x] 键设计：`budget:daily:<YYYY-MM-DD>:<chainId>`。

### 1.5.2 状态注入与更新

- [x] 在 `handlers.ts` 调用 `checkPolicy` 前，读取当日已用额度并注入 `context`。
- [x] 在 `sign/send` 成功后，原子更新 `dailySpent`（累加 `amount`）。
- [x] 处理并发/失败场景下的状态一致性（尽力而为或悲观锁定，视并发需求而定）。

---

## 📅 阶段二：PayFi 增量结算 (Streaming MVP)

**时间**：Week 7
**核心目标**：基于 Ledger 实现“增量释放”，不再一次性锁定全部资金。

### 2.1 `Settlement` 对象升级

- [x] 修改 `extensions/market-core/src/market/types.ts`，为 `Settlement` 增加 `releasedAmount` 和 `strategy` ("one-shot" | "metered")。
- [x] 更新 `extensions/market-core/src/market/handlers/settlement.ts`，兼容旧数据（default releasedAmount=0）。

### 2.2 增量释放逻辑 (Incremental Release)

- [x] 实现 `market.settlement.release(amount)`：支持部分金额释放。
- [x] 状态机调整：当 `releasedAmount < totalAmount` 时，保持 `active` 状态；仅当 `releasedAmount == totalAmount` 或显式 `close` 时才结束。
- [x] 链上适配：调用 `EscrowContract.release(partial)` (需确认合约支持或使用多次 release)。

### 2.3 Ledger 驱动

- [x] 在 `market.ledger.append` 后触发检查：如果累积 `cost` 达到阈值，自动触发一次 `release`。

---

## 📅 阶段三：x402 自动支付闭环 (Protocol MVP)

**时间**：Week 8
**核心目标**：实现机器对机器 (M2M) 的无感支付协议。

### 3.1 `PaymentRequired` 错误处理

- [x] 在 `web3-core` 定义 `PaymentRequiredError` (HTTP 402)。
- [x] 实现 `web3.billing.handlePaymentRequired(invoice)`：创建 `PaymentIntent` -> 检查 Policy -> 支付 -> 返回凭证。

### 3.2 Gateway Interceptor

- [x] 修改 `src/gateway/tools-invoke-http.ts`：捕获 402 响应。
- [x] 注入自动支付逻辑：
  - 检查 `WalletPolicy.autoPay` 开关。
  - 调用 `web3.billing.handlePaymentRequired`。
  - 成功后携带凭证重试工具调用。
  - 失败则抛出原始错误。

### 3.3 幂等性与熔断

- [x] 增加 `x-idempotency-key` 支持。
- [x] 设置最大重试次数（默认 1 次），防止无限循环扣款。

### 3.4 收尾项（发布前必须完成）

- [x] 将 `WalletPolicy.autoPay.maxRetries` 接入网关重试策略（与 `x-idempotency-key` 联动，缺失幂等键默认拒绝自动支付）。
- [x] 验证熔断与 kill switch（`web3.x402.autopay.enabled`）链路。
- [x] 指标与告警对齐（`x402.autopay.*`）并补齐故障注入验证。

### 3.5 任务-证据-验收映射（Phase 3）

| 任务                      | 证据（最小）                                                                                                             | 验收标准                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `maxRetries` 接入网关重试 | 自动化用例：`maxRetries=0/1/2`；网关日志含重试决策与最终状态                                                             | 同一请求不超过策略允许重试次数，且无重复扣款 |
| 幂等键强约束              | 用例：缺失 `x-idempotency-key` 时拒绝自动支付；重复请求返回同一业务结果                                                  | 自动支付链路满足“可重试不可重复扣款”         |
| 指标与告警接入            | 仪表盘/告警规则截图或导出：`x402.autopay.success.rate`、`x402.autopay.retry.count`、`x402.autopay.circuit_breaker.trips` | 指标可观测、阈值可告警、故障可定位           |
| 故障注入回归              | 演练记录：invoice 过期、链上超时、支付成功回调失败                                                                       | 故障场景均可回滚或熔断，且审计链完整         |

---

## 📅 阶段四：Week 9+ 高级推进 (Advanced)

**时间**：Week 9+
**核心目标**：从“可用的自动支付”升级到“可规模化的 Agentic PayFi”。

### 4.1 Week 9：流支付工程化（基础可用）

- [ ] **高频流支付可行性**：评估状态通道/L2 支付通道，沉淀一条可落地路径（含成本与复杂度对比）。
- [ ] **链下计量与链上释放协同**：定义 `metered` 高频记账窗口与批量释放策略，避免频繁链上拥堵。
- [ ] **验收**：完成 PoC 演示（秒级计量 + 分段释放），并形成可复现脚本。

### 4.2 Week 10：策略智能化（风险收敛）

- [ ] **动态策略引擎**：引入异常行为检测（金额突增、调用频率异常、跨链异常）并联动 `WalletPolicy`。
- [ ] **策略灰度**：支持按租户/工具/链路逐步启用动态策略，保留静态策略兜底。
- [ ] **验收**：故障注入下误拦截率/漏拦截率满足目标阈值，并可回溯决策原因。

### 4.3 Week 11+：身份与信用层（生态互认）

- [ ] **DID 集成**：将 KYA 策略与链上 DID 绑定，实现去中心化身份验证。
- [ ] **Agent 信用画像**：沉淀可验证的支付履约与争议记录，用于市场信誉加权。
- [ ] **验收**：完成 DID 绑定与一次跨主体信用验证演示。

---

## 🔬 测试矩阵（Phase 1/1.5/2/3）

### Phase 1 & 1.5 (KYA)

- **单元测试**
  - `WalletPolicy` 解析与默认值。
  - `checkPolicy` 对预算/白名单/TTL 判定。
  - `dailySpent` 状态累积与跨日重置。
- **集成测试**
  - `sign/send` 请求在策略通过时放行、拒绝时阻断。
  - 连续多笔交易触发 Daily Cap 拦截。
- **回归测试**
  - 现有 EVM/TON `create/balance/send/sign` 不被破坏。
- **故障注入**
  - 策略文件缺失/损坏时默认拒绝高风险动作。

### Phase 2 (PayFi metered incremental)

- **单元测试**
  - `releasedAmount` 单调递增。
  - 超额释放返回 `SETTLEMENT_OVER_RELEASE`。
- **集成测试**
  - `ledger.append -> settlement.release(partial)` 闭环。
  - `metered` 结算在 `ledger.append` 驱动下可完成释放。
- **回归测试**
  - `one-shot` 旧路径可用。
- **故障注入**
  - 链上 release 失败时不丢账、可重试。

### Phase 3 (x402)

- **单元测试**
  - 402 分支识别与重试决策。
  - 幂等键复用不重复扣款。
- **集成测试**
  - `402 -> handlePaymentRequired -> retry -> 200` 闭环。
- **回归测试**
  - 非付费工具调用路径性能与行为不回退。
- **故障注入**
  - invoice 过期、链上超时、支付成功但回调失败等异常链路。

---

## 🚦 灰度策略与门禁

### Feature Flags

- `web3.kya.enabled`
- `web3.payfi.metered.enabled`
- `web3.x402.autopay.enabled`

### 灰度放量顺序

1. 内部环境（dev）
2. 指定租户白名单
3. 指定工具白名单（只允许幂等工具）
4. 小流量（5%）
5. 中流量（20%）
6. 全量

### 观测指标（必须接入）

- `policy.reject.rate`
- `settlement.partial.release.count`
- `settlement.over_release.blocked.count`
- `x402.autopay.success.rate`
- `x402.autopay.retry.count`
- `x402.autopay.circuit_breaker.trips`

### 告警基线（建议默认阈值）

| 告警项             | 指标                                    | 阈值（建议）         | 动作                                               |
| ------------------ | --------------------------------------- | -------------------- | -------------------------------------------------- |
| 重复扣款告警       | `x402.autopay.duplicate_charge.count`   | 1h 内 `> 0`          | 立即关闭 `web3.x402.autopay.enabled`，进入人工审计 |
| 自动支付失败率过高 | `x402.autopay.failure.rate`             | 连续 10 分钟 `> 20%` | 停止灰度放量，保留只读调用                         |
| 熔断频繁触发       | `x402.autopay.circuit_breaker.trips`    | 30 分钟 `>= 3`       | 降低重试上限并触发根因排查                         |
| 结算异常拦截       | `settlement.over_release.blocked.count` | 任意窗口突增         | 降级 `metered -> one-shot`                         |

### 故障注入验收（发布前必跑）

- [x] **Invoice 过期**：预期返回 `PAYMENT_EXPIRED`，不发生扣款。
- [x] **链上超时**：预期触发重试上限并记录审计，不无限重试。
- [x] **支付成功但回调失败**：预期可幂等恢复，且账本与结算一致。
- [x] **幂等键缺失/冲突**：预期拒绝自动支付或返回 `IDEMPOTENCY_CONFLICT`。

### 熔断条件

- 单小时重复扣款告警 > 0：立即熔断 `web3.x402.autopay.enabled`。
- 自动支付失败率连续 10 分钟 > 20%：停止放量。
- 结算超额释放拦截异常：降级到 `one-shot`。

---

## 📝 验收标准 (DoD) — 可勾选

### Phase 0 (技术评审)

- [x] 完成《技术选型与架构评审报告》（`skills/web3-market/references/WEB3_TECH_STACK_REVIEW.md`）。
- [x] 确认 Off-chain Policy 路线的必要性（双栈适配 + 零 Gas 风控）。
- [x] 确认 x402 头部标准对齐（OpenClaw-PayFi / L402 语义）。

### Phase 1 (KYA)

- [x] 接口文档与实现一致（`WalletPolicy`, `PolicyDecision`）。
- [x] `sign/send` 已接入策略拦截。
- [x] 拒绝原因具备结构化 reason code。
- [x] 单测/集成/回归全部通过。

### Phase 1.5 (State Persistence)

- [x] Daily Cap 状态存储已落地。
- [x] 连续交易测试验证 Daily Cap 生效。

### Phase 2 (PayFi)

- [x] `Settlement` 新字段 `releasedAmount/strategy` 已落地且兼容旧数据。
- [x] 支持 partial release，且累计释放不超额。
- [x] `metered` 异常可降级 `one-shot`。
- [ ] 单测/集成/回归全部通过。

### Phase 3 (x402)

- [x] Gateway 可识别 402 并受控触发自动支付。
- [x] 自动支付严格受 `WalletPolicy` 约束。
- [x] 幂等键生效，重复请求不重复扣款。
- [x] 熔断与 kill switch 验证通过。

### 发布前总门禁

- [x] 三份文档（架构/计划/进度）术语一致（以 `WEB3_DEV_PLAN_PAYFI.md` 为主口径）。
- [x] 关键日志与指标可观测（至少覆盖 `x402.autopay.*` 与 `settlement.*` 关键指标）。
- [ ] 回滚演练（关闭 `web3.x402.autopay.enabled`、降级 `metered -> one-shot`）通过。
- [ ] 发布说明包含风险与回滚步骤。

### 门禁证据索引（发布评审必填）

- [x] **术语一致性映射表**：架构/计划/进度文档中的术语与状态映射结果。
- [x] **观测证据包**：仪表盘链接、告警规则、最近一次演练日志。
- [ ] **回滚演练记录**：演练时间、步骤、结果、恢复确认。
- [ ] **发布说明草案**：风险、熔断条件、回滚触发条件、负责人。

### 回滚演练模板（建议直接复用）

| 字段         | 内容                                                         |
| ------------ | ------------------------------------------------------------ |
| 演练编号     | `PAYFI-ROLLBACK-YYYYMMDD-01`                                 |
| 触发条件     | 例如：`x402.autopay.failure.rate > 20% (10min)`              |
| 执行动作     | 1) 关闭 `web3.x402.autopay.enabled` 2) `metered -> one-shot` |
| 预期结果     | 自动支付停止，交易链路可降级可用，无新增重复扣款             |
| 实际结果     | （填写）                                                     |
| 审计证据     | 日志片段、指标截图、告警记录                                 |
| 责任人与确认 | oncall / reviewer / 发布时间戳                               |
