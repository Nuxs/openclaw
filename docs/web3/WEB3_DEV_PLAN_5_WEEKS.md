# OpenClaw Web3 Market：5 周执行计划（文档 + 最小对齐修正）

> **状态**：Draft（执行计划）  
> **更新日期**：2026-02-23  
> **适用范围**：Web3 Market（文档为主；仅做少量“文档与实现不一致”的对齐修正，不新增功能）

---

## 0. 约束（本计划的硬边界）

- **不新增功能**：只做文档同步 + 最小命名/schema 对齐。
- **默认脱敏**：文档与示例不包含明文 token、Provider endpoint、真实路径、私钥/凭证。
- **以实现为事实源**：当文档与实现冲突时，优先修正文档；只有当 catalog/schema 描述错误才做最小代码对齐。

---

## Week 1：差异盘点 + 断链修复 + 关键安全口径对齐

- 修复断链：skill references、docs/reference 内相对链接、缺失的 Web3 规划文档引用。
- 对齐关键安全口径：token 规则、`validateLeaseAccess` 的强一致拒绝、索引输出脱敏与验签。
- 交付：
  - 更新后的核心文档：`/reference/web3-resource-market-api`、`/plugins/web3-core`、`/plugins/market-core`、`/reference/web3-market-dev`
  - UI/命令入口补齐：Web3 Tab + `/web3` 一页式入口（脱敏输出）
  - 规划文档补齐：`docs/web3/WEB3_OVERALL_PROGRESS.md`、`WEB3_WEEK3_5_ROADMAP.md`、`WEB3_DEV_PLAN_5_WEEKS.md`

---

## Week 2：自由市场可执行 Gate（可分享输出）

- 把“可分享对账摘要（脱敏）”写成可执行规范：输入/输出字段、稳定错误码、禁止字段。
- 收敛“对外叙事”到可验证范围：区分“已实现”与“规划”。
- 交付：
  - `/reference/web3-free-market-technical-doc` 追加“实现口径提示”并减少误导性示例

---

## Week 3：个人数据/私有知识纳入市场的规范落地（文档）

- 新增并固化规范：consent（强授权/最小披露/可撤销）、脱敏/匿名化、合规回放与审计证据。
- 交付：
  - `skills/web3-market/references/web3-market-privacy-knowledge.md`

---

## Week 4：技术债务一次性清理清单（文档）

- 按 Gate 分组列出技术债：安全/契约/一致性/可观测/可用性；每条给出受影响文件与验收方式。
- 交付：
  - `skills/web3-market/references/web3-market-technical-debt.md`

---

## Week 5：能力自描述与对外口径验收

- 校对 `web3.capabilities.*` 的 `paramsSchema/returns` 与实现一致（必要时做最小代码修正）。
- 文档自检：内部链接按 Mintlify 规则统一为根相对路径；示例全面脱敏。
- 交付：
  - 运行 `scripts/sync-codebuddy.sh`，确保 skill 更新对 IDE 可见。

---

## 相关文档

- 总进度口径：`docs/web3/WEB3_OVERALL_PROGRESS.md`
- Week3-5 路线图：`docs/web3/WEB3_WEEK3_5_ROADMAP.md`
- AI 管家黄金路径：[/web3/ai-steward-golden-path](/web3/ai-steward-golden-path)
- 双栈策略：[/web3/WEB3_DUAL_STACK_STRATEGY](/web3/WEB3_DUAL_STACK_STRATEGY)
