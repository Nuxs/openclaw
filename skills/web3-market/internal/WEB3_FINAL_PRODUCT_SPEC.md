# OpenClaw Web3 Market 最终产品规格书

> **版本**：v1.1  
> **状态**：Approved  
> **范围**：完整产品功能需求（2026-2028 三年路线图整合）  
> **状态追踪**：详见 `WEB3_IMPLEMENTATION_STATUS.md`  
> **前沿调研**：详见 `WEB3_FRONTIER_RESEARCH_REPORT.md`

---

## 0. 产品定位与核心价值

### 0.1 一句话定义

> **OpenClaw 是私人 AI 管家，能替用户发现、购买、验证、结算并审计外部数字服务。**

### 0.2 战略定位

**OpenClaw = Private Steward OS + Market-backed A2A Network**

不是"又一个 Agent Shell"，不是"又一个 Web3 项目"，而是：

- **私人管家**：理解用户、跨工具行动、跨 Agent 协同、代为采购服务、经济问责
- **可问责执行层**：当涉及金钱、权限、结果时，始终可审计、可争议、可控制

### 0.3 协议分层

| 层级          | 协议                  | 职责                                |
| ------------- | --------------------- | ----------------------------------- |
| 工具/数据入口 | MCP                   | 工具连接、数据访问                  |
| Agent 协同    | A2A/ACP               | 跨 Agent 协作、任务委托             |
| 经济问责      | OpenClaw Market       | 报价、租约、proof、结算、争议、对账 |
| 信任锚        | Chain/Wallet/Identity | 签名、支付、审计                    |

### 0.4 链角色分工

| 链      | 角色                                           |
| ------- | ---------------------------------------------- |
| **EVM** | 稳定币流动性、Treasury、跨链桥、外部 DeFi 兼容 |
| **TON** | 分发、轻量支付入口、Telegram 生态触达          |
| **Sui** | 能力/租约/回执/托管/奖励等对象化账本的未来方向 |

**约束**：默认采用 **链下 discovery/quote + 链上 lease/settlement/audit**。

---

## 1. 已实现能力基线（产品起点）

以下能力已完整实现，作为后续扩展的基础：

### 1.1 核心市场协议 ✅

| 能力                       | 状态      | 说明                                    |
| -------------------------- | --------- | --------------------------------------- |
| **Resource/Lease/Ledger**  | ✅ 已实现 | 资源发布、租约签发、账本记账            |
| **Offer/Order/Settlement** | ✅ 已实现 | 报价创建、订单下单、结算执行            |
| **Dispute**                | ✅ 已实现 | 争议发起、证据提交、裁决回写            |
| **Consent/Delivery**       | ✅ 已实现 | 隐私授权、交付确认                      |
| **Task Market**            | ✅ 已实现 | TaskOrder/Bid/Result/Receipt 全生命周期 |

### 1.2 支付与结算

| 能力                      | 状态      | 说明                                    |
| ------------------------- | --------- | --------------------------------------- |
| **双栈支付（EVM + TON）** | ✅ 已实现 | 统一 PaymentIntent/Receipt 类型         |
| **Escrow 托管**           | ✅ 已实现 | EVM + TON 双链托管合约                  |
| **Streaming Settlement**  | ✅ 已实现 | releasedAmount + 部分释放 + Ledger 驱动 |
| **x402 Auto-Pay**         | ✅ 已实现 | 402 捕获 + 自动支付 + 策略驱动重试      |

### 1.3 治理与策略

| 能力                      | 状态      | 说明                                   |
| ------------------------- | --------- | -------------------------------------- |
| **KYA (Know Your Agent)** | ✅ 已实现 | WalletPolicy + PolicyEngine + 策略拦截 |
| **Budget Policy**         | ✅ 已实现 | Daily Cap + 状态持久化                 |
| **Privacy Protection**    | ✅ 已实现 | consent/脱敏/可撤销/合规回放/删除保留  |

### 1.4 发现与索引

| 能力                       | 状态      | 说明                                        |
| -------------------------- | --------- | ------------------------------------------- |
| **Static Discovery**       | ✅ 已实现 | 静态配置发现后端                            |
| **libp2p Discovery (MDL)** | ✅ 已实现 | Slice A-F 全部落地（2137 行代码 + 69 测试） |
| **Index Query**            | ✅ 已实现 | web3.index._ / market.resource._            |

### 1.5 UI 与运营

| 能力               | 状态      | 说明                        |
| ------------------ | --------- | --------------------------- |
| **Web3 Tab**       | ✅ 已实现 | 身份/计费/审计/市场一屏概览 |
| **Market View**    | ✅ 已实现 | 订单/交付/争议可视化        |
| **Status Summary** | ✅ 已实现 | 一页式仪表盘入口            |

---

## 2. Phase 1: Digital Service Market v1 成品化 🔴 阻断项

> **当前状态**：❌ 未完成  
> **预计工作量**：5 周  
> **验收标准**：见各 P0 子项

### 2.1 P0-1：Provider 上架闭环成品化 ❌

#### 目标

将"启用 market + 手工补 offers + 重启 gateway"收束成真正的卖家上架体验。

#### 功能范围

| 功能                        | 说明                                        |
| --------------------------- | ------------------------------------------- |
| **Offer 创建**              | Provider 可通过 UI/CLI 创建服务报价         |
| **Offer 编辑**              | 支持修改价格、描述、供给量、交付方式        |
| **Offer 校验**              | 自动校验服务 schema、价格合法性、供给方资质 |
| **Publish/Unpublish/Close** | 生命周期管理：发布、下架、关闭              |
| **首次上架向导**            | 引导新 Provider 完成首次上架流程            |
| **发布前检查**              | 检查必要配置、凭证、结算账户是否就绪        |

#### 数据模型

```typescript
type OfferStatus = "draft" | "published" | "unpublished" | "closed";

type ServiceOffer = {
  id: string;
  providerId: string;
  serviceSchema: ServiceSchema; // 服务描述
  pricing: PricingModel; // 定价模型
  supply: number | "unlimited"; // 供给量
  deliveryMode: "sync" | "async" | "scheduled";
  proofType: ProofType; // 交付证明类型
  settlementTerms: SettlementTerms; // 结算条款
  status: OfferStatus;
  publishedAt?: string;
  closedAt?: string;
  metadata: Record<string, unknown>;
};

type PricingModel =
  | { type: "fixed"; amount: string; currency: string }
  | { type: "metered"; unitPrice: string; currency: string; unit: string }
  | { type: "tiered"; tiers: PricingTier[] };

type ProofType = "tlsnotary" | "signed_receipt" | "api_response" | "custom";
```

