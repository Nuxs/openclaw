# Web3 Market：技术债清单与一次性清理计划（按 Gate 分组）

> 目标：把 Web3 Market（`web3-core` + `market-core` + UI 看板 + `web3-market` skill）的“会导致误解/安全误导/不可验收”的技术债集中收敛，便于一次性清理。
>
> 说明：本清单以“**不新增功能**、只做一致性/口径/契约修复”为默认边界；需要推进新能力时，另开里程碑。

---

## 0. 现状摘要（本轮已修复的债务）

- 修复了多处“文档写法与实现不一致”的关键点（例如：`validateLeaseAccess` 的 `resource_published` 校验口径）。
- 修复了部分方法名漂移（`tokenEconomy.*`、`bridge.*`）导致的文档误导。
- 补齐了 `docs/web3/` 下被引用但缺失的 3 份规划文档（进度/路线图/5 周计划）。
- 统一租约返回口径：`web3.resources.lease` / `web3.market.lease.issue` / `web3.market.lease` 不回显 token 与 endpoint。
- 补齐 catalog 的 orchestration tools 覆盖，补充必要的 `paramsSchema` 描述。
- 新增对外输出脱敏验收清单：`/reference/web3-market-output-redaction`。
- 增补脱敏回归测试：`web3.index.list`、`web3.resources.lease`、错误路径脱敏。

---

## 1. Security Gate（安全与最小披露）

### 1.1 token 规则在“能力自描述”与实现之间仍有偏差（✅ 已修复）

- **问题**：`web3.resources.lease` 的能力描述（catalog）声称返回明文 token，但实现不会回显（token 只在签发响应出现一次，并由管家内部缓存/代管）。
- **影响**：会误导 UI/Agent 以为能从 `web3.resources.lease` 获得 token，进而写出不安全/不可用的集成。
- **位置**：
  - `extensions/web3-core/src/capabilities/catalog.ts`（`web3.resources.lease` / `web3.market.lease.issue` / `web3.market.lease` returns）
  - `extensions/web3-core/src/resources/registry.ts`（实际返回体）
- **一次性清理动作**：更新 `catalog.ts` 的 returns 文案与示例，明确“token 不回显，仅返回 stored/leaseId/orderId 等”。
- **验收**：`web3.capabilities.describe("web3.resources.lease")` 与 `web3.capabilities.describe("web3.market.lease.issue")` 输出与实际返回体一致。

### 1.2 对外输出点的“脱敏一致性”缺少单点验收（✅ 已修复）

- **问题**：脱敏规则散落在文档、工具输出和部分实现中，缺少统一“可分享输出”验收脚本。
- **影响**：容易出现回归（某处输出意外带出 endpoint/token/path）。
- **位置**：
  - 文档口径：`docs/reference/web3-resource-market-api.md`
  - 索引脱敏：`extensions/web3-core/src/resources/indexer.ts`（`redactIndexEntry`）
- **一次性清理动作**：新增一份“对外输出脱敏验收脚本/清单”（文档即可），列出所有必须审查的输出点与禁止字段。
- **验收**：在 UI/CLI 输出与工具输出中抽样验证不含敏感字段。
- **落地结果**：新增 `/reference/web3-market-output-redaction` 作为统一验收清单。

---

## 2. Contract Gate（方法命名、paramsSchema、对外口径）

### 2.1 `web3.capabilities.describe` 的 `paramsSchema` 与文档/实现不一致（✅ 已修复）

- **问题**：文档与实现支持 `includeUnavailable?`，但 catalog 的 `paramsSchema` 未体现该字段。
- **影响**：能力自描述不再是权威入口。
- **位置**：
  - `extensions/web3-core/src/capabilities/catalog.ts`
  - `extensions/web3-core/src/capabilities/handlers.ts`
  - `docs/plugins/web3-core.md`
- **一次性清理动作**：在 `catalog.ts` 的 `web3.capabilities.describe` 增加 `includeUnavailable` 参数提示。
- **验收**：`web3.capabilities.describe` 的 paramsSchema 与文档一致。

### 2.2 `web3.billing.summary` 的 `paramsSchema` 漏掉 `sessionIdHash?`（✅ 已修复）

- **影响/位置/动作/验收**：同上（补齐 catalog 里的参数提示）。

### 2.3 已注册的编排 tools 未被 catalog 覆盖（✅ 已修复）

- **问题**：`web3-core` 注册了若干 Web3 Market orchestration tools，但 `web3.capabilities.*` 的 catalog 未完整列出。
- **影响**：UI/Agent 依赖能力发现时会漏能力。
- **位置**：
  - 注册：`extensions/web3-core/src/index.ts`（`api.registerTool(...)`）
  - 描述：`extensions/web3-core/src/capabilities/catalog.ts`
- **一次性清理动作（两选一）**：
  1. 补齐 catalog 的 tool entries（推荐）；或
  2. 文档明确 `web3.capabilities.*` 不是全量能力入口（不推荐）。
- **验收**：`web3.capabilities.list(includeDetails=true)` 能覆盖主要 `web3.*` gateway methods + 关键 orchestration tools。

---

## 3. Docs/UX Gate（文档一致性、可用性叙事）

### 3.1 历史评审文档需要“快照标识”（✅ 已修复）

- **问题**：`skills/web3-market/references/web3-market-assessment-2026-02-19.md` 含有与现状不符的结论（例如 dispute、索引脱敏/验签）。
- **影响**：AI/开发者读到会误判。
- **一次性清理动作**：在文档顶部增加醒目的“历史快照（已过期）”声明，并列出已对齐项。
- **验收**：读者不会把该文档当作规范来源（skill 里也应继续标注 non-normative）。

### 3.2 规划/愿景文档与“当前实现”边界仍需持续收敛（✅ 已修复）

- **问题**：部分参考文档包含概念性 CLI/UX 示例，容易被误当成已实现功能。
- **一次性清理动作**：统一在相关文档顶部增加“实现口径提示”，并把“当前可用入口”链接到 `/plugins/*` 与 `/reference/*`。

---

## 4. Consistency Gate（多表面一致性）

### 4.1 UI 数据接口表与真实调用不一致（✅ 已修复）

- **问题**：`skills/web3-market/references/web3-market-plan-overview.md` 中 UI 表格用 `market.*` 作为 UI 入口，但 UI 实际使用 `web3.*`。
- **影响**：照抄表格会做错集成。
- **一次性清理动作**：更新表格为 UI 实际调用的 `web3.market.*`/`web3.index.*`/`web3.monitor.snapshot`/`web3.dispute.*`。
- **验收**：表格与 UI `market-status` 控制器调用列表一致。

---

## 5. Testing Gate（防回归）

### 5.1 对外输出脱敏缺少回归测试（✅ 已修复）

- **问题**：索引脱敏、工具输出脱敏、错误消息脱敏缺少统一回归测试矩阵。
- **一次性清理动作**：补充最小测试：
  - `web3.index.list` 输出不含 endpoint
  - `web3.resources.lease` 输出不含 token
  - 代表性错误路径不泄露 endpoint/token/path
- **验收**：CI 跑过，且测试用例能防住最常见泄露回归。

---

## 6. P1 路线图提醒（非本次清理范围）

- **Agent Wallet**：主仓已存在 `extensions/agent-wallet` 原型；本轮目标是把口径与安全硬约束对齐并做最小硬化（错误脱敏/契约），后续再补 `web3.wallet.*` 聚合入口与 capabilities/catalog（见 `web3-agent-wallet-plan.md`）。
