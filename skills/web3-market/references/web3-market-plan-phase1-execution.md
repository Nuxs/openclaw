### OpenClaw Web3 Market：Phase 1 执行型迭代清单（单入口体验层 + 任务市场协议 MVP）

- **版本**: v2.0
- **定位**: 对外单入口 `web3.*` + 能力自描述 + 任务市场协议 MVP + 仲裁入口基础
- **前置要求**: `web3-core` 与 `market-core` 的 B-1/B-2 已可用，结算仍以外部 ERC-20 为主（自有代币后置）

### **现状对齐（基于当前代码）**

- **已具备**：`market.resource/lease/ledger`、`web3.resources.*`、Provider HTTP routes、consumer tools、`web3.status.summary` 与 `/pay_status`。
- **需调整**：对外入口统一为 `web3.*`，补齐 `web3.capabilities.*` 能力自描述。

### **本 Phase 目标与边界**

- **目标**：完成任务市场协议 MVP，并通过 `web3.*` 单入口让管家无歧义调用。
- **边界**：不引入 core 重型编排，只在插件与独立服务内实现；仲裁暂为链下流程，证据做审计锚定。

---

## 先行调研：开源方案参考（可复用或对标）

> 仅列可核验的开源仓库/项目入口，作为设计参考。

### A. 结算链路 / Escrow / 租约

- **OpenZeppelin Contracts**（成熟合约库，含支付与资金托管常用范式）: `https://github.com/OpenZeppelin/openzeppelin-contracts`
- **Filecoin Market Actor**（存储租约/结算机制参考）: `https://github.com/filecoin-project/builtin-actors`
- **Akash Network Node**（租约与市场机制参考）: `https://github.com/akash-network/node`

### B. 争议仲裁（链下/链上升级路径）

- **Kleros**（去中心化仲裁协议）: `https://github.com/kleros/kleros`
- **Kleros Cross-chain Arbitration Proxy**: `https://github.com/kleros/cross-chain-arbitration-proxy`
- **Aragon Court（历史实现）**: `https://github.com/sc-forks/aragon-court`

### C. 资源发现 / 索引

- **libp2p Kademlia DHT**（去中心化发现基础设施）: `https://github.com/libp2p/go-libp2p-kad-dht`
- **Open Registry（目录型中心化 Registry 参考）**: `https://github.com/open-services/open-registry`
- **apis.io（API 目录服务参考）**: `https://github.com/apisio/legacy.apis.io`

### D. 数据索引与查询层（可选方案）

- **The Graph（链上数据索引）**: `https://github.com/graphprotocol/docs`
- **SubQuery（索引框架）**: `https://github.com/subquery/subql`

---

## 执行型迭代清单（按周）

### Week 1：单入口语义冻结 + 能力自描述

**模块**: `web3-core` / `market-core`

- **入口收敛**：对外仅保留 `web3.*`，完成方法清单与命名约束
- **能力自描述**：实现 `web3.capabilities.list/describe`，并填充权限/风控/成本/前置条件
- **语义映射表**：`web3.*` 到 `market-core` 权威方法的映射清单

**交付物**:

- 单入口 API 清单 + 版本策略
- 可供管家直接调用的能力描述 JSON

### Week 2：任务市场协议 MVP

**模块**: `web3-core` / `market-core`

- **Task 协议结构**：TaskOrder/Bid/Result/Receipt 与状态机
- **签名与不可抵赖**：关键对象 hash 与签名校验
- **`web3.market.*` 方法集**：发布、竞标、授标、交付、验收

**交付物**:

- 协议对象与状态机文档
- 任务发布到结算的最小闭环

---

## 任务市场协议规范（MVP）

### 任务协议对象与字段

- **TaskOrder**（任务发布）
  - `taskId`：任务唯一标识
  - `creatorActorId`：发布者身份
  - `title` / `summary`：任务标题与摘要
  - `requirements`：交付要求（结构化数组）
  - `budget`：预算上限（单位与币种）
  - `expiryAt`：到期时间（ISO）
  - `status`：`task_open` / `task_awarded` / `task_closed` / `task_cancelled` / `task_expired`
  - `hash` / `signature`：可审计签名与哈希

- **TaskBid**（竞标）
  - `bidId`、`taskId`
  - `bidderActorId`
  - `price`：报价（单位与币种）
  - `eta`：交付周期
  - `status`：`bid_submitted` / `bid_withdrawn` / `bid_accepted` / `bid_rejected`
  - `hash` / `signature`

- **TaskAward**（授标）
  - `awardId`、`taskId`、`bidId`
  - `awarderActorId`
  - `status`：`award_active` / `award_revoked`
  - `hash` / `signature`

- **TaskResult**（交付）
  - `resultId`、`taskId`、`bidId`
  - `delivererActorId`
  - `artifacts`：交付物引用（CID 或 URL）
  - `proofs`：可验证证据（可选）
  - `status`：`result_submitted` / `result_accepted` / `result_rejected`
  - `hash` / `signature`

