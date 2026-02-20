### OpenClaw Web3 资源共享 API 契约（B-2 附录）

> 本文档是 `web3-brain-architecture.md` 的子文档，聚焦 **接口与错误契约**，用于 AI 直接落地 `extensions/market-core/src/market/handlers/*`、`extensions/web3-core/src/index.ts` 以及 Provider HTTP routes。

---

## 1. 统一响应格式（Gateway Methods）

- **成功**：
  - `{ "ok": true, ... }`
- **失败**：
  - `{ "ok": false, "error": "<stable_error_code>: <human_message>", "details"?: { ... } }`

### 1.1 稳定错误码（建议）

- **`E_AUTH_REQUIRED`**：缺少 `actorId` / 未登录
- **`E_FORBIDDEN`**：权限不足 / actor 不匹配
- **`E_INVALID_ARGUMENT`**：入参校验失败（enum/format/range）
- **`E_NOT_FOUND`**：资源/租约/订单不存在
- **`E_CONFLICT`**：状态机冲突（非法状态迁移）
- **`E_EXPIRED`**：租约过期
- **`E_REVOKED`**：租约已撤销
- **`E_RATE_LIMITED`**：频率限制
- **`E_INTERNAL`**：内部异常（不得泄露敏感信息）

> `error` 字段必须稳定可机器解析；human_message 用于 CLI/UI。

---

## 2. Market-Core Gateway Methods（资源/租约/账本）

> 所有方法均通过 `market-core` 的 `registerGatewayMethod` 暴露。

### 2.1 `market.resource.publish`

- **params**：见主文档 `12.11.5`（`resource` + 内嵌 `offer`）
- **success**：`{ ok:true, resourceId, offerId, offerHash, status:"resource_published" }`
- **errors**：
  - `E_FORBIDDEN`：actor 非 owner
  - `E_INVALID_ARGUMENT`：kind/price.unit 不匹配
  - `E_CONFLICT`：offer 状态冲突

### 2.2 `market.resource.unpublish`

- **params**：`{ actorId, resourceId }`
- **success**：`{ ok:true, resourceId, status:"resource_unpublished" }`
- **errors**：`E_NOT_FOUND | E_FORBIDDEN | E_CONFLICT`

### 2.3 `market.resource.get`

- **params**：`{ resourceId }`
- **success**：`{ ok:true, resource: MarketResource|null }`

### 2.4 `market.resource.list`

- **params**：`{ kind?, providerActorId?, status?, tag?, limit? }`
- **success**：`{ ok:true, resources: MarketResource[] }`

### 2.5 `market.lease.issue`

- **params**：`{ actorId, resourceId, consumerActorId, ttlMs, maxCost? }`
- **success**：
  - `{ ok:true, leaseId, orderId, consentId?, deliveryId, expiresAt, accessToken }`
  - `accessToken` 必须是一次性返回；不得落盘明文。
- **errors**：
  - `E_NOT_FOUND`：resource 不存在
  - `E_CONFLICT`：resource 非 published
  - `E_INVALID_ARGUMENT`：ttlMs 越界

### 2.6 `market.lease.revoke`

- **params**：`{ actorId, leaseId, reason? }`
- **success**：`{ ok:true, leaseId, status:"lease_revoked", revokedAt }`
- **errors**：`E_NOT_FOUND | E_FORBIDDEN | E_EXPIRED | E_CONFLICT`

### 2.7 `market.lease.get`

- **params**：`{ actorId?, leaseId }`
- **success**：`{ ok:true, lease: MarketLease|null }`
- **notes**：
  - `market.lease.get` **不得**返回 `accessToken` 明文；明文 token **只允许**在 `market.lease.issue` 成功响应中返回一次。

### 2.8 `market.lease.list`

- **params**：`{ providerActorId?, consumerActorId?, resourceId?, status?, limit? }`
- **success**：`{ ok:true, leases: MarketLease[] }`

### 2.9 `market.ledger.append`

- **params**：`{ actorId, entry: Omit<MarketLedgerEntry,"ledgerId"|"timestamp"|"entryHash"> }`
- **success**：`{ ok:true, ledgerId, entryHash }`
- **errors**：
  - `E_FORBIDDEN`：actor 非 provider
  - `E_REVOKED|E_EXPIRED`：lease 非 active
  - `E_INVALID_ARGUMENT`：quantity/cost 非法

### 2.10 `market.ledger.list`

