# OpenClaw Web3 Market 上线准入评审（深度核实版 v2.3）

> **评审日期**: 2026-03-03（v2.2 安全修复完成版）  
> **评审对象**: 私有化 AI 管家自由市场（Web3 Market）  
> **评审口径**: 代码事实优先（A）> 主计划门禁（A）> 既有评估文档（B）> 外部竞品信息（C）  
> **v2 变更**: 增加安全深度审计、并发安全分析、测试覆盖盲区扫描、竞品生态更新。  
> **v2.1 变更**: 同步 `git pull d794482b4` 后代码，修正 §6.2（autopay maxRetries 硬上限已确认在调用层存在），补充 x402 安全闭环正面证据。  
> **v2.2 变更**: §6.1 Settlement TOCTOU 已修复（per-orderId 互斥锁 + 事务内乐观重校验），§6.3 escrow-ton 错误处理已修复（结构化 TonError + 指数退避重试 + 超时 + 幂等 queryId）。**3 个原始安全阻断项已全部修复**，Beta 前置条件清零。
> **v2.3 变更**: 落地《`WEB3_SETTLEMENT_BEST_PRACTICE_PLAN_2026_03_03.md`》，并执行第一阶段工程化加固：TON 侧确认等待与真实超时、Settlement 强 CAS（status+releasedAmount+revision）、结算操作日志与补偿 poller 骨架、请求级幂等键接入（lock/release/refund）。

---

## 0. 执行摘要（结论先行）

- **AI 管家能否"畅游"**：**条件成立，安全阻断项已全部修复**。  
  已具备租约、结算、索引、审计、钱包统一入口等核心基础设施；x402 autopay 安全闭环已完善；settlement 并发安全（TOCTOU）已通过 per-orderId 互斥锁 + 事务内乐观重校验修复；escrow-ton 已增加结构化错误 + 指数退避重试 + 超时保护 + 幂等 queryId。
- **是否可上线**：**Conditional Go（Public Beta）→ 安全修复前置条件已清零**（原报告 3 个阻断项已全部修复）。  
  不支持"无条件上线/GA 就绪"表述（GA 仍需闭合运营门禁）。
- **为何不是 No-Go**：交易与安全主链路架构已成立，且双栈（EVM+TON）执行路径可证实；x402 autopay 安全体系已达生产基线；settlement 并发安全已修复。
- **为何不是 Unconditional Go**：
  1. `WEB3_DEV_PLAN_PAYFI.md` 仍存在未闭合门禁（runbook、回滚演练、灰度复盘、发布说明等）；
  2. Dispute handler 零测试覆盖、Phase 2 DoD 自评未达标。

---

## 1. 三层判定（已证实 / 条件成立 / 未证实）

### 1.1 已证实（A 级证据）

1. `web3.wallet.*` 已完成网关注册与能力目录声明。
2. Discovery 已有 `libp2p` backend、服务启动、周期 `publish/discover` 与 static fallback。
3. TON+EVM 结算适配已落地（统一 `Escrow` 工厂分发，TON Provider 可执行）。
4. `web3.capabilities` 与 ENS 相关条目存在，可用于能力自描述。
5. x402 autopay 端到端测试覆盖充分（Gateway 18+ 用例 + Billing 9 用例 + Metrics 3 用例 + Router 7 用例），Phase 3 DoD 全部通过。
6. EVM/TON autopay 双路径架构清晰，`autopay-router.ts` 正确分发，双路径均有独立实现和测试。
7. **x402 支付安全完整闭环已实现**（v2.1 核实新增）：
   - 签名令牌 v2（tokenVersion=2 + nonce + HMAC-SHA256 + timing-safe compare）防伪造
   - `consumePaymentRequired` 一次性消费防重放（`consumedAt` 标记）
   - Gateway 层 `Math.min(1, ...)` 硬上限防恶意注入无限重试
   - 生产基线校验（`validateAgentWalletProductionBaseline`）在 `NODE_ENV=production` 下强制 policy caps
   - Health guard 滑窗降级 + 冷却自恢复（非全量累计）
   - 幂等记录 TTL + 容量上限治理（24h TTL + 500 条硬上限 + 懒清理）
