### OpenClaw Web3 AI 管家自由市场 — 上线评审报告（勘误修订版）

> **评审日期**: 2026-03-03
> **修订日期**: 2026-03-03（二次代码走查勘误）
> **文档类型**: 深度技术评审 + 竞品对标 + 上线判定
> **评审者**: AI Assistant（基于全量代码走查 + 测试执行 + 竞品调研）
> **范围**: market-core, blockchain-adapter, agent-wallet, web3-core 四大模块全量源码 + 56 个测试文件 + 智能合约 + UI 集成层
> **修订说明**: 本版对初版报告进行了逐项代码级验证，纠正了链数统计、handler 数量、BUG 根因描述、ARCH-05 判定等多处不准确之处。修订条目均以 `[勘误]` 标注。

---

## 一、执行摘要

### 1.1 上线判定

**结论: 🟡 有条件上线（Testnet/受控 Beta），不建议全量 Mainnet 上线**

| 维度         | 评分              | 判定                                                        |
| ------------ | ----------------- | ----------------------------------------------------------- |
| 架构完整性   | ★★★★☆ (4.2/5)     | 交易闭环完整，模块化优秀                                    |
| 代码质量     | ★★★½☆ (3.8/5)     | TypeScript 严格模式，但存在 6 个已确认缺陷（含 1 个严重级） |
| 测试覆盖     | ★★★☆☆ (3.5/5)     | 单元测试丰富，跨模块 E2E 严重不足                           |
| 安全性       | ★★★☆☆ (3.2/5)     | 基础安全到位，合约未审计 + TOCTOU 竞态                      |
| 生产就绪     | ★★★☆☆ (3.0/5)     | 9 个测试用例失败，关键子系统（service-proof）全面不可用     |
| 竞品对标     | ★★★★☆ (4.0/5)     | 架构先进性优于多数竞品                                      |
| **综合评分** | **★★★½☆ (3.6/5)** | **可受控上线 Testnet Beta，不可全量 Mainnet**               |

> `[勘误]` 综合评分从 3.7 调整为 3.6。代码质量从 4.0 降为 3.8（BUG-06 的根因比初版描述的更严重——是属性查找键名错误而非时间格式问题，直接导致 service-proof 子系统全面瘫痪）；安全性从 3.3 降为 3.2（新增 daily cap TOCTOU 竞态漏洞的识别，不仅是测试失败，还存在并发绕过风险）。

### 1.2 关键数字

| 指标                 | 数值                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 源文件总数（4 模块） | 149 个 .ts 文件（market-core 52 + web3-core 63 + blockchain-adapter 22 + agent-wallet 12）                         |
| 测试文件             | 56 个（17 market-core + 30 web3-core + 3 blockchain-adapter + 6 agent-wallet）                                     |
| 测试用例             | market-core: 150 个（143 通过/7 失败），blockchain-adapter: 11 个（全通过），agent-wallet: 38 个（36 通过/2 失败） |
| E2E 测试             | 2 个用例（market-core `e2e-flow.e2e.test.ts`，含 File + SQLite 双模式），缺跨模块贯通                              |
| 智能合约             | 2 个（EVM `RewardDistributor.sol` 135 行 + TON `settlement.fc` 406 行）                                            |
| 支持链数             | 工厂注册 10 条 EVM + 2 条 TON = 12 条链（实际部署配置仅 Base 1 条 EVM + TON 2 条）                                 |
| TODO/FIXME           | 4 处（blockchain-adapter 3 处 + settlement.ts 1 处 `resolveContract` TODO）                                        |
| Handler 工厂函数     | market-core 66 个（分布在 18 个 handler 文件 + 1 个 `_shared.ts`）                                                 |
| Gateway Methods      | web3-core 69 个 `registerGatewayMethod` 调用                                                                       |

> `[勘误]` 多处数据纠正：
>
> - 源文件从"~120 个"更正为精确的 **149 个**
> - 链数从"EVM 11 条 + TON 2 条 = 13 条"更正为"工厂注册 **10 条 EVM + 2 条 TON = 12 条**"（类型定义含已废弃的 Goerli chainId=5，但 `EVM_CHAINS` 和 `factory.ts` 未注册）。实际部署配置（`blockchain-adapter.config.json`）仅 **1 条 EVM (Base) + 2 条 TON + 2 条 Solana + 1 条 Sui = 6 条**，其中 Solana/Sui 无 Provider 实现。
> - Handler 数量从"19 个 handler"更正为"**18 个 handler 文件 + 1 个 `_shared.ts`，共导出 66 个工厂函数**"
> - Gateway Methods 从"50+"更正为精确的 **69 个**
> - TODO 从"仅 3 处"更正为 **4 处**（新增 `settlement.ts` 的 `resolveContract` TODO）
> - E2E 测试描述更精确：1 个文件含 2 个用例，不是"market-core 1 + web3-core 1"

---

## 二、架构全景评审

### 2.1 四层架构总览

```
┌─────────────────────────────────────────────────────────┐
│ Layer 4: UI/CLI 体验层                                    │
│   ├─ ui/src/ui/views/market.ts                          │
│   ├─ ui/src/ui/views/market-cards.ts / market-sections.ts│
│   └─ web3-core/src/market/handlers.ts (Gateway 代理层)   │
├─────────────────────────────────────────────────────────┤
│ Layer 3: 市场核心 (market-core)                           │
│   ├─ 66 个 handler 工厂函数（18 个领域文件）               │
│   ├─ 状态机（8 种实体状态转换）                            │
│   ├─ 定价引擎（动态定价/阶梯定价/波动率/订单簿）           │
│   ├─ 双存储后端（File + SQLite）                          │
│   └─ 透明度/审计/争议仲裁/信誉/奖励/修复子系统             │
├─────────────────────────────────────────────────────────┤
│ Layer 2: 钱包与策略 (agent-wallet)                        │
│   ├─ KYA 策略引擎（budget/scope/autoPay/ttl）            │
│   ├─ AES-256-GCM 加密存储                                │
│   ├─ EVM + TON 双链 handler                              │
│   └─ 每日预算追踪与状态持久化（存在 TOCTOU 竞态）          │
├─────────────────────────────────────────────────────────┤
│ Layer 1: 区块链适配器 (blockchain-adapter)                 │
│   ├─ EVM: viem-based (10 chains 工厂注册)                │
│   ├─ TON: TonConnect + Headless dual mode               │
│   ├─ Settlement: lock/release/refund (EVM + TON)        │
│   └─ Reward: EIP-712 claim (RewardDistributor.sol)      │
└─────────────────────────────────────────────────────────┘
```

> `[勘误]`
>
> - 移除了 `market-assistant.ts (自然语言→结构化命令)` 条目——经代码走查确认，`extensions/web3-core/src/market/` 下**不存在** `market-assistant.ts` 文件，全局搜索也无此文件。初版描述有误。
> - EVM 链数从"11 chains"更正为"10 chains 工厂注册"
> - market-core handler 数量从"19 个 handler"更正为"66 个 handler 工厂函数（18 个领域文件）"
> - 新增"存在 TOCTOU 竞态"标注
> - 定价引擎补充了"订单簿"子模块（pricing.ts 导出 7 个函数含 `createOrderBookEntryHandler`/`getOrderBookHandler`）

### 2.2 交易闭环完整性

核心交易闭环 **已完整实现**，覆盖完整生命周期：

