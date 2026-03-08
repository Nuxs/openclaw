---
summary: "AI 管家自由市场从资源共享升级到 EaaS 的研发计划：明确现状、缺口、阶段目标与验收 Gate。"
read_when:
  - You are planning how Web3 Market evolves from resource sharing into EaaS
  - You need the gap analysis between current runtime and the target-state service market
  - You are reviewing phased delivery gates for digital, human, and RWA services
title: "AI Steward Service Market Plan: Everything as a Service"
doc_family: "web3"
doc_layer: "guide"
normative: false
---

## 背景与目标

OpenClaw 已具备 Web3 Market 的资源共享与结算底座，但当前最成熟的仍是 **资源市场**：Resource、Lease、Ledger、Escrow、Dispute、Reconciliation。

下一阶段的目标不是重造市场，而是把这套底座升级成 **Everything as a Service (EaaS)** 协议层，让 Agent 能交易的不只是算力，还包括：

- **数字服务**：API、搜索、数据服务、自动化流程
- **人类服务**：咨询、代码审查、创作、运营等可验收劳务
- **现实世界资产（RWA）**：设备、物流、租赁物、IoT 驱动交付对象

## 本计划的边界

### 以代码为真

计划中的能力必须服从当前仓库事实：

- 运行时真相：`extensions/web3-core/src/index.ts`、`extensions/market-core/src/index.ts`
- 对外契约：`web3.capabilities.*`
- 参考文档：[/reference/web3-market-dev](/reference/web3-market-dev)、[/reference/web3-eaas-protocol-spec](/reference/web3-eaas-protocol-spec)

### 非目标

- 不把“规划中的协议字段”包装成“已经实现”。
- 不破坏现有 `web3.market.*` / `market.*` 稳定入口。
- 不牺牲最小披露原则去换取调试便利。

## 当前已经具备的底座

### 已实现

- `resource.kind = "service"`：服务资源已可表达
- `serviceSchema`：可描述输入/输出/SLA/proof requirements 的最小服务契约
- `web3.market.service.proof.*`：服务类证明提交/查询/列表接口已存在
- `web3.market.reconciliation.summary`：双栈支付 + 账本 + 争议 + proof 的聚合摘要已存在
- `web3.market.dispute.*`：服务争议已有兜底流程
- TON + EVM：支付与对账已统一到双栈口径

### 已有但仍偏“底层”的能力

- Reputation、TokenEconomy、Bridge、Metrics 等经济机制
- 最小披露与可分享状态输出
- `market-core` 作为内部权威执行层，`web3-core` 作为对外编排层

## 关键缺口

### 1. 服务表达仍是“最小实现”，不是终态协议

当前实现使用的是 `serviceSchema`。它足够支撑数字服务试点，但距离统一的 **Service Wrapper** 仍有差距：

- 缺少统一的 kind 分层（digital / human / rwa）
- 缺少统一的验收策略表达
- 缺少更明确的 proof / settlement / arbitration 对齐约束

### 2. Proof 入口仍偏 service 专用

当前已实现的是 `web3.market.service.proof.*`。这对 API 类服务足够，但对未来的人类服务与 RWA 来说还不够通用。

目标态需要一套统一的 **Proof of Service** 模型，支持：

- API / 数字服务证明
- 人类交付回执
- Oracle / IoT / 物流信号

### 3. 人在环路验收与仲裁还没有产品化

当前争议能力已经存在，但“多签验收、里程碑签收、第三方仲裁节点、信誉/质押联动”还没有形成完整产品闭环。

### 4. Discovery 与 MCP 还需要工程化整合

Agent 需要发现的不是“节点”，而是 **可交易的 Offer / Resource / ServiceSchema**。这意味着后续还要补齐：

- 可比较摘要（价格、SLA、信誉、proof 类型）
- 与 MCP 的双向接入方式
- 更明确的市场层 / 调用层 / 传播层分工

## 设计原则

### 1. Extension = Mechanism，AI = Policy

- `market-core` / `web3-core` 提供**确定性的原子能力**与安全边界
- LLM / Skills / Butler 负责**意图理解、策略决策、行动编排**
- 不把复杂业务判断硬编码进 market runtime

