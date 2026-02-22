## Market Core 插件

### 概览

`market-core` 提供数据、API 或服务类资产的全生命周期管理，覆盖挂牌、下单、支付托管、授权同意、交付、撤回、结算与审计。插件内置可验证哈希链与链上锚定能力，并提供透明度摘要与链路追踪接口，满足可解释透明度与合规审计需求。

### 设计目标

- **可验证**: 所有关键对象生成确定性哈希并记录审计日志。
- **可撤回**: 支持撤回 Webhook 执行器与重试队列。
- **可追踪**: 透明度摘要和链路查询覆盖 Offer 到 Settlement 的全链路。
- **可扩展**: 对不同交付类型与结算方式保持统一接口。
- **可解释**: 提供数据使用链路与可追溯证据。

### 研究与场景对齐

- **控制感与收益感**: 设计将“用途约束 + 签名同意 + 审计回放”作为强制路径，满足控制感与收益可追溯诉求（参考 [BMC 研究](https://link.springer.com/article/10.1186/s12911-019-0886-9) 与 [2024 研究](https://link.springer.com/10.1186/s13690-024-01416-z)）。
- **数据层面的透明度**: 透明度摘要与链路追踪直接展示“使用了哪些数据、产生了什么影响”，符合用户偏好的数据级解释（参考 [隐私偏好研究](https://link.springer.com/article/10.1007/s12525-020-00447-y)）。
- **合规可追溯**: 以哈希锚定实现最小披露与争议举证能力，契合欧盟 EHDS 对个人控制与二次使用治理的趋势（参考 [EHDS](https://health.ec.europa.eu/ehealth-digital-health-and-care/european-health-data-space-regulation-ehds_en)）。

### 核心对象

`market-core` 同时覆盖两条能力链路：

- **交易与结算市场**：Offer/Order/Consent/Delivery/Settlement（面向“买卖与托管”）。
- **资源共享市场**：Resource/Lease/Ledger（面向“出租能力并由 Provider 权威记账”）。

并且在产品口径上遵循“**支付双入口，结算单出口**”：用户可以选择在 TON 或 EVM 支付，但订单/账本/争议/结算与对账摘要保持统一（见 `docs/web3/WEB3_DUAL_STACK_STRATEGY.md` 与 `docs/reference/web3-dual-stack-payments-and-settlement.md`）。

- **Offer**: 资产发布与定价信息，包含 `assetId`、`assetType`、`usageScope` 与 `offerHash`。
- **Order**: 订单状态机与支付托管状态。
- **Consent**: 由买方签名的用途同意，确保用途约束一致。
- **Delivery**: 交付凭证或访问入口，支持 download、api、service。
- **Settlement**: 托管锁定、释放与退款的结算记录。
- **Resource**: 可出租的资源（模型、搜索、存储或其它服务）。
- **Lease**: 对 Resource 的时间窗授权与一次性访问 token（明文 token 只允许签发时返回一次）。
- **Ledger**: Provider 权威账本条目，用于结算与审计。
- **RevocationJob**: 撤回失败后的重试任务。
- **AuditEvent**: 审计事件流，支持审计链路与透明度汇总。

### 网关方法（内部 `market.*`）

> `market.*` 仅供 `web3-core` 与受信运维使用，对外入口请使用 `web3.*`。

- **Offer**: `market.offer.create` `market.offer.publish` `market.offer.update` `market.offer.close`
- **Order**: `market.order.create` `market.order.cancel`
- **Settlement**: `market.settlement.lock` `market.settlement.release` `market.settlement.refund` `market.settlement.status`
- **Consent**: `market.consent.grant` `market.consent.revoke`
- **Delivery**: `market.delivery.issue` `market.delivery.complete` `market.delivery.revoke`
- **Transparency**: `market.status.summary` `market.audit.query` `market.transparency.summary` `market.transparency.trace`
- **Revocation**: `market.revocation.retry`

资源共享（B-2，resources/leases/ledger）：

- **Resource**: `market.resource.publish` `market.resource.unpublish` `market.resource.get` `market.resource.list`
- **Lease**: `market.lease.issue` `market.lease.revoke` `market.lease.get` `market.lease.list` `market.lease.expireSweep`
- **Ledger**: `market.ledger.append` `market.ledger.list` `market.ledger.summary`
- **Repair**: `market.repair.retry`

### 数据链路概览

1. **Offer 创建**: 生成 `offerHash`，写入审计并链上锚定。
2. **Order 创建**: 校验 `offer` 可用性，生成 `orderHash` 并锚定。
3. **Payment 锁定**: 调用链上托管或锚定模式，写入 `Settlement` 记录。
4. **Consent 同意**: 买方签名验证与用途约束一致性校验。
5. **Delivery 交付**: 生成 `deliveryHash` 并锚定，敏感交付凭证可外部化存储，仅在状态中保留引用。
6. **Settlement 释放或退款**: 生成 `settlementHash` 并锚定。
7. **Revocation 撤回**: 生成 `revokeHash`，触发撤回 Webhook，失败进入重试队列。
8. **Transparency 查询**: 汇总统计或按对象链路查询审计事件。

### 哈希与链上锚定

- 使用确定性 JSON 规范化生成 `hashCanonical`。
- 关键对象的哈希写入审计日志，并可链上锚定到 EVM 网络。

### 访问控制与用途约束

- **访问策略**: `access.mode` 支持 `open`、`scoped`、`allowlist`，并可配置 `allowClientIds`、`allowRoles`、`allowScopes`。
- **读写作用域**: `access.readScopes` 与 `access.writeScopes` 分离读写权限。
- **主体控制**: `access.requireActor` + `access.actorSource` 约束 `actorId` 来源，可启用 `access.requireActorMatch` 强制与 `buyerId`/`sellerId`/`payer` 一致。
- **签名验证**: `market.consent.grant` 使用买方 EVM 地址进行签名验证。
- **用途一致性**: `consentScope.purpose` 必须与 `offer.usageScope.purpose` 一致。
- **期限约束**: `consentScope.durationDays` 不得超过 `offer.usageScope.durationDays`。

### 撤回 Webhook 协议

当 `revocation.mode` 为 `webhook` 时，插件将对撤回请求进行签名。

- **请求头**:
  - `x-market-timestamp`: ISO 时间戳
  - `x-market-payload-hash`: 规范化 payload 哈希
  - `x-market-signature`: 可选 HMAC SHA256 签名
  - `x-market-api-key`: 可选 API Key
- **请求体**: 包含 `delivery` `order` `offer` `consent` 与 `reason`
- **超时与重试**: 支持超时与最大重试次数配置

### 交付与撤回语义

- **交付参数**: `market.delivery.issue` 使用 `offer.deliveryType` 决定交付类型；下载与 API 交付需要 `payload` 中的凭证字段。
- **撤回语义**: 撤回仅阻断未来访问，不追溯历史使用，`revokeHash` 用于审计与链上锚定。
- **退款语义**: `market.settlement.refund` 需要 `payer`，可携带可选 `reason` 用于审计与结算哈希。

### 透明度接口

- **Summary**: `market.transparency.summary` 提供状态计数、用途统计、撤回失败与锚定失败统计。
- **Trace**: `market.transparency.trace` 支持按 `offerId` `orderId` `buyerId` `assetId` `deliveryId` `consentId` `settlementId` 追踪全链路对象与审计事件。

### 配置示例

```json
{
  "chain": {
    "network": "base",
    "rpcUrl": "https://mainnet.base.org",
    "privateKey": "0xYOUR_PRIVATE_KEY",
    "escrowContractAddress": "0xESCROW_CONTRACT"
  },
  "settlement": {
    "mode": "contract",
    "tokenAddress": "0xTOKEN_ADDRESS"
  },
  "revocation": {
    "mode": "webhook",

    // Placeholder only. Treat revocation endpoints as sensitive infrastructure.
    // Do not expose them publicly without strong auth (mTLS/JWT), signature checks,
    // and network controls (allowlist, private ingress).
    "endpoint": "https://revocation.example.com/hook",

    // Never put real secrets in docs.
    "apiKey": "REPLACE_WITH_TOKEN",
    "signingSecret": "REPLACE_WITH_SECRET",

    "timeoutMs": 8000,
    "maxAttempts": 3,
    "retryDelayMs": 60000
  },
  "store": {
    "mode": "sqlite",
    "dbPath": "/path/to/market.db",
    "migrateFromFile": true
  },
  "access": {
    "mode": "scoped",
    "allowClientIds": ["gateway-client-1"],
    "allowScopes": ["operator.write"],
    "readScopes": ["operator.read"],
    "writeScopes": ["operator.write"],
    "requireActor": true,
    "actorSource": "either",
    "requireActorMatch": true
  },
  "credentials": {
    "mode": "external",
    "storePath": "/path/to/credentials",
    "encryptionKey": "REPLACE_WITH_SECRET",
    "lockTimeoutMs": 5000
  }
}
```

### 运维与合规要点

- 默认使用 sqlite 存储（`store.mode=sqlite`），审计事件落入 `audit` 表；可选 `store.migrateFromFile` 自动迁移旧 JSON 状态。
- 生产环境建议启用链上锚定与撤回签名。
- 交付凭证字段属于敏感信息，推荐启用 `credentials.mode=external` 并定期轮换 `credentials.encryptionKey`。

### 已知边界

- sqlite 适合单实例网关与有限并发场景，多实例部署需迁移到共享数据库与统一锁。
- 外部撤回执行器依赖 Webhook 可用性，建议结合重试与告警。

### 相关文档

- Web3 Market 概览：[/concepts/web3-market](/concepts/web3-market)
- Web3 Market 开发者文档：[/reference/web3-market-dev](/reference/web3-market-dev)
- Web3 资源共享 API 契约：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
