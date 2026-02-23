# Web3 Market 走查差距报告

> 走查日期：2026-02-23
> 基准文档：`skills/web3-market/references/`（17 份）+ `docs/web3/`（4 份）
> 对比目标：`extensions/market-core` + `extensions/web3-core` + `extensions/agent-wallet` + `extensions/blockchain-adapter`

---

## 一、技术债验证（web3-market-technical-debt.md）

| #   | 检查项                                           | 文档标记 | 实际状态                                                                                                                                  | 残留 |
| --- | ------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1.1 | Token 规则：catalog 声称返回 token，但实现不回显 | 已修复   | ✅ **已验证** — catalog 三个表面（resources/market/tool）均声明 "token stored internally, not returned"                                   | 无   |
| 1.2 | 输出脱敏一致性                                   | 已修复   | ✅ **已验证** — 四个出口点（web3-core/utils/redact、market-core/\_shared、web3-core/errors、dashboard/format）均有脱敏                    | 无   |
| 2.1 | paramsSchema 缺 `includeUnavailable`             | 已修复   | ✅ **已验证** — `catalog/core.ts` 已对齐                                                                                                  | 无   |
| 2.2 | paramsSchema 缺 `sessionIdHash`                  | 已修复   | ✅ **已验证** — `catalog/core.ts` 已对齐                                                                                                  | 无   |
| 2.3 | 编排 tools 未被 catalog 覆盖                     | 已修复   | ✅ **已修复** — 67 个 gateway methods 全部有 catalog descriptor；ENS 方法 `web3.identity.resolveEns` 和 `web3.identity.reverseEns` 已补齐 | 无   |
| 3.1 | UI 数据接口表使用 `market.*` 前缀                | 已修复   | ✅ **已验证** — 文档表格和 UI 实际调用全部使用 `web3.*` 前缀                                                                              | 无   |

**结论**：6 项技术债全部确认修复。

---

## 二、双栈支付统一对象（WEB3_DUAL_STACK_STRATEGY.md）

| 对象                    | 文档定义    | market-core types.ts | web3-core handlers.ts                                                     | 状态                                     |
| ----------------------- | ----------- | -------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| `PaymentIntent`         | ✅ 完整定义 | ✅ 已新增            | ❌ 不存在                                                                 | **已完成（类型定义）**                   |
| `PaymentReceipt`        | ✅ 完整定义 | ✅ 已新增            | ✅ 本地定义（`ReconciliationPaymentReceipt`，含 `chain: "ton" \| "evm"`） | **已完成（类型定义），web3-core 待对齐** |
| `FXQuote`               | ✅ 完整定义 | ✅ 已新增            | ❌ 不存在                                                                 | **已完成（类型定义）**                   |
| `PayoutPreference`      | ✅ 完整定义 | ✅ 已新增            | ❌ 不存在                                                                 | **已完成（类型定义）**                   |
| `ReconciliationSummary` | ✅ 完整定义 | ✅ 已新增            | ✅ 本地定义（完整字段）                                                   | **已完成（类型定义），web3-core 待对齐** |

### ChainNetwork 对齐

| 层                                   | TON 支持                                    |
| ------------------------------------ | ------------------------------------------- |
| `blockchain-adapter`                 | ✅ `TONProvider` 完整实现（主网/测试网）    |
| `market-core/config.ts` ChainNetwork | ✅ 已增加 `"ton-mainnet" \| "ton-testnet"`  |
| `web3-core/market/handlers.ts`       | ✅ 硬编码 `"ton" \| "evm"` 二元判断         |
| `agent-wallet`                       | ✅ 支持 TON headless（create/balance/send） |

**行动项**（已完成）：

1. ✅ market-core `config.ts` ChainNetwork 增加 `"ton-mainnet" | "ton-testnet"`
2. ✅ market-core `types.ts` 新增 5 个双栈统一类型
3. ⏳ web3-core 的本地 `ReconciliationPaymentReceipt`/`ReconciliationSummary` 改为从 market-core 导入或对齐字段（后续迭代）

---

## 三、能力自描述 schema（web3-market-plan-overview.md §十四）

| 检查项                                    | 状态          |
| ----------------------------------------- | ------------- |
| `web3.capabilities.list` handler 存在     | ✅            |
| `web3.capabilities.describe` handler 存在 | ✅            |
| Catalog 覆盖率：gateway methods           | 67/67（100%） |
| Catalog 覆盖率：tools                     | 12/12（100%） |
| 幽灵条目（catalog 有但未注册）            | 0 个          |
| paramsSchema vs handler 签名一致性        | ✅ 已抽查验证 |

**缺口**：无。已在 `catalog/core.ts` identity 分组补齐 `web3.identity.resolveEns` 和 `web3.identity.reverseEns` descriptor。

---

## 四、个人数据/私有知识（web3-market-privacy-knowledge.md）

| 规范要求                                 | 代码状态                           |
| ---------------------------------------- | ---------------------------------- |
| Consent 决策框架（opt-in/opt-out/scope） | ❌ 无专属 handler                  |
| 差分隐私/K-匿名脱敏                      | ❌ 无实现                          |
| 合规回放（撤销后清除）                   | ❌ 无实现                          |
| 审计轨迹                                 | ⚠️ 现有 audit hooks 可复用但未扩展 |

**状态**：纯规划阶段。按 5 周计划 Week 3 交付规范文档，代码实现推迟到后续迭代。

---

## 五、任务市场协议（web3-market-plan-phase1-execution.md Phase 3）

