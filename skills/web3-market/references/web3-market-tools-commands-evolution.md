### OpenClaw Web3 Market：工具与命令命中率、容错率提升指南（供后续 AI 接入更多 API）

> 本文档是 Web3 Market 设计规范的“工程落地附录”，聚焦 **工具与命令层**（slash commands / Agent tools / `web3.*` gateway methods）的可维护性与可演进性。
>
> 适用场景：
>
> - 你要新增/扩展 `web3.market.*`、`web3.index.*`、`web3.monitor.*` 等 API
> - 你要新增一个运维命令（例如启用/诊断/探测/修复）并希望“更容易命中、更不容易误触发”
> - 你要把状态探测做得更稳（部分失败可降级、可诊断、不会放大故障）

---

## 0. 设计总原则（与 OpenClaw 方向一致）

### 0.1 安全默认（Safety by default）

- **不做模糊执行**：对“写配置 / 重启 / 影响资金与账本 / 影响租约状态”的动作，只允许在 **明确命令 + 明确参数** 下执行。
- **输出默认可分享**：状态与工具输出必须默认脱敏，满足“可粘贴给支持人员/发到群里排障”。
- **失败要分层且可操作**：错误消息要告诉你“下一步做什么”，而不是只返回 `String(err)`。

### 0.2 入口分工清晰（高风险绕开模型，但不要求进入 core）

- **高风险运维动作**优先放在“确定性命令 handler”（绕开模型）。该 handler **可以位于插件**（例如 `web3-core` 插件的 `/web3-market` 命令），不必进入 OpenClaw core。
- **写配置/重启**属于通用运维能力：建议通过 `/config set ...`（与现有门禁一致：owner/授权 + `configWrites`），而不是在 Web3 Market 专用命令里暗中写入。
- **可编排/可自动化**能力放在 Agent tools（结构化输入输出）。
- **协议/市场编排**能力放在 `web3.*` gateway methods（对外单入口体验层）。

---

## 1. 现状链路速览（可在代码中核验）

### 1.1 触发面（Trigger surfaces）

- **slash 命令（插件命令）**：`/web3-market ...`
  - 处理位置：`extensions/web3-core/src/market/web3-market-command.ts`
  - 注册位置：`extensions/web3-core/src/index.ts`（`api.registerCommand({ name: "web3-market", ... })`）
  - 调度位置：`src/auto-reply/reply/commands-core.ts`（插件命令优先执行）

- **Agent tools（插件提供）**：`web3_market_status`
  - 注册位置：`extensions/web3-core/src/index.ts`
  - 实现位置：`extensions/web3-core/src/market/web3-market-status-tool.ts`

- **web3-core 插件 tools / gateway methods**：`web3.market.*`
  - 定义位置：`extensions/web3-core/src/resources/market-tools.ts`

### 1.2 命令命中（Command matching）

- 归一化入口：`normalizeCommandBody()`（`src/auto-reply/commands-registry.ts`）
  - 统一处理 `/cmd: args`、Telegram `/cmd@bot`。

- handler 链：`handleCommands()`（`src/auto-reply/reply/commands-core.ts`）
  - 按顺序遍历 handlers，首个返回结果者短路。
  - 插件命令 handler 在内置命令之前执行。

- unknown slash 的 did-you-mean：`src/auto-reply/commands-suggest.ts`
  - 提示来源包含插件命令（通过 `listPluginCommands()`），因此拼写错误仍能被纠正提示。
  - 仅对授权 sender 生效，且只提示不执行。

### 1.3 权限语义（Authorization semantics）

- **写操作**统一建议通过 `/config set ...`（由 OpenClaw core 的 config 命令门禁控制）。
- 插件命令 `/web3-market start` 仅输出步骤，不直接写入；因此“写入权限”的语义与体验更容易统一。

---

## 2. 提升命中率（不增加风险）的推荐模式

### 2.1 插件命令的单一事实来源：保持单一 canonical 命令名

**推荐**：插件命令保持单一 canonical（例如 `/web3-market`），避免把插件命令别名塞进 `commands-registry.data.ts`（该表是内置命令的单一事实来源）。

- 对“动作词”用子命令兼容：例如 `start` 同时兼容 `enable|on`（但输出与文档统一使用 `start`）。
- 对“拼写错误”用 did-you-mean 提示：例如 `/web3-marlet` -> 建议 `/web3-market`。

### 2.2 术语统一：start/enable/on 的兼容与 canonical 输出

**推荐**：

- 对外统一用 `start | status | help`（更贴近“模式开关/运维”语义）。
- 兼容 `enable | on` 作为输入别名，但所有回复与帮助文案使用 canonical 术语。

收益：

- 降低文档、UI、模型提示词的分叉成本。

### 2.3 Did-you-mean：只提示不执行（Commander 风格）

当用户输入未知命令（例如 `/web3-marlet`）：

- **不执行**任何近似命令。
- 仅返回建议（最多 3 条），并提示用户运行 `/commands`。

安全门槛（建议同时满足）：

- `allowTextCommands=true`
- 输入以 `/` 开头但未命中任何命令
- `command.isAuthorizedSender=true`（避免对非授权 sender 形成侧信道/刷屏）
- 距离阈值（例如编辑距离 ≤2），否则放行给模型当普通文本

### 2.4 可发现性：插件命令不走 argsMenu，改用 help + /commands + UI

`commands-registry.data.ts` 的 `argsMenu` 目前是 **内置命令** 的交互入口。

**推荐**给插件命令的替代策略：

- 保证命令自带 `help`：`/web3-market help` 输出最小可用的子命令矩阵。
- `start` 输出“可执行步骤”，并明确写入门禁：`/web3-market start`。
- `/commands` 列表必须能展示插件命令（core 会从插件注册表汇总）。
- UI 若要“一键 deep”，应在 UI 层提供快捷按钮/菜单，而不是依赖内置 argsMenu。

