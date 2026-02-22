# Blockchain Adapter Extension

> **目标**: 为OpenClaw去中心化算力市场提供多链支持，首发TON，预留扩展其他公链和自发代币接口

**版本**: v1.0  
**更新日期**: 2026-02-21  
**状态**: Phase 1 开发中 🚧

---

## 📋 概述

这个扩展模块实现了区块链适配器模式，支持：

1. ✅ **TON区块链集成** (首发)
2. 🔌 **多链扩展接口** (Solana, Sui, Base 等)
3. 🪙 **自发代币支持** (OpenClaw Token - $OCT)
4. 🔄 **统一抽象层** (无缝切换不同链)

---

## 📍 在 Web3 主线中的位置（统一口径）

### 定位

`blockchain-adapter` 的定位是 **“链交互适配器层”**：向上为 `web3-core` / `market-core` 提供统一的链交互接口（身份签名、资产转账、合约调用、结算锁定/释放/退款、事件订阅），向下对接具体公链实现（TON 首发，预留 Base/EVM 等）。

### 与现有 Web3 主线的关系

- **现有主线（已实现）**：`web3-core` + `market-core` 关键路径以 **EVM** 为主（SIWE 身份、EVM audit anchoring、可选 Escrow 合约结算等）。
- **本扩展（当前阶段）**：主要作为 **TON-first 多链能力的独立扩展与设计实现**，用于承接后续“TON+EVM 双栈并行”时的 TON 侧支付/回执/结算能力。

> 重要说明：当前仓库主线能力并不依赖 `blockchain-adapter` 才能运行 Web3 Market；双栈纳入以统一口径为先，再逐步把链能力接入到主线编排与结算策略中。

### 双栈纳入方式（建议）

双栈统一口径见：

- `docs/WEB3_DUAL_STACK_STRATEGY.md`
- `docs/reference/web3-dual-stack-payments-and-settlement.md`

纳入原则：**支付双入口、结算单出口**；链上仅最小披露（hash/承诺/汇总/回执），并保持 endpoint/token 零泄露。

### 安全硬约束（必须遵守）

- endpoint/token/真实路径不得出现在：文档示例、日志、错误消息、状态输出、工具返回。
- 明文 token（如 `accessToken`）只允许在“签发瞬间”出现一次；后续仅存 hash（如 `sha256:...`）。
- 链上动作只允许出现最小披露信息，不得把连接信息或调用明细上链。

## 🏗️ 架构设计

### 核心设计原则

```
┌─────────────────────────────────────────────────────┐
│             OpenClaw Core (业务层)                   │
│  market-core │ web3-core │ node-agent │ settlement  │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│         Blockchain Adapter (适配器层)                │
│  ┌─────────────────────────────────────────────┐    │
│  │   IBlockchainProvider (统一接口)            │    │
│  └─────────────────────────────────────────────┘    │
│         │          │          │          │          │
│         ▼          ▼          ▼          ▼          │
│     ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐         │
│     │ TON │   │Sol  │   │ Sui │   │Base │         │
│     └─────┘   └─────┘   └─────┘   └─────┘         │
└─────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│           区块链网络 (基础设施层)                     │
│  TON Network │ Solana │ Sui │ Base │ ...           │
└─────────────────────────────────────────────────────┘
```

### 接口抽象 (`IBlockchainProvider`)

所有区块链适配器必须实现这个统一接口：

```typescript
interface IBlockchainProvider {
  // 基础信息
  readonly chainId: string;
  readonly chainName: string;
  readonly nativeToken: TokenInfo;

  // 身份认证
  connect(config: ConnectionConfig): Promise<Wallet>;
  disconnect(): Promise<void>;
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<string>;

  // 代币操作
  getBalance(address: string, tokenAddress?: string): Promise<bigint>;
  transfer(to: string, amount: bigint, tokenAddress?: string): Promise<TxHash>;

  // 智能合约交互
  deployContract(bytecode: string, args: any[]): Promise<ContractAddress>;
  callContract(address: string, method: string, args: any[]): Promise<any>;
  estimateGas(tx: Transaction): Promise<bigint>;

  // 结算相关
  lockSettlement(orderId: string, amount: bigint): Promise<TxHash>;
  releaseSettlement(orderId: string, proof: Proof): Promise<TxHash>;
  refundSettlement(orderId: string): Promise<TxHash>;

  // 事件监听
  subscribeEvents(contract: string, eventName: string, callback: EventCallback): Unsubscribe;

  // 工具方法
  waitForTransaction(txHash: string): Promise<TxReceipt>;
  getBlockNumber(): Promise<number>;
  getTransactionReceipt(txHash: string): Promise<TxReceipt | null>;
}
```

