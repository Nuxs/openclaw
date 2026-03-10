---
summary: "OpenClaw Web3 Sui-first 架构草案：把 Sui 用作 Agentic Commerce 的对象化权利与结算层，同时保留 EVM/TON 的现实分工。"
read_when:
  - You are deciding the long-range chain strategy for OpenClaw Web3
  - You need a Sui-first architecture for agent-to-agent commerce
  - You are designing capability, lease, receipt, escrow, and reward object models
title: "OpenClaw Web3 Sui-first 架构草案"
doc_family: "web3"
doc_layer: "reference"
normative: false
---

# OpenClaw Web3 Sui-first 架构草案

> **Status**: Draft for architecture alignment  
> **Updated**: 2026-03-10  
> **Goal**: 在不篡改当前 `EVM + TON` 运行时事实的前提下，明确 `OpenClaw` 面向 `AI-to-AI` 交易的下一阶段账本方向与链上对象模型。

## 1. 一句话结论

如果 `OpenClaw` 的 Web3 模块要真正支撑 **万物皆可交易**、**AI 个体之间高频原子协作**，我建议采用下面这条分工：

> **`Sui` 做对象化权利与结算语义层，`EVM` 做稳定币与外部流动性入口，`TON` 做分发与轻量支付入口。**

这不是在否认当前 `EVM + TON` 双栈，而是在说明：

- **今天的实现主线**仍然是 `EVM + TON`
- **下一阶段的 Agentic Commerce 主账本倾向**应该是 `Sui-first`

## 2. 当前事实 vs 目标态

### 2.1 当前 repo 事实

- `web3.*` 是对外公共入口
- `market.*` 是内部权威执行层
- 当前默认 Web3 Market 主线是 `EVM`
- `TON` 已纳入支付/回执/结算双栈口径
- 执行面仍主要是链下运行时与 Provider，而不是链上执行

### 2.2 推荐目标态

- `Sui` 承载 `Capability / Lease / Receipt / Escrow / Reward` 这类对象化权利与结算语义
- `EVM` 承载稳定币、金库、桥、外部 DeFi 与机构级流动性接口
- `TON` 承载 Telegram/分发/轻量支付/用户触达
- 真正的推理、工具执行、Prompt、数据与交付内容仍主要留在链下

## 3. 为什么是 Sui-first

### 3.1 因为 OpenClaw 想交易的不只是余额

`OpenClaw` 要交易的东西更像：

- 某项能力的访问权
- 一段时间内的租约
- 一次交付的回执
- 某笔款项的托管释放条件
- 某个节点或推荐行为的奖励凭证

这类对象天然带有：

- 所有权
- 生命周期
- 可转移性
- 可撤销性
- 可审计性

`Sui` 的对象模型很适合承载这种语义。

### 3.2 因为 AI 交易常常是多步原子动作

一个最典型的 Agent 商务流通常是：

1. 发现能力
2. 锁定预算
3. 签发租约
4. 调用服务
5. 写入回执
6. 释放结算或进入争议

这类动作很适合用 `PTB` 进行多步原子编排。

### 3.3 因为它更贴近“万物皆可交易”的产品哲学

如果你要把：

- API 访问权
- 模型能力
- 数据许可
- 任务交付结果
- 节点信誉与奖励

都变成可交易、可组合、可转移的对象，`Sui` 会比单纯账户余额式的语义更自然。

## 4. 为什么不是别的链放第一位

### 4.1 `EVM`

**优点**：

- 稳定币生态最强
- 钱包与资产兼容最成熟
- 外部 DeFi 组合最好

**不足**：

- 更适合“余额 + 合约状态”而不是“对象化权利交易”
- 高频 Agent 微商务流会更快暴露出状态与成本上的笨重感

### 4.2 `TON`

**优点**：

- 分发与触达强
- Telegram 场景摩擦低
- 轻量支付入口有优势

**不足**：

- 更适合作为入口和支付触达层
- 不适合作为复杂多步原子 Agent 商务流的第一主账本

### 4.3 `Solana`

**优点**：

- 吞吐强
- 消费级链路成熟
- 生态大

**不足**：

- 资源抽象与开发心智更偏“高速执行系统”
- 对 `Capability / Lease / Receipt` 这类对象语义不如 `Sui` 贴脸

## 5. Sui 的能力边界