8. **x402 可观测性体系已实现**（v2.1 核实新增）：`web3.metrics.recordX402Autopay` + `web3.metrics.snapshot` 含 alerts 阈值判定。
9. **`/web3-market enable ok` 一键启用已实现**（v2.1 核实新增）：含 agent-wallet policy 默认基线注入。
10. Consent/Revocation 授权撤销闭环代码完整（含 webhook + HMAC 签名 + 重试队列）。
11. Delivery handler Issue/Complete/Revoke 三路径功能完整。
12. Dispute handler 6 个路径功能完整（open/evidence/resolve/reject/get/list），支持 release/refund/partial 三种解决方案。

> 对应证据见：`WEB3_LAUNCH_READINESS_EVIDENCE_MATRIX_2026_03_03.md`

### 1.2 条件成立（需满足前提）

1. "AI 管家可畅游"成立前提：Discovery P0/P1 验收项完成，且回退策略演练通过。
2. "可持续运营"成立前提：值班 runbook、灰度复盘、发布说明与回滚演练形成闭环。
3. ~~**"安全可控"成立前提**：§6 中 2 个高危/严重级问题修复并通过验证~~ → **已满足**（v2.2：§6.1 + §6.3 均已修复，3 个原始安全阻断项全部清零）。

### 1.3 未证实（需降级或修复）

1. "无条件批准上线（GA）"——未证实。
2. "discovery 尚未落地 libp2p"——表述失真（实际已落地基础实现，应改为"已实现，未完成生产门禁闭合"）。
3. 竞品对比中的强确定性结论——证据等级不足时应降级为"趋势观察"。
4. ~~**"结算并发安全"——未证实**~~ → **已证实**（v2.2 修复：per-orderId 互斥锁 + 事务内乐观重校验，见 §6.1）。
5. ~~**"autopay 防恶意注入"——未证实**~~ → **已证实**（v2.1 核实：L804 `Math.min(1, ...)` 硬上限有效，从"未证实"提升为"已证实"）。

---

## 2. 上线门禁核对（与主计划一致）

基准：`skills/web3-market/internal/WEB3_DEV_PLAN_PAYFI.md`

### 2.1 已满足（可支持 Beta）

- 钱包统一入口与能力目录（`web3.wallet.*`）已完成。
- x402 自动支付核心闭环已完成（含幂等与熔断关键项）。
- 结算增量释放核心逻辑与双栈执行链路已具备。

### 2.2 未闭合（阻断 GA）

- Discovery P0/P1 多项未勾选。
- GA Readiness 多项未勾选（runbook、灰度复盘等）。
- 发布前门禁未闭合（回滚演练、发布说明草案）。
- **Phase 2 (PayFi) DoD "单测/集成/回归全部通过" 未勾选**（团队自评未达标）。

**门禁判定**：

- **Beta**：可进入（Conditional Go）——**安全修复前置条件已全部清零**（§6.1 + §6.2 + §6.3 均已修复）
- **GA**：不可进入（No-Go for GA）

---

## 3. 竞品与技术方向（深度调研补充版）

### 3.1 x402 协议生态（A/B 级证据——开源可验证）

