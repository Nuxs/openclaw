# OpenClaw Web3 Market：Week 3–5 路线图（里程碑 + 验收证据）

> **状态**：Week3-5 已完成（历史里程碑）  
> **更新日期**：2026-03-03  
> **适用范围**：Web3 Market（看板 + 管家代办 + 可分享自由市场）  
> **边界说明**：本文件仅记录 Week3-5 里程碑，不作为 Week6+（KYA/PayFi/x402）实施状态口径；Week6+ 以 `WEB3_DEV_PLAN_PAYFI.md` 为准。

本路线图的写法强调"可验收"：每个里程碑都要能用**明确的 UI 画面、RPC 方法、或可复制粘贴的脱敏输出**来证明完成。

---

## Week 3：口径统一 + 可观测 + 看板可信 ✅ 已完成

- **文档口径统一**：
  - ✅ `web3.*` vs `market.*` 对外/内部边界写清楚
  - ✅ token/endpoint/路径脱敏规则写成"不可妥协"
  - ✅ 修复断链与不一致（以代码为准）
- **看板可信**：✅ UI Web3 Tab + Market Tab 能稳定展示：身份/计费/审计/市场概览、插件启用状态、资源/租约/账本概要、争议概要、索引概要。
- **验收证据**：
  - ✅ Web3 Tab 截图（脱敏）
  - ✅ Market Tab 截图（脱敏）
  - ✅ `/web3` 输出可复制粘贴
  - ✅ `web3_market_status profile=fast|deep` 输出可复制粘贴

---

## Week 4：自由市场 Gate（可分享输出 + 可撤销）✅ 已完成

- ✅ **可分享输出 Gate**：统一"可分享对账摘要"的最小字段集合；任何外发面默认只输出摘要。
- ✅ **可撤销 Gate**：把撤销/过期/争议对外口径写成可执行规范（不泄露敏感信息）。
- **验收证据**：
  - ✅ 一条完整的"发布→租用→调用→记账→摘要"演示脚本（脱敏）
  - ✅ 撤销/过期后的强一致拒绝演示（返回稳定错误码）

---

## Week 5：双栈支付口径可落地（不要求全实现）✅ 已完成

- **双栈口径**：
  - ✅ `PaymentIntent`/`PaymentReceipt`/`FXQuote`/`PayoutPreference`/`ReconciliationSummary` 类型已定义在 `market-core/types.ts`
  - ✅ `ChainNetwork` 已扩展支持 `"ton-mainnet" | "ton-testnet"`
  - ✅ web3-core reconciliation handler 已实现 `chain: "ton" | "evm"` 分支
- **最小落地路径**：
  - ✅ 明确 TON 与 EVM 的支付入口差异（双栈策略文档 + 类型定义）
  - ✅ 明确"支付双入口，结算单出口"的统一对账输出（reconciliation handler）
- **验收证据**：
  - ✅ 双栈统一类型定义可编译通过
  - ✅ reconciliation handler 测试覆盖 EVM + TON 分支
  - ✅ TON escrow adapter + 统一 escrow 工厂 + agent-wallet TON 支持已实现
  - ✅ 端到端结算闭环（Headless）已打通：合约部署 + `@ton/crypto` 派生 + BOC/payload 编码（验收见 `docs/web3/TON_E2E_SETTLEMENT.md`）

### Week 5 追加验收（2026-02-23 走查）

- ✅ Catalog 覆盖率 67/67 gateway methods + 12/12 tools（100%）
- ✅ 新增测试：market-core 4 个模块（bridge/token-economy/transparency/repair）+ web3-core 2 个模块（reconciliation/catalog）
- ✅ 走查差距报告已产出（`skills/web3-market/internal/WEB3_GAP_AUDIT_REPORT.md`），9 大维度逐项验证

### Week 5 追加验收（2026-02-23 TON 双栈落地）

- ✅ 类型对齐：web3-core 移除本地重复类型，改为从 market-core 导入共享类型（tsconfig paths）
- ✅ TON Escrow Adapter：`market-core/src/market/escrow-ton.ts`（lock/release/refund via TON Provider）
- ✅ 统一 Escrow 工厂：`market-core/src/market/escrow-factory.ts`（IEscrowAdapter + chain dispatch）
- ✅ Agent Wallet TON 支持：config 扩展 + ton-handlers + register() 链分发

### Week 5 追加验收（2026-03-02 UI 类型对齐）

- ✅ UI Overlay 同步：`ui/src/ui/types-web3.ts` 已补齐 `PaymentIntent`/`PaymentReceipt`/`FXQuote`/`PayoutPreference`/`ReconciliationSummary`，消除前后端契约 GAP。

---

## Week 6+ 衔接里程碑（指向 PayFi 主计划）

- **Week 6-6.5（KYA）**：策略拦截与 Daily Cap 状态持久化（完成状态与证据见 `WEB3_DEV_PLAN_PAYFI.md`）。
- **Week 7（PayFi）**：增量结算与 Ledger 驱动释放（完成状态与证据见 `WEB3_DEV_PLAN_PAYFI.md`）。
- **Week 8（x402）**：自动支付闭环已形成，当前进入发布前收尾（`maxRetries`/指标告警/故障注入）。
- **Week 9+（Advanced）**：流支付工程化、动态策略、DID 与信用层推进。

> **状态来源优先级**：`WEB3_DEV_PLAN_PAYFI.md`（主） > `WEB3_OVERALL_PROGRESS.md`（公告） > 本文件（历史里程碑）。

## 相关文档

- 总进度口径：`skills/web3-market/internal/WEB3_OVERALL_PROGRESS.md`
- 5 周执行计划：`skills/web3-market/internal/WEB3_DEV_PLAN_5_WEEKS.md`
- 走查差距报告：`skills/web3-market/internal/WEB3_GAP_AUDIT_REPORT.md`
- AI 管家黄金路径：[/web3/ai-steward-golden-path](/web3/ai-steward-golden-path)
- 双栈策略：[/web3/WEB3_DUAL_STACK_STRATEGY](/web3/WEB3_DUAL_STACK_STRATEGY)
- 双栈支付参考：[/reference/web3-dual-stack-payments-and-settlement](/reference/web3-dual-stack-payments-and-settlement)
