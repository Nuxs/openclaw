# 🌐 OpenClaw：开源 Web3 浏览器项目调研（审核版）

> 这份文档是对上一版调研的“校准+收敛”。目标是：**减少不确定断言**、**明确“浏览器 vs 钱包/连接组件”边界**、并给出**更可落地**、更贴合 OpenClaw（插件 + Gateway + 多端）的路线。

## ✅ 先给结论（更贴合 OpenClaw 的“最契合”）

如果你说的“Web3 浏览器项目”是指**让用户在浏览 DApp 的同时，被 OpenClaw 审计/计费/归档**：

- **最契合 OpenClaw 的开源路线**不是从零造浏览器，而是：
  - **桌面端**：用 **现成浏览器（Brave/Chromium 系）+ 我们做浏览器扩展** 作为“OpenClaw 增强层”。
  - **移动端/应用内**：用 **系统 WebView + WalletConnect/Web3Modal 类连接组件**（作为“钱包连接层”）+ 我们做“WebView ↔ Gateway”的 bridge。

原因很简单：OpenClaw 的强项在 **Gateway/插件的可观测性、审计、策略/计费、归档与链上锚定**，而完整浏览器内核的投入/维护成本极高；把浏览器当“宿主”，我们只做**增强层**，ROI 最大。

## 1) 概念澄清：你要的“Web3 浏览器”是哪一类？

把“Web3 浏览器”拆成 4 类后，选择会变清晰：

- **A. 完整浏览器（Browser App）**：像 Brave，直接给用户一个浏览器。
- **B. 移动端 Web3 超级应用（Superapp with browser）**：像 Status，内置浏览器/钱包/消息等。
- **C. 钱包扩展（Wallet Extension）**：像 MetaMask/Rabby，运行在 Chrome/Brave 等浏览器里，通过注入 `window.ethereum` 支持 DApp。
- **D. 应用内 DApp Browser（WebView Container）**：你自己的 App 内嵌 WebView，再接钱包连接与安全策略。

OpenClaw 现状更天然适配 **C + D**（我们做“策略/审计/归档/计费”的横切增强），而不是去承担 A 的全栈浏览器维护。

## 2) 候选开源项目（只保留能核对/可引用的核心信息）

### 2.1 Brave（完整浏览器，Chromium 系）

- **仓库**：`https://github.com/brave/brave-browser`
- **License**：**MPL-2.0**（已核对）
- **定位**：跨平台浏览器（Android/iOS/Linux/macOS/Windows），基于 Chromium。

适用：

- 你想要“现成浏览器 + 我们用扩展注入 OpenClaw 能力”，Brave 是很现实的宿主选择。

注意：

- 上一版里“MIT 许可证”“虚构的 `@brave/wallet-api` SDK”“BAT 可直接打通计费”等表述，**在没有明确来源/实现路径前都不成立**，已在本版删除。

### 2.2 Status（移动端开源 Web3 应用，含浏览器）

- **仓库**：`https://github.com/status-im/status-mobile`
- **License**：**MPL-2.0**（已核对）
- **定位**：其项目描述明确包含 “browser”。

适用：

- 你要一个“移动端开源 Web3 浏览器/入口”作为参考实现（尤其是产品形态/安全边界/链上交互 UX），Status 是强候选。

注意：

- 这类项目通常体量大、耦合深（钱包/消息/节点等），更适合“参考/对标”，不一定适合直接嵌入到 OpenClaw。

### 2.3 MetaMask Extension（钱包扩展：让任意 Chromium 浏览器变成 Web3 浏览器）

- **仓库**：`https://github.com/MetaMask/metamask-extension`
- **定位**：浏览器扩展，通过注入 provider 支持浏览以太坊相关网站（项目简介即是如此）。
- **License**：请以仓库 `LICENSE` / “View license” 为准（本次抓取未直接返回协议文本）。

适用：

- 如果“Web3 浏览器”在你们语境里=“能浏览 DApp、能弹出签名、能发交易”，**钱包扩展才是核心组件**。

### 2.4 Rabby（钱包扩展）

