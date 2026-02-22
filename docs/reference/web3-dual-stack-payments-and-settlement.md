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

> 候选报价来源与选型 tradeoff 见 `docs/WEB3_DUAL_STACK_STRATEGY.md` §3.3。MVP 阶段建议 CEX API + 手动 fallback。

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
- **规划中（TON 融合）**：将 TON 支付/回执/结算能力纳入统一口径；链交互由 `extensions/blockchain-adapter` 的 TON provider 抽象承接。

> 本文档只定义口径与输出格式；具体实现以 `web3-core`/`market-core` 的后续开发为准。

---

## 7. 与 Skill 的关系

- **不新增 Skill**：双栈支付/结算不单独拆 Skill。
- **复用 `web3-market`**：需要智能体执行主线开发/对齐时，使用 `skills/web3-market/SKILL.md`（其 references 已包含安全模型、资源共享与结算对齐的工作流）。
