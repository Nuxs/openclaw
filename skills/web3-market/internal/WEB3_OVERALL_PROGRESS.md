# OpenClaw Web3 Market：整体进度口径（可验证）

> **状态**：Draft（以严格评审为准：受控内测 Conditional Go，GA 待复评）  
> **更新日期**：2026-03-04  
> **适用范围**：Web3 Market（资源/能力市场 + AI 管家编排）

本文档用于解决一个问题：当我们说"Web3 Market 已做到哪里"，**到底哪些是已实现、可演示、可验收的事实**，哪些仍是规划。

---

## 1. 口径原则

- **对外单入口**：用户/看板/Agent 只依赖 `web3.*`；`market.*` 作为内部权威状态面。
- **默认可分享输出**：任何可外发面（文档示例/日志/状态输出/工具返回）默认脱敏，不包含明文 token、Provider endpoint、真实路径。
- **以代码为准**：本页只写"已能在代码里验证"的能力；规划内容必须标注为"计划"。
- **上线口径**：P0 阻断项已清零，当前以严格评审结论为准（受控内测 Conditional Go，GA 待复评）；后续转绿需满足 `WEB3_DEV_PLAN_PAYFI.md` 的门禁清零。
- **核实依据**：`WEB3_LAUNCH_READINESS_EVALUATION_2026_03_03.md`（v2.2 安全修复完成版）与 `WEB3_LAUNCH_READINESS_EVIDENCE_MATRIX_2026_03_03.md`（v2.2）。

---

## 1.1 严格上线评审快照（2026-03-03）

- 评审报告：`skills/web3-market/internal/WEB3_MARKET_GO_LIVE_REVIEW_2026-03.md`
- 当前判定：**受控内测 Conditional Go**（GA 仍待复评）。
- 本轮已闭环：
  - `market.order.list` / `market.settlement.query` 已补齐并注册；
  - `market-assistant` 已接入命令运行面并收口无效调用；
  - `web3-market` 与 `/pay_status` 命令异常出口已统一稳定错误码。
- 说明：本页维持“能力进度事实”口径；最终上线结论以严格评审报告为准。

---

## 2. 已实现（当前仓库可验证）

### 2.1 插件与看板

- **Web3 插件**：`web3-core`（对外 `web3.*` 编排、审计/归档/锚定/配额等）。
- **Market 插件**：`market-core`（内部权威：资源共享 Resource/Lease/Ledger + 交易结算 Offer/Order/Settlement/Consent/Delivery + Dispute 等）。
- **UI 看板**：UI 内已有 Web3 Tab（身份/计费/审计/市场一屏概览）与 Market 视图，并通过 Gateway RPC 拉取 `web3.status.summary` / `web3.billing.summary` / `web3.market.status.summary` / `web3.index.*` / `web3.monitor.snapshot` / `web3.market.dispute.*` 等数据展示健康状态与概览。
- **一页式入口**：`/web3` 命令输出一页式仪表盘，可作为排障与快速分享入口。

### 2.2 资源共享（B-2：Resource/Lease/Ledger）

- **资源发布与租用**：存在 `market.resource.*`、`market.lease.*` 权威方法，且 `web3-core` 提供 `web3.resources.*` 及 `web3.market.*` 编排/代理入口。
- **一次性 token 约束**：租约签发响应允许返回明文 token（仅一次）；调用面鉴权执行强一致拒绝（含 lease 状态、过期、resource published 校验）。
- **发现索引脱敏**：`web3.index.list` 输出会对 endpoint 等敏感字段做脱敏，并对索引条目执行消费侧验签。

### 2.3 争议（Dispute）

- `market.dispute.*` 与 `web3.market.dispute.*` 已存在，可用于列出/查询/处理争议对象（证据应以 hash/引用形式存放，避免敏感信息外泄）。

### 2.4 双栈支付类型定义（2026-02-23 走查新增）

- **ChainNetwork 扩展**：`market-core/config.ts` 的 `ChainNetwork` 类型已增加 `"ton-mainnet" | "ton-testnet"`，与 `blockchain-adapter` 的 TON Provider 对齐。
- **7 个双栈统一类型**：`market-core/types.ts` 已定义 `PaymentChain` / `PaymentMode` / `PaymentIntent` / `PaymentReceipt` / `FXQuote` / `PayoutPreference` / `ReconciliationSummary`，并从 `market-core/index.ts` re-export 供跨插件消费。
- **类型共享对齐**：`web3-core/market/handlers.ts` 已移除本地 `ReconciliationPaymentReceipt` / `ReconciliationSummary` / `ReconciliationDisputeSummary`，改为从 `@openclaw/market-core` 导入共享类型（通过 tsconfig paths 解析）。
- **ReconciliationSummary 超集**：market-core 的 `ReconciliationSummary` 已扩展为超集，包含 settlement 的 `lockedAt/releasedAt/refundedAt`、archiveReceipt 的 `updatedAt`、anchorReceipt 的 `block/updatedAt`。