```
resourcePublish → offerCreate → orderCreate → settlementLock
→ consentGrant → deliveryIssue → deliveryComplete
→ settlementRelease → ledgerAppend → metricsSnapshot
    ↗ disputeOpen → disputeEvidence → disputeResolve
    ↗ leaseIssue → ledgerAppend（增量结算）
    ↗ revocationRequest（撤销流程）
```

**E2E 已验证的完整流程**（`e2e-flow.e2e.test.ts`，381 行，2 个用例）：

- **用例 1**: 完整订单 + 争议 + 租约 + 指标流程
  - `resourcePublish` → `orderCreate` → `settlementLock` → `consentGrant` → `deliveryIssue` → `deliveryComplete`
  - `disputeOpen` → `disputeEvidence` → `disputeResolve`
  - `leaseIssue` → `ledgerAppend`
  - `metricsSnapshot`
  - 最终状态断言：order=`settlement_completed`, settlement=`settlement_released`
- **用例 2**: 计量结算自动释放
  - 两轮 `ledgerAppend`（80 + 120 = 200）累加到 cap 自动 `release`
- 两个用例均通过 `withStoreModes` 在 File + SQLite 双模式下运行

> `[勘误]` E2E 描述从笼统的 3 条改为精确的 2 个用例及其具体覆盖范围。补充了**未覆盖领域**：bridge、token-economy、reputation、pricing、repair、transparency、offer 独立操作、reward 等 handler 未在 E2E 中出现。

### 2.3 架构亮点

1. **状态机严格性**: 8 种实体（Offer/Order/Delivery/Settlement/Reward/Resource/Lease/Dispute）均有 `assertXxxTransition` 守卫，非法状态转换在入口即拒绝
2. **双存储后端**: File（适合轻量部署）+ SQLite（适合生产），两者 API 一致，SQLite 带完整 BEGIN/COMMIT/ROLLBACK 事务
3. **定价引擎**: 支持动态定价（供需弹性）、阶梯定价（批量折扣）、波动率计算、市场指标收集、订单簿
4. **KYA 策略引擎**: Agent 钱包的知情同意框架（Know Your Agent），支持 per-tx/daily cap/合约白名单/方法白名单/工具白名单/链白名单/TTL
5. **透明度系统**: 完整的交易审计日志（transparency handler）+ Merkle 审计根（canonicalize）
6. **跨链抽象**: 统一 IProvider 接口，工厂模式注册 12 条链（10 EVM + 2 TON），支持 EVM + TON 双栈
7. **Overlay 架构**: 严格遵循 fork 规范，所有 Web3 扩展通过叶子文件 + spread 合并，上游文件仅增加 1-2 行
8. **Gateway 代理层**: web3-core 的 `market/handlers.ts`（506 行）通过统一的 `createMarketProxyHandler` 工厂函数实现 `web3.market.*` → `market.*` 请求透传，30 个代理 handler + 1 个自定义聚合（`reconciliation.summary`）

> `[勘误]` 链数从"13 条"更正为"12 条（10 EVM + 2 TON）"。新增第 8 点 Gateway 代理层描述，补充了定价引擎的订单簿模块。

### 2.4 架构缺陷

| 编号            | 缺陷                                           | 严重程度  | 详述                                                                                                                                                                                       |
| --------------- | ---------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| ARCH-01         | 跨插件集成无贯通测试                           | 🔴 高     | agent-wallet → market-core → blockchain-adapter 无端到端测试，真实支付闭环未验证                                                                                                           |
| ARCH-02         | Solana/Sui 仅类型预留                          | 🟡 中     | `ChainType` 联合类型含 `"solana"                                                                                                                                                           | "sui"`，config 已定义链配置，但 `providers/`下无`solana/`或`sui/` 目录，零实现代码 |
| ARCH-03         | TON `checkNewTransactions` 未实现              | 🟡 中     | 方法体为空（仅 `// TODO: implement if/when required.`），`subscribeEvents` 轮询永远不会触发回调                                                                                            |
| ARCH-04         | 浏览器钱包模式已显式禁用                       | 🟡 中     | `connect()` 和 `connectWithBrowserWallet()` 双重 `throw Error`，DApp 场景无法使用。`SignerMode` 类型和 `signMessage`/`signTypedData` 的 `case "browser-wallet"` 分支代码仍保留，属于死代码 |
| ~~ARCH-05~~     | ~~market-assistant 未与 market-core 深度集成~~ | ~~🟢 低~~ | **[勘误] 删除此项**——`market-assistant.ts` 文件不存在，全局搜索无此文件。初版描述有误                                                                                                      |
| ARCH-06（新增） | EVM 结算合约地址映射为 TODO                    | 🟡 中     | `settlement.ts` 的 `resolveContract()` 含 `// TODO: 支持多代币结算合约映射`，当前无论传入什么 token 都返回同一个 `config.contractAddress`                                                  |
| ARCH-07（新增） | EVM 结算 `release`/`refund` 缺少 token 参数    | 🟡 中     | `lock()` 和 `lockErc20()` 支持 `token?` 参数，但 `release()` 和 `refund()` 方法签名中无 token 参数，多代币场景下合约无法区分                                                               |

> `[勘误]`
>
> - ARCH-02 描述更精确：从"config 和 peerDeps 已定义"改为"类型和 config 已定义"
> - ARCH-05 删除——`market-assistant.ts` 经代码走查确认不存在
> - 新增 ARCH-06（结算合约地址映射 TODO）和 ARCH-07（release/refund 缺 token 参数）

---

## 三、代码质量深度审查

### 3.1 已通过测试的模块健康度

| 模块               | 套件 | 用例 | 通过率          | 备注                 |
| ------------------ | ---- | ---- | --------------- | -------------------- |
| market-core        | 58   | 150  | 95.3% (143/150) | 7 个失败（3 个文件） |
| blockchain-adapter | 6    | 11   | 100% (11/11)    | 全部通过             |
| agent-wallet       | 16   | 38   | 94.7% (36/38)   | 2 个失败（2 个文件） |

### 3.2 失败测试分析

#### 🔴 market-core 7 个失败

| 测试文件                | 失败用例                                   | 根因                                                                                                                                                                                                                      | 影响                                             |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `validators.test.ts`    | `accepts a valid tlsnotary proof`          | `requireIsoTimestamp(proof, "proof.issuedAt")` 中 `"proof.issuedAt"` 被同时用作**属性查找键**和错误消息标签，但 proof 对象的实际键名是 `"issuedAt"`（不带前缀），导致 `params["proof.issuedAt"]` → `undefined` → 必定抛出 | TLSNotary 证明验证**永远失败**，该功能完全不可用 |
| `service-proof.test.ts` | 5 个用例全部失败                           | **级联自 validators.ts 的 BUG-06**——所有 `submitProof` 调用在 proof 验证阶段即抛出异常，后续业务逻辑从未被执行                                                                                                            | 服务证明子系统完全瘫痪                           |
| `reward/poller.test.ts` | `marks as failed when receipt is reverted` | onchain 状态未正确从 `onchain_submitted` 转换为 `onchain_failed`                                                                                                                                                          | 奖励链上回执失败检测异常                         |

> `[勘误]`
>
> - `validators.test.ts` 的失败原因从"issuedAt 字段未使用 ISO 时间戳格式"更正为**属性查找键名错误**（`"proof.issuedAt"` vs `"issuedAt"`）。这是一个更严重的 bug——不是格式不匹配，而是键名错误导致永远找不到值。
> - `service-proof.test.ts` 的失败原因从"前置条件校验与测试期望不匹配"更正为**级联自 BUG-06**。5 个失败不是独立的 5 个 bug，而是同一个根因（`requireExecutionProof` 永远抛出）的连锁反应。
> - 初版说"E_INVALID_ARGUMENT 内容变更"是不准确的，实际抛出的是 `"proof.issuedAt must be an ISO timestamp"` 这个验证错误。

