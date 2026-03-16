---
title: "Web3 Dual-Stack Payments & Settlement (Reference)"
summary: "Web3 双栈支付与结算参考：TON/EVM 两端支付、统一订单口径、汇率与对账输出、链上最小披露与安全约束"
description: "Web3 双栈支付与结算参考：TON/EVM 两端支付、统一订单口径、汇率与对账输出、链上最小披露与安全约束"
read_when:
  - You need the stable dual-stack payment, receipt, FX, and reconciliation contract
  - You are aligning TON and EVM settlement outputs into one public summary
  - You need canonical terms for PaymentIntent, PaymentReceipt, FXQuote, and ReconciliationSummary
doc_family: "web3"
doc_layer: "reference"
normative: true
---

## 1. 目标

本参考文档定义在 TON + EVM 双栈并行时：

- 用户可以选择在 TON 或 EVM 支付
- 系统内部订单/账本/争议/结算口径统一
- 对外输出统一、可分享、脱敏的对账摘要

**安全硬约束**：任何示例/输出不得包含 endpoint/token/真实路径/私钥。

---

## 2. 统一口径：支付双入口，结算单出口

### 2.1 支付入口（PaymentIntent）

PaymentIntent 是“用户选择链与资产”的统一对象（以 `extensions/market-core/src/market/types.ts` 为准）：

- `intentId`: 支付意图 ID
- `chain`: `"ton" | "evm"`
- `asset`: 资产标识（例如 `"TON"` / `"ERC20:<address>"`）
- `amount`: 字符串（避免精度丢失）
- `currency`: 计价币种（例如 `"USD"`）
- `orderId?`: 可选关联订单
- `createdAt`: ISO 时间

示例（仅示意，地址为占位符）：

```json
{
  "intentId": "pi_001",
  "chain": "ton",
  "asset": "TON",
  "amount": "1.25",
  "currency": "USD",
  "orderId": "order_001",
  "createdAt": "2026-02-22T12:00:00.000Z"
}
```

### 2.2 支付回执（PaymentReceipt）

PaymentReceipt 是链上最小披露统一对象（链特有细节可放扩展元数据，不进入统一主字段）：

- `receiptId?`
- `chain`
- `network?`
- `txHash?`
- `amount?`
- `tokenAddress?`
- `confirmedAt?`
- `mode`（`"live"` 或 `"simulated"`，区分真实回执与演示/测试回执）

> **关系约束**：一笔 Order 对应一笔 PaymentReceipt（1:1）。部分支付/补差价场景暂不支持，后续如需 1:N 关系在此扩展。

示例：

```json
{
  "chain": "evm",
  "network": "base",
  "txHash": "0x...",
  "amount": "1000000",
  "tokenAddress": "0x...",
  "confirmedAt": "2026-02-22T12:00:10.000Z",
  "mode": "live"
}
```

> 注意：回执只表达“支付发生了”，不表达“如何接入 Provider”。连接信息永不出现在链上或对外输出。

---

## 3. 汇率（FXQuote）与统一计价

双栈并行的统一口径建议：

- **对外标价优先稳定币口径**（例如 USD 计价）
- 用户可用 TON/EVM 支付时，后台根据 FXQuote 换算

FXQuote 的最小结构（以 `market/types.ts` 为准）：

- `quoteId`: 报价 ID
- `fromAsset`: 源资产（例如 `"USD"`）
- `toAsset`: 目标资产（例如 `"TON"` / `"USDC"`）
- `rate`: 汇率字符串
- `source`: 报价来源标识（例如 `"binance-spot"` / `"pyth-oracle"` / `"manual"`）
- `expiresAt`: 过期时间
- `roundingRule?`: 取整规则（`"floor"` / `"ceil"` / `"nearest"`）

> 候选报价来源与选型 tradeoff 见 `docs/web3/WEB3_DUAL_STACK_STRATEGY.md` §3.3。MVP 阶段建议 CEX API + 手动 fallback。

### 3.1 FXQuote 实现模块

FXQuote 的缓存与快照由 `web3-core/src/billing/fx-quote.ts` 提供：

**核心职责**：

