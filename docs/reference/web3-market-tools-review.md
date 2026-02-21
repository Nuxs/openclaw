---
summary: "Web3 Market 工具与命令设计评审：触发面、数据流、会话回调（hooks）、命令命中与失败机制（可运维、可审计、默认脱敏）"
read_when:
  - You are reviewing the Web3 Market enable/status command and agent tool design
  - You are implementing or auditing redaction and token-handling rules
  - You are integrating web3-core / market-core status into UI or operations
title: "Web3 Market Tools & Commands Review"
---

## 背景与评审范围

本评审覆盖「启用 Web3 Market 模式」与「查看 Web3 Market 状态」两类运维/管理操作在 OpenClaw 中的实现方式：

- **用户入口（插件命令 / slash 命令）**：`/web3-market …`（由 `web3-core` 插件提供；绕开模型，确定性执行）。
- **Agent 工具（LLM Tools）**：`web3_market_status`（由 `web3-core` 插件提供；默认脱敏，可粘贴分享）。
- **Web3 Core 插件工具（market orchestration tools）**：`web3.market.*`（用于资源发现/租约/账本查询，默认输出脱敏）。

评审重点：

- **机制**：触发面与执行路径如何分工，哪些绕开模型、哪些进入模型。
- **数据流转**：从消息输入、命令命中，到（必要时）用户执行 `/config set ...`、重启调度、状态探测的全链路。
- **模型会话回调**：通过插件 hooks（`llm_input`/`after_tool_call`/`session_end` 等）实现的审计/计费回调链。
- **命令命中**：命令归一化与“未知命令 did-you-mean”提示（只提示不执行）。
- **失败机制**：分层失败、降级策略、以及输出脱敏规则。

> 安全约束（必须满足）：禁止在文档示例、日志、错误消息、状态输出、工具结果中泄露 `accessToken`、Provider endpoint、真实文件路径。

## 组件与职责边界

### 1) 插件 slash 命令（绕开模型，直接执行）

- 入口实现：`extensions/web3-core/src/market/web3-market-command.ts`
- 注册位置：`extensions/web3-core/src/index.ts`（`api.registerCommand({ name: "web3-market", ... })`）
- 调度位置：`src/auto-reply/reply/commands-core.ts`（`handlePluginCommand` 位于 handler 链首位）

职责：

- 解析 `status|help|start` 行为（并兼容 `enable|on -> start`）。
- **不写 config、不中断系统**：`/web3-market start` 只打印可执行的 `/config set ...` 步骤（真正写入由 `/config` 命令完成，并受 owner/授权与 `configWrites` 门禁控制）。
- `/web3-market status [deep]` 触发只读探测（`fast|deep` 分档），输出默认脱敏。

**设计意图**：

- “运维入口”是确定性命令执行（绕开模型），但实现归属在插件内，避免对 OpenClaw core 的侵入。
- 写配置属于通用能力（`/config set ...`），不把“写入/重启”耦合进 Web3 Market 专用命令。

### 2) Agent 工具（供模型使用，结构化输入输出）

- 注册位置：`extensions/web3-core/src/index.ts`（`api.registerTool(createWeb3MarketStatusTool(...))`）
- 工具实现：`extensions/web3-core/src/market/web3-market-status-tool.ts`
- 工具：
  - `web3_market_status`（聚合 Web3 Market runtime 状态，默认脱敏，可粘贴分享）

**设计意图**：

- 将“状态查询”变为可编排的工具能力，支持 UI/Agent 自动化流程。
- 使用 schema 限定参数，降低意外输入；输出默认脱敏，适合分享给支持人员排障。

### 3) web3-core 插件工具（市场编排工具，默认脱敏）

- 定义：`extensions/web3-core/src/resources/market-tools.ts`
- 工具集合：
  - `web3.market.index.list`
  - `web3.market.lease`
  - `web3.market.lease.revoke`
  - `web3.market.resource.publish`
  - `web3.market.resource.unpublish`
  - `web3.market.ledger.summary`
  - `web3.market.ledger.list`

**设计意图**：

- 这些工具是“买/卖资源”编排的底层能力，面向模型侧。
- 所有返回值走统一脱敏（字符串与对象字段双层处理），避免 endpoint/token 泄露。

## 命令命中机制（Command Matching）

### 归一化（Normalize）