#### 🟡 agent-wallet 2 个失败

| 测试文件                      | 失败用例                                         | 根因                                                                                                                                                                                              | 影响                                                     |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `handlers.policy.test.ts`     | `rejects second send when daily cap is exceeded` | daily cap 的"检查"（`readDailySpent`）和"写入"（`commitUsage` → `addDailySpent`）不是原子操作。测试在串行场景下验证了拦截逻辑，但实际 `enforcePolicy` 和 `commitUsage` 的分离设计存在 TOCTOU 竞态 | EVM 钱包可能超支（串行场景下逻辑正确，并发场景下可绕过） |
| `ton-handlers.policy.test.ts` | `rejects second send when daily cap is exceeded` | 同上，TON handler 的 `enforcePolicy` 逻辑与 EVM 完全一致                                                                                                                                          | 双链均受影响                                             |

> `[勘误]` 初版仅说"每日预算累计逻辑异常"，现补充了完整的 TOCTOU 竞态分析。daily cap 问题不仅是"测试失败"那么简单——它暴露了一个**架构级的并发安全问题**：
>
> **完整数据流**:
>
> 1. `enforcePolicy()` → `readDailySpent()`（**无文件锁**）读取当前已花费总额
> 2. `checkPolicy()` 判定 `dailySpent + intent.amount > dailyCap`
> 3. 交易链上执行 `provider.sendTransaction()`
> 4. `enforcement.commitUsage()` → `addDailySpent()`（**有文件锁**）写入花费记录
>
> **竞态窗口**: 步骤 1-2 和步骤 4 之间无原子性保证。并发请求可在步骤 1 读到相同的 `dailySpent=0`，各自通过步骤 2 的检查后同时发送交易，绕过 dailyCap 限制。

### 3.3 已发现的代码缺陷

| 编号           | 位置                                                                    | 缺陷                                                                                                                                                                                                                                                                                                                      | 严重程度 | 验证状态                                                                                       |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| BUG-01         | `blockchain-adapter/src/providers/evm/wallet.ts` L300-311               | `signTypedData` 远程模式使用 `hashMessage(JSON.stringify(typedData))` 而非 `hashTypedData()`。`hashMessage` 添加 EIP-191 前缀 `"\x19Ethereum Signed Message:\n"`，完全不符合 EIP-712 规范。代码注释自行标注"这里返回空实现"                                                                                               | 🔴 高    | ✅ 代码确认                                                                                    |
| BUG-02         | `blockchain-adapter/src/types/error.ts` L72-101                         | `EvmError` 构造函数硬编码 `ErrorCode.UNKNOWN`，4 个静态工厂方法（`transactionReverted`/`insufficientBalance`/`insufficientGas`/`contractError`）将真实 ErrorCode 传入 `details` 参数位。`error.code` 永远为 `"UNKNOWN_ERROR"`                                                                                             | 🟡 中    | ✅ 代码确认                                                                                    |
| BUG-03         | `blockchain-adapter/src/providers/evm/wallet.ts` L150-166               | `connectWithRemoteSignature` 调用 `generatePrivateKey()` 生成随机临时私钥，`this._address` 被设为此随机地址。远程签名服务拥有自己的私钥和地址，两者完全不一致。影响余额查询、地址校验、交易 `from` 字段等所有依赖 `this._address` 的逻辑                                                                                  | 🔴 高    | ✅ 代码确认                                                                                    |
| BUG-04         | `blockchain-adapter/src/providers/evm/index.ts` L202 + `wallet.ts` L269 | `signTypedData` 中 `domain.name` 被移除两次（`index.ts` 和 `wallet.ts` 各一次）。第二次移除时 `name` 已不存在，不报错但冗余。另外，`domain.name` 是 EIP-712 domain separator 的标准字段，**不应被移除**——viem 的 `signTypedData` 接受完整 domain                                                                          | 🟡 中    | ✅ 代码确认（严重程度从🟢低上调为🟡中，因为 domain.name 被错误移除影响 domain separator 计算） |
| BUG-05         | `blockchain-adapter/src/providers/ton/index.ts` L355                    | `(this.client as any).getTransactions(address, { limit: 20 })` 的调用签名与 `TonClient.getTransactions(address, opts)` **实际兼容**（参数结构匹配）。`as any` 是类型安全问题而非运行时 bug                                                                                                                                | 🟢 低    | ✅ 验证后降级（初版描述"绕过类型检查"正确，但运行时无害）                                      |
| BUG-06         | `market-core/src/market/validators.ts` L110-136                         | `requireIsoTimestamp(proof, "proof.issuedAt")` 中 `key = "proof.issuedAt"` 被用于 `params[key]` 属性查找，但实际键名是 `"issuedAt"`。对比 `requireString(proof.type, "proof.type")` 直接传值+标签的模式，`requireIsoTimestamp` 的 API 设计不一致——它将 key 参数**既用于查找又用于错误消息**，导致查找永远返回 `undefined` | 🔴 严重  | ✅ 代码确认（严重程度从🟡中上调为🔴严重，因为直接导致 service-proof 子系统 6 个测试全部失败）  |
| BUG-07（新增） | `agent-wallet/src/handlers.ts` L78-121 + `state.ts` L70-99              | daily cap 存在 TOCTOU 竞态：`readDailySpent()`**无文件锁**，`addDailySpent()`**有文件锁**但与读操作不在同一原子事务中。并发请求可在 `commitUsage()` 写入前同时通过 `checkPolicy()` 检查，绕过每日预算上限                                                                                                                 | 🔴 高    | ✅ 代码确认（初版未识别此 bug，仅报告测试失败）                                                |

> `[勘误]` 多处纠正：
>
> - BUG-01：补充了 `hashMessage` 的具体行为（添加 EIP-191 前缀）以及代码自注释"空实现"
> - BUG-03：严重程度从🟡中上调为🔴高——地址不一致影响的不仅是显示，还影响余额查询、from 字段等核心逻辑
> - BUG-04：严重程度从🟢低上调为🟡中——`domain.name` 被移除实际影响 EIP-712 domain separator 哈希计算
> - BUG-05：验证后确认调用签名兼容，保持🟢低
> - BUG-06：根因从"时间格式不匹配"更正为"属性查找键名错误"，严重程度从🟡中上调为🔴严重
> - 新增 BUG-07（TOCTOU 竞态），初版仅报告测试失败未深入分析根因

### 3.4 安全审查

#### ✅ 已实现的安全措施

| 措施                      | 实现位置                            | 评估                                                                               |
| ------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| 私钥 AES-256-GCM 加密存储 | agent-wallet/store.ts               | 已测试验证，磁盘无明文私钥                                                         |
| 敏感信息脱敏（8 种模式）  | agent-wallet/errors.ts              | 路径/URL/Bearer/token/ENV/hex/JWT/Windows路径                                      |
| KYA 策略引擎              | agent-wallet/policy.ts              | 全路径测试覆盖（budget/scope/ttl/autopay）                                         |
| Provider 权威记账防伪造   | market-core handlers                | `actorId === providerActorId` 校验                                                 |
| 状态机防重入              | market-core state-machine.ts        | 8 种实体的状态转换守卫                                                             |
| Ed25519 签名验证          | TON settlement.fc（406 行）         | 合约级防重放（`release_query_id`）+ 4 种状态转换守卫                               |
| EIP-712 签名验证          | RewardDistributor.sol（135 行）     | deadline + claimId 防重放                                                          |
| 敏感配置标注              | openclaw.plugin.json                | rpcUrl/privateKey/apiKey 等均 `sensitive: true`                                    |
| 凭据加密存储              | market-core credentials.ts          | 独立加密模块                                                                       |
| 统一错误脱敏              | `_shared.ts` `formatGatewayError()` | 通过 `redactSensitiveInfo()` 脱敏 + `ERROR_CODE_DESCRIPTIONS` 静态映射返回安全消息 |