- **缓存管理**：基于 `quoteId + fromAsset + toAsset + rate + source` 的复合键缓存，支持 TTL 过期
- **快照落盘**：在 `payment-required` 阶段将报价快照写入 `PaymentRequiredRecord`，确保对账时可追溯
- **来源标识**：支持外部传入报价（`invoice.quote`）或内部生成，保留来源追溯字段

**缓存策略**：

```typescript
// 缓存键格式
function buildCacheKey(params: {
  fromAsset: string;
  toAsset: string;
  rate: string;
  source: string;
}): string {
  return [params.fromAsset, params.toAsset, params.rate, params.source].join(":");
}

// TTL 过期检查
function getCachedQuote(cacheKey: string): FXQuote | undefined {
  const cached = fxQuoteCache.get(cacheKey);
  if (!cached) return undefined;
  if (Date.parse(cached.expiresAt) <= Date.now()) {
    fxQuoteCache.delete(cacheKey);
    return undefined;
  }
  return cached;
}
```

**快照关联**：

在 `payment-required` 处理中，FXQuote 会随 `PaymentRequiredRecord` 持久化，确保：

1. 对账时可以追溯到支付时的汇率
2. 支付重试时可以复用同一报价（幂等性）
3. 审计时可以验证汇率合理性

---

## 4. 金库选路（TreasuryRoute）

### 4.1 选路策略

当支付链与结算链不一致时，需要通过 TreasuryRoute 决定结算路径：

- **Direct Rail**：支付链与结算链相同，资产一致，直接结算
- **Bridge Rail**：支付链与结算链不同，或资产需要跨链转换

**选路决策因素**：

- `paymentChain`：用户选择的支付链（`"ton"` / `"evm"`）
- `settlementAsset`：Provider 偏好的结算资产（稳定币优先）
- `fxQuote.chain`：报价来源链（如果报价来自某链的预言机）
- `preferredSettlementChain`：配置的优先结算链

**稳定币优先规则**：

```typescript
const STABLE_TREASURY_ASSETS = new Set(["USD", "USDC", "USDT", "DAI"]);

// TON 支付稳定币 → EVM 结算
if (paymentChain === "ton" && STABLE_TREASURY_ASSETS.has(settlementAsset)) {
  return "evm"; // 结算链
}
```

### 4.2 TreasuryRoute 实现模块

TreasuryRoute 的选路逻辑由 `market-core/src/market/treasury-router.ts` 提供：

**TreasuryRoute 结构**：

```typescript
interface TreasuryRoute {
  routeId: string; // 路由唯一标识
  sourceChain: PaymentChain;
  sourceAsset: string;
  settlementChain: PaymentChain;
  settlementAsset: string;
  strategy: "direct" | "bridge";
  provider?: string; // 跨链桥 provider（如有）
  estimatedDuration?: number; // 预估完成时间（秒）
}
```

**路由 ID 格式**：

```
treasury:{sourceChain}:{settlementChain}:{sourceAsset}:{settlementAsset}
```

示例：

- `treasury:evm:evm:USDC:USDC`（EVM 直连）
- `treasury:ton:evm:TON:USDC`（TON → EVM 跨链）

**实现位置**：

- **权威定义**：`extensions/market-core/src/market/treasury-router.ts`
- **运行时边界**：`extensions/web3-core/src/billing/treasury-router.runtime.ts`（跨扩展复用）
- **类型导出**：`extensions/market-core/src/market/payment-types.ts`

---

## 5. 支付编排器（PaymentOrchestrator）

### 5.1 编排流程

支付编排器负责协调 invoice → policy → autopay → resume → settlement 的完整流程：

```
Invoice (402)
    ↓
Policy Check (agent-wallet)
    ↓
FXQuote Resolution
    ↓
TreasuryRoute Selection
    ↓
Autopay Execution (TON/EVM)
    ↓
PaymentIntent & Receipt
    ↓
Settlement Intent
    ↓
Resume Original Request
```

### 5.2 PaymentOrchestrator 实现模块

支付编排逻辑由 `web3-core/src/billing/payment-orchestrator.ts` 提供：

**核心函数**：

- `buildPaymentIntent()`：构建 PaymentIntent 对象，关联订单、报价、幂等键
- `buildPaymentRequiredRecord()`：构建持久化支付记录，包含状态、重试计数、确认状态
- `isAutopayCircuitOpen()`：检查 autopay 熔断器状态（冷却期）