- **params**：`{ leaseId?, resourceId?, providerActorId?, consumerActorId?, since?, until?, limit? }`
- **success**：`{ ok:true, entries: MarketLedgerEntry[] }`

### 2.11 `market.ledger.summary`

- **params**：同 list
- **success**：`{ ok:true, summary: { byUnit, totalCost, currency } }`

### 2.12 `market.lease.expireSweep`

- **params**：`{ actorId?, now?, limit?, dryRun? }`
- **success**：`{ ok:true, processed, expired, skipped, errors }`

### 2.13 `market.repair.retry`

- **params**：`{ actorId?, limit?, maxAttempts?, dryRun? }`
- **success**：`{ ok:true, processed, succeeded, failed, pending }`

---

## 3. Web3-Core Gateway Methods（资源层编排）

> `web3-core` 侧负责把 Consumer/Provider 体验做完整：发现、租用、状态展示、与主脑切换整合。

- `web3.resources.publish`：调用 `market.resource.publish`（不暴露 endpoint）
- `web3.resources.list`：聚合 market list + 本地可见性过滤
- `web3.resources.lease`：调用 `market.lease.issue`，把 accessToken 交给 Consumer 内存态或安全存储（不进 session transcript）；若提供 `sessionKey`，则把 `orderId/payer` 写入 session metadata 供结算使用
- `web3.resources.revokeLease`：调用 `market.lease.revoke`
- `web3.resources.status`：调用 `market.resource.get` 或 `market.lease.get`
- `web3.index.report` / `web3.index.list`：资源索引上报与查询（内置 indexer；默认不返回 Provider `endpoint`）

---

## 4. Provider HTTP Routes（调用面）

> 由 `web3-core` 使用 `registerHttpRoute` 暴露；所有请求必须 `Authorization: Bearer <accessToken>`。

### 4.1 统一安全头

- **Request**：
  - `Authorization: Bearer <accessToken>`
  - `X-OpenClaw-Request-Id: <uuid>`（可选，用于对账）
- **Response**：
  - `X-OpenClaw-Request-Id: <uuid>`（回显）

### 4.2 `POST /web3/resources/model/chat`

- **目的**：给 `resolve_stream_fn` 的 `StreamFn` 用
- **协议**：
  - `openai-compat`：OpenAI Chat Completions 或 Responses（二选一）
  - `custom`：必须在 `resources.provider.offers.models[].backend` 中声明
- **兼容路由**：同时提供 `POST /v1/chat/completions` 作为 OpenAI 兼容入口

#### 4.2.1 Provider 权威记账（model chat）

> model/chat 路由**必须**在流式响应完成后写入 Provider 权威账本，与 search/storage 路由保持一致。

- **触发**：pipeline 完成后（流已全部发送），调用 `market.ledger.append`，fire-and-forget（`.catch(noop)`）。
- **ledger entry 字段**：
  - `kind`: `"model"`
  - `unit`: `"token"`
  - `quantity`: 从上游响应 header `x-usage-tokens` 提取；无法获取时回退为 `1`
  - `cost`: `quantity * offer.price.perUnit`
  - `leaseId` / `resourceId` / `providerActorId` / `consumerActorId`：从鉴权阶段的 lease 上下文获取
- **失败处理**：记账失败不影响已发送的流式响应，仅记录 warn 日志。
- **对齐要求**：`appendModelLedger` 与已有的 `appendSearchLedger` / `appendStorageLedger` 遵循相同的 `callGateway` 调用模式。

### 4.3 `POST /web3/resources/search/query`

- **req**：`{ q: string, limit?: number, site?: string }`
- **resp**：`{ results: Array<{ title: string, snippet?: string, url: string }> }`

### 4.4 `POST /web3/resources/storage/put`

- **req**：`{ path: string, bytesBase64: string, mime?: string }`
- **resp**：`{ cid?: string, etag?: string, size: number, createdAt: string }`

### 4.5 `GET /web3/resources/storage/get`

- **query**：`?path=<virtualPath>`
- **resp**：二进制或 `{ bytesBase64, mime, etag }`（选一种，建议二进制）

### 4.6 `POST /web3/resources/storage/list`

- **req**：`{ prefix?: string, limit?: number }`
- **resp**：`{ items: Array<{ path: string, size?: number, etag?: string, updatedAt?: string }> }`

---

## 5. 脱敏与审计要求（接口层强制）

- 任何 gateway method / http route：
  - 不得在错误信息中输出 `accessToken`、endpoint、真实路径
  - 审计事件中用 `accessTokenHash` 替代明文