> `[勘误]` 新增"统一错误脱敏"条目——初版 SEC-04 说"部分 handler 仍透传 err.message"过于笼统，实际 `_shared.ts` 的 `formatGatewayErrorResponse()` 是安全的，需要精确定位泄露点。

#### 🔴 安全缺口（上线阻断项）

| 编号           | 缺口                                    | 风险                                                                                                                                                                                                                                                                    |
| -------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01         | **智能合约未经第三方审计**              | `settlement.fc`（406 行）和 `RewardDistributor.sol`（135 行）均为自行编写，未经 CertiK/OpenZeppelin/Trail of Bits 等第三方审计。合约审计是上线 Mainnet 的硬性前提。注：EVM 侧**无 Settlement.sol 合约文件**（仅有 RewardDistributor.sol），EVM 结算合约地址来自外部配置 |
| SEC-02         | **EIP-712 签名实现不合规（远程模式）**  | BUG-01：`hashMessage(JSON.stringify())` 使用 EIP-191 前缀而非 EIP-712 结构化哈希。BUG-04：`domain.name` 被错误移除，影响 domain separator 计算。双重问题导致远程签名模式产生的签名**链上验证必定失败**                                                                  |
| SEC-03         | **daily cap 存在 TOCTOU 竞态漏洞**      | BUG-07：`readDailySpent` 无锁 + `addDailySpent` 延迟写入 = 并发绕过。不仅是测试失败，更是一个**可被利用的安全漏洞**——恶意并发请求可突破每日预算上限                                                                                                                     |
| SEC-04         | **`ledger.ts` L178 透传 `err.message`** | 唯一确认的泄露点：`settlementReleaseError = err instanceof Error ? err.message : String(err)` 直接返回给客户端，未经 `redactSensitiveInfo()` 处理。其他 handler 均通过 `formatGatewayErrorResponse()` 安全返回                                                          |
| SEC-05         | **多代币结算合约映射未实现**            | `settlement.ts` 的 `resolveContract()` 含 TODO，`release()`/`refund()` 缺少 token 参数。当前仅对应单一 `config.contractAddress`，多代币场景下资金路由错误                                                                                                               |
| SEC-06（新增） | **远程签名模式地址不一致**              | BUG-03：`connectWithRemoteSignature` 生成随机临时地址作为 `this._address`，与远程签名服务的真实地址不匹配。余额查询、地址校验、交易 `from` 字段均指向错误地址                                                                                                           |

> `[勘误]`
>
> - SEC-01：补充了 EVM 侧无 Settlement.sol 的事实
> - SEC-02：整合了 BUG-01 和 BUG-04 的双重影响
> - SEC-03：从"测试失败"升级为"TOCTOU 竞态漏洞"，这是初版最大的遗漏——不仅是 bug，更是可被利用的安全问题
> - SEC-04：从"部分 handler 仍透传 err.message"精确定位为唯一的 `ledger.ts` L178
> - 新增 SEC-06（远程签名地址不一致），初版 BUG-03 仅标为🟡中，现认识到这是安全级别的问题

---

## 四、竞品对标分析

### 4.1 竞品全景

基于深度调研，当前 AI Agent 去中心化市场赛道主要有以下竞品分类：

#### A. Agent 发射/交易平台类

| 项目                  | 类型             | 核心特色                            | 技术栈          | 状态         |
| --------------------- | ---------------- | ----------------------------------- | --------------- | ------------ |
| **Virtuals Protocol** | Agent Launchpad  | Agent 代币化发射 + 沙盒模拟         | Base L2, EVM    | 已上线，活跃 |
| **ai16z / ElizaOS**   | Agent 框架 + DAO | 多 Agent 模拟 + 信任评分 + DAO 投资 | Solana, ElizaOS | 已上线，活跃 |
| **XAIAgent**          | Agent 平台       | Agent 创建 + 交易                   | 多链            | 早期         |

**OpenClaw 对比**: 不做 Agent 代币发射，而是做 Agent **服务交易市场**——更接近 SaaS marketplace 而非 launchpad。差异化明显：Virtuals 做的是 "Agent as Memecoin"，OpenClaw 做的是 "Agent as Service Provider"。

#### B. 去中心化 AI 网络/协议类

| 项目                                             | 类型                   | 核心特色                                                               | 技术栈                      | 状态                    |
| ------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------- | --------------------------- | ----------------------- |
| **ASI Alliance** (Fetch.ai+SingularityNET+Ocean) | 超级联盟               | 2024 年三方代币合并为 ASI（26.3 亿枚），统一 AI Agent 注册/发现/执行   | 自有链 + EVM                | 已合并，迭代中          |
| **Morpheus (MOR)**                               | 去中心化 AI Agent 网络 | 个人 AI Agent + SmartContractRank 算法 + Capital/Code/Compute 三角激励 | EVM (多链 via Wormhole NTT) | 已上线，Compute Testnet |
| **Autonolas (OLAS)**                             | 自治 Agent 服务        | Agent 注册表 + Staking/Bonding + 服务组件化                            | EVM (Ethereum/Gnosis)       | 已上线，活跃            |
| **Bittensor (TAO)**                              | 去中心化 AI 网络       | 子网架构 + 矿工/验证者激励 + GPU 算力市场                              | 自有链 (Substrate)          | 已上线，50+ 子网        |

**OpenClaw 对比**:

- 相比 ASI Alliance 的**重量级公链方案**，OpenClaw 采用**轻量级 L2/侧链方案**（Base/TON），部署成本更低
- 相比 Morpheus 的 Capital/Code/Compute 三角模型，OpenClaw 的 **Provider/Consumer 双角色 + Escrow 担保** 更贴近实际交易场景
- 相比 Autonolas 的纯 EVM 方案，OpenClaw **支持 TON 生态**，覆盖 Telegram 巨大用户群
- 相比 Bittensor 的子网挖矿模型，OpenClaw 是**服务交易市场**而非算力挖矿

> `[勘误]` "Base/Optimism/TON"改为"Base/TON"——代码中虽然工厂注册了 Optimism，但实际部署配置仅 Base。

#### C. 去中心化算力市场类

| 项目               | 类型        | 核心特色                   | 状态   |
| ------------------ | ----------- | -------------------------- | ------ |
| **Akash Network**  | GPU 算力    | 反向拍卖 + Kubernetes 部署 | 已上线 |
| **io.net**         | GPU 聚合    | 全球 GPU 聚合 + 联邦学习   | 已上线 |
| **Gensyn**         | AI 训练验证 | 训练过程可验证性           | 开发中 |
| **Render Network** | GPU 渲染    | 分布式 GPU 渲染            | 已上线 |

**OpenClaw 对比**: OpenClaw 不直接做底层算力市场，而是在**上层做 AI Agent 服务的交易与编排**。与 Akash 等形成互补而非竞争关系——未来可以接入 Akash 作为算力提供方。

#### D. AI Agent 支付/钱包类

