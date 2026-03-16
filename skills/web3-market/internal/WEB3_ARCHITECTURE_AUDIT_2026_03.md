# Web3 Skill 架构审计报告

> **审计日期**：2026-03-17  
> **审计范围**：`skills/web3-market/` 全部文档  
> **审计标准**：愿景一致性、信达雅、最高架构智能工业级

---

## 一、核心发现

### 1.1 ✅ 正确的部分

| 维度             | 证据                                        | 评价                       |
| ---------------- | ------------------------------------------- | -------------------------- |
| **产品定位**     | "Private Steward OS + Market-backed A2A"    | 清晰、克制、无 chain-first |
| **协议分层**     | MCP/A2A/Market/Chain 职责清晰               | 正确                       |
| **叙事风格**     | "sell accountable execution, not the chain" | 信达雅                     |
| **数字服务优先** | Phase 1 聚焦可验证数字服务                  | 正确的 beachhead 策略      |
| **敏感信息保护** | 红线明确（token/endpoint/path 不泄露）      | 工业级                     |

### 1.2 ⚠️ 需要修正的部分

| 问题                           | 位置                           | 严重程度 | 说明                                                  |
| ------------------------------ | ------------------------------ | -------- | ----------------------------------------------------- |
| **AI 自主权表述歧义**          | SKILL.md 第 108 行             | 🔴 高    | "Human as Approver" 暗示每个操作需审批                |
| **human-in-the-loop 过度强调** | product-principles 第 11 行    | 🟡 中    | "governed through human-in-the-loop consent" 可能误导 |
| **阈值控制模型缺失**           | 全局                           | 🟡 中    | 未明确说明 AI 在边界内的完全自主权                    |
| **UI 面板定位不够清晰**        | product-principles 第 27-40 行 | 🟡 中    | "Consent Card" 暗示每次购买都需确认                   |

---

## 二、详细分析与修正

### 2.1 🔴 核心问题：AI 自主权表述

#### 当前表述（有问题）

```markdown
// SKILL.md 第 108 行

- **Agent as Buyer, Human as Approver (最高智能架构)**:
  Do not build traditional Web2 "shopping cart"...
  The UI merely renders a **Consent Card**...
```

**问题**："Approver" 和 "Consent Card" 暗示 AI 每次操作都需要人类审批。

#### 正确理解

根据用户确认和行业前沿：

| 维度         | 错误理解            | 正确理解                        |
| ------------ | ------------------- | ------------------------------- |
| **输入**     | 用户下具体指令      | 用户表达意图（intent）          |
| **决策**     | AI 只是执行，不决策 | AI 在策略边界内**完全自主决策** |
| **审批**     | 每个操作都需审批    | **只在超出阈值时才需审批**      |
| **市场行为** | 人类选择服务        | AI 发现、比较、购买服务         |
| **责任**     | 人类对每个操作负责  | AI 对结果负责，可追溯           |

#### 修正后的表述

```markdown
- **Agent as Buyer, Human as Governor (最高智能架构)**:
  Do not build traditional Web2 "shopping cart" or "marketplace catalog" UIs
  for humans to manually browse and buy services.

  The Private Steward (AI) is the **autonomous buyer** within policy boundaries.
  It discovers resources via tool calls (`market.resource.list`), compares options,
  and **autonomously completes purchases** within budget/risk thresholds.

  The UI surfaces a **Consent Card** ONLY when crossing thresholds
  (e.g., exceeds budget, new provider, high-risk operation).
  For routine operations within boundaries, the steward acts autonomously.
```

### 2.2 🟡 阈值控制模型（需补充）

#### 当前缺失

文档中未明确说明 AI 的自主权边界。

#### 应补充的模型

```markdown
## AI 自主权阈值模型

| 场景                     | 自主权     | 介入点       |
| ------------------------ | ---------- | ------------ |
| **日常搜索**             | 完全自主   | 无           |
| **小额购买（< $10）**    | 完全自主   | 事后审计     |
| **中额购买（$10-$100）** | 边界内自主 | 超预算才审批 |
| **大额交易（> $100）**   | 需确认     | 执行前审批   |
| **首次 Provider**        | 需确认     | 执行前审批   |
| **签约/承诺**            | 需确认     | 执行前审批   |
| **争议处理**             | 需介入     | 人类裁决     |

**核心原则**：AI 在策略边界内完全自主，只有跨越边界才触发人类介入。
```

### 2.3 🟡 UI 面板定位澄清

#### 当前表述（有歧义）

```markdown
// product-principles 第 27-40 行
The UI is for **audit and consent**, not discovery and manual checkout.
```

#### 修正后的表述

```markdown
The UI is for **governance, audit, and exception handling**,
not for routine discovery and checkout.

**Routine operations (within boundaries)**:

- AI autonomously discovers, compares, and purchases services
- No human intervention required
- User sees results in audit trail

**Exception handling (crossing boundaries)**:

- Budget exceeded → Consent Card surfaces for approval
- New provider → Risk confirmation required
- High-value transaction → Explicit approval
- Dispute → Human arbitration interface

**Governance**:

- Set budget limits, risk tolerance, allow/deny lists
- View audit trails, proofs, settlements
- Configure automation boundaries
```