#### 接口定义

```typescript
// CLI 命令
openclaw market offer create --file ./offer.json
openclaw market offer edit <offer-id> --price 0.01
openclaw market offer publish <offer-id>
openclaw market offer unpublish <offer-id>
openclaw market offer close <offer-id>

// Gateway 方法
web3.market.offer.create(offer: CreateOfferInput): Promise<Offer>
web3.market.offer.update(offerId: string, updates: UpdateOfferInput): Promise<Offer>
web3.market.offer.publish(offerId: string): Promise<Offer>
web3.market.offer.unpublish(offerId: string): Promise<Offer>
web3.market.offer.close(offerId: string): Promise<Offer>
web3.market.offer.list(filter?: OfferFilter): Promise<Offer[]>
web3.market.offer.get(offerId: string): Promise<Offer>

// 内部权威方法
market.offer.create(offer: Offer): Promise<Offer>
market.offer.update(offerId: string, updates: Partial<Offer>): Promise<Offer>
market.offer.publish(offerId: string): Promise<Offer>
market.offer.validate(offer: Offer): ValidationResult
```

#### 业务规则

1. **发布前置条件**：
   - Provider 已完成身份验证（DID/KYA）
   - 结算账户已配置
   - 服务 schema 校验通过

2. **编辑限制**：
   - `published` 状态仅允许修改 `supply`、`metadata`
   - 价格修改需先 `unpublish` 再编辑

3. **关闭条件**：
   - 存在未完成订单时，关闭需确认
   - 关闭后不可恢复

4. **敏感信息保护**：
   - Provider endpoint 不可见
   - 真实凭证不可见
   - 输出默认脱敏

#### 验收标准

- 新 Provider 在 30 分钟内完成首次上架
- 无需手动修改配置文件即可完成首次发布
- 发布失败返回稳定错误码
- 敏感字段零泄露

---

### 2.2 P0-2：Buyer 购买闭环成品化 ❌

#### 目标

把 tool/RPC 入口收束成买家可理解的购买路径。

#### 功能范围

| 功能              | 说明                                             |
| ----------------- | ------------------------------------------------ |
| **服务列表**      | 浏览可用服务，支持筛选、排序、搜索               |
| **服务详情**      | 查看服务描述、价格、供给方、交付方式、proof 方式 |
| **报价说明**      | 清晰展示定价模型、单位、示例费用                 |
| **下单确认**      | 确认购买前展示完整交易摘要                       |
| **预算/授权确认** | 检查预算余额、授权限额                           |
| **订单状态跟踪**  | 实时查看订单状态变化                             |

#### 数据模型

```typescript
type OrderStatus =
  | "pending" // 等待确认
  | "confirmed" // 已确认，等待交付
  | "delivering" // 交付中
  | "delivered" // 已交付，等待验收
  | "accepted" // 已验收
  | "rejected" // 已拒绝
  | "disputed" // 已争议
  | "completed" // 已完成
  | "cancelled" // 已取消
  | "refunded"; // 已退款

type ServiceOrder = {
  id: string;
  offerId: string;
  buyerId: string;
  providerId: string;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  currency: string;
  status: OrderStatus;
  paymentIntent?: PaymentIntent;
  settlement?: SettlementRef;
  proof?: ProofRef;
  receipt?: ReceiptRef;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  acceptedAt?: string;
  metadata: Record<string, unknown>;
};

type OrderSummary = {
  orderId: string;
  serviceName: string;
  providerName: string;
  totalAmount: string;
  currency: string;
  status: OrderStatus;
  estimatedDelivery?: string;
};
```

#### 接口定义

```typescript
// CLI 命令
openclaw market browse [--category <category>] [--sort price|rating]
openclaw market show <offer-id>
openclaw market buy <offer-id> [--quantity 1]
openclaw market order list [--status pending|confirmed|...]
openclaw market order status <order-id>

// Gateway 方法
web3.market.browse(filter?: BrowseFilter): Promise<ServiceListing[]>
web3.market.offer.quote(offerId: string, quantity: number): Promise<Quote>
web3.market.order.create(input: CreateOrderInput): Promise<Order>
web3.market.order.get(orderId: string): Promise<Order>
web3.market.order.list(filter?: OrderFilter): Promise<Order[]>
web3.market.order.cancel(orderId: string): Promise<Order>

// 内部权威方法
market.order.create(order: Order): Promise<Order>
market.order.confirm(orderId: string): Promise<Order>
market.order.cancel(orderId: string, reason: string): Promise<Order>
market.order.updateStatus(orderId: string, status: OrderStatus): Promise<Order>
```

#### 业务规则

1. **下单前检查**：
   - 预算余额 >= 订单金额
   - 授权限额未超
   - 服务供给充足

2. **状态转换**：

   ```
   pending -> confirmed -> delivering -> delivered -> accepted -> completed
                                     \-> rejected -> disputed
                    \-> cancelled
   delivered -> rejected -> refunded
   ```

3. **取消规则**：
   - `pending` 状态可自由取消
   - `confirmed` 状态取消需 Provider 同意
   - `delivering` 及之后状态不可取消

4. **价格保护**：
   - 下单时锁定价格
   - Provider 修改 offer 价格不影响已下单订单

#### 验收标准

- 新 Buyer 在 10 分钟内完成首次购买
- 下单前能看到价格、供给方、交付方式、proof 方式、预算影响
- 订单状态机稳定且可追踪

---

### 2.3 P0-3：Proof / Acceptance / Dispute 闭环

#### 目标

将"服务调用成功"升级为"可验证交付、可验收、可争议"的交易闭环。

#### 功能范围

| 功能               | 说明                 |
| ------------------ | -------------------- |
| **Proof 统一结构** | 标准化的交付证明格式 |
| **Accept/Reject**  | Buyer 验收或拒绝服务 |
| **Release/Refund** | 结算释放或退款       |
| **Dispute 发起**   | Buyer 发起争议       |
| **证据提交**       | 双方提交争议证据     |
| **裁决回写**       | 争议处理结果回写     |