---

## 🚀 Phase 1: TON集成 (当前)

### 为什么选择TON优先？

根据之前的公链调研报告：

| 优势                | 说明                   |
| ------------------- | ---------------------- |
| ✅ **Telegram生态** | 9亿+用户，天然获客渠道 |
| ✅ **高性能**       | 处理速度快，Gas费低    |
| ✅ **Mini App**     | 无缝集成Telegram       |
| ✅ **开发成熟度**   | 工具链完善，社区活跃   |

### TON适配器实现

#### 文件结构

```
extensions/blockchain-adapter/
├── src/
│   ├── types/
│   │   ├── provider.ts          # IBlockchainProvider接口定义
│   │   ├── transaction.ts       # 交易类型
│   │   └── events.ts            # 事件类型
│   ├── providers/
│   │   ├── ton/
│   │   │   ├── index.ts         # TON Provider入口
│   │   │   ├── client.ts        # TON SDK封装
│   │   │   ├── wallet.ts        # 钱包连接 (TonConnect)
│   │   │   ├── contracts/       # 智能合约封装
│   │   │   │   ├── settlement.ts
│   │   │   │   ├── marketplace.ts
│   │   │   │   └── token.ts
│   │   │   └── utils.ts
│   │   ├── solana/              # 预留Solana
│   │   │   └── index.ts
│   │   ├── sui/                 # 预留Sui
│   │   │   └── index.ts
│   │   └── base/                # 预留Base (EVM兼容)
│   │       └── index.ts
│   ├── factory.ts               # Provider工厂
│   ├── config.ts                # 配置管理
│   └── index.ts                 # 统一导出
├── contracts/                   # 智能合约源码
│   ├── ton/
│   │   ├── settlement.fc        # 结算合约 (FunC)
│   │   ├── marketplace.fc       # 市场合约
│   │   └── token.fc             # 代币合约 (Jetton标准)
│   ├── solidity/                # EVM链合约 (Base等)
│   │   └── Settlement.sol
│   └── move/                    # Move链合约 (Sui)
│       └── Settlement.move
├── test/
│   ├── ton.test.ts
│   └── integration.test.ts
├── package.json
└── tsconfig.json
```

#### 核心依赖

```json
{
  "dependencies": {
    "@ton/ton": "^13.11.0",
    "@ton/core": "^0.56.0",
    "@ton/crypto": "^3.2.0",
    "@tonconnect/sdk": "^3.0.0",
    "viem": "^2.0.0", // EVM链 (预留)
    "@solana/web3.js": "^1.87.0", // Solana (预留)
    "@mysten/sui.js": "^0.50.0" // Sui (预留)
  }
}
```

---

## 💰 自发代币设计 ($OCT Token)

### OpenClaw Token ($OCT) 规格

基于TON的Jetton标准发行：

| 属性         | 值                      |
| ------------ | ----------------------- |
| **代币名称** | OpenClaw Token          |
| **代币符号** | $OCT                    |
| **总供应量** | 10亿枚                  |
| **标准**     | TON Jetton (类似ERC-20) |
| **销毁机制** | 每笔交易销毁0.1%        |
| **治理功能** | DAO投票权重             |

### 代币分配方案

```
总量: 1,000,000,000 OCT

├─ 40% (400M) → 社区激励
│   ├─ 算力节点奖励: 200M
│   ├─ 用户空投: 100M
│   └─ 生态基金: 100M
│
├─ 20% (200M) → 团队 (4年线性解锁)
│
├─ 15% (150M) → 早期投资人 (2年线性解锁)
│
├─ 15% (150M) → 基金会储备
│
└─ 10% (100M) → 流动性池 (DEX做市)
```

### 代币功能

#### 1. 支付功能

```typescript
// 用户可以用$OCT支付算力服务
await provider.transfer(
  nodeAddress,
  parseUnits("10", 9), // 10 OCT
  OCT_TOKEN_ADDRESS,
);
```

#### 2. 质押功能

```typescript
// 节点质押$OCT提升信誉
await provider.callContract(
  STAKING_CONTRACT,
  "stake",
  [parseUnits("1000", 9)], // 质押1000 OCT
);
```

#### 3. 治理功能

```typescript
// $OCT持有者投票决定协议参数
await provider.callContract(GOVERNANCE_CONTRACT, "vote", [proposalId, VoteOption.YES, votingPower]);
```

---

## 🔌 多链扩展接口

### 扩展新公链的步骤

#### Step 1: 实现Provider接口