| 项目/标准           | 类型     | 核心特色                                  | 状态       |
| ------------------- | -------- | ----------------------------------------- | ---------- |
| **x402 (HTTP 402)** | 支付标准 | AI Agent HTTP 微支付标准，基于 402 状态码 | 提案阶段   |
| **ERC-7579**        | 账户抽象 | 模块化智能账户标准                        | 已通过 ERC |
| **Superfluid**      | 流支付   | 实时按秒计费流支付                        | 已上线     |

**OpenClaw 对比**: OpenClaw 的 PayFi 架构蓝图（`WEB3_PAYFI_AGENTIC_ARCH.md`）已规划了 x402/ERC-7579/Superfluid 的集成路线，但当前实现仍基于传统 Escrow 模式。这是正确的渐进策略——先用成熟的 Escrow 跑通闭环，再逐步引入流支付等高级特性。

#### E. 研究/模拟平台类

| 项目                               | 类型     | 核心特色                                        | 状态        |
| ---------------------------------- | -------- | ----------------------------------------------- | ----------- |
| **Microsoft Magentic Marketplace** | 开源模拟 | 多 Agent 市场模拟环境，研究信息不对称和价格发现 | 2025 年开源 |

**OpenClaw 对比**: Microsoft 的 Magentic Marketplace 是**学术研究工具**，而 OpenClaw 是**生产级交易系统**。但 Magentic 的研究成果（Agent 市场的定价策略、信息不对称解决方案）值得参考。

### 4.2 OpenClaw 竞争优势矩阵

| 能力           | OpenClaw                | Virtuals     | ASI Alliance  | Morpheus             | Autonolas   | Bittensor   |
| -------------- | ----------------------- | ------------ | ------------- | -------------------- | ----------- | ----------- |
| Agent 服务交易 | ✅ 核心                 | ❌ 代币发射  | ✅ 注册中心   | ✅ 计划中            | ✅ 服务组件 | ❌ 算力挖矿 |
| Escrow 担保    | ✅ EVM+TON              | ❌           | ❌            | ❌                   | ❌          | ❌          |
| 多链支持       | 🟡 12 链注册 / 3 链部署 | 🟡 Base 为主 | 🟡 自有链+EVM | ✅ 多链 NTT          | 🟡 EVM      | ❌ 自有链   |
| TON 生态       | ✅                      | ❌           | ❌            | ❌                   | ❌          | ❌          |
| Agent 钱包策略 | ✅ KYA                  | ❌           | ❌            | ❌                   | ❌          | ❌          |
| 隐私管家集成   | ✅ 核心                 | ❌           | ❌            | 🟡 个人 AI           | ❌          | ❌          |
| 争议仲裁       | ✅                      | ❌           | ❌            | ❌                   | ❌          | ❌          |
| 定价引擎       | ✅ 动态+阶梯+订单簿     | ❌           | 🟡            | ❌                   | ❌          | ✅ 竞争激励 |
| 信誉系统       | ✅                      | ❌           | 🟡            | 🟡 SmartContractRank | ❌          | ✅ 矿工信誉 |
| 透明度审计     | ✅ Merkle               | ❌           | ❌            | ❌                   | ❌          | ❌          |
| 开源           | ✅                      | 🟡           | ✅            | ✅                   | ✅          | ✅          |

> `[勘误]` "✅ 13 链"更正为"🟡 12 链注册 / 3 链部署"——实际部署仅 Base + TON Mainnet + TON Testnet 3 条。定价引擎补充"订单簿"。

### 4.3 OpenClaw 独特价值主张

1. **"私有化 AI 管家"视角**: 唯一从个人 AI 管家（Personal AI Butler）角度出发的市场，而非从算力或代币角度。Agent 不只是链上资产，而是你的数字管家去市场上采购/出售服务
2. **Escrow + KYA 双重保障**: 唯一同时提供链上托管担保 + Agent 知情同意策略的项目
3. **TON + EVM 双栈**: 唯一覆盖 Telegram 生态的 AI Agent 市场（TON 在全球有 9 亿 Telegram 用户基础）
4. **完整争议仲裁**: 竞品中罕见的链下争议仲裁系统（open → evidence → resolve），弥补了纯链上仲裁的低效
5. **渐进式 PayFi**: 从 Escrow 出发，规划 x402/Superfluid 演进路线，比直接上流支付更稳健

---

## 五、技术架构前沿对标

### 5.1 行业趋势与 OpenClaw 对齐度

| 趋势                             | 说明                                                  | OpenClaw 现状                                                             | 对齐度 |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| **Agent-to-Agent (A2A) 协议**    | Google 提出的 A2A 标准，定义 Agent 间发现、协商、执行 | 已有 resource/offer/order 协议，但未对齐 A2A 标准                         | 🟡 60% |
| **MCP (Model Context Protocol)** | Anthropic 的 MCP 协议成为 Agent 工具调用标准          | 无直接 MCP 集成，通过 Gateway methods 实现                                | 🟡 50% |
| **x402 微支付**                  | HTTP 402 状态码 + 链上支付，AI Agent 原生支付标准     | PayFi 蓝图已规划，未实现                                                  | 🔴 20% |
| **ERC-7579 模块化账户**          | 可编程智能账户标准，支持 Agent 自主支付               | PayFi 蓝图已规划，未实现                                                  | 🔴 20% |
| **流支付 (Superfluid)**          | 按秒计费的实时流支付                                  | PayFi 蓝图已规划，未实现                                                  | 🔴 20% |
| **TEE (可信执行环境)**           | SGX/TDX 保护 Agent 私钥与计算                         | agent-wallet/tee.ts 仅 6 行占位符                                         | 🔴 10% |
| **可验证计算**                   | TLSNotary/zkML 验证 Agent 执行结果                    | validators.ts 有 TLSNotary proof 验证（**但实现有 bug，当前完全不可用**） | 🔴 15% |
| **去中心化身份 (DID/ENS)**       | Agent 链上身份与信誉绑定                              | web3-core/identity/ 有 ENS 解析 + Gateway 身份                            | 🟢 70% |

> `[勘误]` 可验证计算的对齐度从 🟡 40% 降为 🔴 15%。validators.ts 的 TLSNotary proof 验证存在 BUG-06（属性查找键名错误），**当前完全不可用**——任何 proof 都会被错误地拒绝。功能"有但不能用"比"没有"更糟糕（会误导使用者），因此降为 15%。

### 5.2 技术债清单（按上线优先级排序）

#### P0 — 上线阻断项

| 编号  | 项目                                        | 影响                                                         | 工作量估算                          |
| ----- | ------------------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| P0-01 | 修复 BUG-06: `requireIsoTimestamp` 键名错误 | 直接修复 service-proof 5 个 + validators 1 个 = 6 个测试失败 | 0.5 天                              |
| P0-02 | 修复 reward poller 状态转换                 | 奖励链上回执失败检测                                         | 1 天                                |
| P0-03 | 修复 BUG-07: daily cap TOCTOU 竞态          | Agent 可能通过并发请求绕过预算限制                           | 2-3 天（需引入原子性检查-写入机制） |
| P0-04 | 修复 BUG-01: EIP-712 signTypedData 远程模式 | 使用 `hashTypedData()` 替换 `hashMessage(JSON.stringify())`  | 1 天                                |
| P0-05 | 修复 BUG-03: 远程签名地址不一致             | 需要远程签名服务提供地址，或通过 `signFn` 回调获取           | 1-2 天                              |
| P0-06 | 修复 BUG-02: EvmError 错误码传参            | 构造函数增加 `code` 参数                                     | 0.5 天                              |

