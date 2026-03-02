# Web3 Agentic PayFi 技术选型与架构评审报告 (2026)

> **评审目标**：针对 KYA、流支付、x402 三大模块，评估"自研 vs 集成"的必要性，确认是否重复造轮子。
> **结论摘要**：架构设计合理，未重复造轮子。我们在做**应用层协议适配**，而非底层协议开发。

## 1. KYA 策略引擎：为什么不直接用 ERC-7579 / Session Keys？

### 调研现状 (Mature Solutions)

- **ERC-7579 (Modular Smart Accounts)**: EVM 账户抽象标准，支持插件化校验逻辑。
- **Session Keys (ZeroDev/Biconomy)**: 允许为特定密钥签发"有限权能"（Session）。
- **Coinbase AgentKit**: 提供了基础的 Agent 钱包与 MPC 托管。

### 差距分析 (Gap Analysis)

| 维度           | ERC-7579 / Session Keys            | OpenClaw 需求                     | 结论                                                    |
| :------------- | :--------------------------------- | :-------------------------------- | :------------------------------------------------------ |
| **适用范围**   | **仅限 EVM 链** (Ethereum, L2s)    | **双栈支持** (EVM + TON)          | 开源方案无法覆盖 TON，需自研统一适配层。                |
| **风控时机**   | **链上校验** (On-chain Validation) | **链下预判** (Pre-execution)      | 链上校验Gas昂贵且延迟高。Agent 需要毫秒级本地拒绝策略。 |
| **策略灵活性** | 需部署合约/插件，更新策略需上链    | 本地 JSON/Policy 文件，随时热更新 | 自研链下引擎灵活性更高，适合高频 AI 场景。              |

### 决策结论：自研链下适配层 (Off-chain Policy Engine)

我们**不是**在造一个新的账户抽象标准，而是构建一个 **"双栈策略适配器"**：

1.  **对外**：统一为 `WalletPolicy` JSON 格式（人类/AI 可读）。
2.  **对内**：
    - **Phase 1 (MVP)**: 纯链下拦截（Off-chain Guard），拦截 `sign/send` 请求。
    - **Phase 2 (EVM)**: 将策略编译为 ERC-7579 Validator 插件（上链）。
    - **Phase 3 (TON)**: 映射为 TON Connect 权限或多签合约规则。

---

## 2. 流支付 (PayFi)：为什么不直接用 Superfluid / Sablier？

### 调研现状

- **Superfluid**: 资金流协议，支持 **"Constant Flow"** (恒定流率，如 0.001 USDC/sec)。
- **Sablier**: 线性解锁/归属协议 (Linear Vesting)。

### 差距分析

| 维度         | Superfluid                                          | OpenClaw Agent Usage                                                    | 结论                                                 |
| :----------- | :-------------------------------------------------- | :---------------------------------------------------------------------- | :--------------------------------------------------- |
| **计费模型** | **时间流 (Time-based)**<br>适合工资、订阅、视频流。 | **用量流 (Metered/Usage-based)**<br>适合 API 调用、GPU 算力、模型推理。 | Agent 调用是"脉冲式"的（调用时付费，闲置时不付费）。 |
| **资金效率** | 需要预存或持续扣款，停止需发交易。                  | **按需结算 (Pull-based)**<br>用多少结多少，无用量不扣款。               | Superfluid 对"非连续用量"支持不佳（需频繁开关流）。  |
| **跨链支持** | 部署于特定 EVM 链。                                 | 需支持 EVM 和 TON。                                                     | 需自研统一的结算语义。                               |

### 决策结论：自研增量结算协议 (Incremental Settlement)

我们构建的是 **"Metered Settlement" (按量结算)**，而非"Streaming Money" (流资金)：

- **机制**：基于 `Ledger` 记账，周期性触发 `settlement.release(delta)`。
- **兼容性**：未来可将 Superfluid 作为底层通道之一（如用于支付长期包月租赁），但核心业务逻辑必须是"按量"的。

---

## 3. x402 协议：为什么不直接用 L402？

### 调研现状

- **L402 (Lightning)**: `WWW-Authenticate: L402 macaroon="..."`，基于闪电网络。
- **x402 (Aptos)**: 类似标准，但在特定生态。

### 决策结论：采纳标准头，自研实现 (Adopt Standards, Custom Implementation)

我们**绝不**应该发明私有的 HTTP 头部格式。

- **修正计划**：架构文档中原定的自定义 JSON 交互，应改为兼容 **HTTP 402 标准头** 风格。
  - Response: `WWW-Authenticate: L402 token="...", invoice="..."` (或类似变体)
  - Request: `Authorization: L402 <preimage>:<token>`
- **理由**：虽然底层支付链是 EVM/TON 而非 Lightning，但复用头部语义有助于未来接入标准浏览器插件或通用 Agent 钱包。

---

## 4. 总结

我们目前的方案（Off-chain Policy + Incremental Release + x402 Gateway）是 **"Agent Native"** 的最佳实践组合，完美填补了现有 DeFi 协议（纯链上、纯金融导向）与 AI Agent（高频、跨链、业务导向）之间的空白。

**不重复造轮子，但在造车（组装轮子）。**
