---
summary: "EaaS 工业级协议规范：接口清单、对象与字段架构、状态机、错误码、幂等语义、审计与最小披露（以代码为证）"
title: "EaaS Protocol Spec (Industrial): Interfaces, Schemas, State Machines"
doc_family: "web3"
doc_layer: "reference"
normative: false
---

# EaaS Protocol Spec (Industrial): Interfaces, Schemas, State Machines

> 本文是对内工业级规范：用于实现与评审，默认以“代码为真”。
>
> 约束：所有示例与字段表遵循最小披露，不得包含 provider endpoint、token、真实本地路径。
>
> 关联：对外白皮书见：[/reference/web3-eaas-protocol-upgrade-report-2026](/reference/web3-eaas-protocol-upgrade-report-2026)

## 0. 术语与分层（先消除概念混淆）

- **p2p（传播与查询承载）**：负责传播可发现的摘要元信息；不负责结算与争议。
- **Market（经济层）**：负责可交易对象、定价、合同（lease/escrow）、证明、争议与信誉。
- **MCP（工具接入层）**：负责标准化工具/数据源接入，不定义交易语义。

> 结论：p2p ≠ 市场；MCP ≠ 市场；三者互补。

---

## 1. 版本化策略（必须写清楚，避免文档与实现漂移）

本规范分两层：

- **Implemented（已实现）**：本仓库当前已落地的接口与字段结构，允许用于生产化试点。
- **Planned（规划中）**：来自愿景与计划文档的目标态，必须显式标注，不得冒充已实现。

规划参考：[/reference/ai-steward-service-market-plan](/reference/ai-steward-service-market-plan)、[/reference/web3-everything-as-a-service-vision](/reference/web3-everything-as-a-service-vision)

---

## 2. 接口面总览（以 `web3.*` 为对外入口）

### 2.1 对外入口：`web3.market.*`（可对 UI/Agent 暴露）

> 原则：对外入口统一走 `web3.*`；`market.*` 属于内部权威层，仅供 `web3-core` 与受信运维使用。

已实现的 `web3.market.*` 主要分组：

- **Resources**：`web3.market.resource.publish|unpublish|get|list`
- **Leases**：`web3.market.lease.issue|revoke|get|list|expireSweep`
- **Ledger**：`web3.market.ledger.list|summary`
- **Order**：`web3.market.order.list`
- **Settlement**：`web3.market.settlement.query`
- **Service Proof**：`web3.market.service.proof.submit|get|list`
- **Disputes**：`web3.market.dispute.get|list|open|submitEvidence|resolve|reject`
- **Status/Transparency**：`web3.market.status.summary`、`web3.market.reconciliation.summary`
- **Economy extras**：`web3.market.reputation.summary`、`web3.market.tokenEconomy.*`、`web3.market.bridge.*`、`web3.market.metrics.snapshot`

> 注意：`web3.market.*` 中存在少量“非纯透传”实现（例如 reputation 会补充 ENS 信息、reconciliation 是聚合器）。实现细节与证据路径见开发指南：[/reference/web3-eaas-developer-guide](/reference/web3-eaas-developer-guide)

### 2.2 内部权威层：`market.*`（稳定合同，以实现为准）

已实现的 `market.*` 分组：

- **Offer**：`market.offer.create|publish|update|close`
- **Order**：`market.order.create|cancel|list`
- **Settlement**：`market.settlement.lock|release|refund|status|query`
- **Consent**：`market.consent.grant|revoke`
- **Delivery**：`market.delivery.issue|complete|revoke`
- **Service Proof**：`market.service.proof.submit|get|list`
- **Dispute**：`market.dispute.open|submitEvidence|resolve|reject|get|list`
- **Resource**：`market.resource.publish|unpublish|get|list`
- **Lease**：`market.lease.issue|revoke|get|list|expireSweep`
- **Ledger**：`market.ledger.append|list|summary`
- **Transparency**：`market.transparency.summary|trace`、`market.audit.query`、`market.status.summary`

---

## 3. 对象模型（Implemented）

> 本节只描述现状落地形态。规划中的 Service Wrapper 另见 §7。

### 3.1 Resource（资源/服务的可租用表达）

Resource 是“可租用能力”的权威对象：compute/search/storage/service 都可以用 Resource 表达。

核心字段（摘要）：

- `resourceId`: string
- `kind`: "model" | "search" | "storage" | "service" | ...
- `label`: string
- `description?`: string
- `tags?`: string[]
- `price`: { `unit`: string, `amount`: string, `currency`: string, `tokenAddress?`: string }
- `policy?`: { allowlist/denylist/budget caps/... }（不同 kind 可有不同 policy）
- **`serviceSchema?`**: 仅当 `kind == "service"` 需要（见 §3.2）

最小披露原则：资源对外可发现的是摘要元信息，不包含可直接访问的 endpoint。

### 3.2 ServiceSchema（当前实现的服务封装最小集）

> 现状事实：实现中使用 `serviceSchema`，而不是 `serviceWrapper` 字段。

ServiceSchema 的目标：用标准字段描述“输入/输出/验收约束”，为后续 Proof 与结算提供锚点。

建议字段（与现有实现对齐，细节以代码为准）：

- `inputs`: JSON Schema（或 schema-like 结构）
- `outputs`: JSON Schema
- `sla`: { `maxLatencySec?`, `minQualityScore?`, ... }

