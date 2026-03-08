---
summary: "EaaS 落地开发指南：Discovery、p2p 与市场分层、MCP 接入方式、接口对照表、示例流程、测试与验收清单"
title: "EaaS Developer Guide: Discovery, MCP Integration, and Industrial Checklists"
doc_family: "web3"
doc_layer: "guide"
normative: false
---

# EaaS Developer Guide: Discovery, MCP Integration, and Industrial Checklists

> 本文面向工程团队：如何把 EaaS（Everything as a Service）从"资源共享市场"升级到"服务市场"，并保持工业级约束（幂等、最小披露、审计与可运维）。
>
> 关联：协议规范见 [/reference/web3-eaas-protocol-spec](/reference/web3-eaas-protocol-spec)。

## 1. 现状事实：已实现的关键接口面（对外与内部）

### 1.1 对外：`web3.market.*`

- 资源：`web3.market.resource.*`
- 租约：`web3.market.lease.*`
- 记账：`web3.market.ledger.*`
- 结算查询：`web3.market.settlement.query`
- 订单：`web3.market.order.list`
- 争议：`web3.market.dispute.*`
- 服务证明：`web3.market.service.proof.*`
- 状态与对账摘要：`web3.market.status.summary`、`web3.market.reconciliation.summary`
- 任务市场：`web3.market.task.publish|get|list|cancel|expireSweep`、`web3.market.task.bid.*`、`web3.market.task.result.*`、`web3.market.task.receipt.*`
- 隐私/Consent：`web3.market.consent.*`、`web3.market.privacy.assets`、`web3.market.privacy.replay.*`、`web3.market.privacy.erase`

更多总体接口与状态机口径见：[/reference/web3-market-dev](/reference/web3-market-dev)

### 1.2 内部权威：`market.*`

`market-core` 是权威执行层，覆盖 Offer/Order/Settlement/Dispute/Resource/Lease/Ledger/Transparency 等。

参考：[/plugins/market-core](/plugins/market-core)

---

## 2. Discovery（自动发现）怎么做：p2p、市场、工具三层各司其职

### 2.1 误区：Discovery 不是"找节点"，是"找可交易 Offer"

Agent 需要发现的是：

- 可交易对象（Offer/Resource/ServiceSchema）
- 可比较信号（价格、信誉、SLA、证明方式、争议率、链支持、区域/延迟等）

### 2.2 推荐的三层架构

1. **p2p 承载层**

- 只传播与查询"摘要元数据"（例如：kind/label/tags/price/信誉摘要/proof 类型），不传播 endpoint/token。
- 与最小披露一致：任何连接信息都应被视为敏感资产。

2. **Market 经济层（OpenClaw market-core）**

- 负责合同：offer/order/lease
- 负责资金：escrow lock/release/refund
- 负责纠纷：dispute
- 负责信誉与风控信号：reputation/metrics

3. **Tooling 接入层（OpenClaw tools / MCP）**

- 负责"标准化调用"与"会话级编排/观测"。

---

## 3. MCP 怎么接：两种互补方案（建议都写入路线图）

> 目标：让任何 MCP client 都能安全地调用 EaaS 能力，同时不破坏最小披露与预算门禁。

### 3.1 方案 A：Market as MCP Server（推荐优先落地）

把市场动作封装为 **MCP façade tools**，但要明确区分"对外稳定入口"和"服务端内部 authority"：

- Discovery / catalog：直接走 `web3.market.resource.list`（当前已实现 public surface）
- Lease issuance：直接走 `web3.market.lease.issue`（当前已实现 public surface）
- Service proof submit：直接走 `web3.market.service.proof.submit`（当前已实现 public surface）
- Order create / settlement lock：由受信 MCP server 在服务端落到 `market.order.create` + `market.settlement.lock`（当前属于内部 authority，不应包装成已稳定公开的 `web3.market.*`）
- Dispute open：可由 façade 落到 `web3.market.dispute.open` 或内部 `market.dispute.open`，取决于部署边界

好处：

- MCP 生态可以直接消费 OpenClaw 的市场能力。
- 容易做治理：预算、鉴权、审计、脱敏都在 OpenClaw 侧统一处理。

注意：

- MCP façade 的返回值仍需遵循 [/reference/web3-market-output-redaction](/reference/web3-market-output-redaction)。
- 文档与 UI 里必须把 `market.*` 标成"内部 authority"，避免外部调用方误把它们当公共 RPC。

### 3.2 方案 B：Provider as MCP Server（lease-gated，适合高级场景）

Provider 暴露 MCP server，但必须由 Market 发放 lease 后才允许调用。

关键约束：

- MCP server 地址与访问凭证属于敏感信息：不得进入 p2p index；不得进入可分享输出。
- 建议通过 `web3-core` 做本地代理：让 Agent 的 MCP client 只连本机代理，由代理基于 lease 路由到 provider。

