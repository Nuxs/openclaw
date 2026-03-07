---
name: web3-market
description: Implement OpenClaw Web3 decentralized brain switch (B-1) and resource-sharing market-core (B-2: resources/leases/ledger).
metadata: { "openclaw": { "emoji": "🕸️" } }
---

# web3-market

Implement the Web3 "decentralized brain" switch and the B-2 resource-sharing platform (model/search/storage) using the design docs in this repo.

## Trigger

Use this skill when working on:

- Core hook: `resolve_stream_fn` (custom `StreamFn` override)
- `market-core` extensions: `resources` / `leases` / `ledger`
- `web3-core` orchestration: publish/list/lease/revoke, Provider HTTP routes, consumer tools
- Token handling, auditing, and settlement/ledger alignment
- **Discovery Network (Phase 4)**: `extensions/web3-core/src/discovery/` — P2P resource discovery, libp2p integration (P0/P1 scope; P2 by ally agent per `references/web3-mdl-libp2p-discovery-plan.md`)

## Implementation Status (as of 2026-03-04)

**Completed**:

- ✅ B-1: Decentralized brain switch (resolve_stream_fn hook)
- ✅ B-2: Resource sharing market (resources/leases/ledger)
- ✅ Phase 1: Reward lifecycle（create → issueClaim → status update / poll confirm）
  - 说明：`market-core` 已实现创建、签发、状态机校验与确认回写；“链上提交”依赖外部执行/上游调用，不应默认表述为插件内部自动完成。
- ✅ Dispute data source unification (web3-core dispute interfaces delegated to market-core)
- ✅ TON transaction receipt query (getTransactionReceipt)
- ✅ Capabilities Catalog: covers core, resources, market, monitor, tools, **reward**

**In Progress / Pending**:

- Task market protocol
- Full arbitration system
- Independent index service
- Monitoring & alerting
- Web management console

## References (source of truth)

Read these files as needed:

- `skills/web3-market/references/web3-brain-architecture.md`
- `skills/web3-market/references/web3-agent-wallet-plan.md` ← **AI Agent Wallet（已合入 `extensions/agent-wallet` 原型，但尚未接入 `web3.*` 统一入口/`web3.capabilities.*`，仍需持续硬化）**
- `skills/web3-market/references/web3-market-privacy-knowledge.md` ← **个人数据/私有知识：consent/脱敏/合规/撤销规范**
- `skills/web3-market/references/web3-market-technical-debt.md` ← **技术债清单与一次性清理计划**
- `skills/web3-market/references/web3-market-plan-overview.md`
- `skills/web3-market/references/web3-market-plan-phase1-execution.md`
- `skills/web3-market/references/web3-market-plan-roadmap-open-source-coldstart.md`
- `skills/web3-market/references/web3-market-plan-parallel-execution-ray-celery.md`
- `skills/web3-market/references/web3-market-resource-api.md`
- `skills/web3-market/references/web3-market-resource-security.md`
- `skills/web3-market/references/web3-market-resource-ops.md`
- `skills/web3-market/references/web3-market-resource-testing.md`
- `skills/web3-market/references/web3-market-resource-config-examples.md`
- `skills/web3-market/references/web3-market-resource-implementation-checklist.md`
- `skills/web3-market/references/web3-market-tools-commands-evolution.md`
- `skills/web3-market/references/web3-market-assessment-2026-02-19.md`
- `skills/web3-market/references/web3-mdl-libp2p-discovery-plan.md` ← **MDL（Market Discovery Layer）：基于 libp2p 的去中心化发现层实施计划（可量化追溯）**

## Docs

### External docs (`docs/web3/`)

- `docs/web3/ai-steward-golden-path.md`
- `docs/web3/TON_E2E_SETTLEMENT.md` ← TON 端到端结算（Headless）验收指南
- `docs/web3/WEB3_DUAL_STACK_STRATEGY.md` ← 双栈策略与统一口径（对外）

### Internal planning & research (`skills/web3-market/internal/`)