**PaymentIntent 字段**：

```typescript
interface PaymentIntent {
  intentId: string;
  chain: PaymentChain;
  asset: string;
  amount: string;
  currency: string;
  orderId?: string;
  requestId?: string;
  idempotencyKey: string;
  provider?: string;
  payTo?: string;
  payer?: string;
  network?: string;
  mode: "live" | "simulated";
  quoteId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
```

**幂等性保证**：

- `idempotencyKey`：请求级幂等键，防止重复支付
- `invoiceHash`：发票内容哈希，确保同一发票复用同一记录
- `reused` 标志：标识是否复用了已有记录

**熔断器机制**：

当 autopay 连续失败时，会进入冷却期，期间拒绝自动支付：

```typescript
function isAutopayCircuitOpen(store: Web3StateStore): boolean {
  const cooldownUntil = store.getX402AutopayStats().cooldownUntil;
  return cooldownUntil && Date.parse(cooldownUntil) > Date.now();
}
```

---

## 6. 结算与对账输出（ReconciliationSummary）

对外（可分享）摘要建议包含：

- `orderId` / `leaseId`（如适用）
- `paymentReceipt`（TON 或 EVM）
- `ledgerSummary`（usage 与金额汇总）
- `disputeSummary`（如有：证据 hash、裁决结果）
- `anchorReceipt` / `archiveReceipt`（如启用）

示例（字段为示意，注意脱敏）：

```json
{
  "orderId": "order_...",
  "payment": {
    "chain": "ton",
    "network": "ton-mainnet",
    "txHash": "...",
    "amount": "1.25"
  },
  "ledger": {
    "totalEntries": 12,
    "totalAmount": "...",
    "units": { "token": 12345, "call": 20 }
  },
  "dispute": {
    "open": 0,
    "resolved": 0
  }
}
```

---

## 6. 结算与对账输出（ReconciliationSummary）

对外（可分享）摘要建议包含：

- `orderId` / `leaseId`（如适用）
- `paymentReceipt`（TON 或 EVM）
- `ledgerSummary`（usage 与金额汇总）
- `disputeSummary`（如有：证据 hash、裁决结果）
- `anchorReceipt` / `archiveReceipt`（如启用）
- `serviceProofs`（服务证明摘要）

示例（字段为示意，注意脱敏）：

```json
{
  "orderId": "order_...",
  "payment": {
    "chain": "ton",
    "network": "ton-mainnet",
    "txHash": "...",
    "amount": "1.25"
  },
  "ledger": {
    "totalEntries": 12,
    "totalAmount": "...",
    "units": { "token": 12345, "call": 20 }
  },
  "dispute": {
    "open": 0,
    "resolved": 0
  },
  "serviceProofs": {
    "total": 3,
    "byStatus": { "verified": 2, "pending": 1 },
    "artifactHashes": ["sha256:..."]
  }
}
```

### 6.1 Reconciliation 实现模块

对账摘要生成逻辑由 `web3-core/src/market/reconciliation.ts` 提供：

**核心职责**：

- **多源聚合**：从 `market-core` 聚合 payment、ledger、dispute、serviceProof 数据
- **脱敏输出**：确保输出不包含 endpoint、token、真实路径等敏感信息
- **可分享格式**：支持复制粘贴到外部渠道（Discord/Telegram）用于运营沟通

**Gateway Method 入口**：

```typescript
// web3.market.reconciliation.summary
async function handleReconciliationSummary(params: {
  orderId?: string;
  settlementId?: string;
  leaseId?: string;
  chain?: string;
  network?: string;
  includeLedger?: boolean;
  includeDisputes?: boolean;
}): Promise<ReconciliationSummary>;
```

**PaymentTrace 关联**：

对账时会从 `Web3StateStore` 查找支付记录，关联 `PaymentIntent`、`FXQuote`、`TreasuryRoute` 等上下文：

```typescript
function resolvePaymentTraceRecord(params: {
  store: Web3StateStore;
  orderId?: string;
  settlementId?: string;
}): StoredPaymentRecord | undefined;
```