### 5.1 它不是以太坊生态

必须明确：

- `Sui` 不是以太坊 `L2`
- `Sui` 不是 `EVM`
- Solidity / ERC 的实现路径不能直接平移

所以这是一条**明确的链策略选择**，不是“换个 RPC 就行”。

### 5.2 它的快有适用条件

`Sui` 的优势主要体现在：

- 点对点对象转移
- 低冲突 `Owned Object` 路径
- 多步原子商务编排

而一旦你把大量交易压进同一个热点 `Shared Object`，就会进入更重的争用与共识路径。

### 5.3 它不是执行面

不要把以下内容直接当成链上载荷：

- Prompt 明文
- 模型权重
- 推理中间状态
- 大体量结果内容
- 私有上下文

链上更适合放：

- hash / pointer / policy anchor
- lease / receipt / dispute digest
- payout / reward / claim records

## 6. OpenClaw 的链与层分工

| 层                 | 角色          | 主要职责                                         |
| ------------------ | ------------- | ------------------------------------------------ |
| 产品层             | `AI Steward`  | 理解用户意图、预算、隐私与风险偏好               |
| 控制面             | `web3-core`   | 发现、身份、监控、外表面编排                     |
| 权威经济层         | `market-core` | 租约、账本、结算、争议、奖励状态机               |
| 对象化账本层       | `Sui`         | `Capability / Lease / Receipt / Escrow / Reward` |
| 流动性与外部金融层 | `EVM`         | 稳定币、桥、金库、外部协议兼容                   |
| 触达与轻量支付层   | `TON`         | 分发、轻量支付入口、用户触达                     |
| 执行层             | 外部运行时    | `vLLM`、`TensorRT-LLM`、`exo`、`llama.cpp` 等    |
| 数据层             | 存储/凭证仓   | 真实结果、密文载荷、交付大对象                   |

## 7. 推荐的链上对象模型：五件套

### 7.1 `Capability`

#### 作用

表达“卖的到底是什么能力”。

#### 建议字段

- `capability_id`
- `publisher`
- `category`：例如 `model`, `embedding`, `rerank`, `tool`, `dataset`, `compute-slot`
- `service_ref_hash`
- `pricing_policy_ref`
- `visibility_policy`
- `sla_policy_ref`
- `settlement_asset_policy`
- `metadata_hash`
- `status`

#### 不变量

- 不能直接暴露 `endpoint` / `token` / 真实路径
- 对外描述的是“能力摘要”，不是“接入秘密”
- 可被索引、可被发现、可被撤下，但要可审计

### 7.2 `Lease`

#### 作用

表达“谁在什么条件下、多久之内、以什么预算，获得什么访问权”。

#### 建议字段

- `lease_id`
- `capability_id`
- `lessor`
- `lessee`
- `start_at` / `expire_at`
- `usage_budget`
- `allowed_scopes`
- `credential_delivery_ref_hash`
- `escrow_id`
- `revocation_policy`
- `dispute_window_sec`
- `status`

#### 不变量

- 明文秘密不应长期驻留链上
- 链上只保留引用、哈希或交付确认
- 撤销、过期、退款与争议必须能追溯

### 7.3 `Receipt`

#### 作用

表达“某次能力调用或任务交付已经发生，并留下了可审计痕迹”。

#### 建议字段

- `receipt_id`
- `lease_id`
- `executor`
- `usage_summary_hash`
- `result_pointer_hash`
- `proof_ref_hash`
- `completed_at`
- `accepted_by`
- `audit_anchor_ref`
- `status`

#### 不变量

- 不直接上链交付正文
- 回执是可追溯摘要，不是大结果容器
- 适合与 `Escrow` 的释放条件绑定

### 7.4 `Escrow`

#### 作用

表达“钱什么时候锁、何时放、失败怎么退、争议怎么办”。

#### 建议字段

- `escrow_id`
- `payer`
- `payee`
- `asset`
- `amount_locked`
- `release_policy`
- `receipt_requirement`
- `dispute_window_sec`
- `refund_policy`
- `status`

#### 不变量

- 状态必须单向清晰，例如：`locked -> released | refunded | disputed`
- 不允许含糊的双写路径
- 与 `Receipt` / `Dispute` 联动时要保证可审计

### 7.5 `Reward`

#### 作用