### 2.5 能力自描述 Catalog（2026-02-23 走查补全）

- **覆盖率 100%**：67 个注册 gateway method + 12 个 tool 全部有 catalog descriptor（ENS 方法 `web3.identity.resolveEns` / `web3.identity.reverseEns` 已补齐）。
- **幽灵条目 0**：catalog 中不存在未注册的 method。

### 2.6 测试覆盖（2026-02-23 走查新增）

- **market-core 新增测试**：bridge handler（13 tests）、token-economy handler（13 tests）、transparency handler（9 tests）、repair handler（4 tests）。
- **web3-core 新增测试**：`market/handlers.test.ts`（reconciliation summary，5 tests）、`capabilities/catalog.test.ts`（completeness/structure/findWeb3Capability，10 tests）。

### 2.7 TON 双栈运行时基础设施（2026-02-23 新增）

- **TON Escrow Adapter**：`market-core/src/market/escrow-ton.ts` — `TonEscrowAdapter` 类，与 EVM `EscrowAdapter` 同接口（lock/release/refund），通过 `blockchain-adapter` 的 TON Provider 与 settlement.fc 合约交互。
- **统一 Escrow 工厂**：`market-core/src/market/escrow-factory.ts` — `createEscrowAdapter()` 根据 `chain.network` 自动选择 EVM 或 TON 适配器，定义 `IEscrowAdapter` 统一接口。
- **Agent Wallet TON 支持**：`agent-wallet/src/config.ts` 新增 `"ton-mainnet" | "ton-testnet"` 网络 + `isEVMNetwork()`/`isTONNetwork()` 判断；`ton-handlers.ts` 实现 TON 侧 create/balance/send handler；`index.ts` 根据链配置自动分发到 EVM 或 TON handler。

### 2.8 TON 端到端结算（Headless）（2026-02-24 完成）

- **合约部署**：补齐 `settlement.fc` 的编译/部署链路与可复制命令。
- **钱包与派生**：集成 `@ton/crypto` 用于助记词派生与地址生成。
- **BOC/payload 与发送**：补齐 payload 编码（base64 BOC）并支持通过 TON provider 发送。
- **验收指南**：`docs/web3/TON_E2E_SETTLEMENT.md`

### 2.9 UI 类型对齐（2026-03-02 完成）

- **UI Overlay 同步**：`ui/src/ui/types-web3.ts` 已补齐 `PaymentIntent`/`PaymentReceipt`/`FXQuote`/`PayoutPreference`/`ReconciliationSummary`，消除前后端契约 GAP。

### 2.10 Settlement 最优方案执行（2026-03-03 v2.3）

- **P0 已执行**：TON 确认等待 + 真实超时、Settlement 强 CAS（`status+releasedAmount+revision`）、错误码归一。
- **P1 基础设施已落地**：`settlement_operations`（SQLite/File）+ `market-settlement-poller`。
- **P2 入口已接入**：lock/release/refund 的 `idempotencyKey`。

---

## 3. PayFi Agentic Commerce（按主计划推进）

### 3.1 当前实施状态（以主计划勾选为准）

> 主计划：`skills/web3-market/internal/WEB3_DEV_PLAN_PAYFI.md`  
> 架构口径：`skills/web3-market/references/WEB3_PAYFI_AGENTIC_ARCH.md`

- **KYA (Know Your Agent)**：✅ 核心能力已落地（策略拦截 + 状态持久化）。
- **PayFi (Streaming Settlement / Incremental Release)**：✅ 核心能力已落地（`releasedAmount/strategy` + 部分释放 + Ledger 驱动）；测试全量门禁仍在收尾。
- **x402 (Auto-Pay Loop)**：✅ 核心闭环与收尾项已完成（402 捕获、自动支付、策略驱动重试、幂等键强约束、故障注入验证）；发布文档门禁仍有待补齐项。

#### 3.1.1 治理就绪状态（2026-03-03）

- **技术评审**：✅ 已完成（`references/WEB3_TECH_STACK_REVIEW.md`）。
- **文档治理**：🟡 进行中（已形成架构/计划/进度三层文档，术语与状态正在统一到主计划口径）。
- **代码实现**：🟡 进行中（核心路径已具备，发布门禁项尚未全部闭合）。
- **执行口径**：`WEB3_DEV_PLAN_PAYFI.md` 为单一执行真相源；其余文档同步对齐。

#### 3.1.2 阻断分级结论（严格审计）

- **不阻断当前能力迭代**：Week3-5 已完成能力可继续迭代与优化。
- **阻断新能力全量上线**：以下任一未完成即阻断全量：
  1. 发布前回滚演练记录
  2. 发布说明草案（风险/熔断/回滚）