#### 数据模型

```typescript
type ProofStatus = "pending" | "verified" | "rejected";

type ServiceProof = {
  id: string;
  orderId: string;
  type: ProofType;
  artifacts: ProofArtifact[];
  submittedAt: string;
  verifiedAt?: string;
  status: ProofStatus;
  verificationResult?: VerificationResult;
};

type ProofArtifact =
  | { type: "tlsnotary"; sessionHash: string; transcriptHash: string }
  | { type: "signed_receipt"; signature: string; payload: string }
  | { type: "api_response"; responseHash: string; timestamp: string }
  | { type: "custom"; data: unknown; hash: string };

type DisputeStatus = "open" | "investigating" | "resolved" | "closed";

type ServiceDispute = {
  id: string;
  orderId: string;
  initiator: "buyer" | "provider";
  reason: string;
  evidence: DisputeEvidence[];
  status: DisputeStatus;
  resolution?: DisputeResolution;
  createdAt: string;
  resolvedAt?: string;
};

type DisputeEvidence = {
  submittedBy: "buyer" | "provider";
  type: "text" | "document" | "proof_ref";
  content: string;
  hash: string;
  submittedAt: string;
};

type DisputeResolution = {
  outcome: "buyer_wins" | "provider_wins" | "split";
  refundAmount?: string;
  releaseAmount?: string;
  decidedBy: string;
  reason: string;
  decidedAt: string;
};
```

#### 接口定义

```typescript
// CLI 命令
openclaw market proof submit <order-id> --file ./proof.json
openclaw market proof verify <proof-id>
openclaw market order accept <order-id>
openclaw market order reject <order-id> --reason "..."
openclaw market dispute create <order-id> --reason "..."
openclaw market dispute evidence <dispute-id> --file ./evidence.json
openclaw market dispute resolve <dispute-id> --outcome buyer_wins

// Gateway 方法
web3.market.proof.submit(input: SubmitProofInput): Promise<ServiceProof>
web3.market.proof.verify(proofId: string): Promise<VerificationResult>
web3.market.acceptance.accept(orderId: string): Promise<Order>
web3.market.acceptance.reject(orderId: string, reason: string): Promise<Order>
web3.market.dispute.create(input: CreateDisputeInput): Promise<ServiceDispute>
web3.market.dispute.submitEvidence(disputeId: string, evidence: EvidenceInput): Promise<ServiceDispute>
web3.market.dispute.resolve(disputeId: string, resolution: ResolutionInput): Promise<ServiceDispute>

// 内部权威方法
market.proof.submit(proof: ServiceProof): Promise<ServiceProof>
market.proof.verify(proofId: string): Promise<VerificationResult>
market.acceptance.sign(orderId: string, acceptedBy: string): Promise<Order>
market.acceptance.reject(orderId: string, reason: string): Promise<Order>
market.dispute.create(dispute: ServiceDispute): Promise<ServiceDispute>
market.dispute.addEvidence(disputeId: string, evidence: DisputeEvidence): Promise<ServiceDispute>
market.dispute.resolve(disputeId: string, resolution: DisputeResolution): Promise<ServiceDispute>
```

#### 业务规则

1. **Proof 提交**：
   - Provider 必须在交付后提交 proof
   - Proof 必须包含可验证的 artifact
   - 敏感数据默认 hash 化

2. **Acceptance 流程**：
   - Buyer 在 review window 内未响应，默认 accept
   - Accept 触发 settlement release
   - Reject 可转 dispute

3. **Dispute 流程**：
   - 仅 `delivered` 或 `rejected` 状态可发起争议
   - 证据以 hash/引用形式存储
   - 裁决后自动执行资金分配

4. **资金流转**：
   ```
   Accept -> Release 100% to Provider
   Reject -> Refund 100% to Buyer
   Dispute(buyer_wins) -> Refund to Buyer
   Dispute(provider_wins) -> Release to Provider
   Dispute(split) -> Partial release + partial refund
   ```

#### 验收标准

- 每笔交易均可关联 order、proof、receipt、ledger
- Accept 触发 release
- Reject 可转 dispute
- 证据默认摘要化/hash 化

---

### 2.4 P0-4：Control 面成品化

#### 目标

将 market UI 从"读看板"补成"可运营、可治理、可排障"的后台。

#### 功能范围

| 功能                   | 说明                             |
| ---------------------- | -------------------------------- |
| **Provider 管理**      | 查看、审核、启用/禁用 Provider   |
| **订单/交付/争议检索** | 多条件查询、筛选、导出           |
| **风险与预算治理**     | 配置预算策略、风险阈值、熔断条件 |
| **告警/健康探针**      | 配置告警规则、查看健康状态       |
| **审计与回滚辅助视图** | 查看操作审计、辅助回滚决策       |

#### 数据模型

```typescript
type ProviderStatus = "pending" | "active" | "suspended" | "banned";

type ProviderProfile = {
  id: string;
  name: string;
  did: string;
  status: ProviderStatus;
  offers: OfferSummary[];
  stats: ProviderStats;
  verifiedAt?: string;
  suspendedAt?: string;
  suspensionReason?: string;
};

type ProviderStats = {
  totalOrders: number;
  completedOrders: number;
  disputedOrders: number;
  averageRating: number;
  totalRevenue: string;
};

type RiskPolicy = {
  maxDailySpend: string;
  maxOrderAmount: string;
  autoAcceptEnabled: boolean;
  autoDisputeThreshold: number;
  circuitBreaker: CircuitBreakerConfig;
};

type CircuitBreakerConfig = {
  failureRateThreshold: number;
  minRequestsForEvaluation: number;
  openDuration: number;
  halfOpenRequests: number;
};

type AuditLog = {
  id: string;
  action: string;
  entityType: "order" | "offer" | "dispute" | "provider" | "policy";
  entityId: string;
  operator: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  timestamp: string;
};

type HealthProbe = {
  component: string;
  status: "healthy" | "degraded" | "unhealthy";
  lastCheck: string;
  details: Record<string, unknown>;
};
```

#### 接口定义