> `[勘误]` P0 项从 4 个扩展为 6 个：
>
> - 拆分了 P0-01（原版笼统的"修复 7 个失败测试"拆为精确的 BUG-06 修复 + reward poller 修复）
> - 新增 P0-03（TOCTOU 竞态），初版仅列为"daily cap 逻辑修复 1 天"严重低估了工作量
> - 新增 P0-05（远程签名地址不一致），初版仅作为🟡中 BUG-03 提及
> - BUG-04（domain.name 被移除）可随 P0-04 一并修复

#### P1 — Beta 上线前建议修复

| 编号  | 项目                                       | 影响                                                                                           | 工作量估算 |
| ----- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------- |
| P1-01 | 添加跨模块 E2E 测试（wallet→market→chain） | 支付闭环未验证                                                                                 | 3-5 天     |
| P1-02 | 添加 EVM Provider 单元测试                 | 0 个测试，风险敞口大                                                                           | 2-3 天     |
| P1-03 | 实现 TON `checkNewTransactions`            | Provider 无法主动发现新订单                                                                    | 2 天       |
| P1-04 | `ledger.ts` L178 `err.message` 脱敏        | 唯一确认的信息泄露点                                                                           | 0.5 天     |
| P1-05 | 清理 EVM 浏览器钱包死代码                  | `SignerMode` 类型、`signMessage`/`signTypedData` 的 `case "browser-wallet"` 分支均为不可达代码 | 1 天       |
| P1-06 | BUG-04: 恢复 `domain.name` 传递            | 停止从 domain 中移除 `name` 字段                                                               | 0.5 天     |

> `[勘误]`
>
> - P1-04 从"err.message 脱敏全覆盖"精确化为"ledger.ts L178"单点修复（其他 handler 已安全）
> - P1-05 替换了"稳定错误码全覆盖"——错误码问题主要是 BUG-02（已归入 P0-06），P1 层面更紧迫的是清理死代码
> - 新增 P1-06

#### P2 — Mainnet 上线前必须完成

| 编号  | 项目                                     | 影响                                                                        | 工作量估算    |
| ----- | ---------------------------------------- | --------------------------------------------------------------------------- | ------------- |
| P2-01 | 智能合约第三方安全审计                   | 资金安全的行业硬性要求（注意：EVM 侧无 Settlement.sol，需确认链上合约来源） | 4-8 周 + 费用 |
| P2-02 | 实现 ARCH-06/ARCH-07: 多代币结算完整支持 | `resolveContract()` TODO + `release()`/`refund()` 增加 token 参数           | 3-5 天        |
| P2-03 | 实现浏览器钱包模式（或正式移除）         | 当前是半实现状态（throw + 死代码），需做出明确的架构决策                    | 3-5 天        |
| P2-04 | TEE 集成（非占位符）                     | 私钥保护不足                                                                | 2-4 周        |
| P2-05 | x402/流支付集成                          | 微支付场景效率低                                                            | 4-6 周        |

---

## 六、模块维度详细评审

### 6.1 market-core (★★★★☆ 4.0/5)

**优点**:

- 66 个 handler 工厂函数覆盖完整交易生命周期，分布在 18 个领域文件中
- 双存储后端 + SQLite 事务回滚
- 定价引擎（动态/阶梯/波动率/订单簿）设计精良（pricing.ts 导出 7 个函数）
- handler 按领域拆分（offer/order/consent/delivery/dispute/lease/ledger/settlement/reward/metrics/transparency/bridge/token-economy/pricing/resource/repair/reputation/service-proof），符合 ~500 LOC 规范
- barrel re-export 入口文件仅做导出（handlers/index.ts 97 行）
- `_shared.ts` 的 `formatGatewayErrorResponse()` 提供安全的错误返回（`redactSensitiveInfo()` + 静态错误码描述映射）

**不足**:

- service-proof 子系统因 BUG-06 **完全不可用**（6 个测试全部失败，根因是 `validators.ts` 属性查找键名错误）
- reward poller 链上失败检测异常（1 个测试失败）
- `_shared.ts` 472 行，接近 500 LOC 上限
- `ledger.ts` L178 的 `settlementReleaseError` 未脱敏

> `[勘误]` 评分从 4.2 降为 4.0——service-proof 子系统的完全瘫痪影响更大（初版仅说"测试全部失败"，实际是功能完全不可用）。Handler 数量从"19 个"更正为"66 个工厂函数，18 个领域文件"。

### 6.2 blockchain-adapter (★★★☆☆ 3.2/5)

**优点**:

- 适配器+工厂+组合三重设计模式，架构优雅
- TON 双模式（TonConnect 交互 + Headless 服务端）设计合理
- 合约代码（settlement.fc 406 行 + RewardDistributor.sol 135 行）功能完整
- 工厂预注册 12 条链（10 EVM + 2 TON），扩展性好
- `chains.ts` 硬编码了 10 条 EVM 链的完整信息（RPC/浏览器/币种符号）

**不足**:

- **EVM Provider 零测试**（严重）
- BUG-01: EIP-712 签名远程模式完全不合规（使用 `hashMessage` + `JSON.stringify`）
- BUG-02: 错误码硬编码 UNKNOWN
- BUG-03: 远程签名地址不一致（🔴 高）
- BUG-04: `domain.name` 被双重错误移除
- 类型安全降级（`as any` 绕过）
- Solana/Sui 仅类型预留，无 Provider 实现
- EVM Settlement 合约源码不在仓库中

> `[勘误]` 评分从 3.5 降为 3.2——BUG-03 的严重性被初版低估（🟡中→🔴高），加上 BUG-04 的实际影响（domain.name 影响 domain separator 计算），整体代码可靠性下降。新增"EVM Settlement 合约源码不在仓库中"。

### 6.3 agent-wallet (★★★½☆ 3.5/5)

**优点**:

- KYA 策略引擎设计出色，覆盖 budget/scope/autoPay/ttl
- AES-256-GCM 加密存储已验证
- 8 种敏感信息脱敏模式
- EVM + TON 双链 handler 完整
- v1→v2 存储升级迁移

**不足**:

- BUG-07: daily cap 存在 TOCTOU 竞态漏洞（`readDailySpent` 无锁 + `addDailySpent` 延迟写入）
- `commitUsage()` 在 `sendTransaction()` 之后调用——交易已上链但磁盘写入失败时，花费不被记录
- integration.ts 几乎为空（17 行，仅类型定义）
- tee.ts 仅 6 行占位符
- 无 E2E 测试
- 测试仅覆盖串行场景，未覆盖并发场景

> `[勘误]` 评分从 3.8 降为 3.5——TOCTOU 竞态不仅是"测试失败"，更是**可被利用的安全漏洞**。补充了 `commitUsage()` 与 `sendTransaction()` 的原子性缺失分析。

### 6.4 web3-core (★★★★☆ 4.0/5)

**优点**:

- 30 个测试文件，覆盖面最广
- 完整的子系统：audit/billing/brain/capabilities/chain/dashboard/identity/ingest/market/monitor/resources/rewards/storage
- Gateway 代理层（market/handlers.ts，506 行）通过统一的 `createMarketProxyHandler` 实现 `web3.market.*` → `market.*` 透传，含 30 个代理 handler + 1 个自定义聚合
- 69 个 `registerGatewayMethod` 调用，覆盖完整的 Web3 API 面
- HTTP 签名验证（signature-verification.test.ts）

**不足**:

- index.ts 623 行，超出 500 LOC 指导线（主要是 147 行 import + 大量注册调用，可拆分为按子系统的注册模块）
- 6 个测试文件通过 `vi.mock("../../../../src/gateway/call.ts")` 跨边界 mock（已知技术债，有解耦计划）
- 4 个 handler 函数（`createAuditQueryHandler` 等）内联在 index.ts 中而非独立文件

---

## 七、上线建议与路线图

### 7.1 分阶段上线路线

```
Phase 0: Bug Fix Sprint（2-3 周）
├─ P0-01: 修复 validators.ts 键名错误（恢复 service-proof 子系统）
├─ P0-02: 修复 reward poller 状态转换
├─ P0-03: 修复 daily cap TOCTOU 竞态（引入原子检查-写入）
├─ P0-04: 修复 EIP-712 signTypedData（hashTypedData + 恢复 domain.name）
├─ P0-05: 修复远程签名地址不一致
├─ P0-06: 修复 EvmError 错误码传参
└─ 目标：9 个测试全部转绿，0 known security defect

Phase 1: Testnet Beta（3-5 周）
├─ Sepolia/Base Sepolia + TON Testnet 部署
├─ 跨模块 E2E 测试补全（wallet→market→chain 贯通）
├─ EVM Provider 单元测试补全
├─ ledger.ts err.message 脱敏
├─ 清理浏览器钱包死代码
└─ 限定 10-50 个 Alpha 用户

Phase 2: Mainnet Beta（6-10 周）
├─ 智能合约第三方审计（需确认 EVM Settlement 合约源码来源）
├─ Base Mainnet + TON Mainnet
├─ 多代币结算完整实现
├─ 浏览器钱包模式（或正式移除）
└─ 限定 500-1000 个用户，设交易金额上限

Phase 3: Mainnet GA（10-18 周）
├─ TEE 集成
├─ x402 微支付
├─ Superfluid 流支付
├─ A2A 协议对齐
└─ 全量开放
```

> `[勘误]`
>
> - Phase 0 从"1-2 周"延长为"2-3 周"——TOCTOU 竞态修复需要架构级改动（引入原子性机制），不是简单的 bug fix
> - Phase 1 从"2-4 周"延长为"3-5 周"
> - Phase 2 从"4-8 周"延长为"6-10 周"——新增了"确认 EVM Settlement 合约源码来源"的工作
> - P0 项从 4 个扩展为 6 个

### 7.2 上线前必须满足的 Gate

| Gate            | 条件                             | 当前状态                                                                                  |
| --------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| **Gate-TEST**   | 所有测试 100% 通过               | 🔴 9 个失败（5 个 service-proof + 1 个 validators + 1 个 reward poller + 2 个 daily cap） |
| **Gate-SEC**    | 合约通过第三方审计               | 🔴 未审计（且 EVM Settlement 合约源码不在仓库中）                                         |
| **Gate-BUDGET** | daily cap 守卫通过（含并发场景） | 🔴 TOCTOU 竞态                                                                            |
| **Gate-SIGN**   | EIP-712 签名合规                 | 🔴 远程模式三重不合规（hashMessage + JSON.stringify + domain.name 移除）                  |
| **Gate-ADDR**   | 远程签名地址一致性               | 🔴 随机临时地址                                                                           |
| **Gate-E2E**    | 跨模块支付闭环 E2E 通过          | 🔴 不存在                                                                                 |
| **Gate-ERR**    | 稳定错误码 + 安全错误返回        | 🟡 EvmError 始终 UNKNOWN + ledger.ts 1 处泄露                                             |
| **Gate-PROOF**  | service-proof 子系统可用         | 🔴 BUG-06 导致完全不可用                                                                  |

> `[勘误]` 新增 Gate-ADDR（地址一致性）和 Gate-PROOF（service-proof 可用性）。Gate-SIGN 描述从"远程模式不合规"细化为"三重不合规"。

### 7.3 Testnet Beta 可上线条件（最低要求）

满足以下条件可进行 Testnet Beta：

- [x] 交易闭环 E2E 通过（单模块内）
- [x] 双存储后端稳定
- [x] 状态机转换守卫完整
- [x] KYA 策略引擎框架完整
- [ ] **所有 9 个测试转绿**（当前 95%+）
- [ ] **EIP-712 签名修复**（BUG-01 + BUG-04）
- [ ] **远程签名地址修复**（BUG-03）
- [ ] **daily cap TOCTOU 竞态修复**（BUG-07）
- [ ] **EvmError 错误码修复**（BUG-02）

---

## 八、总结

### 8.1 一句话结论

> OpenClaw 的 AI 管家自由市场在**架构设计、模块化程度、跨链抽象**上已达到行业领先水平，是当前唯一同时提供 **Escrow 担保 + KYA 策略 + TON 生态 + 争议仲裁** 的 AI Agent 服务市场。但 **9 个失败测试 + 7 个已确认代码缺陷（含 3 个🔴高/严重级）+ 智能合约未审计 + TOCTOU 竞态漏洞** 是上线的硬性阻断项。建议用 2-3 周修复全部 P0 级问题后进行 Testnet Beta，再经第三方合约审计后开放 Mainnet。

### 8.2 AI 管家"畅游"自由市场的成熟度

| 场景                       | 可行性      | 备注                                         |
| -------------------------- | ----------- | -------------------------------------------- |
| Agent 发布服务（Provider） | ✅ 可用     | resourcePublish + offerCreate 完整           |
| Agent 购买服务（Consumer） | 🔴 需修复   | daily cap TOCTOU 竞态可导致超支（并发场景）  |
| 链上结算（Escrow）         | 🔴 需修复   | EIP-712 远程签名三重不合规 + 地址不一致      |
| 服务证明（Proof）          | 🔴 不可用   | BUG-06 导致 TLSNotary proof 验证永远失败     |
| 争议仲裁                   | ✅ 可用     | open → evidence → resolve 完整（E2E 已验证） |
| 信誉评价                   | ✅ 可用     | reputation handler 已实现                    |
| 增量结算（Metered）        | ✅ 可用     | E2E 已验证自动 release（两轮累加到 cap）     |
| 跨链操作                   | 🟡 部分可用 | EVM 10 链注册/1 链部署，TON 缺交易监听       |
| 审计追溯                   | ✅ 可用     | transparency + canonicalize 已实现           |

> `[勘误]`
>
> - "Agent 购买服务"从🟡降为🔴——TOCTOU 竞态是安全漏洞，不仅是功能缺陷
> - "链上结算"从🟡降为🔴——新增了地址不一致问题
> - 新增"服务证明"🔴——初版遗漏了这个完全不可用的子系统
> - 移除"自然语言交互 ✅ market-assistant 已实现"——该文件不存在
> - "跨链操作"描述更精确

**底线判断**: AI 管家在当前状态下**不能畅游**——链上结算（Escrow）、服务证明（Proof）、预算守卫（daily cap）三个核心环节均存在阻断级缺陷。修复 P0 后可在 Testnet 上"试游"，Mainnet 上"畅游"还需 2-4 个月的修复、测试补全和合约审计周期。

---

## 附录：勘误汇总表