- **仓库**：`https://github.com/RabbyHub/Rabby`
- **定位**：EVM 系多链钱包扩展（仓库描述如此）。
- **License**：请以仓库 `LICENSE` / “View license” 为准（本次抓取未直接返回协议文本）。

适用：

- 同上，作为“让浏览器具备 Web3 能力”的钱包层；我们在其上叠加 OpenClaw 审计/策略层。

## 3) 与 OpenClaw 的“最小可行集成”应该长什么样？

这里给一个更**真实可实现**、也更“OpenClaw 风格”的集成切面：

### 3.1 桌面端：浏览器扩展作为“OpenClaw 增强层”

扩展要做的不是替代钱包，而是：

- **观测**：DApp 导航、provider 请求、签名/交易请求、链/账号变更
- **上报**：把关键事件发给 OpenClaw Gateway（用于审计/计费/归档/链上锚定）
- **策略**（可选）：在交易/签名前做提示或阻断（由 Gateway 下发策略）

**关键点**：不要依赖某个浏览器私有 API；用通用 Web3 标准接口：

- **EIP-1193 provider**：`window.ethereum.request(...)`
- provider 事件：`accountsChanged`、`chainChanged`

一个更稳妥的实现方式是：

- `content_script` 注入一段脚本，包装 `window.ethereum.request`，将请求摘要（方法名、目标链、dapp 域名、时间戳、可选 hash）通过 `postMessage` 传给扩展。
- 扩展 `background/service_worker` 再把事件发给 Gateway（HTTP/WebSocket 任一）。

这样我们能做到：

- **钱包无关**（MetaMask/Rabby/Brave Wallet 都可用）
- **浏览器无关**（Chrome/Brave/Edge 等 Chromium 系都可用）
- 只要 DApp 用标准 provider，就可观测。

### 3.2 移动端/应用内：WebView 容器 + Bridge

思路相同：WebView 是宿主，钱包连接是组件（WalletConnect/Web3Modal 类），OpenClaw 是增强层。

- 在 WebView 内注入 `window.openclaw` bridge
- 通过 bridge 把关键 Web3 行为上报 Gateway
- Gateway 统一做审计、计费、归档、锚定

## 4) 职责拆分与接口边界（规范）

### 4.1 `web3-core` 负责什么（事实边界）

- **身份与 SIWE**：命令 `/bind_wallet`、`/unbind_wallet`、`/whoami_web3`；Gateway 方法 `web3.siwe.challenge`、`web3.siwe.verify`（见 `extensions/web3-core/src/index.ts`）。
- **审计与归档**：`llm_input`/`llm_output`/`after_tool_call`/`session_end` hooks 生成 `AuditEvent`，落盘到 `web3/audit-log.jsonl`，可选 IPFS 归档与链上锚定（见 `extensions/web3-core/src/audit/hooks.ts`、`extensions/web3-core/src/state/store.ts`）。
- **链上锚定**：通过 `EvmChainAdapter` 以 calldata 写入 `OPCLAW:<anchorId>:<payloadHash>`（见 `extensions/web3-core/src/chain/evm/adapter.ts`）。
- **计费与配额**：`web3.billing.status`/`web3.billing.summary` + 计费 guard；**`/pay_status` 仍是占位输出**，不代表真实链上支付已完成（见 `extensions/web3-core/src/index.ts`、`extensions/web3-core/src/billing/commands.ts`）。

### 4.2 `market-core` 负责什么（事实边界）

- **交易闭环与结算**：`market.settlement.lock/release/refund` 通过 `EscrowAdapter` 触发真实链上交易（见 `extensions/market-core/src/market/handlers.ts`）。
- **业务状态机**：Offer/Order/Delivery/Consent 等全流程状态机，且具备 `market.status.summary`、`market.audit.query`、`market.transparency.*`（见 `extensions/market-core/src/index.ts`）。
- **审计与锚定**：业务事件会 `recordAudit`，并在可配置时锚定链上（同上）。

### 4.3 边界原则（必须遵守）

