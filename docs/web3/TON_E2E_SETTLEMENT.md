---
title: TON 端到端结算（Headless）落地指南
---

## 目标

把 TON 侧结算闭环跑通（不依赖 TonConnect 交互）：

- **合约**：`settlement.fc` 的编译与部署
- **地址派生**：基于 `@ton/crypto` 的助记词派生（ed25519）与钱包地址生成
- **BOC 编码**：按合约 `recv_internal` 规范构造消息体（payload）
- **Provider 能力**：扩展 `IProviderTON` 与 `transfer(..., { payload })`
- **业务接入**：`market-core` 结算/争议走 `createEscrowAdapter()`，TON/EVM 自动分发

> 安全约束：文档示例里不要放真实 `mnemonic`、RPC `apiKey`、真实私钥或个人主机路径；用占位符。

## 当前实现的关键事实（与限制）

- TON 合约 `recv_internal` **会忽略空消息体**，所以 **必须** 带 payload。
- `lock_settlement` 的 payload 中 **必须包含 `payee` 地址**（单一收款方）。
- `release_settlement` 需要 `signature: bits512` 但 **当前合约并未校验签名**（仅校验 sender 是 payee 或 owner）。
- 当前 TON 结算合约 **仅支持单 payee**：`lock` 时写入一个 `payee`，`release` 也只会给这个 `payee` 打款。

## 代码位置

- **合约**：`extensions/blockchain-adapter/contracts/ton/settlement.fc`
- **部署脚本**：`extensions/blockchain-adapter/scripts/deploy-contracts.mjs`
- **Provider (TON)**：`extensions/blockchain-adapter/src/providers/ton/index.ts`
- **BOC 编码**：`extensions/blockchain-adapter/src/providers/ton/settlement-payload.ts`
- **market-core TON escrow**：`extensions/market-core/src/market/escrow-ton.ts`
- **market-core 结算/争议 handlers**：
  - `extensions/market-core/src/market/handlers/settlement.ts`
  - `extensions/market-core/src/market/handlers/dispute.ts`
- **agent-wallet TON**：
  - `extensions/agent-wallet/src/ton-wallet.ts`
  - `extensions/agent-wallet/src/ton-handlers.ts`

## 合约消息体（payload）编码规范

合约 `recv_internal` 读取顺序固定：

- **通用头**
  - `op:uint32`
  - `query_id:uint64`
  - `order_hash:uint256`

- **op=1 lock_settlement**
  - `amount:coins`
  - `payee:msg_addr`

- **op=2 release_settlement**
  - `actual_amount:coins`
  - `signature:bits512`（当前合约未验证，仅占位）

- **op=3 refund_settlement**
  - 无额外字段

实现提供了对应的编码函数（返回 base64 BOC）：

- `encodeTonSettlementLockPayload({ orderHash, amount, payee, queryId })`
- `encodeTonSettlementReleasePayload({ orderHash, actualAmount, signature, queryId })`
- `encodeTonSettlementRefundPayload({ orderHash, queryId })`

## 合约部署（testnet/mainnet）

### 前置依赖

部署脚本默认调用 TON 官方工具链：

- `func`（FunC 编译器）
- `fift`（Fift 工具）

并需要一个可用的 RPC endpoint（默认 TonCenter）：

- Testnet：`https://testnet.toncenter.com/api/v2/jsonRPC`
- Mainnet：`https://toncenter.com/api/v2/jsonRPC`

### 部署命令

在 `extensions/blockchain-adapter` 目录执行：

- **Testnet 部署**（建议）：
  - 环境变量方式：
    - `TON_NETWORK=testnet`
    - `TON_RPC_URL=<TON_RPC_URL>`（可选）
    - `TON_API_KEY=<TONCENTER_API_KEY>`（可选）
    - `TON_MNEMONIC=<SPACE_SEPARATED_MNEMONIC>`
    - `TON_OWNER_ADDRESS=<OWNER_TON_ADDRESS>`（可选；不填则 owner 为空地址）
  - 运行：
    - `pnpm -C extensions/blockchain-adapter contracts:deploy`

脚本会输出：

- `walletAddress`：部署钱包地址
- `contractAddress`：合约地址
- `deployBocBase64`：部署交易的 BOC（可用于排查/广播）

## Provider：Headless 连接与发送

### Headless 连接参数

`ConnectionConfig` 目前支持：

- `rpcUrl?: string`
- `apiKey?: string`
- `tonMnemonic?: string`（空格分隔助记词）
- `tonWorkchain?: number`（默认 0）

### 发送带 payload 的内部消息

统一走 `transfer(to, amount, options)`：

- `amount`: nanotons 的整数（`bigint`）
- `options.payload`: base64 BOC（Cell）

> 对 TON 结算合约调用：`to = chain.escrowContractAddress`，并把 `payload` 设置为上面的编码结果。

### TON 交易标识语义

EVM 的 `transfer()` 返回链上交易哈希（`0x…`），可直接用于查询回执。
TON 的 `transfer()` 返回的是 **已签名外部消息的 BOC base64 编码**，不是链上交易哈希。
TON 网络中链上交易哈希需通过 `lt + hash` 查询获取，当前实现返回 BOC 标识以便追踪。
下游消费方（如 settlement 记录中的 `lockTxHash` / `releaseTxHash` / `refundTxHash`）应根据 `chain.network` 前缀（`ton-`）区分语义。

## market-core 接入（TON）

### 配置要点

- `chain.network`: `ton-testnet` 或 `ton-mainnet`
- `chain.escrowContractAddress`: 部署脚本输出的合约地址
- `chain.tonMnemonic`: 用于链上发送交易的助记词（**注意：不同操作对 sender 有要求**）
- `settlement.mode`: `contract`

### 重要行为约束

- `lock` payload 里的 `payee` 目前来自 `offer.sellerId`。
- `release/refund` 目前由 market-core 发起：
  - `release` 要求 sender 是 `payee` 或 `owner`
  - `refund` 要求 sender 是 `payer` 或 `owner`，或超时

如果你的运行形态是“多参与方（买方/卖方/平台分别持钥）”，需要把 `lock/release/refund` 分别下沉到对应的 wallet/agent 执行，并在 market-core 只做 **验证/记账/状态推进**。

## agent-wallet（TON）

### 创建/加载 TON 钱包

`agent-wallet.create` 在 TON 模式下会：

- 生成并加密保存助记词（AES-256-GCM，使用 `agent-wallet.encryptionKey`）
- 派生并返回 TON 地址与公钥

### 查询余额与转账

- `agent-wallet.balance`: 默认查自己的地址；也可传 `address`
- `agent-wallet.send`: 传 `to` 与 `amount`（nanotons 的整数字符串）

## 最小验收（建议）

1. 部署合约，记录 `contractAddress`
2. 配置 market-core：`chain.network=ton-testnet`、`chain.escrowContractAddress`、`chain.tonMnemonic`、`settlement.mode=contract`
3. 创建 offer：`sellerId` 填一个合法 TON 地址（与后续 release sender 角色匹配）
4. 锁定结算：调用 `settlement.lock`（应返回 `txHash` / BOC）
5. 释放结算：调用 `settlement.release`，并确保 `payees` 只有 1 个

> 备注：当前合约未验证 `signature`，所以 release payload 里使用全 0 签名也能通过。
