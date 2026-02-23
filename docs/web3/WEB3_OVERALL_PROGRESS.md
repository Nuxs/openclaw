# OpenClaw Web3 Market：整体进度口径（可验证）

> **状态**：Draft（随实现推进更新）  
> **更新日期**：2026-02-23  
> **适用范围**：Web3 Market（资源/能力市场 + AI 管家编排）

本文档用于解决一个问题：当我们说"Web3 Market 已做到哪里"，**到底哪些是已实现、可演示、可验收的事实**，哪些仍是规划。

---

## 1. 口径原则

- **对外单入口**：用户/看板/Agent 只依赖 `web3.*`；`market.*` 作为内部权威状态面。
- **默认可分享输出**：任何可外发面（文档示例/日志/状态输出/工具返回）默认脱敏，不包含明文 token、Provider endpoint、真实路径。
- **以代码为准**：本页只写"已能在代码里验证"的能力；规划内容必须标注为"计划"。

---

## 2. 已实现（当前仓库可验证）

### 2.1 插件与看板

- **Web3 插件**：`web3-core`（对外 `web3.*` 编排、审计/归档/锚定/配额等）。
- **Market 插件**：`market-core`（内部权威：资源共享 Resource/Lease/Ledger + 交易结算 Offer/Order/Settlement/Consent/Delivery + Dispute 等）。
- **UI 看板**：UI 内已有 Web3 Tab（身份/计费/审计/市场一屏概览）与 Market 视图，并通过 Gateway RPC 拉取 `web3.status.summary` / `web3.billing.summary` / `web3.market.status.summary` / `web3.index.*` / `web3.monitor.snapshot` / `web3.dispute.*` 等数据展示健康状态与概览。
- **一页式入口**：`/web3` 命令输出一页式仪表盘，可作为排障与快速分享入口。

### 2.2 资源共享（B-2：Resource/Lease/Ledger）

- **资源发布与租用**：存在 `market.resource.*`、`market.lease.*` 权威方法，且 `web3-core` 提供 `web3.resources.*` 及 `web3.market.*` 编排/代理入口。
- **一次性 token 约束**：租约签发响应允许返回明文 token（仅一次）；调用面鉴权执行强一致拒绝（含 lease 状态、过期、resource published 校验）。
- **发现索引脱敏**：`web3.index.list` 输出会对 endpoint 等敏感字段做脱敏，并对索引条目执行消费侧验签。

### 2.3 争议（Dispute）

- `market.dispute.*` 与 `web3.dispute.*` 已存在，可用于列出/查询/处理争议对象（证据应以 hash/引用形式存放，避免敏感信息外泄）。

### 2.4 双栈支付类型定义（2026-02-23 走查新增）

- **ChainNetwork 扩展**：`market-core/config.ts` 的 `ChainNetwork` 类型已增加 `"ton-mainnet" | "ton-testnet"`，与 `blockchain-adapter` 的 TON Provider 对齐。
- **5 个双栈统一类型**：`market-core/types.ts` 已定义 `PaymentChain` / `PaymentMode` / `PaymentIntent` / `PaymentReceipt` / `FXQuote` / `PayoutPreference` / `ReconciliationSummary`（纯类型，文档先行）。
- **web3-core reconciliation handler**：`market/handlers.ts` 已有本地 `ReconciliationPaymentReceipt` / `ReconciliationSummary` 实现，支持 `chain: "ton" | "evm"` 参数（后续将改为从 market-core 导入共享类型）。

### 2.5 能力自描述 Catalog（2026-02-23 走查补全）

- **覆盖率 100%**：67 个注册 gateway method + 12 个 tool 全部有 catalog descriptor（ENS 方法 `web3.identity.resolveEns` / `web3.identity.reverseEns` 已补齐）。
- **幽灵条目 0**：catalog 中不存在未注册的 method。

### 2.6 测试覆盖（2026-02-23 走查新增）

- **market-core 新增测试**：bridge handler（13 tests）、token-economy handler（13 tests）、transparency handler（9 tests）、repair handler（4 tests）。
- **web3-core 新增测试**：`market/handlers.test.ts`（reconciliation summary，5 tests）、`capabilities/catalog.test.ts`（completeness/structure/findWeb3Capability，10 tests）。

---

## 3. 已定义但仍属规划（需要明确里程碑）

- **双栈支付运行时落地**：类型已定义，reconciliation handler 已实现本地逻辑；结算流程的 TON 链路实际打通需等 `blockchain-adapter` TON escrow 完善 + `agent-wallet` 接入。
- **"可分享对账摘要"完整闭环**：输出格式已有口径，但需要持续把所有对外输出点收敛为"可复制粘贴传播"的脱敏摘要。
- **个人数据/私有知识纳入市场**：需要补齐 consent/脱敏/可撤销/合规回放的强约束规范（见本轮新增 skill references）。
- **任务市场协议（Phase 3）**：`TaskOrder`/`TaskBid`/`TaskResult`/`TaskReceipt` 类型设计完成，代码实现推迟到开源冷启动之后。
- **Agent Wallet 接入**：`extensions/agent-wallet` 骨架存在但未接入 `web3.wallet.*` 统一入口和 capabilities catalog，推迟到 Phase 2。

---

## 4. 下一步（与 Week3-5 路线图对齐）

- 路线图：`docs/web3/WEB3_WEEK3_5_ROADMAP.md`
- 5 周执行计划：`docs/web3/WEB3_DEV_PLAN_5_WEEKS.md`
- 走查差距报告：`docs/web3/WEB3_GAP_AUDIT_REPORT.md`

相关入口：

- Web3 Market Dev：[/reference/web3-market-dev](/reference/web3-market-dev)
- 资源共享 API 契约：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
- AI 管家黄金路径：[/web3/ai-steward-golden-path](/web3/ai-steward-golden-path)
- 插件文档：[/plugins/web3-core](/plugins/web3-core)、[/plugins/market-core](/plugins/market-core)