```typescript
// CLI 命令
openclaw market provider list [--status active|suspended]
openclaw market provider show <provider-id>
openclaw market provider suspend <provider-id> --reason "..."
openclaw market provider activate <provider-id>
openclaw market search orders --status disputed --from 2026-01-01
openclaw market policy show
openclaw market policy set maxDailySpend 100
openclaw market audit log --entity-type order --entity-id <id>
openclaw market health

// Gateway 方法
web3.market.provider.list(filter?: ProviderFilter): Promise<ProviderProfile[]>
web3.market.provider.get(providerId: string): Promise<ProviderProfile>
web3.market.provider.suspend(providerId: string, reason: string): Promise<ProviderProfile>
web3.market.provider.activate(providerId: string): Promise<ProviderProfile>
web3.market.search.query(input: SearchInput): Promise<SearchResult>
web3.market.policy.get(): Promise<RiskPolicy>
web3.market.policy.update(updates: Partial<RiskPolicy>): Promise<RiskPolicy>
web3.market.audit.query(filter?: AuditFilter): Promise<AuditLog[]>
web3.market.health.check(): Promise<HealthStatus>

// 内部权威方法
market.provider.list(filter?: ProviderFilter): Promise<ProviderProfile[]>
market.provider.updateStatus(providerId: string, status: ProviderStatus, reason?: string): Promise<ProviderProfile>
market.search.orders(filter: OrderFilter): Promise<Order[]>
market.search.disputes(filter: DisputeFilter): Promise<ServiceDispute[]>
market.policy.get(): Promise<RiskPolicy>
market.policy.update(updates: Partial<RiskPolicy>): Promise<RiskPolicy>
market.audit.record(log: AuditLogInput): Promise<AuditLog>
market.audit.query(filter?: AuditFilter): Promise<AuditLog[]>
```

#### 业务规则

1. **Provider 管理**：
   - 新 Provider 默认 `pending` 状态
   - `suspend` 需填写原因，记录审计日志
   - 被禁 Provider 的 offer 自动下架

2. **风险治理**：
   - 超过 `maxDailySpend` 触发告警
   - 超过 `maxOrderAmount` 需人工审批
   - 熔断触发后自动降级

3. **审计要求**：
   - 所有写操作记录审计日志
   - 审计日志不可删除/修改
   - 保留周期可配置

#### 验收标准

- Operator 可独立查询、定位、处置常见异常
- 风险动作均有审计记录
- UI 不再只有"启用 + 刷新"两类动作

---

### 2.5 P0-5：契约统一与发布口径收敛 🟡

#### 目标

让代码、docs、catalog、UI、命令和测试使用同一套说法。

#### 功能范围

| 功能                          | 说明                              |
| ----------------------------- | --------------------------------- |
| **Capability Stability 统一** | 统一标记 stable/beta/experimental |
| **Docs 重写与删减过度承诺**   | 清理文档中的过度宣称              |
| **UI/Command 文案统一**       | 统一术语和描述                    |
| **Catalog Schema 完整化**     | 完善能力描述 schema               |
| **Beta FAQ 与发布说明**       | 编写用户-facing 文档              |

#### 数据模型

```typescript
type StabilityLevel = "stable" | "beta" | "experimental" | "deprecated";

type CapabilityDescriptor = {
  method: string;
  namespace: string;
  summary: string;
  description: string;
  stability: StabilityLevel;
  prerequisites: string[];
  parameters: ParameterDescriptor[];
  returns: ReturnDescriptor;
  examples: ExampleDescriptor[];
  errors: ErrorDescriptor[];
  since: string;
  deprecated?: { since: string; removalVersion: string; replacement?: string };
};

type CatalogSchema = {
  version: string;
  capabilities: CapabilityDescriptor[];
  namespaces: NamespaceDescriptor[];
  glossary: GlossaryEntry[];
};
```

#### 接口定义

```typescript
// CLI 命令
openclaw catalog list [--namespace web3.market]
openclaw catalog show <method>
openclaw catalog validate

// Gateway 方法
web3.catalog.list(filter?: CatalogFilter): Promise<CapabilityDescriptor[]>
web3.catalog.get(method: string): Promise<CapabilityDescriptor>
web3.catalog.validate(): Promise<ValidationResult>
```

#### 业务规则

1. **稳定性分级**：
   - `stable`: 生产可用，承诺向后兼容
   - `beta`: 功能完整，可能有 breaking change
   - `experimental`: 原型阶段，不承诺稳定性
   - `deprecated`: 已废弃，计划移除

2. **文档约束**：
   - 仅对外承诺 Invite Beta 级能力
   - experimental 能力不进入主卖点
   - 区分"已实现"与"计划中"

3. **Catalog 要求**：
   - 每个方法必须有 descriptor
   - 示例必须可执行
   - 错误码必须完整

#### 验收标准

- 仅对外承诺 Invite Beta 级能力
- experimental 能力不进入主卖点
- catalog 能独立支撑 agent 构造请求

---

## 3. Phase 2: Service Wrapper & Generic Proof Foundation

### 3.1 目标

从 `serviceSchema` 增量演进到 `ServiceWrapper`，支持更丰富的服务类型和 proof 模型。

### 3.2 功能范围

| 功能                    | 说明                                                          |
| ----------------------- | ------------------------------------------------------------- |
| **ServiceWrapper 类型** | 包装现有 serviceSchema，增加 category/acceptance/proof policy |
| **Generic Proof Types** | 通用化 proof 类型，支持多种证明族                             |
| **Acceptance Policy**   | 定义验收模式、验收窗口、里程碑数量                            |
| **Proof Policy**        | 定义证明族、必需性、最小 artifact 数量                        |
| **向后兼容**            | 旧 serviceSchema 数据可正常工作                               |

### 3.3 数据模型

