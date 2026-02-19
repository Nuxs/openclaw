---
summary: "OpenClaw Web3 市场化能力总览：钱包身份、可验证审计、去中心化归档与预付锁定结算（面向用户）"
read_when:
  - You want to use OpenClaw with wallets, on-chain anchoring, and decentralized archives
  - You want the default Web3 payment policy (escrow) and user-facing flows
  - You are onboarding users to Web3 market mode
title: "Web3 Market (概览)"
---

## 什么是 Web3 Market 模式

OpenClaw 的 Web3 Market 模式把三件事变成“开箱即用”的一站式管家入口：

- **钱包身份**：用 SIWE（Sign-In with Ethereum）把“谁在用 OpenClaw”变成可验证身份。
- **可验证审计**：把会话与工具调用变成可验证的审计事件，支持链上锚定（最小披露）。
- **去中心化归档**：把会话/产物加密后归档到去中心化存储，并能按需取回。
- **代币结算（市场化）**：用预付锁定（escrow）把消费与交付绑定，并提供退款/争议窗口。

这套能力目前由两个插件提供：

- **`web3-core`**：身份（SIWE）、审计锚定、去中心化归档、使用量（quota/credits）与状态汇总。
- **`market-core`**：挂牌/下单/托管锁定/释放/退款/同意/交付/撤回/透明度审计。

## 默认支持的 1-2 个生态（默认体验）

OpenClaw 选择“主流 + 低摩擦”的默认组合，以便让更多链上用户能快速加入。

- **默认链生态：EVM / Base**
  - 默认网络是 `base`（EVM L2），钱包兼容性强、手续费相对低。
  - 开发与演示可使用 `sepolia`。

- **默认存储生态：IPFS + w3s 网关（并保留 Filecoin/web3.storage 选项）**
  - IPFS：默认通过 Pinata 上传（需要 `pinataJwt`），读取可走 `w3s.link` 网关。
  - Filecoin：可选 `web3.storage` 上传 API（需要 token，默认 endpoint 为 `https://api.web3.storage/upload`）。

## 你会在 UI/CLI 里看到什么

- **钱包状态**：是否已绑定钱包、最近验证时间、链 ID。
- **审计状态**：最近审计事件数量、最近锚定交易、是否存在 pending anchors。
- **归档状态**：最近归档的 CID、归档 provider（IPFS/Filecoin/Arweave）。
- **计费状态**：会话 credits/配额、LLM/Tool 调用次数、最近活动时间。
- **结算状态**：某笔订单的 escrow 锁定/释放/退款状态。

## 默认支付策略（你已确认）

### 开放市场（任意节点/陌生节点）默认：预付锁定 + 退款 + 部分结算 + 争议窗口

为什么：开放市场里要同时保护需求方和供给方，避免“逃单/白干”。

- **预付锁定（escrow lock）**：先锁定预算，交付与验收后再释放。
- **超时自动退款**：超过 TTL 未交付则退款。
- **部分结算**：允许“部分交付按比例释放”。
- **争议窗口**：交付后默认 10 分钟内可发起争议；未争议则自动释放。

### 信任域（自己设备/朋友节点/allowlist 节点）可选：会话后付 + cap + 限速

- **会话后付**：在会话结束时统一结算。
- **单会话上限（cap）**：防止意外烧钱。
- **速率限制**：限制单位时间内的调用次数或额度消耗。

## 隐私与最小披露

默认策略是“**链上最小披露** + **归档端到端加密**”。

- 链上默认只写入不可逆摘要（hash），避免泄露原文。
- 归档内容默认加密后上传到去中心化存储。
- 审计前会对敏感字段进行裁剪/脱敏（例如 token、password、secret、privateKey）。

## 快速开始（概念流程）

1. **安装并启用插件**：启用 `web3-core` 与 `market-core`。
2. **在 UI 连接钱包**：完成 SIWE 签名验证（挑战/验签）。
3. **开始使用 OpenClaw**：正常对话、调用工具。
4. **查看状态**：在概览/用量页查看 `web3.status.summary` 与 `web3.billing.summary`。
5. **需要结算时**：开放市场默认走“预付锁定”，并可查询 escrow 状态。

## 相关文档

- `web3-core` 插件：[/plugins/web3-core](/plugins/web3-core)
- `market-core` 插件：[/plugins/market-core](/plugins/market-core)
- 插件系统：[/tools/plugin](/tools/plugin)