**输出脱敏**：

所有输出通过 `redactUnknown()` 处理，确保敏感字段（如 endpoint、privateKey）不会泄露到对账摘要中。

---

## 7. 链上最小披露策略（强制一致）

- 链上只允许出现：hash/承诺/汇总/回执
- 禁止出现：endpoint/token/真实路径/调用明细

这与资源共享侧的安全模型一致（见 `docs/reference/web3-resource-market-api.md` 与 `extensions/web3-core/src/utils/redact.ts`）。

---

## 8. 与现有模块的对齐（当前事实 vs 规划）

- **已存在（EVM 主线）**：SIWE 身份、EVM audit anchoring、market-core escrow settlement、资源租约与 Provider 权威账本、dispute 机制、索引签名验证与 endpoint 脱敏。
- **已实现（TON 融合）**：TON 支付/回执/结算主路径已纳入统一口径；链交互由 `extensions/blockchain-adapter` 的 TON provider 抽象承接（详见 `docs/web3/TON_E2E_SETTLEMENT.md`）。
- **已实现（支付编排）**：FXQuote 缓存与快照（`web3-core/src/billing/fx-quote.ts`）、TreasuryRoute 选路（`market-core/src/market/treasury-router.ts`）、PaymentOrchestrator 编排（`web3-core/src/billing/payment-orchestrator.ts`）、Reconciliation 摘要（`web3-core/src/market/reconciliation.ts`）。
- **边界说明**：TON provider 事件轮询链路存在待实现项（`checkNewTransactions()` 仍为 TODO），当前文档按已实现主路径描述，不将该轮询能力表述为已完成。

> 本文档只定义口径与输出格式；具体实现以 `web3-core`/`market-core` 当前代码为准。

---

## 9. 合约发奖（Claim + 兜底直发交易）

### 7.1 信任模型

- **禁止以前端/客户端"成功信号"作为发奖依据**。`node.invoke.result` 的 `ok` 仅为 Promise resolve，不是可验证价值凭证。
- 发奖由后端可信逻辑驱动：后端创建奖励单 → 签发可验证凭证（claim） → 链上验签 + 防重放 → 发放。
- 后端直发交易仅作为**受控兜底/修复通道**（operator write 权限，默认关闭或强约束）。

### 9.2 双链一致语义

EVM 和 TON 的发奖 payload 共享统一的 canonical 字段集：

| 字段                | 说明                                       |
| ------------------- | ------------------------------------------ |
| `recipient`         | 收款方地址                                 |
| `amount`            | 发奖金额（字符串，避免精度丢失）           |
| `asset`             | 资产类型（ERC-20 token 地址 / TON native） |
| `nonce` / `queryId` | 唯一性标识，防止重放                       |
| `deadline`          | 时效（ISO 时间或 Unix 秒）                 |
| `chainFamily`       | `"evm"` 或 `"ton"`                         |
| `network`           | 链网络标识（如 `base` / `ton-mainnet`）    |
| `eventHash`         | 业务事件哈希，关联触发来源                 |

### 9.3 EVM 发奖流程（EIP-712 Typed Data）

```
后端(market-core)            合约(RewardDistributor)          前端/Relayer
    │                              │                              │
    ├─ 创建 RewardGrant ──────────►│                              │
    ├─ 生成 EIP-712 签名 ─────────►│                              │
    │  (domain + RewardClaim type)  │                              │
    ├─ 返回 claim payload+sig ─────┼─────────────────────────────►│
    │                              │◄── claimReward(sig,data) ────┤
    │                              ├─ ecrecover 验签              │
    │                              ├─ 检查 nonce 唯一性           │
    │                              ├─ 检查 deadline               │
    │                              ├─ 转账 ERC-20                 │
    │                              ├─ emit RewardClaimed ─────────►│
    │◄── 回写 onchain_confirmed ───┤                              │
```

- 合约源码：`extensions/blockchain-adapter/contracts/evm/RewardDistributor.sol`
- ABI：`extensions/blockchain-adapter/src/types/abi/reward-distributor.ts`
- 签名适配器：`extensions/market-core/src/market/reward/evm-claim.ts`（`EvmRewardClaimAdapter`）

### 9.4 TON 发奖流程（Ed25519 验签）