### 2. 演进优先于重写

- 保持 `serviceSchema` 向后兼容
- 后续引入 `serviceWrapper` 时，优先采用兼容演进，而不是一次性推翻现有对象模型
- 继续复用现有 Lease / Ledger / Settlement / Dispute / Reconciliation 主线

### 3. 最小披露不可妥协

- token / endpoint / 真实路径永不进入对外文档、日志、错误和可分享状态
- 链上只放 hash / 承诺 / 回执 / 汇总

## 路线图

### Phase Q2: Digital Services（把 service 变成一等公民）

#### 目标

在不破坏现有协议面的前提下，把今天的 `serviceSchema + service proof` 打磨成可稳定试点的数字服务协议。

#### 交付项

- 巩固 `serviceSchema` 的字段约束与 capability 文档
- 补强 `web3.market.service.proof.*` 的验证、前置条件与对账关联
- 打通开发文档、协议文档、能力目录三者的统一口径
- 为未来 `serviceWrapper` 预留兼容扩展位

#### 验收 Gate

- 服务类资源发布、租约、proof、对账链路可完整走通
- 对外输出继续满足最小披露
- 证明提交与争议/结算状态机保持一致
- 文档明确区分 Implemented vs Planned

### Phase Q3: Human Services（把“人类交付”纳入协议）

#### 目标

支持“提交成果 → 验收 → 放款 / 争议”的人类服务交易闭环。

#### 交付项

- Human Service Wrapper（或兼容字段集）
- 多签/签收式交付回执
- 信誉与质押的联动策略
- 仲裁节点或仲裁角色接入

#### 验收 Gate

- 可以表达“非标准成果”的交付与验收
- 可以冻结资金并进入争议流程
- 信誉、质押、争议成本之间存在可执行约束

### Phase Q4: RWA Pilot（把现实世界交付接进来）

#### 目标

支持基于 Oracle / IoT / 物流信号的现实世界交付验证，并纳入预算门禁。

#### 交付项

- RWA Wrapper
- Oracle / IoT 适配器
- 更严格的预算与审批策略
- 多源验证与异常回滚策略

#### 验收 Gate

- 可以消费外部交付信号并驱动 settlement 决策
- 预算超限必须 fail-closed
- 现实世界交付同样遵守最小披露与可审计原则

## 契约演进路径

| 主题     | 当前已实现                         | 规划演进                                |
| -------- | ---------------------------------- | --------------------------------------- |
| 服务描述 | `serviceSchema`                    | `serviceWrapper`（保持兼容）            |
| 证明入口 | `web3.market.service.proof.*`      | 更统一的 `proof.submit` 家族            |
| 验收状态 | 以现有 Order/Settlement 状态机为主 | 更明确的 verification / acceptance gate |
| 交易对象 | digital service 初步可表达         | digital / human / rwa 统一对象模型      |
| 争议     | 已有 dispute 主线                  | 更强的人在环路与仲裁节点                |

## 工业级护栏

### 安全

- 任何 EaaS 演进都不得泄露 token / endpoint / 真实路径
- 预算、权限、allowlist、scope 仍是强门禁

### 一致性

- 影响输出语义的后处理必须在缓存前完成
- 双栈支付与对账保持统一口径

### 可运维

- 文档、capability、代码必须同步更新
- 新能力默认需要状态面、错误边界与验收清单

## 相关文档

- 概览：[/concepts/web3-market](/concepts/web3-market)
- 当前实现口径：[/reference/web3-market-dev](/reference/web3-market-dev)
- 资源共享 API：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
- 双栈支付与结算：[/reference/web3-dual-stack-payments-and-settlement](/reference/web3-dual-stack-payments-and-settlement)
- EaaS 愿景：[/reference/web3-everything-as-a-service-vision](/reference/web3-everything-as-a-service-vision)
- EaaS 白皮书：[/reference/web3-eaas-protocol-upgrade-report-2026](/reference/web3-eaas-protocol-upgrade-report-2026)
- EaaS 协议规范：[/reference/web3-eaas-protocol-spec](/reference/web3-eaas-protocol-spec)
- EaaS 开发指南：[/reference/web3-eaas-developer-guide](/reference/web3-eaas-developer-guide)