---

## 3. 提升容错率（可降级、可诊断、不会放大故障）

### 3.1 状态探测分档：fast / deep

现状：`buildWeb3MarketStatusSummary()` 通过并行 RPC 探测多个端点。

实现位置（插件）：`extensions/web3-core/src/market/market-status.ts`。

**推荐演进**：

- **fast**（默认）：只跑关键探测（例如 `web3.status.summary`、`web3.market.status.summary`、`web3.market.ledger.summary`）。
- **deep**（按需）：覆盖运维需要的更多端点（resources/leases 列表、metrics、index stats、monitor 等）。

原则：

- 默认 fast，保证“快且稳定”。
- deep 由显式参数触发（命令 `status deep` 或 tool 参数），避免把依赖打爆。

### 3.2 stale cache：失败时返回“陈旧但可用”的摘要

当本次 status 探测失败：

- 返回 `stale=true` + `staleAgeSec`
- 同时返回最近一次成功的 summary（已脱敏）
- 本次失败原因进入 `errors[]`

收益：

- 依赖不稳时仍能辅助排障。
- 让运维知道“当前数据可能陈旧”，避免误判。

### 3.3 bounded retry：只对只读探测做小幅重试

**推荐**：

- 只对 status 的 **只读** RPC 做重试。
- attempts 建议 2–3 次；总耗时必须受 `timeoutMs` 约束。
- `shouldRetry` 必须优先使用结构化字段（`status/statusCode/code`），message 匹配仅作为 fallback。

### 3.4 稳定错误码契约（为后续更多 API 接入做铺垫）

Web3 Market 的 gateway methods 建议遵循统一响应格式（见 `web3-market-resource-api.md`）：

- 成功：`{ ok: true, ... }`
- 失败：`{ ok: false, error: "E_...: ...", details?: { ... } }`

关键：

- `error` 必须稳定可机器解析。
- human message 可以变化，但不得泄露 token/endpoint/真实路径。

---

## 4. PR 级落地计划（可逐个合并、每个 PR 可独立验收）

> 本节保留“可拆分验收”的结构，但所有落地点都以“插件入口”为准（避免把 Web3 Market 入口做成 core 内置能力）。

### PR-1：`/web3-market` 子命令解析单一化 + 写操作收敛到 /config

- 插件命令仅负责 `help/status/start`。
- `start` 输出可执行的 `/config set ...` 步骤（不写入）。

文件：

- `extensions/web3-core/src/market/web3-market-command.ts`

### PR-2：unknown command 的 Did-you-mean 建议（不执行）

- 新增命令建议模块（bounded edit distance）。
- 在 `handleCommands()` 末尾对“未知命令”返回建议（仅授权 sender）。
- 建议来源包含插件命令（`listPluginCommands()`）。

文件：

- `src/auto-reply/reply/commands-core.ts`
- `src/auto-reply/commands-suggest.ts`（新增/维护）

### PR-3：可发现性（插件不做 argsMenu）

- 插件命令提供 `help` 与明确的 `start/status` 子命令矩阵。
- UI 侧提供 deep 的快捷入口（如果需要）。

文件：

- `extensions/web3-core/src/market/web3-market-command.ts`
- `docs/plugins/web3-core.md`（文档）

### PR-4：status 支持 fast/deep + stale cache

- `buildWeb3MarketStatusSummary()` 增加 `profile`，默认 fast。
- 失败时返回 stale（带时间戳/年龄），并合并本次部分成功结果。

文件：

- `extensions/web3-core/src/market/market-status.ts`
- `extensions/web3-core/src/market/web3-market-status-tool.ts`

### PR-5：status probes 的 bounded retry（结构化错误优先）

- 只读探测做小幅重试 + jitter；排除不可重试错误（权限/参数/404/unknown method）。

文件：

- `extensions/web3-core/src/market/market-status.ts`

---

## 5. 后续新增更多 API 接入时的模板（建议复制粘贴）

### 5.1 新增一个 `web3.market.*` gateway method

检查清单：

- 方法名遵循 `web3.*` 单入口体验层命名（不要把 `market.*` 直接暴露给最终用户）。
- 输入参数做严格校验（enum/范围/必填字段）；不要接收自由形态对象。
- 输出遵循 `{ ok: true } / { ok: false, error }` 统一契约。
- 输出必须默认脱敏：不能包含 endpoint、token、真实文件路径。
- 加入 `capabilities.describe` 的自描述（若该能力面向模型/用户）。

### 5.2 新增一个运维命令（slash 或 tool）

决策：

- **影响配置/重启/租约/账本**：优先确定性命令（可在插件内实现）+ 写操作仍走 `/config set`。
- **只读/诊断/生成报告**：可走 tool（结构化参数）+ 可粘贴分享输出。

最低要求：

- 明确写入门禁：owner/授权 + `configWrites`。
- 提供 `help` 子命令或 UI 快捷入口。
- 错误消息可操作（告诉用户应该改哪个 config key 或下一步命令）。

### 5.3 新增一个 status probe

建议：

- 默认只加入 deep；fast 只放关键少量。
- 失败不阻断：进入 `errors[]`。
- 允许通过参数控制超时/是否包含该 probe。

---

## 6. 与其他规范的关系

- 网关方法的错误码与响应格式：见 `web3-market-resource-api.md`。
- 安全与敏感信息约束：见 `web3-market-resource-security.md`。
- 运维/可观测性要求：见 `web3-market-resource-ops.md`。
- 测试矩阵：见 `web3-market-resource-testing.md`。