- `skills/web3-market/internal/WEB3_OVERALL_PROGRESS.md`
- `skills/web3-market/internal/WEB3_WEEK3_5_ROADMAP.md`
- `skills/web3-market/internal/WEB3_DEV_PLAN_5_WEEKS.md`
- `skills/web3-market/internal/WEB3_GAP_AUDIT_REPORT.md`
- `skills/web3-market/internal/openclaw-web3-evaluation-report.md`
- `skills/web3-market/internal/2026年十大优秀公链技术调研报告.md`

## Architecture Principle: Extension = Mechanism, AI = Policy

> **单一权威声明**：此原则是 OpenClaw Web3 全栈的架构基石，所有 skill/agent/contributor 必须遵循。

**OpenClaw 愿景**：AI（大脑）通过 Tool-use（手脚）在去中心化市场（物理世界）中自由活动。

### Extension 层（`market-core` / `web3-core`）= 物理世界 + 手脚

提供**确定性的原子能力**，不包含决策智慧：

| 职责         | 示例                                                | 说明                                     |
| :----------- | :-------------------------------------------------- | :--------------------------------------- |
| **原子动作** | `market.order.list`, `market.settlement.release`    | 可组合的最小操作单元                     |
| **感知能力** | `web3.market.status.summary`, `web3.monitor.health` | 五官——返回结构化数据，不附带"建议"       |
| **聚合感知** | `handleDiagnose`（聚合多个 API 的高级传感器）       | 合理——是"更灵敏的眼睛"，不是"替你做决定" |
| **安全边界** | 签名校验、状态机约束、CAS 冲突检测                  | 物理定律——防止大脑发疯                   |

**Extension 层禁止**：

- 固化意图解析逻辑（自然语言 → 意图映射是 AI Agent 的工作）
- 固化决策策略（"建议降价"是 LLM 基于 context 做的判断，不能写死在代码里）
- 固化业务规则（"收入下降 20% → 建议降价促销"是 Policy，不是 Mechanism）

### AI Agent 层（LLM / Skills / Butler）= 大脑

负责**理解意图、做出决策、编排行动**：

| 职责         | 示例                                 | 说明                                   |
| :----------- | :----------------------------------- | :------------------------------------- |
| **意图理解** | "老板觉得赚得少" → `QUERY_EARNINGS`  | LLM 的工作                             |
| **复杂决策** | "市场均价 $10，我有独家算力，卖 $15" | 不能写死在代码里                       |
| **行动编排** | 先查健康 → 再查订单 → 最后建议       | Skill/Prompt 定义，不是 Extension 代码 |

### 过渡期约定（L1 → L2）

`market-assistant.ts` 中的 `parseIntent`（关键词匹配）和 `generatePricingSuggestion`（定价建议）属于 **L1 确定性反射层**——在 LLM 未接管时提供保底 CLI 交互。这不是终态：

- L1（当前）：关键词匹配 + 硬编码建议 → CLI 可用
- L2（目标）：`parseIntent` 替换为 LLM Function Calling，`generatePricingSuggestion` 移入 Skill/Prompt → 管家智能化
- **Capability Catalog**（`describeWeb3Capabilities`）是 L1 → L2 的桥梁：它已经生成了 LLM 可读的 JSON Schema 工具清单

## Non-negotiables

- Never leak `accessToken`, provider endpoints, or real file paths (errors/logs/status/tool results)
- Plaintext tokens may only be returned in the lease issuance response (`market.lease.issue` and its `web3.market.lease.issue` proxy), and only once
- `market.ledger.append` must reject consumer-forged entries (provider-only)
- File + SQLite store modes must behave the same
- Don't break existing `/pay_status` behavior

## Workflow

1. Read `skills/web3-market/references/web3-brain-architecture.md` as the main source of truth.
2. Use `skills/web3-market/references/web3-market-plan-overview.md` + `web3-market-plan-phase1-execution.md` for execution sequencing.
3. Start from the checklist in `skills/web3-market/references/web3-market-resource-implementation-checklist.md`.
4. Implement the minimal Phase order: Core hook → market-core primitives → web3-core orchestration → Provider routes/tools.
5. Add tests per the matrix (run both store modes).
6. Confirm operational hooks exist (e.g. `market.lease.expireSweep`) and are observable.
7. Treat `skills/web3-market/references/web3-market-assessment-2026-02-19.md` as review-only (non-normative).