```typescript
type ServiceCategory = "digital" | "human" | "rwa";

type AcceptanceMode = "auto" | "human" | "milestone" | "oracle";

type ProofFamily =
  | "tlsnotary" // TLS Notary 证明
  | "signed_receipt" // 签名收据
  | "human_attestation" // 人类证明
  | "oracle_event"; // 预言机事件

type AcceptancePolicy = {
  mode: AcceptanceMode;
  reviewWindowHours?: number;
  milestoneCount?: number;
  arbitratorType?: "manual" | "dao" | "partner";
};

type ProofPolicy = {
  families: ProofFamily[];
  required: boolean;
  minArtifacts?: number;
};

type ServiceWrapper = {
  version: "v1";
  category: ServiceCategory;
  serviceSchema?: unknown; // 兼容锚点
  acceptance: AcceptancePolicy;
  proof: ProofPolicy;
  tags?: string[];
};

// Generic Proof 扩展
type GenericProof = {
  id: string;
  orderId: string;
  family: ProofFamily;
  artifacts: ProofArtifact[];
  metadata: Record<string, unknown>;
  verifiedAt?: string;
  verificationProof?: string;
};
```

### 3.4 接口定义

```typescript
// Gateway 方法
web3.market.offer.quote(offerId: string, quantity: number): Promise<Quote>
web3.market.offer.compare(offerIds: string[]): Promise<ComparisonResult>
web3.market.proof.submit(input: GenericProofInput): Promise<GenericProof>
web3.market.proof.verify(proofId: string): Promise<VerificationResult>

// 内部权威方法
market.proof.submit(proof: GenericProof): Promise<GenericProof>
market.proof.verify(proofId: string): Promise<VerificationResult>
market.wrapper.wrap(serviceSchema: unknown, wrapper: ServiceWrapperInput): Promise<ServiceWrapper>
```

### 3.5 业务规则

1. **兼容性约束**：
   - 旧 `serviceSchema` 数据自动包装为默认 `ServiceWrapper`
   - 新字段均为可选，不破坏现有流程
   - wrapper 元数据可增量添加

2. **Proof 族选择**：
   - `digital` 服务默认 `tlsnotary` 或 `signed_receipt`
   - `human` 服务需要 `human_attestation`
   - `rwa` 服务可能需要 `oracle_event`

3. **Acceptance 模式映射**：
   - `auto`: 自动验收（如 API 调用）
   - `human`: 需人工确认
   - `milestone`: 分阶段验收
   - `oracle`: 预言机验证

### 3.6 验收标准

- 现有服务流程仍可正常工作
- 新 wrapper 元数据可验证并持久化
- reconciliation 可引用通用 proof 摘要数据

---

## 4. Phase 3: Acceptance & Execution-State Model ❌ 未开始

### 4.1 目标

增加明确的验收权威和执行状态查询面，将 proof、acceptance 和 disputes 紧密绑定。

### 4.2 功能范围

| 功能                              | 说明                     |
| --------------------------------- | ------------------------ |
| **Acceptance Authority**          | 明确的验收签核/拒绝流程  |
| **Execution-State Query**         | 查询执行状态，不泄露凭证 |
| **Proof-Acceptance-Dispute 绑定** | 三者通过共享 ID 关联     |
| **里程碑验收**                    | 支持分阶段验收           |

### 4.3 数据模型

```typescript
type AcceptanceStatus = "pending" | "accepted" | "rejected" | "expired";

type AcceptanceRecord = {
  id: string;
  orderId: string;
  proofId: string;
  status: AcceptanceStatus;
  acceptedBy?: string;
  rejectedBy?: string;
  rejectReason?: string;
  milestones?: MilestoneAcceptance[];
  expiresAt: string;
  acceptedAt?: string;
  rejectedAt?: string;
};

type MilestoneAcceptance = {
  index: number;
  description: string;
  status: "pending" | "accepted" | "rejected";
  acceptedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
};

type ExecutionState = {
  orderId: string;
  phase: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  error?: ErrorInfo;
  // 不包含凭证、endpoint、token
};

type ExecutionStateQuery = {
  orderId: string;
  includeProgress: boolean;
  includeTiming: boolean;
  includeError: boolean;
};
```

### 4.4 接口定义

```typescript
// Gateway 方法
web3.market.acceptance.sign(orderId: string): Promise<AcceptanceRecord>
web3.market.acceptance.reject(orderId: string, reason: string): Promise<AcceptanceRecord>
web3.market.acceptance.milestone(orderId: string, index: number, accepted: boolean): Promise<AcceptanceRecord>
web3.market.execution.status(orderId: string): Promise<ExecutionState>

// 内部权威方法
market.acceptance.sign(orderId: string, acceptedBy: string): Promise<AcceptanceRecord>
market.acceptance.reject(orderId: string, rejectedBy: string, reason: string): Promise<AcceptanceRecord>
market.acceptance.milestone(orderId: string, index: number, accepted: boolean): Promise<AcceptanceRecord>
market.execution.get(orderId: string): Promise<ExecutionState>
```

### 4.5 业务规则

1. **验收窗口**：
   - 默认 7 天验收窗口
   - 窗口内未响应，按 AcceptancePolicy.mode 处理
   - 过期后自动 accepted（可配置）

2. **里程碑验收**：
   - 每个 milestone 独立验收
   - 任一 milestone rejected 可触发 dispute
   - 全部 accepted 后触发 settlement release

3. **执行状态查询**：
   - 不泄露敏感信息（token、endpoint）
   - 仅返回状态、进度、时序、错误

4. **绑定约束**：
   - Dispute 必须引用 proofId 和 acceptanceId
   - Settlement 必须引用 acceptanceId
   - Ledger 条目必须关联 orderId

### 4.6 验收标准

- 数字服务订单可明确 accept 或 reject
- 执行状态可查询且不泄露凭证
- 争议证据可引用 proof 和 acceptance ID

---

## 5. Phase 4: Market-backed MCP & A2A Bridge ❌ 未开始

### 5.1 目标

将市场能力暴露为 MCP 安全门面，并将 A2A 执行与租约/proof/acceptance 元数据绑定。

### 5.2 功能范围

| 功能                     | 说明                           |
| ------------------------ | ------------------------------ |
| **MCP 市场门面**         | 暴露脱敏、稳定的 MCP 入口      |
| **Lease-gated Provider** | 租约控制的 MCP server 访问     |
| **A2A 执行会话**         | 绑定市场元数据的跨 Agent 任务  |
| **Execution 引用**       | A2A 任务可引用 execution/proof |

### 5.3 数据模型

