# TON E2E Settlement + Agent Wallet（内部实现计划）

> 来源：本仓库开发过程中的内部计划稿（最初位于 CodeBuddy plan），已收敛到 `skills/web3-market/internal/` 便于后续 AI/协作者持续迭代与对齐。

## User Requirements

- 实现 TON 侧 **escrow 端到端可跑通**：包含结算合约编译/部署、链上调用（lock/release/refund）、以及可验证的链上状态与交易哈希输出。
- 补齐 **@ton/crypto 地址派生**：agent-wallet 生成/持久化可用于 TON 的密钥材料，并能导出 TON 地址（不暴露私钥）。
- 补齐 **BOC/payload 编码**：按 `settlement.fc` 的 `recv_internal` 入参格式构造消息体并随交易发送。
- 落地 **IProviderTON 扩展接口**：暴露发送带 payload 的交易、必要的 get-method 查询能力；保证接口清晰、可复用、可测试。
- 产出一份“落地开发文档”，内容可直接指导开发/测试/验收，并配套最小自动化脚本或可复制命令。

## Product Overview

- 在 OpenClaw Web3 Market 的“合约结算模式”下，TON 与 EVM 统一走相同的市场结算流程，但 TON 侧具备可编译、可部署、可调用、可验收的完整闭环。

## Core Features

- TON settlement 合约：可编译与部署到 ton-testnet，并记录合约地址与验收步骤。
- TON escrow 调用：lock/release/refund 能发送正确 payload，返回可复用的交易标识。
- TON 钱包能力：agent-wallet 可生成并保存密钥材料，能派生 TON 地址并完成转账/合约调用所需签名路径。
- 可验收输出：提供可复制粘贴的脱敏输出（合约地址、交易哈希、关键状态字段），用于演示与回归。

## Tech Stack Selection（基于现有仓库确认）

- 语言与模块：TypeScript（ESM），扩展包位于 `extensions/*`
- TON 相关依赖：`@ton/ton`、`@ton/crypto`、`@tonconnect/sdk`
- 测试：Vitest（与仓库现有一致）

## Implementation Approach

- 以 `settlement.fc` 的 **recv_internal 入参格式**为事实源，新增一套可单测的“TON payload 构造器”，由 `market-core` 的 `TonEscrowAdapter` 调用。
- 在 `blockchain-adapter` 侧把 `IProvider.transfer()` 扩展为 **可携带 TON payload（base64 BOC）** 的通用能力；TON Provider 通过 `TransferOptions.payload` 发送该 payload。
- 为满足“端到端可跑通”，TON Provider 增加 **headless 连接路径**（无需 TonConnect UI），以 `@ton/crypto` 派生 keypair 并使用钱包合约发送交易。
- `market-core` 的结算/争议 handler 统一通过 `createEscrowAdapter()` 选择 EVM/TON，避免继续硬编码 `new EscrowAdapter(...)`。

## Implementation Notes（执行关键点）

- 合约调用安全性：`settlement.fc` 当前 lock 逻辑读取 body 里的 `amount`；建议在合约中增加 `msg_value >= amount` 的校验（需重新部署）。
- 兼容性：agent-wallet 现有存储为 v1（仅 EVM 私钥）；升级为 v2 时需支持 **无损迁移**（旧记录仍可读取，并转换为 seed 驱动的新结构）。
- TON 合约能力限制：当前合约 lock 仅接收单个 `payee`；`market-core` 在 TON 网络下对 `payees.length > 1` 做显式拒绝，并在文档标注限制与后续扩展点。
- 脱敏与安全：文档与示例不得包含真实 endpoint/token/私钥；所有示例用明显占位符。

## Architecture Design

```mermaid
flowchart LR
  A[market-core: settlement/dispute handlers] --> B[createEscrowAdapter()]
  B -->|EVM| C[EscrowAdapter]
  B -->|TON| D[TonEscrowAdapter + payload builder]
  D --> E[blockchain-adapter: TONProvider.transfer(payload)]
  E --> F[TON settlement.fc contract]
  G[agent-wallet] -->|seed派生+签名| E
```

## 对外验收文档

- `docs/web3/TON_E2E_SETTLEMENT.md`
