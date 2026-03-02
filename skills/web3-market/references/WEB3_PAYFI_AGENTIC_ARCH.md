# OpenClaw Web3 Agentic PayFi 架构蓝图 (2026)

> **版本**：v1.0 (Draft)  
> **适用范围**：Web3 Market（支付、结算、代理身份）  
> **核心目标**：实现“支付即协议”(PayFi) 与“策略驱动代理”(Agentic Commerce) 的融合。

---

## 1. 核心理念：从“离散交易”到“流式金融”

传统的 Web3 是“离散”的（一次签名 = 一次交易）。2026 年的 PayFi 要求 Web3 是“流式”的：

1.  **KYA (Know Your Agent)**：钱包不再是“上帝权限”，而是受 **WalletPolicy** 约束的执行器。
2.  **Streaming Settlement**：结算不再是“一锤子买卖”，而是基于 **Ledger** 的增量释放（Incremental Release）。
3.  **x402 Loop**：支付不再是“异常中断”，而是 **Gateway** 层面的自动闭环协议。

---

## 2. 架构分层与责任边界

为了平衡“灵活性”与“安全性”，我们采用 **Off-chain Policy / On-chain Settlement** 的混合架构。

| 层级            | 组件                    | 职责                                                            | 关键数据结构                  |
| :-------------- | :---------------------- | :-------------------------------------------------------------- | :---------------------------- |
| **应用层 (L3)** | **Gateway Interceptor** | 拦截 `402 Payment Required`，触发自动支付循环。                 | `PaymentIntent`               |
| **策略层 (L2)** | **KYA Policy Engine**   | **(核心)** 拦截所有 `sign/send` 请求，强制执行预算/白名单检查。 | `WalletPolicy`, `DecisionLog` |
| **执行层 (L1)** | **Market Core**         | 维护资源生命周期与结算状态，驱动 Ledger 记账。                  | `Settlement`, `Ledger`        |
| **结算层 (L0)** | **On-chain Contract**   | 最终资金托管与转移（Escrow）。支持分段释放。                    | `EscrowContract`              |

---

## 3. 核心组件设计

### 3.1 KYA Policy Engine (Agent Wallet)

**定位**：Agent 的“前额叶”，负责抑制冲动消费与越权操作。

**数据结构：`WalletPolicy`**

- 规范定义见 **4.1 WalletPolicy**（字段级契约唯一来源）。
- 3.1 仅描述职责与行为，不重复字段定义，避免实现期口径漂移。

**行为**：

- `checkPolicy(intent)`：在每次签名/发送前调用。
- **Pass**：记录 `DecisionLog` (Approved)，放行。
- **Fail**：记录 `DecisionLog` (Rejected)，抛出 `PolicyViolationError`。

---

### 3.2 Streaming Settlement (Market Core)

**定位**：基于用量的“增量结算”引擎。

**数据结构升级：`Settlement`**

```typescript
export type Settlement = {
  // ... existing fields ...
  amount: string; // 总锁定金额 (Cap)
  releasedAmount: string; // [NEW] 已释放金额 (累积)

  strategy: "one-shot" | "metered"; // [NEW] 结算策略

  // 状态流转
  // locked -> active (incremental release) -> completed (final)
};
```

**流程**：

1.  **Lock**：买方锁定全额 `amount` (e.g. 100 USDC)。
2.  **Usage**：卖方/Gateway 上报 `Ledger` (e.g. Used 10 USDC)。
3.  **Release (Incremental)**：Market Core 触发 `release(10)`。
    - 链上合约：将 10 USDC 转给卖方，剩余 90 USDC 继续托管。
    - 状态：`releasedAmount += 10`。
4.  **Finalize**：服务结束，释放剩余资金或退款。

---

### 3.3 x402 Auto-Pay Loop (Gateway & Web3 Core)

**定位**：机器对机器 (M2M) 的无感支付协议。

**流程**：

1.  **Tool Invoke**：Agent 调用 `search_tool`。
2.  **402 Trap**：Provider 返回 `402 Payment Required` + `Invoice` (Price, Address)。
3.  **Interceptor**：Gateway 捕获 402。
    - 检查 `WalletPolicy.autoPay`。
    - 检查 `Invoice` 是否在 `budget` 内。
4.  **Payment**：
    - 调用 `web3.billing.pay(invoice)`。
    - 等待 `PaymentReceipt`。
5.  **Retry**：携带 `PaymentReceipt` (or Token) 重试 `search_tool`。
6.  **Result**：Agent 获得结果，全程无感。

---

## 4. MVP 接口契约（字段级）

> 说明：本节定义 Week6-8 的最小可执行契约，避免实现期概念漂移。

### 4.1 WalletPolicy