```typescript
type MCPMarketFacade = {
  method: string;
  namespace: "market";
  input: MCPInputSchema;
  output: MCPOutputSchema;
  requiresLease: boolean;
  redaction: RedactionPolicy;
};

type LeaseGatedProvider = {
  providerId: string;
  mcpServer: MCPServerConfig;
  leaseRequirement: {
    resourceId: string;
    minDuration: number;
    permissions: string[];
  };
};

type A2AExecutionSession = {
  id: string;
  initiatorAgent: string;
  executorAgent: string;
  orderId?: string;
  leaseId?: string;
  proofId?: string;
  acceptanceId?: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: A2AResult;
  createdAt: string;
  completedAt?: string;
};

type A2AResult = {
  success: boolean;
  output?: unknown;
  executionRef?: string;
  proofRef?: string;
  error?: ErrorInfo;
};
```

### 5.4 接口定义

```typescript
// MCP 市场门面
mcp.market.browse(filter?: BrowseFilter): Promise<ServiceListing[]>
mcp.market.order(input: MCPCreateOrderInput): Promise<OrderSummary>
mcp.market.status(orderId: string): Promise<OrderStatus>

// A2A 执行
a2a.session.create(input: A2ASessionInput): Promise<A2AExecutionSession>
a2a.session.get(sessionId: string): Promise<A2AExecutionSession>
a2a.session.result(sessionId: string): Promise<A2AResult>

// 内部权威方法
market.mcp.authorize(input: MCPAuthorizeInput): Promise<MCPAuthorization>
market.a2a.createSession(session: A2AExecutionSession): Promise<A2AExecutionSession>
market.a2a.updateSession(sessionId: string, updates: Partial<A2AExecutionSession>): Promise<A2AExecutionSession>
```

### 5.5 业务规则

1. **MCP 门面约束**：
   - 所有输出默认脱敏
   - 敏感字段（token、endpoint）不可见
   - 需要 lease 的操作必须先获取租约

2. **Lease-gated 访问**：
   - MCP server 访问需要有效 lease
   - Lease 过期后自动拒绝
   - Lease 权限决定可访问的 MCP 方法

3. **A2A 执行绑定**：
   - A2A 任务可选绑定 orderId
   - 完成后可提交 proof 引用
   - 不在 A2A 协议中嵌入结算逻辑

4. **责任分离**：
   - MCP 负责工具/数据访问
   - A2A 负责 Agent 协作
   - Market 负责经济问责

### 5.6 验收标准

- MCP 门面暴露脱敏、稳定入口
- A2A 执行任务可报告 execution/proof 引用
- 结算权威不泄露到协调协议

---

## 6. Phase 5: Human-Service & RWA Preparation ❌ 未开始

### 6.1 目标

为人类服务和现实世界资产服务做准备，不破坏数字服务闭环。

### 6.2 功能范围

| 功能                           | 说明                         |
| ------------------------------ | ---------------------------- |
| **Human Attestation Proof**    | 人类证明族                   |
| **Oracle Event Proof**         | 预言机事件证明               |
| **Milestone-based Acceptance** | 分阶段验收（适用于长期服务） |
| **Human Review Workflow**      | 人工审核流程                 |
| **跨司法管辖区合规标记**       | 合规层预留                   |

### 6.3 数据模型

```typescript
type HumanAttestationProof = {
  type: "human_attestation";
  attester: {
    did: string;
    role: "reviewer" | "auditor" | "expert";
    credentials?: string[];
  };
  attestation: {
    claim: string;
    evidence: string[];
    confidence: number;
    signedAt: string;
    signature: string;
  };
};

type OracleEventProof = {
  type: "oracle_event";
  oracle: {
    type: "chainlink" | "pyth" | "custom";
    address: string;
  };
  event: {
    name: string;
    parameters: Record<string, unknown>;
    blockNumber: number;
    transactionHash: string;
  };
  verifiedAt: string;
};

type HumanReviewWorkflow = {
  id: string;
  orderId: string;
  reviewers: Reviewer[];
  reviewDeadline: string;
  reviews: Review[];
  consensus: "unanimous" | "majority" | "weighted";
  status: "pending" | "in_review" | "completed" | "disputed";
};

type Reviewer = {
  did: string;
  role: string;
  weight: number;
};

type Review = {
  reviewerDid: string;
  outcome: "approved" | "rejected" | "needs_info";
  comments: string;
  reviewedAt: string;
};
```

### 6.4 接口定义

```typescript
// Proof 提交
web3.market.proof.submitHumanAttestation(input: HumanAttestationInput): Promise<HumanAttestationProof>
web3.market.proof.submitOracleEvent(input: OracleEventInput): Promise<OracleEventProof>

// Human Review
web3.market.review.create(input: CreateReviewInput): Promise<HumanReviewWorkflow>
web3.market.review.submit(reviewId: string, review: ReviewInput): Promise<HumanReviewWorkflow>
web3.market.review.get(reviewId: string): Promise<HumanReviewWorkflow>
```

### 6.5 业务规则

1. **Proof 族扩展**：
   - 新 Proof 族不破坏现有 Proof 结构
   - 每个 Proof 族有独立的验证逻辑
   - 验证失败不影响其他 Proof 族

2. **Human Review**：
   - 支持多审核人、加权投票
   - 达成共识后自动推进订单状态
   - 审核争议可升级为 Dispute

3. **合规标记**：
   - 服务可标记适用的司法管辖区
   - 用户购买时检查合规要求
   - 跨区交易可触发额外审核

### 6.6 验收标准

- 设计保持增量性
- 数字服务流程仍是默认成熟基准
- 新 Proof 族可验证

---

## 7. Phase 6: Multi-Agent Coordination with Market Accountability (2027) ❌ 未开始

### 7.1 目标

让跨 Agent 服务执行成为合约式而非临时式。

### 7.2 功能范围

| 功能                                 | 说明                        |
| ------------------------------------ | --------------------------- |
| **Lease-gated Provider MCP Servers** | 租约控制的 MCP server 访问  |
| **A2A-linked Execution Sessions**    | 绑定市场的跨 Agent 执行会话 |
| **Milestone Acceptance**             | 更丰富的里程碑验收          |
| **Reputation & Proof Coupling**      | 信誉与 Proof 耦合           |
| **Stronger Control-plane**           | 更强的控制面功能            |

### 7.3 数据模型

