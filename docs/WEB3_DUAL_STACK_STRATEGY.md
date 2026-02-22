# OpenClaw Web3 Market：TON + EVM 双栈策略（规划文档）

> **状态**：Draft（随实现推进更新）  
> **更新日期**：2026-02-22  
> **适用范围**：Web3 Market（资源/能力市场 + AI 管家编排）

---

## 1. 目标与边界

### 1.1 目标（对外叙事口径）

OpenClaw Web3 Market 是一个“去中心化资源/能力市场”的 AI 管家入口：

- **用户只做少量决策**：发布什么、价格/规则、要不要租用、用哪条链支付。
- **复杂执行由 AI 管家代办**：租约、token 代管、消费路由、权威记账、争议、结算与对账摘要。

本策略文档的核心目标是：

- **TON + EVM 双栈并行**：两边都能完成“发布→租用→消费→记账→争议→结算/对账”的主路径。
- **支付双入口，结算单出口**：用户可选链支付，但订单/账本/对账输出口径统一。
- **安全硬约束不妥协**：endpoint/token/真实路径不进入任何可外发面（文档示例、日志、错误、状态输出、工具返回）。

### 1.2 明确非目标（避免误解）

- 不追求“把每次调用明细全上链”；链上仅做**最小披露**（hash/承诺/汇总/回执）。
- 不把 `extensions/blockchain-adapter` 误读为“已进入主线关键路径”：它是 **TON-first 多链适配层（规划中的可插拔后端）**，现阶段主线仍以 EVM 能力为主。

---

## 2. 为什么要双栈（市场层面的最优解释）

- **TON**：更适合“分发与低摩擦交易”（Telegram 场景、轻量支付、快速冷启动）。
- **EVM（优先 L2，如 Base）**：更适合“金融化与可组合结算”（稳定币、托管结算、外部协议协作）。

双栈不是“多链炫技”，而是把平台拆成两类能力：

- **触达/转化能力**（偏 TON）
- **清结算/金融化能力**（偏 EVM）

---

## 3. 统一对象模型与术语表（双栈口径的核心）

> 统一对象模型的目的：**避免 TON/EVM 双套概念导致产品、文档、UI、运营全部分裂**。

### 3.1 核心对象（与现有实现对齐）

| 对象                                    | 作用                                         | 主体                | 备注                                          |
| --------------------------------------- | -------------------------------------------- | ------------------- | --------------------------------------------- |
| Resource                                | 可出租的能力（model/search/storage/service） | Provider            | 资源共享市场（B-2）核心对象                   |
| Lease                                   | 对 Resource 的时间窗授权                     | Market              | `accessToken` 仅签发时返回一次；后续只留 hash |
| LedgerEntry                             | Provider 权威记账条目                        | Provider            | 结算与对账依据；Consumer 不可伪造             |
| Dispute                                 | 争议对象（证据为 hash）                      | Buyer/Seller/平台   | 证据与裁决必须可追溯                          |
| Offer/Order/Consent/Delivery/Settlement | 交易与结算市场对象（B-1）                    | Buyer/Seller/Market | 支持 escrow lock/release/refund 与锚定        |

### 3.2 双栈新增的“统一口径对象”（文档先定义，代码后落地）

| 对象                  | 作用                       | 说明                                              |
| --------------------- | -------------------------- | ------------------------------------------------- | --------------------------------- |
| PaymentIntent         | 用户选择链与资产的支付意图 | `chain=ton                                        | evm`，`asset=TON/Jetton/USDC/...` |
| PaymentReceipt        | 支付回执（链上最小披露）   | 仅包含 tx/网络/金额/时间等；不包含 endpoint/token |
| FXQuote               | 统一汇率口径               | 支持“报价来源 + 过期时间 + 取整规则”              |
| PayoutPreference      | Provider 的结算偏好        | 稳定币结算 + 代币奖励/折扣（可选）                |
| ReconciliationSummary | 可分享对账摘要（脱敏）     | 支持复制粘贴传播；不得包含敏感信息                |

---

## 4. 双栈主流程（索引→接入→租用→消费→记账→结算/对账）

### 4.1 索引（Discovery）：公开“能力与规则”，不公开“接入信息”

- 对外索引只发布：能力、价格、SLA、policy、签名与 TTL。
- **不发布**：Provider endpoint、token、真实路径。

> 现状对齐：`web3.index.list` 默认脱敏 endpoint（符合安全约束）。

### 4.2 接入（Connect）：连接信息必须“授权交付”

双栈下接入策略仍保持单一原则：**连接不公开**。

- 默认推荐：**Gateway/Agent 代理模式**（Consumer 永远不直面 endpoint）。
- 可选增强：**加密交付模式**（交付 payload 加密落盘到外部凭证仓，仅返回引用）。

> 现状对齐：资源共享侧已支持 `credentials.mode=external` 思路（交付载荷外部化）。

### 4.3 租用（Lease）：token 一次性下发 + 永不回显

- `market.lease.issue` 是唯一允许返回明文 `accessToken` 的地方。
- token 只能出现一次：后续只存 `accessTokenHash`；工具输出/状态/错误均不得回显 token。

### 4.4 消费（Consume）：带租约上下文的强一致拒绝

Provider HTTP 路由的鉴权必须同时验证：

- token hash 命中 lease
- lease active 且未过期
- resource 仍 published
- policy 约束（并发/大小/速率）