- **支付/结算以 `market-core` 为事实来源**，`web3-core` 不再独立造支付状态。
- **审计链路以 `web3-core` 为横切能力**，`market-core` 的审计仍可保留，但需要统一的“审计入口/格式”以便归档与锚定共用。

## 5) 数据链路走查（现状 + 确定缺口）

- **`web3-core` 审计链路**：hooks → `handleAuditEvent` → 可选 IPFS 归档 → 可选链上锚定 → `web3/audit-log.jsonl`（已实现）。
- **`market-core` 结算链路**：`market.settlement.*` → `EscrowAdapter` → `recordAuditWithAnchor`（已实现）。
- **明确缺口**：
  - `web3-core` 的 `/pay_status` 仍为占位，**没有“链上支付闭环”。**
  - **浏览器侧事件目前无法进入 Gateway**（已补上：`browser-extension` + `web3-core` 插件 HTTP ingest）。

## 6) 实现计划（不留 TODO，交付可执行）

### 6.1 支付闭环（以 `market-core` 为准）

- **输入**：`orderId`/`orderHash`（由 `market.order.create` 返回）。
- **处理**：
  - 在 `market-core` 增加 `market.settlement.status` 方法，输出 `lockTx`/`releaseTx`/`refundTx` 与当前结算状态。
  - 将 `/pay_status` 在 `web3-core` 调整为“指向市场结算状态的提示命令”，避免误导。
- **输出**：
  - `market.settlement.status` 作为唯一结算状态源。
  - `web3.billing.status` 仅保留“配额/usage”维度。

### 6.2 浏览器扩展原型（已落仓，可直接加载）

- **扩展目录**：`extensions/web3-core/browser-extension/`
- **能力**：
  - 注入脚本包装 `window.ethereum.request`。
  - 采集 `method` + `origin` + `chainId` + `requestId` + `ok/durationMs`。
  - 通过 `POST http://127.0.0.1:18789/plugins/web3-core/ingest` 上报。
- **Gateway 接收**：`web3-core` 插件新增 HTTP ingest（受 `browserIngest` 配置控制），把事件落为 `AuditEvent(kind="dapp_request")`。

### 6.3 端到端验证（确定性步骤）

- **浏览器侧**：在 Chrome/Brave 里加载 `extensions/web3-core/browser-extension/` → 打开任意 DApp → 触发一次 `window.ethereum.request`。
- **Gateway 侧**：调用 `web3.audit.query` 查看新增的 `dapp_request` 事件（落盘文件为 `web3/audit-log.jsonl`）。

## 7) 更优雅的“推荐话术”与决策表

### 7.1 推荐话术（对内沟通）

- **我们不选一个“Web3 浏览器项目”来当核心**；我们选一个“宿主”（浏览器/WebView）+ 一个“钱包层”（扩展/连接组件），然后把 OpenClaw 的 Web3 Core 做成跨宿主的“策略与审计层”。

### 7.2 决策表（按目标选择）

| 目标                              | 最优选型                                          | 理由                                       |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------ |
| 桌面端最快落地                    | **Chrome/Brave + 钱包扩展 + OpenClaw 扩展**       | 宿主成熟，钱包成熟，我们只做增强层         |
| 移动端 App 内 DApp 浏览           | **WebView + WalletConnect/Web3Modal 类 + Bridge** | 能控 UX，能做安全沙箱与策略                |
| 找一个开源“Web3 浏览器产品”做对标 | **Status**                                        | 项目定位明确含 browser，开源且体系完整     |
| 真的要做“自有浏览器”              | **以 Chromium/Brave 为基础 fork（极重）**         | 工程量与长期维护巨大，只建议在战略驱动下做 |

## 8) 需要删除/修正的点（对上一版的审计记录）

- **已删除**：把 Brave 描述为 “MIT 许可证”（已核对为 MPL-2.0）。
- **已删除**：`@brave/wallet-api` 之类“看似合理但实际不存在/未证明”的 API 示例。
- **已收敛**：关于“链支持范围”“体积大小”“官方维护关系”等缺少证据的量化描述。
- **已澄清**：把“浏览器项目”和“钱包连接组件/钱包扩展”分开讨论，避免概念混淆。
