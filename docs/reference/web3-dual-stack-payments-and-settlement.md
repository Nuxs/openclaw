---
title: "Web3 Dual-Stack Payments & Settlement (Reference)"
description: "Web3 双栈支付与结算参考：TON/EVM 两端支付、统一订单口径、汇率与对账输出、链上最小披露与安全约束"
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

PaymentIntent 是“用户选择链与资产”的最小表达：

- `chain`: `"ton" | "evm"`
- `asset`: 例如 `"TON" | "JETTON:<address>" | "ERC20:<address>" | "NATIVE"`
- `amount`: 字符串（避免精度丢失）
- `expiresAt`: ISO 时间

示例（仅示意，地址为占位符）：

```json
{
  "chain": "ton",
  "asset": "TON",
  "amount": "1.25",
  "expiresAt": "2026-02-22T12:00:00.000Z"
}
```

### 2.2 支付回执（PaymentReceipt）

PaymentReceipt 是链上最小披露：

- TON：`txHash`/`seqno`/`network`/`amount`/`confirmedAt`
- EVM：`txHash`/`chainId`/`tokenAddress?`/`amount`/`block`
- 通用：`mode`（`"live"` 或 `"simulated"`，区分真实回执与演示/测试回执）

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

FXQuote 的最小结构：

- `base`: 计价资产（例如 USD）
- `quote`: 支付资产（例如 TON / USDC / Jetton）
- `rate`: base/quote
- `source`: 报价来源标识（例如 `"binance-spot"` / `"pyth-oracle"` / `"manual"`）
- `expiresAt`: 过期时间
- `roundingRule`: 取整规则（例如 `"round-half-up"` / `"ceil"` / `"floor"`，默认 `"round-half-up"`）

> 候选报价来源与选型 tradeoff 见 `docs/web3/WEB3_DUAL_STACK_STRATEGY.md` §3.3。MVP 阶段建议 CEX API + 手动 fallback。

---

## 4. 结算与对账输出（ReconciliationSummary）

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

## 5. 链上最小披露策略（强制一致）

- 链上只允许出现：hash/承诺/汇总/回执
- 禁止出现：endpoint/token/真实路径/调用明细

这与资源共享侧的安全模型一致（见 `docs/reference/web3-resource-market-api.md` 与 `extensions/web3-core/src/utils/redact.ts`）。

---

## 6. 与现有模块的对齐（当前事实 vs 规划）

- **已存在（EVM 主线）**：SIWE 身份、EVM audit anchoring、market-core escrow settlement、资源租约与 Provider 权威账本、dispute 机制、索引签名验证与 endpoint 脱敏。
- **规划中（TON 融合）**：将 TON 支付/回执/结算能力纳入统一口径；链交互将由 `extensions/blockchain-adapter` 的 TON provider 抽象承接（补充：EVM escrow 侧已通过 blockchain-adapter 的 EVM provider 发送合约交易）。

> 本文档只定义口径与输出格式；具体实现以 `web3-core`/`market-core` 的后续开发为准。

---

## 7. 合约发奖（Claim + 兜底直发交易）

### 7.1 信任模型

- **禁止以前端/客户端"成功信号"作为发奖依据**。`node.invoke.result` 的 `ok` 仅为 Promise resolve，不是可验证价值凭证。
- 发奖由后端可信逻辑驱动：后端创建奖励单 → 签发可验证凭证（claim） → 链上验签 + 防重放 → 发放。
- 后端直发交易仅作为**受控兜底/修复通道**（operator write 权限，默认关闭或强约束）。

### 7.2 双链一致语义

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

### 7.3 EVM 发奖流程（EIP-712 Typed Data）

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

### 7.4 TON 发奖流程（Ed25519 验签）

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

### 7.5 状态机

```
reward_created → claim_issued → onchain_submitted → onchain_confirmed
                                                  ↘ onchain_failed → claim_issued (可受控重试)
```

- 状态跃迁由 `assertRewardTransition()` 强制校验
- `onchain_failed → claim_issued` 允许受控重试（attempts 计数器递增）
- 每次状态变更均生成审计事件（`reward_created` / `reward_claim_issued`），含 canonical hash

### 7.6 审计锚定

- 每笔奖励单的 canonical hash 由 `rewardCanonicalHash()` 生成（域分离：`domain: "reward"` + 经济身份字段）
- 审计事件通过 `recordAuditWithAnchor()` 写入，复用现有 web3-core 的 anchor/审计能力
- Canonical hash 为 `0x` 前缀的 SHA-256 字符串（66 字符）

### 7.7 Feature Gate

- 配置：`MarketPluginConfig.rewards.enabled`（默认 `true`）
- Handler 入口调用 `assertRewardsEnabled(config)` 检查
- 可在 `openclaw.plugin.json` 的 `configSchema` 中配置

### 7.8 验收标准

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

### 7.9 故障排查路径

1. **claim 签发失败**：检查 `config.chain.privateKey` 是否配置（EVM）；检查 `config.chain.mnemonics` 是否配置（TON）
2. **链上提交超时**：检查 RPC endpoint 可达性；确认 gas 估算/TON fee 是否足够
3. **nonce 冲突**：查询 `market.reward.list` 确认已有 reward 的 nonce 值；使用不同 nonce 重新创建
4. **状态卡在 `onchain_submitted`**：链上交易可能 pending/reverted；需手动查链确认后更新状态
5. **审计 hash 不一致**：确认 canonical hash 输入字段完全一致（大小写、精度、前缀）

---

## 8. 与 Skill 的关系

- **不新增 Skill**：双栈支付/结算不单独拆 Skill。
- **复用 `web3-market`**：需要智能体执行主线开发/对齐时，使用 `skills/web3-market/SKILL.md`（其 references 已包含安全模型、资源共享与结算对齐的工作流）。