**重要发现**：Coinbase 主导的 **x402 开放协议**（[github.com/coinbase/x402](https://github.com/coinbase/x402)，594+ commits，327 个公开生态项目）已成为 AI Agent 机器对机器支付的事实标准。

- **协议定义**：x402 利用 HTTP 402 状态码，定义 Client/Server/Facilitator 三方角色，支持多链（EVM + Aptos + Solana）和多形式价值（稳定币/Token/法币）。
- **OpenClaw 对齐度**：OpenClaw 的 `web3.billing.handlePaymentRequired` + Gateway 402 拦截 + autopay 链路**已对齐 x402 核心语义**（invoice → 检查策略 → 支付 → 凭证重试）。这是正面信号——我们的实现与行业主流方向一致。
- **差异点**：x402 原生聚焦 EVM 稳定币，OpenClaw 额外支持 **TON 链路**，在 Telegram 生态有差异化优势。
- **风险点**：x402 生态快速壮大（2026 年 2 月已有 Aptos/Solana/PEAC Protocol 等多链接入），OpenClaw 若长期独立演进可能与标准偏离。建议关注并保持 invoice 格式兼容。

### 3.2 Microsoft Magentic Marketplace（B 级证据——公开新闻）

2025 年 11 月微软发布 **Magentic Marketplace**（开源 AI Agent 市场仿真平台）：

- 100 个 customer-agent 与 300 个 business-agent 交互的合成市场。
- 聚焦"Agent 行为研究"而非"可部署的交易基础设施"。
- **与 OpenClaw 定位互补**：Magentic 是仿真框架，OpenClaw 是可部署的交易运行时。

### 3.3 去中心化 AI 项目（B/C 级证据）

| 项目            | 侧重                                | 与 OpenClaw 差异                           | 证据等级 |
| --------------- | ----------------------------------- | ------------------------------------------ | -------- |
| **Bittensor**   | 算力/模型评估的挖矿激励（子网模式） | 底层共识层 vs 应用层交易闭环               | B        |
| **Morpheus AI** | 计算市场 + 智能 Agent 路由          | 更偏通用计算 vs OpenClaw 聚焦 API 服务交付 | C        |
| **Autonolas**   | 自主 Agent 组件注册与服务发现       | 组件级复用 vs OpenClaw 的服务级租约        | C        |

> **口径约束**：以上竞品信息为趋势观察，不作为上线硬门禁证据。C 级结论可能不准确。

### 3.4 高置信战略结论

1. **OpenClaw 的差异化**在"应用层交易闭环"（lease + ledger + audit + 双栈结算 + x402 对齐），而非底层共识创新。这是**正确的卡位**——避开红海。
2. **TON 双栈**是独特优势——竞品大多绑定 EVM 或 Polkadot，Telegram 8 亿用户的支付入口是差异化护城河。
3. **x402 对齐**是及时且正确的方向——行业正在收敛到 HTTP 402 支付语义，OpenClaw 已在正确赛道上。

---

## 4. 测试覆盖深度审计（v2 新增）

### 4.1 测试覆盖盲区

| 模块                                  | 测试状态                                         | 风险等级 | 行动项                                                                      |
| ------------------------------------- | ------------------------------------------------ | -------- | --------------------------------------------------------------------------- |
| **Dispute handler**（6 路径，518 行） | **零专项测试**                                   | **P1**   | 必须补充：open/evidence/resolve/reject/get/list + 权限校验 + 状态机非法转换 |
| **Consent revoke 级联**               | 仅有基础测试，revoke→delivery→webhook 级联无覆盖 | P2       | 建议补充端到端 revoke 级联测试                                              |
| **Delivery handler**                  | 无独立测试文件                                   | P2       | 建议补充 issue/complete/revoke 三路径测试                                   |
| **Metered settlement**                | 7 个端到端用例，但 **Phase 2 DoD 自评未达标**    | **P1**   | 补充链上 release 失败重试/回滚测试，使 DoD 可勾选                           |
| **x402 autopay**                      | 覆盖充分（20+ 用例），Phase 3 DoD 全通过         | P2       | 良好，仅缺真实链上集成（mock 层以下），属正常做法                           |

### 4.2 测试矩阵一致性

评审中声称"x402 核心闭环已完成（含幂等与熔断关键项）"——**已证实**，测试证据充分。  
评审中声称"结算增量释放核心逻辑已具备"——**已证实**（v2.2：核心逻辑有，并发安全已修复，新增 settlement-lock + settlement + escrow-ton 共 20 个测试用例）。

---

## 5. 功能完整性深度审计（v2 新增）

### 5.1 市场交易全链路覆盖度

| 环节                         | 代码完整性                        | 测试完整性             | 综合评定       |
| ---------------------------- | --------------------------------- | ---------------------- | -------------- |
| **Offer/Order**（发布/下单） | 完整                              | 有基础覆盖             | 良好           |
| **Consent**（授权）          | 完整（含签名验证）                | 有基础覆盖             | 良好           |
| **Settlement**（结算）       | 完整（one-shot + metered + 双栈） | 核心路径有，边界条件缺 | 中等           |
| **Delivery**（交付）         | 完整                              | 薄弱                   | 需加强         |
| **Dispute**（争议）          | 完整（6 handler）                 | **零覆盖**             | **需紧急补充** |
| **Revocation**（撤销）       | 完整（含 webhook + 重试）         | 有基础覆盖             | 中等           |

### 5.2 EVM/TON 双栈对称性

| 能力                            | EVM               | TON                                      | 对齐度                                                                         |
| ------------------------------- | ----------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| Wallet create/balance/sign/send | 有                | 有                                       | 对齐                                                                           |
| Autopay                         | 有（handlers.ts） | 有（ton-handlers.ts）                    | 对齐，命名不对称（无 evm-handlers.ts）但不影响功能                             |
| Escrow lock/release/refund      | 有                | 有（escrow-ton.ts）                      | 对齐（v2.2：TON 侧已增加结构化 TonError + 指数退避重试 + 超时 + 幂等 queryId） |
| 交易确认等待                    | 待验证            | **缺失**（直接 return txHash，不等确认） | 不对齐——需修复（GA 前）                                                        |

---

## 6. 安全深度审计（v2 新增——Beta 前阻断项）

### 6.1 ~~【严重】Settlement 并发超额释放（TOCTOU）~~ → **已修复（v2.2）**

**文件**：`extensions/market-core/src/market/handlers/settlement.ts` + 新增 `settlement-lock.ts`  
**原问题**：`releaseSettlementIncremental` 的 read-check-execute-write 流程**不在同一事务/锁内**。

**修复方案（双层防护）**：

1. **Per-orderId 互斥锁**（`settlement-lock.ts` → `withSettlementLock`）：
   - 对同一 `orderId` 的所有结算操作（lock/release/refund）进行进程级 FIFO 串行化
   - 不同 `orderId` 完全并行，无全局瓶颈
   - `releaseSettlementIncremental`、`createSettlementLockHandler`、`createSettlementRefundHandler` 三个入口均已包裹

2. **事务内乐观重校验（Defense in Depth）**：
   - 在 `store.runInTransaction()` 回调中重新读取 settlement 状态
   - 比较 `freshReleased !== priorReleased`，不一致则抛出 `E_CONFLICT: SETTLEMENT_CONCURRENT_MODIFICATION`
   - 即使互斥锁被绕过（多进程/集群部署），此层亦能拦截

3. **测试覆盖**：
   - `settlement-lock.test.ts`（4 用例）：同 orderId 串行、异 orderId 并行、错误后释放锁、FIFO 顺序
   - `settlement.test.ts`（6 用例）：并发释放串行化、计量释放 happy path、全额释放后幂等拦截、并发 lock 串行化、并发 release+refund 串行化

**风险等级**：~~CRITICAL~~ → **已修复**

### 6.2 ~~【高危】autopay maxRetries 无代码层硬上限~~ → **已修复（v2.1 核实）**

**文件**：`src/gateway/tools-invoke-http.ts` L804  
**原问题**：v2 评审指出 `resolveAutoPayMaxRetries()` 无硬上限。  
**实际状态**：调用层已有 `Math.min(1, resolveAutoPayMaxRetries(...))` 硬上限（L804），无论 402 响应注入多大的 `maxRetries` 值，实际重试最多 **1 次**。此外 `resolveX402AutopayConfig` 中 `maxRetries` 默认值为 `1`，与硬上限一致。

**结论**：此问题**不成立**，从 Beta 阻断项中移除。

> 注：`resolveAutoPayMaxRetries` 函数本身确实不含内部上限，但调用处的 `Math.min(1, ...)` 是最终执行路径，安全有效。

### 6.3 ~~【高危】escrow-ton 链上/DB 非原子性~~ → **已修复（v2.2，Beta 短期项全部完成）**

**文件**：`extensions/market-core/src/market/escrow-ton.ts`（重写）  
**原问题**：lock/release/refund 三方法无 try/catch、无重试、无超时、queryId 硬编码 `0n`。

**修复方案**：

1. **结构化错误处理**：所有异常统一包装为 `TonError`（from `@openclaw/blockchain-adapter`），携带 `ErrorCode`（`CONNECTION_FAILED`/`TRANSACTION_FAILED`/`TIMEOUT` 等）和原始错误链。

2. **指数退避重试**（`withRetry` 函数）：
   - 默认最多 2 次重试（`DEFAULT_MAX_RETRIES=2`）
   - 基础延迟 1s，最大延迟 8s，带随机抖动
   - `isRetryable(err)` 智能判断：timeout / ECONNRESET / rate limit / 503 等瞬时故障可重试；permanent error 立即失败
   - 每次尝试均有 30s `AbortController` 超时保护

3. **幂等 queryId**：
   - lock/refund：`deterministicQueryId(orderId)` — SHA-256(orderId) → 前 8 字节作为 BigUInt64BE，保证同一 orderId 多次调用产生相同 queryId（链上幂等）
   - release：随机 queryId（nonce），因增量释放每次金额不同，需签名域分离

4. **测试覆盖**（`escrow-ton.test.ts`，10 用例全部通过）：
   - happy path lock/release/refund、瞬时故障重试成功、永久错误快速失败、重试耗尽、payees 数量校验、确定性 queryId 验证、缺失 mnemonic/contract 错误

**遗留项（GA 前）**：

- tx receipt 确认等待（TON finality 1-2 区块）
- 中期 outbox 模式（先写"待释放"状态 → 链上调用 → 更新最终状态）

**风险等级**：~~HIGH~~ → **已修复**（Beta 短期修复项全部完成，GA 遗留项已明确）

### 6.4 【中危】libp2p discovery 生产硬化

**文件**：`extensions/web3-core/src/discovery/backend-libp2p.ts`  
**问题**：

- 无消息大小限制（DHT record 可被恶意 peer 注入超大 payload）
- 无 peer 黑名单/白名单（DHT clientMode 降低了风险但不消除）
- 缓存过期条目只跳过不删除（内存泄漏风险）
- 无 `minConnections` 配置（低连接数时无自动恢复）

**正面**：连接数上限 `maxConnections: 50` 已配置；错误处理完善（所有异步操作有 try/catch）；优雅关闭完整（unregister → stop → clear）。

**风险等级**：**MEDIUM（Beta 可接受，GA 前必须硬化）**

---

## 7. 最终判定与发布建议（v2 修订）

### 7.1 最终判定

- **上线结论**：`Conditional Go (Public Beta)` — **安全修复前置条件已全部清零**（§6.1 + §6.2 + §6.3 均已修复）
- **禁用表述**：`Unconditional Go`、`GA Ready`（GA 仍需闭合运营门禁）
- **可用表述**：`安全基线已达标`、`有护栏的畅游`

### 7.2 Beta 前必须完成（Hard Blocker）

| #     | 问题                           | 修复复杂度                       | 文件                       | 状态                                                                     |
| ----- | ------------------------------ | -------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| ~~1~~ | ~~Settlement TOCTOU 并发安全~~ | ~~中（事务范围扩大 or 乐观锁）~~ | ~~`settlement.ts`~~        | **已修复**（v2.2：per-orderId 互斥锁 + 事务内乐观重校验）                |
| ~~2~~ | ~~autopay maxRetries 硬上限~~  | ~~低（一行 Math.min）~~          | ~~`tools-invoke-http.ts`~~ | **已修复**（v2.1：L804 `Math.min(1, ...)`）                              |
| ~~3~~ | ~~escrow-ton 错误处理与重试~~  | ~~中（try/catch + retry）~~      | ~~`escrow-ton.ts`~~        | **已修复**（v2.2：结构化 TonError + 指数退避重试 + 超时 + 幂等 queryId） |

### 7.3 Beta 期间须完成（Soft Blocker for GA）

| #   | 问题                                      | 文件                                  |
| --- | ----------------------------------------- | ------------------------------------- |
| 4   | Dispute handler 补充测试覆盖              | `dispute.ts` → 新增 `dispute.test.ts` |
| 5   | Phase 2 DoD "单测/集成/回归全部通过" 闭合 | settlement 相关测试补齐               |
| 6   | libp2p 消息大小限制 + 缓存清理            | `backend-libp2p.ts`                   |
| 7   | Discovery P0/P1 全项闭合                  | 按主计划推进                          |
| 8   | Runbook/回滚演练/灰度复盘/发布说明        | 运营文档                              |

### 7.4 必须附带的上线声明

1. 当前结论以代码事实与主计划门禁为准，不以外部竞品结论作为放行依据。
2. Discovery 已有实现，但仍处于"能力已具备、门禁待闭合"阶段。
3. ~~§6 中 3 个 Hard Blocker 修复并通过验证后，方可进入 Public Beta。~~ → **已满足**（v2.2：3 个 Hard Blocker 全部已修复并通过测试验证）。
4. 满足 §7.3 全部项后，方可进入 GA 复审。

### 7.5 最优方案执行进度（v2.3）

- **P0（已执行）**：
  - TON 侧确认等待 + 真实超时（`waitForTransaction` + `Promise.race`）
  - Settlement 强 CAS（`status + releasedAmount + revision`）
  - 错误码归一（`TonError.code` 主字段可判定）
- **P1（已落地基础设施）**：
  - `settlement_operations` 操作日志（SQLite/File 双存储）
  - `market-settlement-poller` 服务注册与重试/补偿框架
- **P2（已落地入口层）**：
  - lock/release/refund 接入 `idempotencyKey`（请求级幂等）
  - 证据链同步到本评审与证据矩阵

---

## 8. 竞品对标速查表（v2 更新）

| 维度         | OpenClaw Web3 Market       | x402 (Coinbase)       | Bittensor         | Morpheus AI           | Microsoft Magentic |
| ------------ | -------------------------- | --------------------- | ----------------- | --------------------- | ------------------ |
| **定位**     | 可部署的 AI 服务交易运行时 | HTTP 402 支付协议标准 | 算力/模型评估挖矿 | 计算市场 + Agent 路由 | Agent 行为仿真研究 |
| **支付**     | 双栈 EVM+TON               | 多链 EVM+Aptos+Solana | TAO 代币激励      | MOR 代币              | 无（仿真）         |
| **发现**     | libp2p + static fallback   | N/A（无发现层）       | 子网内路由        | DeFi 路由             | 合成市场内         |
| **结算**     | Escrow + metered release   | Facilitator 验证      | 共识验证          | 智能合约              | 无                 |
| **上线状态** | Conditional Beta           | 生产可用              | 主网运行          | 测试网                | 开源仿真           |
| **证据等级** | A（代码可验证）            | A（开源+文档）        | B                 | C                     | B                  |

---

## 9. 一句话结论（给决策层，v2 修订）

**3 个安全阻断项已全部修复（§6.1 settlement TOCTOU per-orderId 互斥锁 + 乐观重校验，§6.2 autopay maxRetries `Math.min(1, ...)`，§6.3 escrow-ton 结构化 TonError + 指数退避重试 + 超时 + 幂等 queryId），安全前置条件清零，可上线 Beta。不能宣称 GA（运营门禁未闭合）；可以说"安全基线已达标的有护栏畅游"，不能说"无条件畅游"。x402 支付安全闭环 + settlement 并发安全 + escrow-ton 容错重试是三大正面工程信号。与 x402 行业标准对齐，TON 双栈是差异化护城河。**
