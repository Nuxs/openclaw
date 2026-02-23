# AI Agent Wallet 实施规划

> **文档目标**：为 OpenClaw Web3 架构补充「AI 经济身份」核心能力，使 AI 管家具备独立的经济主体地位。
>
> **核心理念**：AI 即人，应拥有自己的钱包。
>
> **参考案例**：Virtuals Protocol 的 Agent Wallet 模式。

---

## 一、现状评估

> **实现状态（对齐）**：主仓已存在 `extensions/agent-wallet`（独立插件原型），但尚未通过 `web3.wallet.*` 聚合入口对外稳定暴露，也未纳入 `web3.capabilities.*` catalog；本文同时覆盖“已落地事实”与后续 Phase 0/1 规划（以实际 PR 为准）。
>
> 补充：TON headless（助记词派生/地址生成/发送）与结算合约部署 + BOC/payload 验收指南见 `docs/web3/TON_E2E_SETTLEMENT.md`。

### 1.1 现有架构盘点

| 模块                   | 定位          | 现状                                                        | 评价                                                       |
| ---------------------- | ------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| **market-core**        | 唯一结算引擎  | Offer/Order/Settlement/Consent/Delivery/Lease/Ledger 全链路 | ✅ 工业级                                                  |
| **web3-core**          | 对外 API 网关 | `web3.market.*` → `market.*` 代理                           | ✅ 完整                                                    |
| **blockchain-adapter** | 底层链交互    | EVM/TON Provider，签名 + 广播                               | ⚠️ 已被复用（EVM escrow/agent-wallet），但主线入口仍未收敛 |
| **用户钱包**           | 用户资产      | 用户通过 SIWE 绑定自己的地址                                | ✅ 成熟                                                    |

### 1.2 架构断点

```
用户: /bind_wallet → SIWE 验证 → 绑定地址
       ↓
AI: "帮我买 ETH" → 用用户的地址签名 → 链上交易
       ↓
问题：AI 没有自己的经济身份，无法自主交易
```

### 1.3 对标分析

| 产品                  | AI 经济身份 | 结算层 | 私钥方案 |
| --------------------- | ----------- | ------ | -------- |
| **Virtuals Protocol** | ✅ 独立钱包 | 链上   | TEE/MPC  |
| **ElizaOS (ai16z)**   | ✅ 独立钱包 | 链上   | TEE      |
| **Bittensor**         | ✅ 子网账户 | 链上   | PoW      |
| **OpenClaw 现状**     | ❌ 无       | 链下   | 用户绑定 |

---

## 二、乔布斯方案：AI Agent Wallet

### 2.1 核心理念

> **"AI 就是人，它应该有自己的钱包和银行账户"**

- AI 可以用自己的钱买资源
- AI 可以出租自己的能力赚钱
- 形成 AI 经济循环

### 2.2 设计原则

| 原则     | 描述                                                           |
| -------- | -------------------------------------------------------------- |
| **简单** | 不做 MPC 复杂度，优先 TEE                                      |
| **渐进** | 先本地文件，再 TEE                                             |
| **复用** | 复用现有 blockchain-adapter 执行层                             |
| **对齐** | agent-wallet 签名 → market-core 结算 → blockchain-adapter 广播 |

---

## 三、架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI Agent                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  Agent Wallet (虚拟)                       │  │
│  │  - 地址生成 (BIP-44)                                       │  │
│  │  - 私钥托管 (TEE/加密文件)                                │  │
│  │  - 余额查询 + 签名                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         market-core                              │
│  (唯一结算引擎：Offer → Order → Settlement → 交付 → 账本)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    blockchain-adapter                           │
│  (纯"手"：签名 + 广播，不承载业务逻辑)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          链上                                    │
│                    (EVM / TON / 更多)                           │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 调用链路