```typescript
// extensions/blockchain-adapter/src/providers/solana/index.ts

import { IBlockchainProvider } from "../../types/provider";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";

export class SolanaProvider implements IBlockchainProvider {
  readonly chainId = "solana-mainnet";
  readonly chainName = "Solana";
  readonly nativeToken = {
    symbol: "SOL",
    decimals: 9,
    name: "Solana",
  };

  private connection: Connection;
  private wallet?: Keypair;

  async connect(config: ConnectionConfig): Promise<Wallet> {
    this.connection = new Connection(config.rpcUrl);
    // ... 实现Phantom钱包连接
    return { address: this.wallet.publicKey.toBase58() };
  }

  async getBalance(address: string, tokenAddress?: string): Promise<bigint> {
    const pubkey = new PublicKey(address);
    if (tokenAddress) {
      // SPL Token余额
      // ...
    } else {
      // SOL余额
      const balance = await this.connection.getBalance(pubkey);
      return BigInt(balance);
    }
  }

  async lockSettlement(orderId: string, amount: bigint): Promise<TxHash> {
    // 调用Solana上的结算合约
    // ...
  }

  // ... 实现其他接口方法
}
```

#### Step 2: 注册到工厂

```typescript
// extensions/blockchain-adapter/src/factory.ts

import { TONProvider } from "./providers/ton";
import { SolanaProvider } from "./providers/solana";
import { SuiProvider } from "./providers/sui";

export class BlockchainFactory {
  private static providers = new Map<string, IBlockchainProvider>();

  static register(chainId: string, provider: IBlockchainProvider) {
    this.providers.set(chainId, provider);
  }

  static getProvider(chainId: string): IBlockchainProvider {
    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new Error(`Provider for chain ${chainId} not found`);
    }
    return provider;
  }

  static init() {
    // 注册已实现的Provider
    this.register("ton-mainnet", new TONProvider());
    this.register("ton-testnet", new TONProvider({ testnet: true }));
    this.register("solana-mainnet", new SolanaProvider());
    this.register("sui-mainnet", new SuiProvider());
    // ... 更多链
  }
}
```

#### Step 3: 配置文件

```json
// blockchain-adapter.config.json
{
  "defaultChain": "ton-mainnet",
  "chains": {
    "ton-mainnet": {
      "rpcUrl": "https://toncenter.com/api/v2/jsonRPC",
      "explorerUrl": "https://tonscan.org",
      "contracts": {
        "settlement": "EQD...",
        "marketplace": "EQD...",
        "token": "EQD..."
      }
    },
    "ton-testnet": {
      "rpcUrl": "https://testnet.toncenter.com/api/v2/jsonRPC",
      "explorerUrl": "https://testnet.tonscan.org",
      "contracts": {
        "settlement": "kQD...",
        "marketplace": "kQD...",
        "token": "kQD..."
      }
    },
    "solana-mainnet": {
      "rpcUrl": "https://api.mainnet-beta.solana.com",
      "explorerUrl": "https://explorer.solana.com",
      "contracts": {
        "settlement": "So1...",
        "marketplace": "So2...",
        "token": "So3..."
      }
    }
  }
}
```

---

## 🛠️ 使用示例

### 1. 初始化并连接TON

```typescript
import { BlockchainFactory } from "@openclaw/blockchain-adapter";

// 初始化工厂
BlockchainFactory.init();

// 获取TON Provider
const tonProvider = BlockchainFactory.getProvider("ton-mainnet");

// 连接钱包 (TonConnect)
const wallet = await tonProvider.connect({
  manifestUrl: "https://openclaw.io/tonconnect-manifest.json",
});

console.log("Connected:", wallet.address);
```

### 2. 查询余额

```typescript
// 查询TON余额
const tonBalance = await tonProvider.getBalance(wallet.address);
console.log("TON Balance:", tonBalance / 1_000_000_000n, "TON");

// 查询$OCT代币余额
const octBalance = await tonProvider.getBalance(wallet.address, OCT_TOKEN_ADDRESS);
console.log("OCT Balance:", octBalance / 1_000_000_000n, "OCT");
```

### 3. 锁定结算

```typescript
// 发布任务时锁定预算
const orderId = generateOrderId();
const budget = parseUnits("50", 9); // 50 OCT

const txHash = await tonProvider.lockSettlement(orderId, budget);
console.log("Settlement locked:", txHash);

// 等待交易确认
await tonProvider.waitForTransaction(txHash);
```

### 4. 释放结算

```typescript
// 任务完成后释放结算
const actualUsage = parseUnits("35", 9); // 实际使用35 OCT
const proof = generateProof(taskResult);

const txHash = await tonProvider.releaseSettlement(orderId, proof);
console.log("Settlement released:", txHash);
```

### 5. 切换链