### 3.3 Lease（租约）

Lease 是“访问权 + 预算门禁”的合同对象，通常由 Consumer 发起、Provider/Market 签发。

- `leaseId`: string
- `resourceId`: string
- `orderId`: string
- `consumerActorId` / `providerActorId`: string
- `expiresAt`: ISO string
- `maxCost?`: string

安全约束：

- `market.lease.issue` 会生成一次性 `accessToken`（内部敏感数据）。
- 对外工具（如 `web3.market.lease` tool）必须“存 token 不回显”。

### 3.4 LedgerEntry（权威记账条目）

Ledger 由 Provider 权威记账，写入后可触发 metered release（分次结算）。

核心字段：

- `leaseId`, `resourceId`, `providerActorId`, `consumerActorId`
- `unit`: 例如 `token` / `call` / `query` / `byte`
- `quantity`: string
- `cost`: string
- `currency`: string
- `tokenAddress?`: string
- `sessionId?`, `runId?`: string

### 3.5 Settlement（托管结算记录）

Settlement 支持：lock（锁定预算）、release（放款，可分次）、refund（退款）。

工业级要求：必须支持幂等、并发互斥与可重放日志。

### 3.6 Dispute（争议）

Dispute 是乐观结算的兜底：

- `disputeId`, `orderId`
- `status`: `open|resolved|rejected|...`
- `evidence[]`: { summary, cid? }
- `resolution`: 支付分配/退款信息

### 3.7 ServiceProof（服务证明）

> 现状事实：已实现 `service` 专用 proof 提交接口，当前 proof 类型以 `tlsnotary` 为主。

ServiceProof 的目标：提供“交付发生且可验证”的证据锚点，用于自动结算与争议裁决。

- `proofId`: string
- `orderId`: string
- `status`: `proof_submitted`
- `proof`: ExecutionProof
- `proofHash`: string

ExecutionProof（现状最小集）：

- `type`: "tlsnotary"
- `artifactHash`: "sha256:..."（注意：仅 hash，不放原文）
- `issuedAt`: ISO string
- `verifier`: string
- `redactedFields?`: string[]

---

## 4. 状态机与前置条件（Industrial）

### 4.1 Order 状态机（摘要）

现状（详见 [/reference/web3-market-dev](/reference/web3-market-dev)）：

- `order_created` → `payment_locked` → `consent_granted` → `delivery_ready` → `delivery_completed` → `settlement_completed`

### 4.2 证明提交前置条件（现状已实现）

- `market.service.proof.submit` 仅允许在 order.status 为 `delivery_completed` 或 `settlement_completed` 时调用。
- 若 settlement 已退款，proof 提交应被拒绝。
- 每个 order 只能提交一次 proof（重复提交视为冲突）。

### 4.3 Planned：PendingVerification（规划中，未实现）

规划提出在状态机中引入 `PendingVerification`，用于“交付完成但待验证”与“验证通过自动释放”之间的门禁。

- 当前实现中不存在该状态（文档必须明确标注为 Planned）。

---

## 5. 错误码与幂等语义（Industrial）

### 5.1 错误结构

错误应是结构化的，包含：

- `code`: `E_INVALID_ARGUMENT | E_FORBIDDEN | E_NOT_FOUND | E_CONFLICT | E_INTERNAL | ...`
- `message`: 可展示但不得泄露敏感信息
- `details?`: 机器可读细节（同样需要脱敏）

### 5.2 幂等与并发（必须 fail-closed）

- Settlement 相关操作（lock/refund/release）应提供 `idempotencyKey`。
- 并发冲突必须返回 `E_CONFLICT`，并提供稳定的 reason code（例如：`SETTLEMENT_OPERATION_IN_PROGRESS`）。
- 重试必须不产生重复副作用（支持安全重放）。

---

## 6. 最小披露与脱敏验收（必须）

必须遵循：[/reference/web3-market-output-redaction](/reference/web3-market-output-redaction)

抽样验收最小集：

1. 租约签发：对外不回显 token/endpoint
2. 索引发现：不返回 endpoint
3. 工具输出：不含 token/endpoint/真实路径
4. 错误路径：错误信息同样脱敏
5. 状态面：可直接分享

---

## 7. Service Wrapper（Planned：目标态协议，文档先行）

> 注意：本节是目标态协议草案，不代表已实现。

Service Wrapper 是 `serviceSchema` 的扩展与统一命名：

- 统一表达：`kind`（digital/human/rwa）、schema、sla、proofMechanism、验收策略。
- 统一 proof 提交入口：未来引入一套覆盖 API / Human / RWA 的 proof submit 家族。

在实现上建议：

- 保持 `serviceSchema` 兼容：先支持 `serviceSchema`，并在后续版本加入 `serviceWrapper` 字段（双写/迁移策略写入开发指南）。

---

## 8. 规范到实现的对应关系

- 现状接口与状态机：[/reference/web3-market-dev](/reference/web3-market-dev)
- 资源共享 API：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
- 双栈支付与对账：[/reference/web3-dual-stack-payments-and-settlement](/reference/web3-dual-stack-payments-and-settlement)
- 开发指南：[/reference/web3-eaas-developer-guide](/reference/web3-eaas-developer-guide)