```typescript
export type WalletPolicy = {
  version: "v1";
  budget: {
    dailyCap: string;
    perTxCap: string;
    currency: string;
  };
  scope: {
    allowedContracts?: string[];
    allowedMethods?: string[];
    allowedTools?: string[];
    allowedChains?: Array<"evm" | "ton">;
  };
  autoPay: {
    enabled: boolean;
    maxRetries: number;
    maxAutoPayPerRequest?: string;
  };
  ttl?: {
    notBefore?: string;
    notAfter?: string;
  };
};
```

### 4.2 PolicyDecision（审计输出）

```typescript
export type PolicyDecision = {
  decisionId: string;
  timestamp: string;
  action: "sign" | "send" | "autopay";
  result: "approved" | "rejected";
  reasonCode:
    | "budget_daily_exceeded"
    | "budget_per_tx_exceeded"
    | "scope_contract_denied"
    | "scope_method_denied"
    | "scope_tool_denied"
    | "scope_chain_denied"
    | "ttl_expired"
    | "policy_missing"
    | "internal_error";
  metadata?: Record<string, unknown>;
};
```

### 4.3 x402 相关契约（遵循 L402 语义）

> 采用类似 L402 的头部交互流程，但适配 EVM/TON 载荷。

**HTTP 响应头 (Server -> Agent)**:

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: OpenClaw-PayFi realm="market", invoice="<base64_invoice_json>", methods="evm,ton"
```

**PaymentRequiredInvoice (解码后)**:

```typescript
export type PaymentRequiredInvoice = {
  invoiceId: string;
  provider: string;
  chain: "evm" | "ton";
  asset: string;
  amount: string;
  payTo: string;
  nonce: string;
  expiresAt: string;
  idempotencyKey?: string;
};

export type PaymentResumeToken = {
  invoiceId: string;
  paymentReceiptId: string;
  txHash?: string;
  chain: "evm" | "ton";
  issuedAt: string;
  expiresAt: string;
};
```

### 4.4 Settlement 增量释放契约

```typescript
export type SettlementReleaseRequest = {
  settlementId: string;
  amount: string;
  reason: "metered_usage" | "manual_adjustment" | "finalize";
  idempotencyKey?: string;
};
```

---

## 5. 失败语义、幂等与边界

### 5.1 错误语义（最小集合）

- `POLICY_REJECTED`：策略检查拒绝（返回 `PolicyDecision.reasonCode`）。
- `PAYMENT_REQUIRED`：外部服务返回 402，需要支付后重试。
- `PAYMENT_EXPIRED`：invoice 或 resume token 已过期。
- `SETTLEMENT_OVER_RELEASE`：请求释放金额超过可释放余额。
- `IDEMPOTENCY_CONFLICT`：相同 `idempotencyKey` 但 payload 不一致。

### 5.2 幂等规则

- `autopay` 与 `settlement.release` 必须支持 `idempotencyKey`。
- 同一 `idempotencyKey` 的重复请求必须返回同一业务结果，不得二次扣款。
- Gateway 对单次请求最多执行一次自动支付重试（`maxRetries` 默认 1）。

### 5.3 On-chain / Off-chain 责任边界

- **Off-chain（Agent/Gateway/Market）**：Policy 决策、预算统计、402 重试编排、Ledger 计量。
- **On-chain（Escrow）**：最终资金锁定/释放/退款与交易不可抵赖性。
- **约束**：链上不承载复杂风控策略；链下不伪造链上结算事实。

---

## 6. 安全红线与回滚策略

### 6.1 安全红线

- 禁止在日志/状态输出中暴露明文 token、真实 provider endpoint、真实本地路径。
- 自动支付仅允许在 `WalletPolicy.autoPay.enabled=true` 且预算/白名单全部通过时执行。
- 未提供幂等键的自动支付请求，默认拒绝进入自动支付链路。

### 6.2 回滚策略

- 任一阶段出现异常扣款或重试风暴：立即关闭 `autoPay.enabled`（全局 kill switch）。
- `metered` 结算异常时可降级到 `one-shot` 策略，保证结算可用性优先。
- 回滚后必须保留 `PolicyDecision` 与支付链路审计记录，供追溯。

---

## 7. 验收标准 (Definition of Done)

1.  **KYA 验收**：
    - 必须能拦截超额支付。
    - 必须生成结构化的 `PolicyDecision` 日志。
2.  **Streaming 验收**：
    - 支持多次 `release` 操作而不关闭结算单。
    - `releasedAmount` 必须单调递增且不超过 `amount`。
3.  **x402 验收**：
    - 必须处理幂等性（避免重复扣款）。
    - 必须有最大重试次数熔断。

---

## 8. 附录：关键术语

- **PayFi**: Payment Finance，指利用链上流动性与可编程性实现的金融化支付。
- **Agentic Commerce**: 代理商业，指 AI Agent 作为独立经济主体进行的自主交易。
- **Incremental Release**: 增量释放，流式结算的一种务实实现（分段结算）。