| 类型          | 定义位置                    | 代码状态  |
| ------------- | --------------------------- | --------- |
| `TaskOrder`   | phase1-execution.md §Phase3 | ❌ 不存在 |
| `TaskBid`     | phase1-execution.md §Phase3 | ❌ 不存在 |
| `TaskResult`  | phase1-execution.md §Phase3 | ❌ 不存在 |
| `TaskReceipt` | phase1-execution.md §Phase3 | ❌ 不存在 |

**状态**：按路线图推迟到 Phase 3（开源冷启动之后）。

---

## 六、Agent Wallet（web3-agent-wallet-plan.md）

| 阶段              | 规划内容                 | 代码状态                                                                                                               |
| ----------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Phase 1：结算打通 | wallet → settlement 绑定 | ⚠️ agent-wallet 已支持 EVM+TON headless（create/balance/send），但仍未接入 market-core settlement 的角色分工与签名路径 |
| Phase 2：钱包原型 | 密钥管理 + 签名 + TEE    | ⚠️ 仍处于原型阶段：TON 侧已落地助记词加密存储与派生；TEE 仍为骨架（`tee.ts` 仅 207B）                                  |
| Phase 3：经济闭环 | 自动结算 + 计费绑定      | ❌ 未实现                                                                                                              |
| Phase 4：TEE 隔离 | 硬件 enclave             | ❌ 未实现                                                                                                              |

### `web3.wallet.*` 统一入口

- `web3-core/index.ts` 中**未注册任何** `web3.wallet.*` gateway method
- `capabilities/catalog/` 中**无 wallet 分组**
- agent-wallet 使用独立的 `agent-wallet.*` 命名空间

**行动项**：本轮仅更新进度文档标注状态，wallet 接入推迟到 Phase 2。

---

## 七、测试覆盖缺口

### market-core（7 个已有测试文件）

| 模块                         | 有测试？              | 优先级 |
| ---------------------------- | --------------------- | ------ |
| handlers.test.ts（综合）     | ✅ 31.7KB             | —      |
| e2e-flow.e2e.test.ts         | ✅ 8.4KB              | —      |
| settlement.handlers.test.ts  | ✅ 5.6KB              | —      |
| pricing-engine.test.ts       | ✅ 3.0KB              | —      |
| revocation.test.ts           | ✅ 1.1KB              | —      |
| resources/validators.test.ts | ✅ 7.7KB              | —      |
| state/store.test.ts          | ✅ 6.6KB              | —      |
| **bridge handler**           | ✅ 已新增（13 tests） | —      |
| **token-economy handler**    | ✅ 已新增（13 tests） | —      |
| **transparency handler**     | ✅ 已新增（9 tests）  | —      |
| **repair handler**           | ✅ 已新增（4 tests）  | —      |

### web3-core（27 个已有测试文件）

| 模块                                                         | 有测试？              | 优先级 |
| ------------------------------------------------------------ | --------------------- | ------ |
| 资源 HTTP（30.6KB）、索引器、租约、注册表、签名验证          | ✅                    | —      |
| 审计、计费、主脑、面板、争议 E2E、监控引擎                   | ✅                    | —      |
| **market/handlers.ts**（17KB，含 reconciliation）            | ✅ 已新增（5 tests）  | —      |
| **market/market-status.ts**（13KB）                          | ❌                    | P2     |
| **capabilities/catalog**                                     | ✅ 已新增（10 tests） | —      |
| **monitor/ 子模块**（commands/handlers/notifications/rules） | ❌                    | P3     |
| **state/store.ts**                                           | ❌                    | P3     |

---

## 八、架构评审报告跟进（web3-market-assessment-2026-02-19.md）

| 评审建议                | 当前状态                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------- |
| 综合评分 4.0/5          | —                                                                                  |
| 跨插件 E2E 覆盖不足     | ✅ 关键路径已覆盖：bridge/token-economy/transparency/repair/reconciliation/catalog |
| Settlement 双模式一致性 | ✅ store.test.ts 覆盖                                                              |
| 错误码统一              | ✅ errors/codes.ts 已对齐                                                          |
| 监控告警闭环            | ⚠️ 有 engine 但缺规则/通知测试                                                     |

---

## 九、本轮行动清单

| #   | 行动                                                     | 优先级 | 状态      |
| --- | -------------------------------------------------------- | ------ | --------- |
| 1   | market-core `config.ts` ChainNetwork 增加 TON            | P0     | ✅ 已完成 |
| 2   | market-core `types.ts` 新增 5 个双栈统一类型             | P0     | ✅ 已完成 |
| 3   | catalog/core.ts 补齐 ENS 方法 descriptor                 | P1     | ✅ 已完成 |
| 4   | 新增 market-core bridge handler 测试                     | P1     | ✅ 已完成 |
| 5   | 新增 market-core token-economy handler 测试              | P1     | ✅ 已完成 |
| 6   | 新增 web3-core market/handlers.test.ts（reconciliation） | P1     | ✅ 已完成 |
| 7   | 新增 web3-core capabilities/catalog.test.ts              | P1     | ✅ 已完成 |
| 8   | 更新 WEB3_OVERALL_PROGRESS.md                            | P1     | ✅ 已完成 |
| 9   | 更新 WEB3_DEV_PLAN_5_WEEKS.md                            | P1     | ✅ 已完成 |
| 10  | 更新 WEB3_WEEK3_5_ROADMAP.md                             | P1     | ✅ 已完成 |