```typescript
// 切换到Solana
const solanaProvider = BlockchainFactory.getProvider("solana-mainnet");
const solWallet = await solanaProvider.connect({
  walletType: "phantom",
});

// 相同的API，不同的链！
const solBalance = await solanaProvider.getBalance(solWallet.address);
```

---

## 📦 与 OpenClaw Core 集成（规划示例，非当前主线实现）

> 说明：以下示例用于展示未来接入点；当前 `web3-core`/`market-core` 的主线关键路径仍以 EVM 能力为主，尚未直接依赖 `blockchain-adapter`。
> 双栈（TON+EVM）接入的统一口径与阶段规划，见：
>
> - `docs/WEB3_DUAL_STACK_STRATEGY.md`
> - `docs/reference/web3-dual-stack-payments-and-settlement.md`

### 在 `market-core` 中使用（示意）

```typescript
// extensions/market-core/src/settlement/lock.ts

import { BlockchainFactory } from "@openclaw/blockchain-adapter";

export async function lockSettlement(order: TaskOrder) {
  const provider = BlockchainFactory.getProvider(order.chainId);

  // 锁定预算
  const txHash = await provider.lockSettlement(order.id, order.budget.amount);

  // 记录到store
  await store.settlements.create({
    orderId: order.id,
    txHash,
    amount: order.budget.amount,
    status: "locked",
    chainId: order.chainId,
    createdAt: Date.now(),
  });

  return txHash;
}
```

### 在web3-core中使用

```typescript
// extensions/web3-core/src/billing/guard.ts

import { BlockchainFactory } from "@openclaw/blockchain-adapter";

export async function checkBalance(userAddress: string): Promise<boolean> {
  const config = getConfig();
  const provider = BlockchainFactory.getProvider(config.defaultChain);

  const balance = await provider.getBalance(userAddress, config.tokenAddress);

  return balance >= config.minBalance;
}
```

---

## 🧪 测试策略

### 单元测试

```typescript
// test/ton.test.ts

import { TONProvider } from "../src/providers/ton";

describe("TON Provider", () => {
  let provider: TONProvider;

  beforeEach(() => {
    provider = new TONProvider({ testnet: true });
  });

  it("should connect to wallet", async () => {
    const wallet = await provider.connect({
      manifestUrl: "https://example.com/manifest.json",
    });
    expect(wallet.address).toMatch(/^[UE]Q/); // TON地址格式
  });

  it("should get balance", async () => {
    const balance = await provider.getBalance(testAddress);
    expect(balance).toBeGreaterThanOrEqual(0n);
  });

  it("should lock settlement", async () => {
    const txHash = await provider.lockSettlement("order-123", parseUnits("10", 9));
    expect(txHash).toBeTruthy();
  });
});
```

### 集成测试

```typescript
// test/integration.test.ts

describe("Multi-chain Integration", () => {
  it("should work with TON", async () => {
    const provider = BlockchainFactory.getProvider("ton-testnet");
    // ...
  });

  it("should work with Solana", async () => {
    const provider = BlockchainFactory.getProvider("solana-devnet");
    // ...
  });

  it("should switch between chains", async () => {
    const ton = BlockchainFactory.getProvider("ton-testnet");
    const sol = BlockchainFactory.getProvider("solana-devnet");

    // 相同API，不同链
    const tonBalance = await ton.getBalance(address1);
    const solBalance = await sol.getBalance(address2);
  });
});
```

---

## 🗺️ 开发路线图

### Phase 1: TON基础实现 (4周) - 当前

- [x] Week 1: 接口设计 + 项目搭建
- [ ] Week 2: TON Provider实现
- [ ] Week 3: 智能合约开发与部署
- [ ] Week 4: 测试与文档

### Phase 2: 自发代币 ($OCT) (2周)

- [ ] Week 5: Jetton合约开发
- [ ] Week 6: 代币经济模型实现

### Phase 3: 多链扩展 (6周)

- [ ] Week 7-8: Solana适配器
- [ ] Week 9-10: Sui适配器
- [ ] Week 11-12: Base (EVM) 适配器

### Phase 4: 优化与上线 (2周)

- [ ] Week 13: 性能优化
- [ ] Week 14: 主网部署

---

## 📚 相关文档

- [TON官方文档](https://docs.ton.org)
- [TonConnect SDK](https://github.com/ton-connect/sdk)
- [Jetton标准](https://github.com/ton-blockchain/TEPs/blob/master/text/0074-jettons-standard.md)

---

## 📞 联系方式

- **GitHub**: https://github.com/openclaw/openclaw
- **Discord**: https://discord.gg/openclaw
- **Telegram**: @OpenClawDAO