```
场景：AI 主动购买资源

1. AI: "帮我买 100 美元 ETH"
       ↓
2. agent-wallet: 检查余额 → 签名(order)
       ↓
3. market-core: 创建订单 + 计算价格 + 锁定托管
       ↓
4. blockchain-adapter: 广播交易到链上
       ↓
5. 链上确认 → market-core 更新状态 → AI 收到通知
```

### 3.3 模块职责

| 模块                   | 职责                        | 边界         |
| ---------------------- | --------------------------- | ------------ |
| **agent-wallet**       | AI 钱包生成、私钥存储、签名 | 不做结算     |
| **market-core**        | 订单、托管、结算、交付      | 不做链上广播 |
| **blockchain-adapter** | 签名、广播、余额查询        | 纯执行层     |

---

## 四、实施规划

### 4.1 阶段 0：打通结算层（1 周）

**目标**：让 market-core 的 settlement 能调用 blockchain-adapter 广播

**现状**：

- `market-core` 有 Settlement 状态机
- `blockchain-adapter` 有签名 + 广播能力
- **两者已连接（EVM escrow 合约调用已通过 `@openclaw/blockchain-adapter` 广播交易）**；但 signer 仍来自 `market-core` 的 `chain.privateKey`（非 agent-wallet），且尚未形成 `web3.*` 统一入口

**行动**：

| 序号 | 任务                                                                                     | 文件                                                        |
| ---- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 序号 | 任务（对齐现状后）                                                                       | 文件                                                        |
| ---- | --------------------------------------------------------------------------------         | ----------------------------------------------------------- |
| 1    | 确认 `market-core` 已通过 `blockchain-adapter` 走通 EVM escrow 交易广播（事实对齐）      | `extensions/market-core/src/market/escrow.ts`               |
| 2    | 确认 `settlement.mode=contract` 旧配置兼容性与错误脱敏（Gate-SEC-01 / Gate-ERR-01）      | `extensions/market-core/src/market/handlers/settlement.ts`  |
| 3    | 明确并文档化 signer 来源与安全边界（目前为 `chain.privateKey`，后续再切到 agent-wallet） | `extensions/market-core/src/config.ts`                      |

**验收标准**：

- `market.settlement.lock` 可触发链上交易
- 交易 hash 写入 settlement 记录
- 旧配置仍可运行（`settlement.mode=contract` 行为不变，signer 来源需在配置/文档中明确）

### 4.2 阶段 1：Agent Wallet 原型（2 周）

**目标**：AI 有自己的钱包，可生成地址和签名

**目录结构**：

```
extensions/agent-wallet/
├── src/
│   ├── index.ts           # 插件入口
│   ├── wallet.ts          # 钱包生成 + 签名
│   ├── tee.ts             # TEE 集成（待实现）
│   ├── store.ts           # 密钥存储
│   └── integration.ts     # 与 market-core 对接
├── package.json
└── README.md            # （可选）当前主仓未提供，后续可补插件级说明文档
```

**核心接口**：

```typescript
// agent-wallet 暴露的 Gateway Methods
export interface AgentWalletAPI {
  // 生成新钱包（首次启动时调用）
  "agent-wallet.create": () => Promise<{
    address: string;
    publicKey: string;
  }>;

  // 获取余额
  "agent-wallet.balance": (params: { address: string }) => Promise<{
    balance: string;
    symbol: string;
  }>;

  // 签名消息
  "agent-wallet.sign": (params: { message: string }) => Promise<{
    signature: string;
  }>;

  // 签名并广播交易
  "agent-wallet.send": (params: { to: string; value: string; data?: string }) => Promise<{
    txHash: string;
  }>;
}
```

**实现要点**：

| 功能     | 实现方式                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| 私钥生成 | `generatePrivateKey()` 为默认；可选 `generateMnemonic`，但不得用短口令直接当 key                                |
| 私钥存储 | AES-256-GCM 加密文件，包含 `version/alg/kdf/nonce/salt/ciphertext`；密钥需 32 bytes（base64/hex），不得写入日志 |
| 签名     | 调用 blockchain-adapter 的 EVM Provider                                                                         |
| 充值     | 用户向 AI 钱包地址充值（先支持）                                                                                |