```
后端(market-core)            合约(settlement.fc)              链上
    │                              │                           │
    ├─ 创建 RewardGrant ──────────►│                           │
    ├─ escrow-ton.release() ──────►│                           │
    │  (签名 + queryId + amount)    │                           │
    │                              ├─ check_signature(hash,    │
    │                              │   sig, owner_pubkey)      │
    │                              ├─ 验证 status == LOCKED    │
    │                              ├─ 记录 release_query_id    │
    │                              ├─ 转账 TON ────────────────►│
    │◄── 回写 tx/BOC 标识 ─────────┤                           │
```

- 合约源码：`extensions/blockchain-adapter/contracts/ton/settlement.fc`
- 适配层：`extensions/market-core/src/market/escrow-ton.ts`
- 防重放：settlement record 的 `release_query_id` 字段 + 状态机天然防重放（LOCKED → RELEASED 单向）

### 9.5 状态机

```
reward_created → claim_issued → onchain_submitted → onchain_confirmed
                                                  ↘ onchain_failed → claim_issued (可受控重试)
```

- 状态跃迁由 `assertRewardTransition()` 强制校验
- `onchain_failed → claim_issued` 允许受控重试（attempts 计数器递增）
- 每次状态变更均生成审计事件（`reward_created` / `reward_claim_issued`），含 canonical hash

### 9.6 审计锚定

- 每笔奖励单的 canonical hash 由 `rewardCanonicalHash()` 生成（域分离：`domain: "reward"` + 经济身份字段）
- 审计事件通过 `recordAuditWithAnchor()` 写入，复用现有 web3-core 的 anchor/审计能力
- Canonical hash 为 `0x` 前缀的 SHA-256 字符串（66 字符）

### 7.7 Feature Gate

- 配置：`MarketPluginConfig.rewards.enabled`（默认 `true`）
- Handler 入口调用 `assertRewardsEnabled(config)` 检查
- 可在 `openclaw.plugin.json` 的 `configSchema` 中配置

### 9.8 验收标准

- [ ] **幂等性**：相同 `rewardId` 重复创建返回已有记录，不产生副作用
- [ ] **防重放（nonce）**：相同 `(chainFamily, network, recipient, nonce)` 组合拒绝创建
- [ ] **权限控制**：无 write scope 的调用方被拒绝（gateway scope + handler assertAccess 双层）
- [ ] **状态机完整性**：非法状态跃迁被拒绝（如 `onchain_confirmed → claim_issued`）
- [ ] **EVM 链上验证**：EIP-712 签名可被 RewardDistributor 合约 ecrecover 验签
- [ ] **TON 链上验证**：Ed25519 签名可被 settlement.fc 的 `check_signature` 验证
- [ ] **审计追踪**：每次创建和签发 claim 均产生含 canonical hash 的审计事件
- [ ] **feature gate**：`rewards.enabled = false` 时 create 和 issueClaim 均被拒绝
- [ ] **兜底直发交易**：operator write 权限下可通过 escrow-ton 或 EVM provider 直接发送链上交易
- [ ] **链上证据**：EVM 返回 `txHash` + receipt；TON 返回可追踪 tx/BOC 标识 + `release_query_id`

### 9.9 故障排查路径

1. **claim 签发失败**：检查 `config.chain.privateKey` 是否配置（EVM）；检查 `config.chain.mnemonics` 是否配置（TON）
2. **链上提交超时**：检查 RPC endpoint 可达性；确认 gas 估算/TON fee 是否足够
3. **nonce 冲突**：查询 `market.reward.list` 确认已有 reward 的 nonce 值；使用不同 nonce 重新创建
4. **状态卡在 `onchain_submitted`**：链上交易可能 pending/reverted；需手动查链确认后更新状态
5. **审计 hash 不一致**：确认 canonical hash 输入字段完全一致（大小写、精度、前缀）

---

## 10. 与 Skill 的关系

- **不新增 Skill**：双栈支付/结算不单独拆 Skill。
- **复用 `web3-market`**：需要智能体执行主线开发/对齐时，使用 `skills/web3-market/SKILL.md`（其 references 已包含安全模型、资源共享与结算对齐的工作流）。