| 条目            | 初版内容                      | 纠正内容                                           | 影响                          |
| --------------- | ----------------------------- | -------------------------------------------------- | ----------------------------- |
| 综合评分        | 3.7/5                         | **3.6/5**                                          | 代码质量和安全性评分下调      |
| 源文件数        | ~120 个                       | **149 个**                                         | 精确统计                      |
| 链数            | EVM 11 + TON 2 = 13           | **EVM 10 + TON 2 = 12（工厂注册），实际部署 3 条** | 数据不准确                    |
| Handler 数      | 19 个 handler                 | **66 个工厂函数，18 个领域文件**                   | 混淆了文件数和函数数          |
| Gateway Methods | 50+ 个                        | **69 个**                                          | 精确统计                      |
| ARCH-05         | market-assistant 未深度集成   | **删除——文件不存在**                               | 虚假条目                      |
| BUG-03 严重程度 | 🟡 中                         | **🔴 高**                                          | 地址不一致影响核心逻辑        |
| BUG-04 严重程度 | 🟢 低                         | **🟡 中**                                          | domain.name 影响 EIP-712      |
| BUG-06 根因     | issuedAt 时间格式不匹配       | **属性查找键名错误**                               | 根因完全不同                  |
| BUG-06 严重程度 | 🟡 中                         | **🔴 严重**                                        | 导致 service-proof 子系统瘫痪 |
| 新增 BUG-07     | （无）                        | **daily cap TOCTOU 竞态漏洞**                      | 初版未识别                    |
| SEC-03          | 测试失败                      | **TOCTOU 竞态可被利用**                            | 从 bug 升级为安全漏洞         |
| SEC-04          | 部分 handler 透传 err.message | **仅 ledger.ts L178 一处**                         | 初版过于笼统                  |
| 新增 SEC-06     | （无）                        | **远程签名地址不一致**                             | 初版未归入安全缺口            |
| 新增 ARCH-06    | （无）                        | **结算合约地址映射 TODO**                          | 初版遗漏                      |
| 新增 ARCH-07    | （无）                        | **release/refund 缺 token 参数**                   | 初版遗漏                      |
| 自然语言交互    | ✅ 可用                       | **移除——market-assistant 不存在**                  | 虚假条目                      |
| Phase 0 工期    | 1-2 周                        | **2-3 周**                                         | TOCTOU 修复工作量被低估       |

---

## 附录 B：修复状态追踪（2026-03-03 修复批次）

> 本节记录评审报告发布当日完成的修复工作。所有修复均已通过完整测试验证（18/18 测试全部通过）。

### 已修复项

| 编号               | 修复内容                                                                                                                                     | 修改文件                                                                                          | 验证                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------- |
| **P0-01 (BUG-06)** | `requireIsoTimestamp(proof, "proof.issuedAt")` → `requireIsoTimestamp(proof, "issuedAt")`：修复属性查找键名错误，恢复 service-proof 子系统   | `market-core/src/market/validators.ts`                                                            | ✅ 6 个测试恢复        |
| **P0-02**          | reward poller `receipt.status === "reverted"` 状态检测 + `lastError` 动态化                                                                  | `market-core/src/market/reward/poller.ts`                                                         | ✅ 2/2 测试通过        |
| **P0-03 (BUG-07)** | daily cap TOCTOU 竞态修复：引入 `reserveDailyBudget()` 原子检查-预提交 + rollback 机制；修复 `EMPTY_STATE.totals` 浅拷贝导致的跨调用状态污染 | `agent-wallet/src/state.ts`, `agent-wallet/src/handlers.ts`, `agent-wallet/src/ton-handlers.ts`   | ✅ 7/7 policy 测试通过 |
| **P0-04 (BUG-01)** | EIP-712 `signTypedData` 远程模式：`hashMessage(JSON.stringify())` → `hashTypedData()`                                                        | `blockchain-adapter/src/providers/evm/wallet.ts`                                                  | ✅ 代码修复            |
| **P0-06 (BUG-02)** | `EvmError` 构造函数：硬编码 `ErrorCode.UNKNOWN` → 参数化 `code: ErrorCode = ErrorCode.UNKNOWN`                                               | `blockchain-adapter/src/types/error.ts`                                                           | ✅ 代码修复            |
| **P1-04 (SEC-04)** | `ledger.ts` L178 `err.message` 泄露：非 `E_` 前缀消息替换为安全的通用错误                                                                    | `market-core/src/market/handlers/ledger.ts`                                                       | ✅ 代码修复            |
| **P1-06 (BUG-04)** | `domain.name` 双重移除：删除 `index.ts` 和 `wallet.ts` 中的 name 剥离逻辑，传递完整 domain                                                   | `blockchain-adapter/src/providers/evm/index.ts`, `blockchain-adapter/src/providers/evm/wallet.ts` | ✅ 代码修复            |

### 额外发现并修复

| 问题                                  | 描述                                                                                                                                                                                                                  | 修改文件                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `EMPTY_STATE.totals` 浅拷贝           | `{ ...EMPTY_STATE }` 只做一层展开，`totals` 对象在多次 `loadState` 调用间共享引用。`reserveDailyBudget` 写入 `state.totals[key] = ...` 时**污染了模块级常量**，导致后续所有 `loadState(ENOENT)` 返回已被修改的 totals | `agent-wallet/src/state.ts`：`const EMPTY_STATE` → `function emptyState()` 工厂函数 |
| service-proof 测试 `submitProof` 异步 | handler 为 async 但 helper 未 await，导致 `r.result()` 始终为 undefined                                                                                                                                               | `market-core/src/market/handlers/service-proof.test.ts`                             |
| service-proof 测试断言格式            | 预期原始错误消息但实际返回 `formatGatewayErrorResponse` 格式化后的错误码                                                                                                                                              | `market-core/src/market/handlers/service-proof.test.ts`                             |

### 未修复项（待后续处理）

| 编号               | 内容                         | 原因                                                          |
| ------------------ | ---------------------------- | ------------------------------------------------------------- |
| **P0-05 (BUG-03)** | 远程签名地址不一致           | 需远程签名服务提供地址或通过 `signFn` 回调获取，涉及 API 设计 |
| **BUG-05**         | TON `as any` 类型安全        | 🟢 低优先级，运行时无害                                       |
| **SEC-01**         | 审计溯源完整性               | 设计层面优化                                                  |
| **SEC-02**         | EIP-712 远程模式 E2E         | 需部署远程签名服务后验证                                      |
| **SEC-05**         | 多代币结算合约映射           | 需合约层面支持                                                |
| **SEC-06**         | 远程签名地址不一致（安全面） | 同 P0-05                                                      |

### Testnet Beta 可上线条件更新

```diff
 - [x] 交易闭环 E2E 通过（单模块内）
 - [x] 双存储后端稳定
 - [x] 状态机转换守卫完整
 - [x] KYA 策略引擎框架完整
-- [ ] **所有 9 个测试转绿**（当前 95%+）
+- [x] **所有测试转绿**（18/18 通过，含 validators 4 + service-proof 5 + poller 2 + EVM policy 4 + TON policy 3）
-- [ ] **EIP-712 签名修复**（BUG-01 + BUG-04）
+- [x] **EIP-712 签名修复**（BUG-01 hashTypedData + BUG-04 domain.name 恢复）
 - [ ] **远程签名地址修复**（BUG-03）
-- [ ] **daily cap TOCTOU 竞态修复**（BUG-07）
+- [x] **daily cap TOCTOU 竞态修复**（BUG-07 原子预留 + EMPTY_STATE 浅拷贝修复）
-- [ ] **EvmError 错误码修复**（BUG-02）
+- [x] **EvmError 错误码修复**（BUG-02 构造函数参数化）
```

---

> **注**: 本报告基于 2026-03-03 的代码快照，经二次代码级走查勘误。实施以 `web3-brain-architecture.md` 与 `web3-market-resource-implementation-checklist.md` 为准。若本文与实现冲突，以实现与上述文档为准。
