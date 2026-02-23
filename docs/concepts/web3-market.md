---
summary: "OpenClaw Web3 Market 模式总览：用户操作极简，由 AI 管家代办租约、记账与结算（面向用户）"
read_when:
  - You want to use OpenClaw with wallets, on-chain anchoring, and decentralized archives
  - You want the default Web3 payment policy (escrow) and user-facing flows
  - You are onboarding users to Web3 market mode
title: "Web3 Market (概览)"
---

## 什么是 Web3 Market 模式

Web3 Market 模式把 OpenClaw 变成一个“互助式市场”的管家入口：

- **你（用户）只做少量决策**：发布什么、价格/规则、要不要租用别人、以及（可选）选择支付网络（当前默认 EVM；TON 为规划/实验口径）。
- **复杂执行都由 AI 管家代办**：签发租约、代管一次性 token（不回显）、调用资源、记账、进入结算队列、生成可审计记录。

它强调两个底层原则：

- **安全边界清晰**：`accessToken`、Provider endpoint、真实路径属于敏感资产，不能出现在文档示例、日志、错误消息或状态输出里。
- **可审计**：关键动作可被追踪（最小披露），便于对账、仲裁和回放。

## 与系统工具的关系（web_search 与 browser）

- **`web_search` / `browser`**：OpenClaw 的通用执行工具，用于上网搜索、打开网页、执行推广或操作流程。
- **Web3 Market**：OpenClaw 的可选扩展协议层，用于能力的发现、租约、记账与结算。
- 即使资源类型是“搜索”，也不等同于内置 `web_search`：market 的搜索能力来自外部 Provider，具备**可计费、可审计、可结算**的属性。

## 用户视角的极简流程

### 卖资源（赚钱）

1. **发布资源**：选择你要提供的能力（模型、搜索、存储或其它服务），设置价格与规则。
2. **等待租用**：由 AI 管家负责签发租约、发放一次性 token，并在后台维护租约生命周期。
3. **查看收益与结算状态**：你只看结果（收入、待结算、失败重试等）。

### 买资源（省钱或补能力）

1. **发现并选择资源**：你只看到摘要信息（能力、价格、SLA 等），不需要也不应该看到 endpoint。
2. **选择支付网络并租用**：当前默认走 EVM（Base/Sepolia）；TON 支付入口为规划/实验（见双栈策略）；AI 管家签发租约并代管一次性 token（不回显）。
3. **发起使用并查看对账**：AI 管家自动路由到正确的 Provider；你在 UI/CLI 里查看 credits、账本与 escrow 状态，以及可分享的脱敏对账摘要。

## 你会在 UI/CLI 里看到什么

- **钱包状态**：是否已绑定钱包、最近验证时间、链 ID。
- **审计状态**：最近审计事件数量、最近锚定交易、是否存在 pending anchors。
- **归档状态**：最近归档的 CID、归档 provider。
- **计费状态**：会话 credits/配额、LLM/Tool 调用次数、最近活动时间。
- **结算状态**：订单的 escrow 锁定/释放/退款状态（当你启用结算策略时）。
- **资源共享状态摘要**：资源/租约/账本的概览统计（默认脱敏，可直接粘贴分享）。

## 默认体验与更多细节

本文档只保留用户向的“极简心智模型”。关于默认网络、默认存储、结算参数与状态机等实现细节，见开发者文档：[/reference/web3-market-dev](/reference/web3-market-dev)。

关于 TON+EVM 双栈并行（用户选链支付、后台统一对账口径）的总规划，见：[双栈策略总规划](/web3/WEB3_DUAL_STACK_STRATEGY)。

## 相关文档

- `web3-core` 插件：[/plugins/web3-core](/plugins/web3-core)
- `web3-core` 开发者文档：[/plugins/web3-core-dev](/plugins/web3-core-dev)
- `market-core` 插件：[/plugins/market-core](/plugins/market-core)
- Web3 Market 开发者文档：[/reference/web3-market-dev](/reference/web3-market-dev)
- Web3 资源共享 API 契约：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
- 双栈总规划（TON+EVM）：[双栈策略总规划](/web3/WEB3_DUAL_STACK_STRATEGY)
- 双栈支付与结算参考：[/reference/web3-dual-stack-payments-and-settlement](/reference/web3-dual-stack-payments-and-settlement)
- 插件系统：[/tools/plugin](/tools/plugin)