**入口与能力对齐（建议）**：

- UI/面板优先走 `web3.wallet.*` 代理入口，避免直接依赖 `agent-wallet.*`
- `web3.capabilities.*` 中把 `web3.wallet.*` 标为 Experimental，并注明前置条件（启用 agent-wallet 插件）

**安全与运维约束**：

- 任何错误/状态/工具输出不得泄露私钥、密钥、真实路径或 endpoint
- 失败应返回稳定错误码（参考 `docs/reference/web3-resource-market-api.md`）

### 4.3 阶段 2：AI 经济闭环（2 周）

**目标**：AI 可以买卖资源，形成经济循环

**场景 1：AI 主动购买**

```
用户： "AI，帮我买 10 美元的计算资源"

AI 决策链：
1. agent-wallet.balance → 检查余额
2. market-core.offer.list → 发现资源
3. market-core.order.create → 创建订单
4. agent-wallet.sign(order) → AI 自己的钱包签名
5. blockchain-adapter.broadcast → 链上确认
6. market-core.settlement.lock → 托管锁定
7. 交付完成 → settlement.release → 结算
```

**场景 2：AI 出租能力**

```
用户： "谁想用我的 GPU？"

AI 决策链：
1. market-core.resource.publish → 发布资源
2. 其他用户租用 → market-core.lease.issue
3. 结算 → agent-wallet 收到付款
4. AI 余额增加
```

**新增 Gateway Methods**：

```typescript
// agent-wallet 与 market-core 集成
export interface AgentWalletMarketAPI {
  // AI 用自己的钱包创建订单
  "agent-wallet.order.create": (params: { offerId: string; amount: string }) => Promise<{
    orderId: string;
    txHash: string;
  }>;

  // AI 用自己的钱包支付
  "agent-wallet.order.pay": (params: { orderId: string }) => Promise<{
    txHash: string;
  }>;

  // 查询 AI 钱包的收入
  "agent-wallet.earnings": (params: { since?: string; until?: string }) => Promise<{
    total: string;
    transactions: Array<{
      type: "receive" | "send";
      amount: string;
      txHash: string;
      timestamp: string;
    }>;
  }>;
}
```

### 4.4 阶段 3：TEE 私钥保护（2 周）

**目标**：生产级私钥安全

**方案选择**：

| 方案            | 复杂度 | 安全等级 | 参考     |
| --------------- | ------ | -------- | -------- |
| 加密文件        | 低     | 中       | 现有实现 |
| TEE (Intel SGX) | 中     | 高       | ElizaOS  |
| HSM             | 高     | 极高     | 企业级   |

**推荐路径**：

1. Phase 1-2：加密文件（可用）
2. Phase 3：TEE 升级（参考 ElizaOS 实现）

**TEE 集成设计**：

```typescript
// extensions/agent-wallet/src/tee.ts

export interface TEEInterface {
  // 在 TEE 内生成密钥对
  generateKey(): Promise<{ publicKey: string }>;

  // 在 TEE 内签名（私钥永不出 TEE）
  sign(message: string): Promise<{ signature: string }>;

  // 验证 TEE 运行时状态
  verifyAttestation(): Promise<{ valid: boolean; quote: string }>;
}
```

---

## 五、关键设计决策

### 5.1 私钥放哪？

| 方案     | 乔布斯式答案          |
| -------- | --------------------- |
| 明文文件 | ❌ 不安全             |
| 密码加密 | ⚠️ 需要用户输入       |
| **TEE**  | ✅ 推荐，参考 ElizaOS |
| MPC      | ❌ 复杂度太高         |

### 5.2 结算模式选择

| 模式          | 描述                                | 现状    |
| ------------- | ----------------------------------- | ------- |
| `contract`    | 链上合约托管（lock/release/refund） | ✅ 已有 |
| `anchor_only` | 仅链上锚定哈希，不转移资金          | ✅ 已有 |