- **TaskReceipt**（结算回执）
  - `receiptId`、`taskId`、`bidId`
  - `payerActorId`、`payeeActorId`
  - `amount` / `currency`
  - `settlementId`：关联 `market-core` 结算
  - `status`：`receipt_pending` / `receipt_settled` / `receipt_refunded` / `receipt_disputed`

### 状态机约束

- 任务必须从 `task_open` 开始，`task_awarded` 后才能进入交付与结算。
- 竞标只能在 `task_open` 时提交。
- `result_accepted` 才能进入 `receipt_settled`。
- 任何取消或过期均不可逆转为活跃状态。

### `web3.market.*` API 清单

- **`web3.market.publishTask`**：创建任务
- **`web3.market.listTasks`**：任务查询（过滤、分页）
- **`web3.market.getTask`**：任务详情
- **`web3.market.placeBid`**：提交竞标
- **`web3.market.listBids`**：竞标查询
- **`web3.market.awardBid`**：授标并触发结算预锁定
- **`web3.market.submitResult`**：提交交付物
- **`web3.market.reviewResult`**：验收或拒绝
- **`web3.market.cancelTask`**：取消任务
- **`web3.market.expireSweep`**：任务过期清扫

### `market-core` 权威映射

- `awardBid` 触发 `market.order.create` + `market.settlement.lock`
- `reviewResult(accept)` 触发 `market.settlement.release`
- `reviewResult(reject)` 可触发 `web3.dispute.open`

---

## 仲裁体系规范（MVP）

### 争议对象与字段

- **Dispute**
  - `disputeId`、`taskId`、`bidId`
  - `initiatorActorId`、`respondentActorId`
  - `reason`、`status`：`dispute_open` / `dispute_resolved` / `dispute_rejected`
  - `resolution`：`release` / `refund` / `partial`
  - `evidence`：证据列表（摘要、CID、时间戳）
  - `openedAt` / `resolvedAt`

### `web3.dispute.*` API 清单

- **`web3.dispute.open`**：发起争议
- **`web3.dispute.submitEvidence`**：提交证据
- **`web3.dispute.resolve`**：裁决并回写结算
- **`web3.dispute.list`**：争议查询
- **`web3.dispute.get`**：争议详情

---

## 测试矩阵（MVP）

| 用例    | 场景       | 关键断言                                       | 存储模式      |
| ------- | ---------- | ---------------------------------------------- | ------------- |
| TASK-01 | 发布任务   | `task_open` 状态、签名校验通过                 | file + sqlite |
| TASK-02 | 竞标提交   | 仅 `task_open` 可提交                          | file + sqlite |
| TASK-03 | 授标       | 创建 `award` 且触发结算预锁定                  | file + sqlite |
| TASK-04 | 提交结果   | 结果可被检索，`result_submitted`               | file + sqlite |
| TASK-05 | 验收通过   | 触发 `receipt_settled` 与 `settlement.release` | file + sqlite |
| TASK-06 | 验收拒绝   | `result_rejected`，可进入争议                  | file + sqlite |
| DSP-01  | 发起争议   | `dispute_open` 写入审计                        | file + sqlite |
| DSP-02  | 提交证据   | 证据摘要锚定，敏感信息不暴露                   | file + sqlite |
| DSP-03  | 裁决释放   | 结算 release 或 refund 正确                    | file + sqlite |
| SEC-01  | 签名篡改   | 拒绝写入权威状态                               | file + sqlite |
| SEC-02  | 未授权调用 | `web3.market.*` 返回权限错误                   | file + sqlite |

### Week 3：仲裁体系 MVP

**模块**: `market-core` / `web3-core`

- **争议入口**：`web3.dispute.open/submitEvidence/resolve`
- **证据锚定**：证据摘要接入审计与锚定管线
- **仲裁 SLA**：链下裁决流程与责任分配

**交付物**:

- 仲裁流程文档与最小闭环测试

### Week 4：索引闭环 + 监控告警 + 管理台 MVP

**模块**: `web3-core` / `index-service` / `ui`

- **索引服务 MVP**：Provider 上报、Consumer 查询、健康心跳
- **监控告警**：指标与 P0/P1 规则、历史记录
- **管理台 MVP**：概览、资源、租约、账本、争议视图

**交付物**:

- 可观测指标、告警规则与历史查询
- 最小可用管理台

---

## 执行型迭代清单（按模块）

### 1) `market-core`

- TaskOrder/Bid/Result/Receipt 的权威存储与状态机
- 争议与证据接口扩展（dispute + evidence）
- 结算与 escrow 失败回滚语义

### 2) `web3-core`

- `web3.capabilities.*` 能力自描述与版本管理
- `web3.market.*` 体验层编排与语义收敛
- 争议编排与审计锚定接入

### 3) `index-service`（独立服务）

- 资源与任务索引 API
- Provider 心跳与信誉数据
- DHT 兼容的存储与同步接口

### 4) `ui`

- 概览与告警
- 资源与任务管理
- 租约、账本、争议视图

---

## 下一步建议

- **先行落地 Week 1 + Week 2**，确保结算链路和冷启动入口可跑通。
- 在上线前完成 **争议仲裁 + 监控告警**，以保障可信与可运维。
- 自有代币设计放在 Phase 2，确保有真实需求支撑。