### 4.5 记账（Ledger）：Provider 权威追加

- Provider 端追加 `market.ledger.append`，Consumer 只能读取汇总与明细。
- 对账的“权威来源”是 Provider 侧的 ledger，而不是 Consumer 侧的声明。

### 4.6 结算/对账（Settlement & Reconciliation）：双入口单口径

双栈的关键口径：

- 用户支付可发生在 TON 或 EVM。
- 系统内部的订单/账本/争议/结算状态机保持统一。
- 对外输出统一的 `ReconciliationSummary`：
  - 支付回执（TON/EVM）
  - 账本汇总（usage/金额）
  - 争议与裁决结果（如有）
  - 链上锚定/归档回执（如启用）

链上动作建议保持“最小披露”：

- **锚定**：hash/承诺
- **结算**：escrow 的 lock/release/refund 或等价回执

---

## 5. 安全与隐私（双栈一致的硬约束）

### 5.1 不泄露清单（任何可外发面）

- Provider endpoint（网络地址/反代地址/内网信息）
- `accessToken` 明文
- 真实文件系统路径
- 任何私钥/密钥/签名材料（包括 RPC key / Pinata JWT 等）

文档示例统一使用占位符：

- endpoint：`[REDACTED_ENDPOINT]`
- token：`tok_***`
- 私钥：`0xYOUR_PRIVATE_KEY`

### 5.2 脱敏口径统一

- 代码层脱敏工具：`extensions/web3-core/src/utils/redact.ts`
- 文档层要求：任何示例输出、状态摘要、错误示例都必须遵循同样的脱敏规则。

---

## 6. 里程碑与交付物（与现有 Week3-5 对齐）

> 这里定义“文档与产品口径”的里程碑；具体实现可在 Week3-5 的监控/UI/Demo 里落地。

- **M0（立即）**：完成双栈统一口径文档（本文件 + 参考文档），并对齐既有进度/路线图/概览。
- **M1（可演示）**：UI/脚本可演示“用户选链支付 + 统一对账摘要”（哪怕链上动作先以回执模拟/占位）。
- **M2（可运营）**：监控与告警覆盖：支付回执队列、结算队列、争议队列、归档/锚定 pending。
- **M3（规模化）**：根据交易量与生态需求再评估自有 L1（可选，不前置）。

---

## 7. 文档入口与关联

- Web3 Market 概览：`docs/concepts/web3-market.md`
- Web3 Market Dev：`docs/reference/web3-market-dev.md`
- Web3 Resource Market API：`docs/reference/web3-resource-market-api.md`
- 双栈总规划：`docs/WEB3_DUAL_STACK_STRATEGY.md`
- 双栈支付与结算参考：`docs/reference/web3-dual-stack-payments-and-settlement.md`
- TON-first 多链适配层：`extensions/blockchain-adapter/README.md`

---

## 8. Skill 策略（不新增 Skill）

- **不新增 Skill**：双栈并行不需要拆出新的技能包。
- **复用现有 Skill**：继续使用 `skills/web3-market` 作为主线工作流技能（覆盖 `web3-core` 编排、`market-core` 状态机、资源共享与结算/账本对齐，以及“不泄露”硬约束）。
- **后续演进**：如需增强双栈落地提示，优先在 `skills/web3-market/references/` 增补双栈参考与验收清单，而不是新建 skill。

---

## 9. 双栈验收清单（必须满足）

### 9.1 不泄露（Blocking）

- endpoint/token/真实路径不得出现在：
  - 文档示例
  - 日志
  - 错误消息
  - `status.summary` / `web3_market_status` 输出
  - 任何 tool result
- `accessToken` 只允许在“签发瞬间”出现一次（后续仅允许出现 hash 或 `tok_***` 占位）。

### 9.2 支付路由（TON/EVM 双入口）

- UI/CLI/Agent 能明确表达 `PaymentIntent`：用户可选 `chain=ton|evm`。
- 能生成并保存 `PaymentReceipt`（TON 或 EVM），且对外输出为“最小披露”。
- 有统一的汇率口径（`FXQuote`）：包含来源标识与过期时间；对账时可追溯。

### 9.3 统一对账输出（单口径）

- 可生成 `ReconciliationSummary`（可分享、脱敏）：
  - 支付回执（TON/EVM）
  - 账本汇总（ledger）
  - 争议摘要（如有）
  - 归档/锚定回执（如启用）
- 对账摘要必须满足：复制粘贴到外部渠道不会泄露敏感信息。

### 9.4 争议与证据

- 证据仅允许提交 hash（或等价的最小披露），不得提交敏感明文。
- 争议流程可追溯：状态、裁决、超时处理与配额限制都可观测。

### 9.5 监控指标与告警（面向运营）

- 监控快照至少覆盖：
  - `payments.receiptsByChain`、`payments.pendingSettlements`
  - disputes（open/resolved/平均耗时）
  - archive/anchor pending 队列
- 告警规则至少覆盖：
  - 结算 pending 异常堆积
  - 错误率异常
  - 争议异常增长

### 9.6 Demo 脚本口径

- Demo 必须体现：
  - “用户选链支付（TON/EVM）”
  - “AI 管家代管一次性 token（不回显）”
  - “对账摘要可分享且脱敏”

> 双栈支付/结算输出字段的推荐结构见：`docs/reference/web3-dual-stack-payments-and-settlement.md`。