> **修正**：原"链下结算"表述不准确。现有两种模式均为链上，区别在于是否实际转移资金。

### 5.3 blockchain-adapter 角色？

| 现状                           | 目标                                       |
| ------------------------------ | ------------------------------------------ |
| 功能完整，但游离于市场流程之外 | **纯执行层**：AI 的"手"，只负责签名 + 广播 |

### 5.4 多链支持？

| 优先级 | 链          | 理由           |
| ------ | ----------- | -------------- |
| P0     | ETH/Base    | 主网生态       |
| P1     | TON         | 文档已支持双栈 |
| P2     | 更多 EVM L2 | 按需扩展       |

---

## 六、文件清单

### 6.1 新增文件

```
extensions/agent-wallet/
├── src/
│   ├── index.ts                          # 插件入口（NEW）
│   ├── wallet.ts                         # 钱包生成 + 签名（NEW）
│   ├── tee.ts                            # TEE 集成（NEW）
│   ├── store.ts                          # 密钥存储（NEW）
│   └── integration.ts                    # 与 market-core 对接（NEW）
├── package.json                          #（NEW）
└── README.md                             #（NEW）
```

### 6.2 修改文件

```
extensions/market-core/
├── src/
│   └── market/
│       └── handlers/
│           └── settlements.ts            # MODIFY：接入 blockchain-adapter

extensions/web3-core/
└── src/
    └── index.ts                          # MODIFY：注册 agent-wallet gateway methods
```

### 6.3 无需修改

| 模块                 | 原因                             |
| -------------------- | -------------------------------- |
| blockchain-adapter   | 已是纯执行层，无需大改           |
| market-core 其他模块 | 现有 Settlement/Order 逻辑可复用 |

---

## 七、验收标准

### 7.1 阶段 0 验收

- [ ] market-core settlement 可触发链上交易
- [ ] 交易 hash 正确写入记录

### 7.2 阶段 1 验收

- [ ] 首次启动自动生成 AI 钱包地址
- [ ] 可查询余额
- [ ] 可签名消息
- [ ] 可发送交易

### 7.3 阶段 2 验收

- [ ] AI 可用自己钱包创建订单
- [ ] AI 可接收资源付款
- [ ] 完整交易链路可跑通

### 7.4 阶段 3 验收

- [ ] 私钥存储在 TEE 内
- [ ] 签名在 TEE 内完成，私钥永不出

---

## 八、风险与治理

| 风险       | 处理                                  |
| ---------- | ------------------------------------- |
| 私钥泄露   | TEE 保护；生产环境不用明文存储        |
| 结算失败   | 复用现有 pendingSettlements 重试机制  |
| 链上拥堵   | 可选 `anchor_only` 模式（仅锚定哈希） |
| 多链复杂性 | 先 ETH/Base；TON 已支持；其他按需     |

---

## 九、相关文档

- [web3-brain-architecture.md](./web3-brain-architecture.md) — Web3 主脑架构
- [web3-market-plan-overview.md](./web3-market-plan-overview.md) — 市场规划概览
- [docs/plugins/web3-core.md](../../../docs/plugins/web3-core.md) — Web3 Core 插件文档
- [docs/plugins/market-core.md](../../../docs/plugins/market-core.md) — Market Core 插件文档

---

## 十、乔布斯式执行摘要

> **一句话**：AI 就是人，给它一个钱包。

**三个步骤**：

1. **连通**：market-core → blockchain-adapter 广播
2. **钱包**：Agent Wallet 原型（加密文件起步）
3. **闭环**：AI 自主买卖资源

**时间线**：

- Phase 0: 1 周（最小可验证）
- Phase 1: 2 周（钱包可用）
- Phase 2: 2 周（经济闭环）
- Phase 3: 2 周（TEE 安全）

**总计**：7 周可落地生产级能力