表达“为什么奖励、奖励谁、何时可领、是否带条件”。

#### 建议字段

- `reward_id`
- `subject`
- `reason_code`
- `asset`
- `amount`
- `claim_policy`
- `vesting_policy`（可选）
- `source_event_hash`
- `status`

#### 不变量

- 先定义奖励语义，再决定是否代币化
- 早期应优先支持稳定币奖励、积分映射或折扣权益
- 不应在没有 staking/slashing/governance 刚需时仓促引入复杂原生 token 经济

## 8. 推荐的事务模式

### 8.1 Off-chain quote，On-chain settlement

推荐默认路径：

1. 链下发现与报价
2. 链下选择候选能力
3. 链上创建 `Lease + Escrow`
4. 链下执行
5. 链上写 `Receipt`
6. 链上释放或退款

原因很简单：

- 热路径放链下更快
- 权利与结算上链更可信
- 可以避免把热点路由压成 `Shared Object` 瓶颈

### 8.2 Owned Object first

优先把交易设计成：

- 单一能力对象
- 单一租约对象
- 单一支付托管对象
- 单一回执对象

这样更容易走 `Sui` 的低冲突路径。

### 8.3 Shared Object only when necessary

只有在下面几类场景才引入共享对象：

- 治理
- 公共信誉汇总
- 公共池子
- 公共索引锚点

即使如此，也应避免把所有热交易都聚合到单一共享对象上。

## 9. 与 OpenClaw MVP 顺序的关系

`Sui-first` 不会改变 `OpenClaw` 的正确工程顺序，只会改变“链上最值得怎样建模”。

真正的 MVP 仍应是：

1. **节点发现**
2. **节点健康与可用性评估**
3. **资源发布与能力描述**
4. **租约 / 账本 / 结算 / 奖励闭环**
5. **最小可行任务分发或工具调用路由**
6. **最后才是更激进的模型逐层协同推理**

也就是说：

> 先把协作网络做成立，再把协同推理做高级。

## 10. 不应该过度承诺的事

- 不要把 `Sui-first` 写成“当前已经全量迁移”
- 不要把 `Sui` 写成“自动解决信任、执行正确性、调度稳定性”
- 不要把链上对象设计误当成算力执行引擎
- 不要把 `Mac mini 4GB` 一类轻节点包装成通用主力 LLM 节点

## 11. 最后一句产品定义

如果把这套方向压成一句最清楚的话，我建议写成：

> **OpenClaw 的 Web3 模块，应让 AI 私人助理把能力、租约、回执、托管与奖励对象化，并以 `Sui-first` 的方式承载 Agentic Commerce；同时保留 `EVM` 的流动性价值与 `TON` 的分发价值。**

## 12. 实现落地

本草案的 §7 五件套对象模型和 §8 推荐事务模式已落地为可实现的 Sui Move 协议草图：

- **合约源码**：[`extensions/blockchain-adapter/contracts/sui/openclaw_protocol/`](https://github.com/openclaw/openclaw/tree/main/extensions/blockchain-adapter/contracts/sui/openclaw_protocol)
  - `openclaw_market.move` — Capability / Lease / Receipt / MarketRegistry
  - `openclaw_escrow.move` — Escrow\<T\> / Reward
- **协议参考文档**：[Sui Move 协议草图 — 最小对象 Schema + PTB 交易流](/reference/web3-sui-move-protocol)
- **工业化蓝图**：[Sui Move 工业化整改蓝图 — 可组合 PTB API + 权限能力 + 交付闭环](/reference/web3-sui-industrialization-blueprint)

> 当前为**协议草图阶段**（最小对象 schema + entry function 签名），不是生产就绪合约。若要进入工业级实现，请继续阅读工业化蓝图文档。

## 相关文档

- [Sui Move 协议草图 — PTB 交易流](/reference/web3-sui-move-protocol) ⭐ 实现落地
- [Web3 Market（概览）](/concepts/web3-market)
- [Web3 Market Dev](/reference/web3-market-dev)
- [TON + EVM 双栈策略](/web3/WEB3_DUAL_STACK_STRATEGY)
- [双栈支付与结算参考](/reference/web3-dual-stack-payments-and-settlement)
- [OpenClaw P2P 协同算力架构落地图](/reference/web3-p2p-openclaw-architecture)