```typescript
type AgentReputation = {
  agentDid: string;
  profile: {
    totalJobs: number;
    completedJobs: number;
    disputedJobs: number;
    averageRating: number;
    specializations: string[];
  };
  proofs: ProofSummary[];
  attestations: AttestationSummary[];
  lastUpdated: string;
};

type ProofSummary = {
  type: ProofFamily;
  count: number;
  verifiedRate: number;
};

type AttestationSummary = {
  attesterRole: string;
  count: number;
  averageConfidence: number;
};

type CrossAgentContract = {
  id: string;
  parties: ContractParty[];
  terms: ContractTerms;
  milestones: ContractMilestone[];
  status: "draft" | "active" | "completed" | "disputed" | "terminated";
  createdAt: string;
  effectiveAt?: string;
  completedAt?: string;
};

type ContractParty = {
  agentDid: string;
  role: "buyer" | "provider" | "arbitrator";
  obligations: string[];
  rights: string[];
};

type ContractMilestone = {
  index: number;
  description: string;
  deliverable: string;
  deadline: string;
  status: "pending" | "submitted" | "accepted" | "rejected";
  proofId?: string;
  acceptedAt?: string;
};
```

### 7.4 接口定义

```typescript
// Agent Reputation
web3.reputation.get(agentDid: string): Promise<AgentReputation>
web3.reputation.update(agentDid: string, event: ReputationEvent): Promise<AgentReputation>

// Cross-Agent Contract
web3.contract.create(input: CreateContractInput): Promise<CrossAgentContract>
web3.contract.get(contractId: string): Promise<CrossAgentContract>
web3.contract.milestone.submit(contractId: string, index: number, proof: ProofInput): Promise<CrossAgentContract>
web3.contract.milestone.accept(contractId: string, index: number): Promise<CrossAgentContract>
web3.contract.milestone.reject(contractId: string, index: number, reason: string): Promise<CrossAgentContract>
web3.contract.terminate(contractId: string, reason: string): Promise<CrossAgentContract>
```

### 7.5 业务规则

1. **Reputation 计算**：
   - 基于 verified proof 数量、成功率、争议率
   - 可配置权重公式
   - 支持按领域/技能维度评分

2. **合约执行**：
   - Milestone 逐一验收
   - 每个 milestone 可独立触发 payment
   - 争议可针对特定 milestone

3. **Arbitrator 角色**：
   - 合约可指定第三方 arbitrator
   - Arbitrator 可裁决争议
   - Arbitrator 信誉影响其裁决权重

### 7.6 验收标准

- Agent 信誉画像可用于市场撮合权重
- 跨 Agent 合约可执行、可审计
- 争议可追溯到具体 milestone

---

## 8. Phase 7: Digital + Human + RWA Unified (2028) ❌ 未开始

### 8.1 目标

统一数字、人类和现实世界服务到一个可问责运营模型。

### 8.2 功能范围

| 功能                   | 说明                          |
| ---------------------- | ----------------------------- |
| **Human-service EaaS** | 人类服务作为可执行服务        |
| **RWA 挂钩的服务证明** | 现实世界资产服务的 Proof 机制 |
| **跨司法管辖区合规层** | 自动化合规检查                |
| **DAO/机构级控制面**   | 支持更复杂的治理结构          |

### 8.3 数据模型

```typescript
type HumanServiceWrapper = ServiceWrapper & {
  category: "human";
  humanService: {
    type: "consultation" | "review" | "implementation" | "support";
    providerCredentials: CredentialRequirement[];
    deliveryFormat: "async" | "sync" | "onsite";
    timezoneConstraints?: string[];
    languageRequirements?: string[];
  };
};

type RWAServiceWrapper = ServiceWrapper & {
  category: "rwa";
  rwaService: {
    assetType: "physical" | "rights" | "mixed";
    jurisdiction: string;
    compliance: ComplianceRequirement[];
    physicalLocation?: string;
    insuranceRequired: boolean;
    thirdPartyVerification: boolean;
  };
};

type ComplianceRequirement = {
  jurisdiction: string;
  regulation: string;
  requiredChecks: string[];
  exemptions?: string[];
};

type InstitutionalControlPlane = {
  id: string;
  organization: string;
  governance: GovernanceConfig;
  treasury: TreasuryConfig;
  members: Member[];
  policies: Policy[];
  auditLog: AuditEntry[];
};

type GovernanceConfig = {
  votingMechanism: "simple" | "weighted" | "quadratic";
  proposalThreshold: number;
  votingPeriod: number;
  quorum: number;
};

type TreasuryConfig = {
  multisigRequired: boolean;
  signers: string[];
  threshold: number;
  dailyLimit: string;
};
```

### 8.4 接口定义

```typescript
// Human Service
web3.market.human.createOffer(input: HumanServiceOfferInput): Promise<HumanServiceWrapper>
web3.market.human.book(offerId: string, slot: TimeSlotInput): Promise<Order>
web3.market.human.attest(orderId: string, attestation: HumanAttestationInput): Promise<ServiceProof>

// RWA Service
web3.market.rwa.createOffer(input: RWAServiceOfferInput): Promise<RWAServiceWrapper>
web3.market.rwa.verify(orderId: string, verification: RWAVerificationInput): Promise<ServiceProof>
web3.market.rwa.insurance.check(orderId: string): Promise<InsuranceStatus>

// Institutional
web3.institution.create(input: CreateInstitutionInput): Promise<InstitutionalControlPlane>
web3.institution.governance.propose(input: ProposalInput): Promise<Proposal>
web3.institution.governance.vote(proposalId: string, vote: VoteInput): Promise<Vote>
web3.institution.treasury.approve(transactionId: string): Promise<Approval>
```

### 8.5 业务规则

1. **Human Service 约束**：
   - Provider 必须满足 credential 要求
   - 跨时区服务需明确时区约束
   - 语言匹配影响撮合权重

2. **RWA Service 约束**：
   - 必须明确司法管辖区
   - 可能需要第三方验证
   - 保险要求影响结算条件

3. **机构治理**：
   - 支持 multisig 签署
   - 支持 DAO 投票机制
   - 审计日志不可篡改

### 8.6 验收标准

- 人类服务可下单、可验证、可争议
- RWA 服务 proof 可链接到预言机/物联网数据
- 机构控制面支持 multisig 和 DAO 治理

---