命令解析前会对输入做归一化：

- `/cmd: args` 形式会被归一化为 `/cmd args`。
- Telegram 等场景的 `/cmd@botname` 会剥离 `@botname`。

实现：`src/auto-reply/commands-registry.ts`（`normalizeCommandBody`、`getTextAliasMap`）。

> 说明：`commands-registry.data.ts` 只描述 **内置命令** 的 alias 与 argsMenu。插件命令（如 `/web3-market`）不在该表中维护别名；推荐通过确定性子命令兼容（例如 `enable|on`）+ unknown did-you-mean 提示来提升命中率。

### 命中与调度

- 控制命令检测：`src/auto-reply/command-detection.ts`（用于决定是否需要计算 `CommandAuthorized` 等成本较高的元信息）。
- handler 链：`src/auto-reply/reply/commands-core.ts` 按顺序遍历 handlers，首个返回结果者短路。
- 插件命令优先：`handlePluginCommand` 在内置 commands 之前执行，因此插件可以“占用”某些命令名（这是刻意的扩展点）。

### unknown slash 的 did-you-mean（只提示不执行）

当输入看起来像 slash 命令（以 `/` 开头）但未命中任何 handler 时，core 会给出最多 3 条建议：

- 建议实现：`src/auto-reply/commands-suggest.ts`
- 调用位置：`src/auto-reply/reply/commands-core.ts`（仅对授权 sender、并跳过路径样式输入）
- 建议来源：内置命令 + `listPluginCommands()` 的插件命令（因此 `/web3-marlet` 仍能提示 `/web3-market`）

## 数据流转（Data Flow）

### A) 用户 slash 命令：获取启用步骤（不写 config）

```mermaid
actionDiagram
  title /web3-market start 数据流（插件入口）
  action "Inbound message" as msg
  action "normalizeCommandBody" as norm
  action "CommandAuthorized gate" as auth
  action "handleCommands (handler chain)" as chain
  action "handlePluginCommand" as plugin
  action "web3-core: /web3-market handler" as market
  action "formatEnableInstructions (prints /config steps)" as steps
  action "reply routed to channel" as reply

  msg -> norm
  norm -> auth
  auth -> chain
  chain -> plugin
  plugin -> market
  market -> steps
  steps -> reply
```

要点：

- `/web3-market start` 走 **插件命令 handler**，绕开模型。
- 该命令**只打印**启用步骤：用户需要显式执行 `/config set ...`（写入门禁由 `/config` 命令负责）。
- 重启也不由该命令强制触发：遵循你现有的 Gateway 重启流程（或按提示手动重启）。

### B) 用户 slash 命令：查询状态（fast/deep 分档）

```mermaid
actionDiagram
  title /web3-market status [deep] 数据流（插件入口）
  action "Inbound message" as msg
  action "handlePluginCommand" as plugin
  action "web3-core: /web3-market handler" as market
  action "buildWeb3MarketStatusSummary (parallel probes)" as status
  action "callGateway web3.status.summary" as w3
  action "callGateway web3.market.status.summary" as mkt
  action "callGateway web3.market.resource.list (deep only)" as res
  action "callGateway web3.market.lease.list (deep only)" as lease
  action "callGateway web3.market.ledger.*" as ledger
  action "formatWeb3MarketStatusMessage" as fmt

  msg -> plugin
  plugin -> market
  market -> status
  status -> w3
  status -> mkt
  status -> res
  status -> lease
  status -> ledger
  w3 -> fmt
  mkt -> fmt
  res -> fmt
  lease -> fmt
  ledger -> fmt
```

要点：

- 实现位置：`extensions/web3-core/src/market/market-status.ts`。
- `fast` 为默认档：只做关键探测（更快、更稳）。
- `deep` 为显式档：额外拉取 resources/leases/ledger list 等更重探测。
- 输出默认脱敏：去 token、去 endpoint、缩短 home path；适合粘贴分享。

### C) Agent 工具：`web3_market_status`

- `web3_market_status`：结构化参数（例如 `profile=fast|deep`），输出脱敏后的状态摘要，适合 UI/Agent 自动化与粘贴排障。
- 该工具与 `/web3-market status` 共享同一套探测与脱敏策略（实现上由 `web3-core` 插件统一维护）。

## 模型会话回调（Session Callbacks via Hooks）

