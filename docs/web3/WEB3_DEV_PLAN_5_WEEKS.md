# OpenClaw Web3 Market：5 周执行计划（文档 + 最小对齐修正）

> **状态**：执行中  
> **更新日期**：2026-02-23  
> **适用范围**：Web3 Market（文档为主；仅做少量"文档与实现不一致"的对齐修正，不新增功能）

---

## 0. 约束（本计划的硬边界）

- **不新增功能**：只做文档同步 + 最小命名/schema 对齐。
- **默认脱敏**：文档与示例不包含明文 token、Provider endpoint、真实路径、私钥/凭证。
- **以实现为事实源**：当文档与实现冲突时，优先修正文档；只有当 catalog/schema 描述错误才做最小代码对齐。

---

## Week 1：差异盘点 + 断链修复 + 关键安全口径对齐 ✅ 已完成

- ✅ 修复断链：skill references、docs/reference 内相对链接、缺失的 Web3 规划文档引用。
- ✅ 对齐关键安全口径：token 规则、`validateLeaseAccess` 的强一致拒绝、索引输出脱敏与验签。
- ✅ 交付：
  - 更新后的核心文档：`/reference/web3-resource-market-api`、`/plugins/web3-core`、`/plugins/market-core`、`/reference/web3-market-dev`
  - UI/命令入口补齐：Web3 Tab + `/web3` 一页式入口（脱敏输出）
  - 规划文档补齐：`docs/web3/WEB3_OVERALL_PROGRESS.md`、`WEB3_WEEK3_5_ROADMAP.md`、`WEB3_DEV_PLAN_5_WEEKS.md`

### Week 1 追加交付（2026-02-23 走查）

- ✅ 产出走查差距报告：`docs/web3/WEB3_GAP_AUDIT_REPORT.md`
- ✅ market-core `config.ts` ChainNetwork 增加 `"ton-mainnet" | "ton-testnet"`
- ✅ market-core `types.ts` 新增 5 个双栈统一类型（PaymentIntent/PaymentReceipt/FXQuote/PayoutPreference/ReconciliationSummary）
- ✅ catalog/core.ts 补齐 ENS 方法 descriptor（`web3.identity.resolveEns`、`web3.identity.reverseEns`），catalog 覆盖率 100%

---

## Week 2：自由市场可执行 Gate（可分享输出）✅ 已完成

- ✅ 把"可分享对账摘要（脱敏）"写成可执行规范：输入/输出字段、稳定错误码、禁止字段。
- ✅ 收敛"对外叙事"到可验证范围：区分"已实现"与"规划"。
- ✅ 交付：
  - `/reference/web3-free-market-technical-doc` 追加"实现口径提示"并减少误导性示例

### Week 2 追加交付（2026-02-23 走查）

- ✅ market-core 测试补全：bridge handler（13 tests）、token-economy handler（13 tests）、transparency handler（9 tests）、repair handler（4 tests）
- ✅ web3-core 测试补全：market/handlers.test.ts（reconciliation，5 tests）、capabilities/catalog.test.ts（10 tests）

---

## Week 3：个人数据/私有知识纳入市场的规范落地（文档）

- ✅ 新增并固化规范：consent（强授权/最小披露/可撤销）、脱敏/匿名化、合规回放与审计证据。
- ✅ 交付：
  - `skills/web3-market/references/web3-market-privacy-knowledge.md`
- ⏳ 代码实现：consent 决策/脱敏/合规回放 handler 推迟到后续迭代

---

## Week 4：技术债务一次性清理清单（文档）

- ✅ 按 Gate 分组列出技术债：安全/契约/一致性/可观测/可用性；每条给出受影响文件与验收方式。
- ✅ 交付：
  - `skills/web3-market/references/web3-market-technical-debt.md`
- ✅ 走查验证结果：6 项技术债中 5 项确认修复，1 项残留（ENS catalog）已在 Week 1 追加修复

---

## Week 5：能力自描述与对外口径验收

- ✅ 校对 `web3.capabilities.*` 的 `paramsSchema/returns` 与实现一致。
- ✅ ENS catalog 缺口已修复（67/67 gateway methods + 12/12 tools 全覆盖）。
- ⏳ 文档自检：内部链接按 Mintlify 规则统一为根相对路径；示例全面脱敏（持续进行）。
- ⏳ 运行 `scripts/sync-codebuddy.sh`，确保 skill 更新对 IDE 可见。

### Week 5 追加交付（2026-02-23 TON 双栈落地）

- ✅ 类型对齐：web3-core 移除本地重复类型定义，改为从 `@openclaw/market-core` 导入共享类型（via tsconfig paths）
- ✅ TON Escrow Adapter：`escrow-ton.ts`（TonEscrowAdapter: lock/release/refund via blockchain-adapter TON Provider）
- ✅ 统一 Escrow 工厂：`escrow-factory.ts`（IEscrowAdapter 接口 + createEscrowAdapter 按 chain.network 分发）
- ✅ Agent Wallet TON 支持：config 扩展 ton-mainnet/ton-testnet + ton-handlers（create/balance/send）+ register() 自动分发
- ⏳ 端到端闭环待完成：settlement.fc 合约部署、`@ton/crypto` 地址派生、BOC 编码、IProviderTON 扩展

---

## 相关文档

- 总进度口径：`docs/web3/WEB3_OVERALL_PROGRESS.md`
- Week3-5 路线图：`docs/web3/WEB3_WEEK3_5_ROADMAP.md`
- 走查差距报告：`docs/web3/WEB3_GAP_AUDIT_REPORT.md`
- AI 管家黄金路径：[/web3/ai-steward-golden-path](/web3/ai-steward-golden-path)
- 双栈策略：[/web3/WEB3_DUAL_STACK_STRATEGY](/web3/WEB3_DUAL_STACK_STRATEGY)