## 9. 统一架构约束（全阶段适用）

### 9.1 公共契约边界

| 命名空间   | 可见性 | 职责                      |
| ---------- | ------ | ------------------------- |
| `web3.*`   | 公开   | 用户/Agent 面向的编排入口 |
| `market.*` | 内部   | 权威执行层，不直接暴露    |

### 9.2 敏感信息保护

- **不可见**：token、endpoint、真实路径、凭证
- **默认脱敏**：所有输出面
- **审计可追溯**：操作日志、状态变更

### 9.3 数据一致性

- **File/SQLite 双存储**：行为必须一致
- **事务保护**：多对象写入原子性
- **状态机约束**：状态转换必须合法

### 9.4 链角色约束

- **链下**：discovery、quote、prompt、数据、模型权重
- **链上**：lease、settlement、audit、hash 承诺

### 9.5 禁止事项

1. **不暴露 `market.*` 为公开 API**
2. **不在 A2A 协议中嵌入结算逻辑**
3. **不削弱脱敏保证**
4. **不在 serviceSchema 兼容前破坏旧数据**
5. **不在数字服务成熟前宣称 human/RWA 生产就绪**

---

## 10. 验收总门禁

### 10.1 安全门禁

- **Gate-SEC-01**：敏感信息零泄露
- **Gate-SEC-02**：权限校验完整
- **Gate-SEC-03**：审计日志完整

### 10.2 数据门禁

- **Gate-DATA-01**：File/SQLite 行为一致
- **Gate-DATA-02**：多对象写入原子性
- **Gate-DATA-03**：状态机转换合法

### 10.3 经济门禁

- **Gate-ECO-01**：权威记账不可伪造
- **Gate-ECO-02**：结算闭环可执行
- **Gate-ECO-03**：争议处理可追溯

### 10.4 契约门禁

- **Gate-CONTRACT-01**：Capability 稳定性标记正确
- **Gate-CONTRACT-02**：Catalog 覆盖率 100%
- **Gate-CONTRACT-03**：文档与代码一致

---

## 附录 A：供给类型定义

### A.1 第一版支持的供给类型

| 类型              | 说明                 | Proof 族                  |
| ----------------- | -------------------- | ------------------------- |
| **搜索**          | 网络搜索、数据检索   | tlsnotary, api_response   |
| **数据增强**      | 数据清洗、标注、转换 | signed_receipt, custom    |
| **模型推理**      | LLM、图像、语音推理  | tlsnotary, api_response   |
| **自动化工作流**  | 定时任务、批处理     | signed_receipt, custom    |
| **代码/安全审查** | 代码审查、安全扫描   | tlsnotary, signed_receipt |

### A.2 后续阶段扩展类型

| 阶段    | 新增类型                     |
| ------- | ---------------------------- |
| Phase 5 | 人类专家咨询、人工审核       |
| Phase 7 | 物流跟踪、IoT 验证、RWA 交割 |

---

## 附录 B：错误码定义

### B.1 通用错误码

| 错误码           | 说明         |
| ---------------- | ------------ |
| `INVALID_INPUT`  | 输入参数无效 |
| `UNAUTHORIZED`   | 未授权       |
| `FORBIDDEN`      | 禁止访问     |
| `NOT_FOUND`      | 资源不存在   |
| `CONFLICT`       | 状态冲突     |
| `INTERNAL_ERROR` | 内部错误     |

### B.2 市场专用错误码

| 错误码                      | 说明               |
| --------------------------- | ------------------ |
| `OFFER_NOT_PUBLISHED`       | Offer 未发布       |
| `ORDER_NOT_PENDING`         | 订单状态不允许操作 |
| `INSUFFICIENT_BALANCE`      | 余额不足           |
| `INSUFFICIENT_SUPPLY`       | 供给不足           |
| `PROOF_VERIFICATION_FAILED` | Proof 验证失败     |
| `SETTLEMENT_OVER_RELEASE`   | 结算超额释放       |
| `DISPUTE_ALREADY_RESOLVED`  | 争议已解决         |
| `LEASE_EXPIRED`             | 租约已过期         |
| `IDEMPOTENCY_CONFLICT`      | 幂等键冲突         |
| `PAYMENT_EXPIRED`           | 支付发票已过期     |

---

## 附录 C：Feature Flags

| Flag                         | 说明          | 默认值  |
| ---------------------------- | ------------- | ------- |
| `web3.kya.enabled`           | KYA 策略引擎  | `true`  |
| `web3.payfi.metered.enabled` | 流式结算      | `true`  |
| `web3.x402.autopay.enabled`  | x402 自动支付 | `false` |
| `web3.mdl.libp2p.enabled`    | libp2p 发现   | `true`  |
| `web3.market.human.enabled`  | 人类服务      | `false` |
| `web3.market.rwa.enabled`    | RWA 服务      | `false` |

---

## 附录 D：指标定义

### D.1 核心指标

| 指标名                                  | 说明         | 类型      |
| --------------------------------------- | ------------ | --------- |
| `web3.order.count`                      | 订单总数     | counter   |
| `web3.order.success.rate`               | 订单成功率   | gauge     |
| `web3.settlement.total`                 | 结算总额     | counter   |
| `web3.settlement.partial.release.count` | 部分释放次数 | counter   |
| `web3.dispute.count`                    | 争议总数     | counter   |
| `web3.dispute.resolution.time`          | 争议解决时间 | histogram |

### D.2 x402 自动支付指标

| 指标名                                | 说明           | 类型    |
| ------------------------------------- | -------------- | ------- |
| `x402.autopay.success.rate`           | 自动支付成功率 | gauge   |
| `x402.autopay.failure.rate`           | 自动支付失败率 | gauge   |
| `x402.autopay.retry.count`            | 重试次数       | counter |
| `x402.autopay.circuit_breaker.trips`  | 熔断次数       | counter |
| `x402.autopay.duplicate_charge.count` | 重复扣款次数   | counter |

### D.3 策略指标

| 指标名                       | 说明           | 类型    |
| ---------------------------- | -------------- | ------- |
| `policy.reject.rate`         | 策略拒绝率     | gauge   |
| `policy.daily_cap.hit.count` | 日限额命中次数 | counter |
| `policy.allowlist.hit.count` | 白名单命中次数 | counter |