---

## 三、架构智能工业级评估

### 3.1 ✅ 已符合工业级标准的部分

| 标准             | 证据                           | 评价   |
| ---------------- | ------------------------------ | ------ |
| **敏感信息保护** | accessToken/endpoint/path 红线 | 工业级 |
| **协议分层**     | MCP/A2A/Market/Chain 职责清晰  | 工业级 |
| **链角色分工**   | EVM+TON+Sui 三链分工明确       | 工业级 |
| **可追溯性**     | Proof/Settlement/Dispute 闭环  | 工业级 |
| **可操作性**     | kill switch、回滚、审计        | 工业级 |

### 3.2 🟡 需要加强的部分

| 维度                | 当前状态 | 建议             |
| ------------------- | -------- | ---------------- |
| **Reputation 系统** | 未实现   | Phase 6 必须实现 |
| **Agent 信誉**      | 未实现   | 与 Proof 耦合    |
| **跨 Agent 合约**   | 未实现   | 2027 年关键功能  |
| **人类证明**        | 未实现   | Phase 5 准备     |
| **RWA Proof**       | 未实现   | 2028 年目标      |

### 3.3 🔴 前沿趋势对比

| 趋势                     | OpenClaw 状态 | 建议                    |
| ------------------------ | ------------- | ----------------------- |
| **Accountable Autonomy** | 🟡 部分符合   | 需明确 AI 自主权模型    |
| **A2A Agent Payment**    | 🟡 部分符合   | 需补充 Agent 间结算协议 |
| **MCP Market Façade**    | ✅ 已规划     | Phase 4 实现            |
| **TLSNotary Proof**      | 🟡 部分符合   | 需补充实现计划          |
| **x402 Auto-Pay**        | ✅ 已实现     | 符合前沿                |

---

## 四、信达雅评估

### 4.1 信（真实性）

| 检查项         | 状态 | 说明                     |
| -------------- | ---- | ------------------------ |
| 代码与文档一致 | ✅   | 已核对 extensions/ 代码  |
| 无过度宣称     | ✅   | 区分 "已实现" vs "规划"  |
| 无 chain-first | ✅   | 始终强调 Private Steward |

### 4.2 达（清晰性）

| 检查项     | 状态 | 说明                 |
| ---------- | ---- | -------------------- |
| 分层清晰   | ✅   | MCP/A2A/Market/Chain |
| 链角色清晰 | ✅   | EVM/TON/Sui 分工     |
| AI 自主权  | 🟡   | 需修正表述           |

### 4.3 雅（克制性）

| 检查项         | 状态 | 说明                  |
| -------------- | ---- | --------------------- |
| 无炒作语言     | ✅   | 无 "革命性"、"颠覆性" |
| 无 token-first | ✅   | 明确 "稳定币优先"     |
| 无过度承诺     | ✅   | 区分 Phase 1-7        |

---

## 五、修正清单

### 5.1 必须修正（🔴 高优先级）

| 文件                    | 行号    | 修正内容                                  |
| ----------------------- | ------- | ----------------------------------------- |
| `SKILL.md`              | 108     | "Human as Approver" → "Human as Governor" |
| `SKILL.md`              | 109-110 | 补充阈值控制模型                          |
| `product-principles.md` | 11      | 澄清 "human-in-the-loop" 含义             |
| `product-principles.md` | 27-40   | 区分 routine vs exception                 |

### 5.2 建议修正（🟡 中优先级）

| 文件                    | 修正内容                               |
| ----------------------- | -------------------------------------- |
| `SKILL.md`              | 添加 "AI 自主权阈值模型" 章节          |
| `product-principles.md` | 添加 "Governance vs Intervention" 章节 |
| `external-narrative.md` | 补充 "AI 在边界内自主" 的表述          |

### 5.3 可选增强（🟢 低优先级）

| 文件                         | 增强内容                    |
| ---------------------------- | --------------------------- |
| `WEB3_FINAL_PRODUCT_SPEC.md` | 添加 "AI 自主权设计" 章节   |
| `BOARD_STRATEGY_MEMO.md`     | 强调 "Accountable Autonomy" |

---

## 六、总结

### 核心修正

**从 "AI 需要人类审批" → "AI 在边界内完全自主，只在跨越边界时才需人类介入"**

这是符合前沿趋势和用户预期的正确理解。OpenClaw 的独特性在于：

> **自主决策 + 经济责任闭环 = 真正的 Private Steward**

### 整体评价

| 维度             | 评分   | 说明                      |
| ---------------- | ------ | ------------------------- |
| **信**           | 90/100 | 真实可靠，无过度宣称      |
| **达**           | 85/100 | 分层清晰，AI 自主权需澄清 |
| **雅**           | 95/100 | 叙事克制，无 chain-first  |
| **工业级**       | 80/100 | 核心达标，产品化待完善    |
| **最高智能架构** | 75/100 | 需补充自主权模型          |

**修正后预期评分**：信 95 / 达 95 / 雅 95 / 工业级 90 / 最高智能架构 90