---

## 4. 工业级清单（必须写进验收门槛）

### 4.1 安全红线（Fail-closed）

- 对外输出、日志、错误：不得泄露 endpoint/token/真实路径。
- 所有资金变更动作必须有门禁（预算 cap、allowlist、权限 scope）。
- 必须具备 kill switch（规划中也要写清楚）：关闭后不再产生任何外部副作用。

### 4.2 幂等与重放

- Settlement 相关（lock/release/refund）必须支持 `idempotencyKey`。
- 并发冲突必须稳定返回 `E_CONFLICT`。

### 4.3 审计与对账

- 必须能输出"可分享对账摘要"（最小披露）。
- 重要事件建议形成结构化审计事件：order_created / payment_locked / delivery_completed / service_proof_submitted / settlement_released / dispute_opened 等。

参考：[/plugins/web3-core](/plugins/web3-core)（hooks 与审计能力）、[/reference/web3-dual-stack-payments-and-settlement](/reference/web3-dual-stack-payments-and-settlement)

---

## 5. 端到端示例流程（脱敏示意）

> 下面是"API 类服务 + 证明 + 自动结算"的最小闭环示意，字段为示意，真实字段以协议规范与实现为准。

1. Seller 发布 service resource（包含 `serviceSchema`）
2. Buyer 通过受信 façade 创建 order 并 lock escrow（服务端落到 `market.order.create` + `market.settlement.lock`）
3. Buyer 获得 lease 并调用服务（token 存储在本地，不回显）
4. Buyer 或 Provider 通过 façade 调用 `web3.market.service.proof.submit`
5. 系统触发 release 或进入争议窗口

---

## 5.1 任务市场端到端流程（脱敏示意）

> 适用于人类服务、Agent 协作、代码审计等场景。

1. **发布任务**：买家调用 `web3.market.task.publish`，设置标题、描述、需求、预算与截止日期
2. **竞标**：卖家调用 `web3.market.task.bid.place` 提交方案与报价
3. **授标**：买家调用 `web3.market.task.bid.award`——系统自动创建 Order（跳过 consent/delivery 流程，直接 `delivery_completed`）并锁定 Settlement escrow
4. **交付**：中标者调用 `web3.market.task.result.submit` 提交交付物（含可选 proofHash）
5. **验收（通过）**：买家调用 `web3.market.task.result.review` + `accept`——系统释放结算资金、关闭任务、生成回执
6. **验收（拒绝）**：买家调用 `web3.market.task.result.review` + `reject`——系统创建争议（`dispute_opened`），待仲裁

> 关键约束：
>
> - 任务市场订单跳过标准 consent/delivery 流程（TaskResult 承担交付验证）
> - 结算锁定后只能通过验收或争议解决来释放
> - 所有操作均可审计、可回放、默认脱敏

---

## 5.2 隐私与 Consent 管理流程

> 适用于数据授权、知识资产管理、合规审计场景。

1. **查看授权**：调用 `web3.market.consent.list` 查看所有活跃/撤销的授权
2. **查看知识资产**：调用 `web3.market.privacy.assets` 查看资产分类、作用域与地域限制
3. **撤销授权**：通过 `market.consent.revoke` 撤销
4. **生成合规回放**：撤销后调用 `web3.market.privacy.replay.generate`——输出包含脱敏摘要、保留策略、审计事件链
5. **执行删除**：调用 `web3.market.privacy.erase`——根据保留策略执行 erase/retain_anonymized/retain_with_consent

> 保留策略推导规则（`deriveRetentionAction`）：
>
> - consent 包含 `retentionDays` 且未过期 → `retain_with_consent`
> - consent 有 `allowedUsage` 包含 "anonymized" → `retain_anonymized`
> - 其余情况 → `erase`

---

## 5.3 A2A 任务协作

当多个 Agent 协作执行任务时，通过 `sessions-send-tool.a2a.ts` 透传以下标识：

- `taskId`：任务标识
- `orderId`：关联订单
- `proofId`：服务证明标识
- `settlementId`：结算标识

这保证了跨 Agent 的审计链路可追踪，且 `market.*` 始终是资金真相源。

---

## 6. 与现有文档的对齐入口

- 白皮书：[/reference/web3-eaas-protocol-upgrade-report-2026](/reference/web3-eaas-protocol-upgrade-report-2026)
- 协议规范：[/reference/web3-eaas-protocol-spec](/reference/web3-eaas-protocol-spec)
- 现状接口与状态机：[/reference/web3-market-dev](/reference/web3-market-dev)
- 资源共享 API：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
- 双栈支付与对账：[/reference/web3-dual-stack-payments-and-settlement](/reference/web3-dual-stack-payments-and-settlement)
- 输出脱敏验收：[/reference/web3-market-output-redaction](/reference/web3-market-output-redaction)
