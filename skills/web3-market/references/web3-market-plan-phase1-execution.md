### OpenClaw Web3 Market：Phase 1 执行型迭代清单（单入口体验层 + 能力自描述 + 资源租约闭环）

- **版本**: v2.1
- **定位**: 对外单入口 `web3.*` + 能力自描述（Day 0）+ 资源发现/租约/调用的“管家无感”闭环 + 经济仪表盘
- **前置要求**: `web3-core` 与 `market-core` 的 B-1/B-2 已可用，结算仍以外部 ERC-20 为主（自有代币后置）

### **产品一句话（10 秒懂）**

让 AI 管家可以像调用本地能力一样，自动**发现/租用/调用**外部的模型、搜索、存储资源；用户最终只看到“今天赚了多少/花了多少/净收益多少”，成本与风险由系统用租约与结算规则兜住。

### **现状对齐（基于当前代码）**

- **已具备**：`market.resource/lease/ledger`、`web3.resources.*`、Provider HTTP routes、consumer tools、`web3.status.summary` 与 `/pay_status`。
- **需调整**：对外入口统一为 `web3.*`，补齐 `web3.capabilities.*` 能力自描述。

### **本 Phase 目标与边界**

- **目标**：把既有 B-2 能力打磨到“管家自动发现/租用/调用、用户无感知”的体验；能力自描述成为 Day 0 基础协议。
- **边界**：任务市场协议（TaskOrder/Bid/Result）**推迟到 Phase 3**；Phase 1 不引入重型撮合与竞标流程。
- **仲裁**：Phase 1 仅做链下裁决入口与证据锚定，保留去中心化仲裁扩展位。

---

### **核心用户故事（三条）**

- **Provider**：我有一台闲置设备或能力 → `openclaw share start` 一键共享并开始计费。
- **Consumer**：我的管家需要更强能力 → 自动发现可用资源 → 租约签发 → 直接调用。
- **双向**：月末查看“收入/支出/净收益”与活跃资源，理解系统价值。

---

### **Phase 1 上线硬 Gate（必须全部通过）**

> Phase 1 的目标是“管家无感闭环 + 用户看见价值”。为了避免上线后出现安全/可用性事故，以下 Gate 必须作为硬门槛执行。

- **Gate-SEC-01（敏感信息零泄露）**：任何输出面（gateway method 返回、HTTP route 错误、CLI 状态、logs、审计摘要、能力自描述、tool 结果）不得包含 `accessToken`、provider endpoint、真实文件路径。
- **Gate-ERR-01（稳定错误码）**：对外返回必须使用稳定错误码（例如 `E_INVALID_ARGUMENT`/`E_FORBIDDEN`/`E_NOT_FOUND`/`E_CONFLICT`/`E_INTERNAL` 等），并保持机器可解析；错误契约以 `web3-market-resource-api.md` 为准。
- **Gate-CAP-01（能力自描述可操作）**：`web3.capabilities.*` 必须提供字段级输入结构（必填/可选/范围/格式）与关键前置条件/风险/成本提示，使管家无需外部文档即可构造有效请求。
- **Gate-LEDGER-01（权威记账防伪造）**：Provider 才能写入权威 `market.ledger.append`；Consumer 侧不得伪造权威账本（以 `market-core` 校验为准）。
- **Gate-STORE-01（双存储一致性）**：file/sqlite 两种 store 行为一致，且关键路径用例必须在两种模式下通过（至少覆盖发布→租约→调用→记账→撤销/过期）。

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

### Day 0：能力自描述协议（必须先行）

**模块**: `web3-core`

- **能力自描述**：`web3.capabilities.list/describe` 作为 Day 0 基础协议
- **能力结构**：统一输出权限/风控/代价/前置条件/返回含义
- **错误码契约**：能力描述必须声明常见错误码与降级策略（以 `web3-market-resource-api.md` 为准）
- **可操作 schema**：对高风险/高频能力（例如租约签发、存储读写、搜索查询）必须提供字段级输入结构（必填/可选/范围/格式）
- **版本策略**：新增能力必须先出能力描述，再出入口实现

**交付物**:

- 能力描述 JSON（可被管家直接消费，且足够构造有效请求）
- 能力变更的版本约束

### Week 1：索引签名 + 一键 Provider 引导

**模块**: `web3-core` / `index-service`

- **索引条目签名**：Provider 自签名能力描述（为未来 DHT 迁移保留格式）
- **一键共享**：`openclaw share start` 引导 Provider 配置并上报
- **发现链路**：`web3.index.report/list` 支持签名字段与验证

**交付物**:

- 可迁移的索引条目 schema（含签名）
- 一键 Provider 引导说明

### Week 2：管家经济仪表盘（用户可见价值）

**模块**: `ui` / `web3-core` / `market-core`

- **仪表盘**：收入/支出/净收益、活跃资源、最近交易
- **低门槛入口**：默认展示“管家今天做了什么”

**交付物**:

- 用户可理解的经济仪表盘 MVP

### Week 3：监控告警 + 部分释放结算

**模块**: `market-core` / `web3-core`

- **监控告警**：P0/P1 规则与历史
- **部分释放**：结算支持 partial release（按 ledger 累计释放）

**交付物**:

- 监控告警可触发
- partial release 规则与审计记录

### Week 4：仲裁入口 MVP（链下平台裁决）

**模块**: `market-core` / `web3-core`

- **争议入口**：`web3.dispute.open/submitEvidence/resolve`
- **裁决来源**：预留 `arbitratorType`（platform/community/onchain）

**交付物**:

- 可发起争议、提交证据与裁决落账

---

## Phase 3：任务市场协议规范（MVP，后续）

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
  - `arbitratorType`：`platform` / `community` / `onchain`
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
