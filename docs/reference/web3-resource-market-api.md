---
summary: "Web3 资源共享市场 API 契约：market.resource/lease/ledger 与 web3 编排、Provider routes、安全与脱敏规则"
read_when:
  - You are implementing AI butler flows for Web3 resource sharing (model/search/storage)
  - You need a stable API and error contract for Gateway RPC and Provider routes
  - You are reviewing security constraints like one time tokens and endpoint non-disclosure
title: "Web3 Resource Market API"
---

## 目标与适用范围

本文档描述 Web3 资源共享市场的“可机器执行”接口契约，用于 AI 管家在底层代办复杂流程。

- **用户侧**：操作极简，只做发布和租用的少量决策。
- **AI 管家侧**：用本页定义的 Gateway RPC 与 Provider HTTP routes 完成租约签发、调用、记账与对账。

资源可以是任意类型的能力与资产，例如：模型、搜索、存储、API、服务。

## 安全与敏感信息治理（不可妥协）

- **禁止泄露**：`accessToken` 明文、Provider endpoint、真实文件系统路径。
- **一次性 token**：`market.lease.issue` 是唯一允许返回明文 token 的地方，且只能返回一次。
- **权威记账**：`market.ledger.append` 必须拒绝 consumer 伪造，必须由 Provider actor 写入。
- **强一致拒绝**：Provider HTTP routes 的鉴权必须同时验证：
  - token hash 命中 lease
  - lease `status=lease_active`
  - `expiresAt > now`
  - resource `status=resource_published`

> 注意：即使后续的 `market.ledger.append` 会失败，也不能把“失败记账”当作访问控制。

## 统一响应与错误码（Gateway RPC）

- **成功**：`{ "ok": true, ... }`
- **失败**：`{ "ok": false, "error": "<stable_error_code>: <human_message>", "details"?: { ... } }`

建议使用的稳定错误码：

- `E_AUTH_REQUIRED`
- `E_FORBIDDEN`
- `E_INVALID_ARGUMENT`
- `E_NOT_FOUND`
- `E_CONFLICT`
- `E_EXPIRED`
- `E_REVOKED`
- `E_RATE_LIMITED`
- `E_INTERNAL`

## Gateway RPC（market-core，资源与租约）

以下方法由 `market-core` 暴露，属于资源共享市场的权威状态面。

### Resource

- `market.resource.publish`
- `market.resource.unpublish`
- `market.resource.get`
- `market.resource.list`

### Lease

- `market.lease.issue`
- `market.lease.revoke`
- `market.lease.get`
- `market.lease.list`
- `market.lease.expireSweep`

`market.lease.issue` 返回的 `accessToken` 必须被 AI 管家当作最高敏感数据处理：

- 不写入日志
- 不进入 session transcript
- 不回显到任何状态或 summary

### Ledger

- `market.ledger.append`
- `market.ledger.list`
- `market.ledger.summary`

`market.ledger.append` 的写入规则：

- `actorId` 必须匹配 `entry.providerActorId`
- lease 必须 active 且未过期
- resource 必须 published

### Repair

- `market.repair.retry`

用于后台修复与重试（例如结算/审计链路的修复任务），返回结构化统计结果。

## Gateway RPC（web3-core，编排与体验）

以下方法由 `web3-core` 暴露，用于把资源共享能力变成“AI 管家可用”的高层接口。

### Orchestration

- `web3.resources.publish`
- `web3.resources.list`
- `web3.resources.lease`
- `web3.resources.revokeLease`

这些方法一般会在内部调用 `market.resource.*` / `market.lease.*`，并负责把“资源调用面”封装为用户不可见的实现细节。

### Consumer tools

- `web3.search.query`
- `web3.storage.put`
- `web3.storage.get`
- `web3.storage.list`

工具结果与错误信息同样必须遵守脱敏规则，不得包含 token、endpoint 或真实路径。

### Discovery index（内部接口）

- `web3.index.report`
- `web3.index.list`

这些方法用于发现与测试，但**默认不返回 Provider endpoint**。对外的发现应只返回可租用资源的摘要信息；如需建立连接，必须通过“租约签发后的受控路由”或“本地受信配置解析”等受控机制完成。

如确需在调试中携带“连接提示”，只能返回不可直接使用的引用（例如 `providerRef` / `connectionRef`），不得包含网络地址、token 或真实路径。

## Provider HTTP routes（调用面）

Provider routes 由 `web3-core` 通过 `registerHttpRoute` 暴露，统一要求：

- 请求头必须包含：`Authorization: Bearer tok_***`
- 必须在鉴权阶段完成“强一致拒绝”检查（见上文安全规则）

### Model chat

- `POST /web3/resources/model/chat`

支持 OpenAI 兼容协议（例如 Chat Completions），用于 `resolve_stream_fn` 的 `StreamFn` 调用。

Provider 权威记账规则：

- 必须在流式响应完成后调用 `market.ledger.append` 写入 `kind="model"`、`unit="token"`
- 记账失败不得影响已经返回给调用方的响应

### Search query

- `POST /web3/resources/search/query`

请求示例（示意）：

- `q`: string
- `limit?`: number
- `site?`: string

### Storage

- `POST /web3/resources/storage/put`
- `GET /web3/resources/storage/get?path=<virtualPath>`
- `POST /web3/resources/storage/list`

存储路径必须是“虚拟路径”，禁止 `..`、绝对路径、控制字符等注入形态。

## 发现与分发策略（不暴露 endpoint）

对外的“发现”应该只返回可租用资源的摘要信息，例如：

- 资源类型与能力
- 价格与单位
- 可用性与 SLA
- tags

真正的调用入口应通过“租约签发”与“网关受控下发”获得，避免把 Provider 网络入口当作可公开传播的 URL。

## 已知缺口提示（实现与文档对齐）

当前实现里存在一个需要尽快补齐的安全对齐点：

- `validateLeaseAccess` 在校验 token 与 lease 时，如果未同时校验 resource 是否仍为 published，则可能出现“资源已下线但租约未过期仍可继续调用”的窗口。

本文档以安全模型为准，AI 管家与开发者在实现/部署/验收时应以“强一致拒绝”为 Gate。

## 相关文档

- Web3 Market overview: [/concepts/web3-market](/concepts/web3-market)
- Web3 Market dev guide: [/reference/web3-market-dev](/reference/web3-market-dev)
- Web3 Core dev guide: [/plugins/web3-core-dev](/plugins/web3-core-dev)
- Market Core plugin: [/plugins/market-core](/plugins/market-core)