- **上线前硬门禁**：必须满足 `WEB3_DEV_PLAN_PAYFI.md` 的 DoD、灰度门禁与证据索引。

### 3.2 其他规划

- **个人数据/私有知识纳入市场**：✅ 工业级已实现——consent/脱敏/可撤销/合规回放/删除保留策略强约束规范已落地。
  - `privacy-replay.ts`：`hashReplaySummary()` 使用 SHA-256（via `hashCanonical`）、`deriveRetentionAction()` 自动推导保留策略、`buildPrivacyReplaySummary()` 生成脱敏摘要。
  - `handlers/privacy.ts`：consent 查询（scope-aware）、知识资产聚合、回放生成（事务安全 + hash 验证）、删除执行（事务包裹 consent 保存 + replay 擦除）。
  - AI 助手：`handleQueryConsents`（含 erased/active/revoked 分类、scope 用途展示）、`handleGenerateReplay`（含 replayHash）、`handleEraseData`（含 replayCount 和 erasedAt）。
- **任务市场协议（Phase 3）**：✅ 工业级已实现——`TaskOrder`/`TaskBid`/`TaskResult`/`TaskReceipt` 全生命周期闭环。
  - 权威层（`market-core`）：状态机守卫（`task-state-machine.ts`）、事务保护（`store.runInTransaction()`）、审计锚定（`recordAuditWithAnchor()`）。
  - handler 层：`task-order.ts`（发布/查询/取消/过期清扫，事务包裹写操作）、`task-bid.ts`（竞标/撤回/授标，联动 Order + Settlement lock）、`task-result.ts`（交付/验收，接受触发结算释放+回执生成，拒绝触发争议创建，事务包裹写操作）、`privacy.ts`（SHA-256 哈希替代 hex、事务包裹擦除）。
  - 编排层（`web3-core`）：`market-status.ts` 新增 `tasks`（TaskMarketSummary）+ `privacy`（PrivacyConsentSummary）聚合字段，始终探测（非仅 deep 模式），格式化输出含任务/隐私摘要行。
  - 助手层（`MarketAssistant`）：5 个任务 handler（publish/query/bid/submit/review）+ 3 个隐私 handler（queryConsents/generateReplay/eraseData）+ 2 个运营 handler（opsStatus/alerts），全部使用 `paste-safe.ts` 脱敏输出。
  - UI 层：`types-web3.ts` 已有完整视图模型，`controllers/market-status.ts` 已实现 `loadMarketTasks`/`loadMarketPrivacy`/`loadMarketOps` 懒加载器，`views/` 下已有任务/隐私/运营三个独立区块。
- **Agent Wallet 统一入口**：✅ 已完成 `web3.wallet.*` 聚合入口与 capabilities catalog 注册，并补齐 proxy 单测。

---

## 4. 下一步

### 4.1 MDL（Market Discovery Layer）— ⏳ 执行中（与主计划对齐）

- **目标**：按 `WEB3_DEV_PLAN_PAYFI.md` v1.4 对齐，仅维护 Discovery **P0/P1**（我方接入与集成面），保障 PayFi 与 Discovery 并行推进。
- **实施计划**：`skills/web3-market/references/web3-mdl-libp2p-discovery-plan.md`（盟友主导完整切片 A→F，我方按 P0/P1 接入）
- **我方范围（P0/P1）**：节点身份映射、资源广播契约、`web3.index.*` / `market.resource.*` 索引对接、P2P 异常回退静态/HTTP 索引。
- **边界说明（P2）**：NAT/Relay/端到端路由由盟友主文档维护与排期，本页不重复承诺实现细节。
- **安全约束**：发现不暴露 endpoint/token、market.lease.issue 零改动、默认 disabled

### 4.2 既有路线图

- PayFi 演进路线图：`skills/web3-market/internal/WEB3_DEV_PLAN_PAYFI.md`
- 路线图：`skills/web3-market/internal/WEB3_WEEK3_5_ROADMAP.md`
- 5 周执行计划：`skills/web3-market/internal/WEB3_DEV_PLAN_5_WEEKS.md`
- 走查差距报告：`skills/web3-market/internal/WEB3_GAP_AUDIT_REPORT.md`

### 相关入口

- Web3 Market Dev：[/reference/web3-market-dev](/reference/web3-market-dev)
- 资源共享 API 契约：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
- AI 管家黄金路径：[/web3/ai-steward-golden-path](/web3/ai-steward-golden-path)
- 插件文档：[/plugins/web3-core](/plugins/web3-core)、[/plugins/market-core](/plugins/market-core)
- MDL 实施计划：`skills/web3-market/references/web3-mdl-libp2p-discovery-plan.md`