Web3 Market 相关的“会话回调”主要通过 `web3-core` 插件 hooks 实现，属于模型运行时事件链：

- **审计链路**：`llm_input`、`llm_output`、`after_tool_call`、`session_end`
  - 目的：记录可回放的、最小披露的事件序列，便于对账/追责/仲裁。
- **计费门禁**：`before_tool_call`
  - 目的：在执行工具前做 credits/配额检查，防止超额调用。

实现入口：`extensions/web3-core/src/index.ts`。

> 注意：插件 slash 命令（例如 `/web3-market status`、`/web3-market start`）属于“绕开模型的直接执行”，不会触发 LLM tool call 相关 hooks；但它会影响后续会话（通过启用插件与改变可用的工具/路由能力）。

## 失败机制与降级策略

### 分层失败清单

- **命中失败（不认为是命令）**
  - 触发：输入不以 `/` 开头。
  - 行为：继续走常规对话（`handleCommands` 返回 `shouldContinue=true`）。

- **文本命令禁用**
  - 触发：`cfg.commands.text=false` 且当前 surface 支持 native commands。
  - 行为：handler 直接返回 `null`，最终进入常规对话或由 native commands 兜底。

- **鉴权失败（未授权 sender）**
  - 触发：`CommandAuthorized=false`。
  - 行为：不响应命令（避免对非授权 sender 形成侧信道/刷屏）。

- **状态探测失败（部分 RPC 超时/错误）**
  - 触发：单个 gateway method 调用失败。
  - 行为：写入 `errors[]`，其余探测结果照常返回；若有缓存，返回 `stale=true` 的上次成功摘要。

### 输出脱敏与安全失败

- 状态与工具输出必须满足“可粘贴分享”属性：
  - 不包含 `accessToken`、endpoint、真实路径。
  - 错误信息也必须经过脱敏。

落地位置：

- `extensions/web3-core/src/market/market-status.ts`：对 gateway 错误做结构化重试判定 + 文本脱敏。
- `extensions/web3-core/src/resources/market-tools.ts`：对任意结果做递归脱敏（字段名与字符串双层）。
- `extensions/web3-core/src/market/web3-market-status-tool.ts`：工具输出默认脱敏，并限制可选参数。

## 设计评估（优点、风险、建议）

### 优点

- **插件优先、core 低侵入**：Web3 Market 的用户入口与工具能力由插件提供，core 仅负责通用路由与安全提示机制。
- **写操作收敛**：启用步骤通过 `/web3-market start` 给出明确的 `/config set ...` 指令，真正写入走通用 `/config` 门禁，权限语义更一致。
- **默认脱敏**：market orchestration tools + status/tool 输出统一脱敏，符合 Web3 Market 的安全底线。
- **可运维**：状态探测并行、部分失败不阻断，并支持 stale cache。
- **可审计/可计费**：通过 web3-core hooks 捕获关键会话事件，便于追踪与对账。

### 风险点

- **可发现性需要插件自带“帮助面”**：插件命令不在 `commands-registry.data.ts` 的 `argsMenu` 中，必须通过 `/web3-market help`、`/commands`、文档与 UI 快捷入口保证可发现性。
- **权限语义需明确说明**：`/web3-market start` 仅输出步骤，但实际 `/config set ...` 需要 owner/授权 + `configWrites`；文档必须明确这点，避免“照抄命令却失败”的困惑。

### 建议

- **保持术语统一**：对外统一 `start | status | help`，同时兼容 `enable|on` 输入（但输出与文档只使用 canonical 术语）。
- **扩展 status 的可选探测项**：后续若 UI 观测面扩展（metrics/index/monitor/disputes），优先作为 `deep` 的可选 probe 引入，避免默认探测压力。
- **保持错误码结构化优先**：当 gateway 层能提供稳定 `status/code` 字段时，重试判定优先使用白名单策略，message 匹配仅作为 fallback。

## 相关文档

- Web3 Market 概览：[/concepts/web3-market](/concepts/web3-market)
- Web3 Core 插件：[/plugins/web3-core](/plugins/web3-core)
- Web3 Market 开发文档：[/reference/web3-market-dev](/reference/web3-market-dev)
- Web3 资源共享 API：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
- 插件系统：[/tools/plugin](/tools/plugin)
