---
summary: "EaaS 协议升级调研（2026 版）：面向 AI 私人管家与 Agent Economy 的协议栈、竞品与落地路线图（对外白皮书）"
title: "OpenClaw Agent Economy: Everything as a Service (EaaS) Protocol Upgrade Report (2026)"
doc_family: "web3"
doc_layer: "guide"
normative: false
---

# OpenClaw Agent Economy: Everything as a Service (EaaS) Protocol Upgrade Report (2026)

> 版本：2026-03-04（与愿景文档同日更新）
>
> 本文是对外白皮书：用于解释为什么要做 EaaS，OpenClaw 的差异化在哪里，以及“从资源市场升级到服务市场”的最短落地路径。
>
> 约束：本文所有示例均遵循最小披露（不包含 provider endpoint、token、真实本地路径等敏感信息）。更多约束见：[/reference/web3-market-output-redaction](/reference/web3-market-output-redaction)

## 1. 执行摘要（给决策者的 3 分钟）

### 1.1 核心判断

2026 的“AI 私人管家”正在从“回答问题”升级为三件事：

- **代表你行动（actions）**：跨应用、跨系统执行任务。
- **代表你持有与支付（wallet）**：购买服务、租赁能力、支付与结算。
- **代表你承担责任（audit/trace）**：事后可追责、可对账、可争议与仲裁。

行业主流的协议/平台（无论是 MCP、A2A 还是各类 Agent SDK）大多优先解决“连接与编排”，但很少把 **交易、结算、争议、审计、最小披露** 当作一等公民。

### 1.2 OpenClaw 的独特优势

OpenClaw 已通过 `web3-core` / `market-core` 落地了一个“可运维、可审计、默认脱敏、可结算”的 Agent 经济底座：

- 资源发布与租约（Lease）
- Provider 权威记账（Ledger）
- 托管结算（Escrow lock/release/refund）
- 争议处理（Dispute）
- 审计与可分享对账摘要（最小披露）
- 信誉/定价/奖励等经济机制

参考：[/plugins/web3-core](/plugins/web3-core)、[/plugins/market-core](/plugins/market-core)、[/reference/web3-market-dev](/reference/web3-market-dev)

### 1.3 最大缺口（也是升级抓手）

从“资源（model/search/storage）共享市场”走到“万物皆可服务（API/Human/RWA）”，关键不在再造市场，而在补齐并产品化三件套：

- **通用 Service Wrapper（服务封装）**：把异构价值封装成 Agent 可读、可交易对象。
- **Proof of Service（服务证明）**：证明交付发生、且可验证；支持 API/Human/RWA 三类路径。
- **人在环路验收与仲裁**：把非标品交易从“信任我”升级为“信任协议”。

路线图与规划（说明性，不等同于已实现）：[/reference/ai-steward-service-market-plan](/reference/ai-steward-service-market-plan)

---

## 2. 为什么是 2026：AI 私人管家正在收敛到 4 层架构

你要做的是“管家”，不是“聊天机器人”；护城河来自 **上下文、行动、权限与责任**。

### 2.1 个人上下文层（Personal Context / Memory）

趋势：端侧/本地优先成为主流叙事：更强隐私、更低延迟、更可控。

- 代表案例：Apple Intelligence 强调设备端处理与 Private Cloud Compute 的隐私承诺（官方：`https://www.apple.com/hk/en/apple-intelligence/`）。
- 开源范式：screenpipe 提出“record/search/automate，all local, all private, all yours”（项目：`https://github.com/screenpipe/screenpipe`）。

结论：一旦“个人行为数据层”建立，管家才能真正理解你在做什么，并对长期偏好进行预算与风险约束。

### 2.2 行动层（Actions / Tooling / App 操作）

趋势：从“工具调用”走向“跨应用动作编排”。关键是：**稳定可控地把意图变成动作**。

经验教训：Rabbit r1 的“Large Action Model”叙事证明用户渴望“别让我找 App，你替我做”，但也暴露了动作可靠性、延迟、可替代性等问题（例如 WIRED：`https://www.wired.com/story/rabbit-r1/`）。

结论：护城河不是一个设备，而是动作的 **可验证、可回滚、可审计**。

### 2.3 权限与安全层（Identity / Permission / Governance）

趋势：系统级助手必然走向“最小权限 + 透明可控”：能做什么、何时做、花多少钱、出了事怎么追责与止损。

### 2.4 经济层（Payments / Settlement / Dispute）

趋势：当管家开始“代表你购买服务/雇佣人/租赁资产”，经济层不可避免：报价、预算、托管、验收、结算、争议、信誉，以及对外可分享的最小披露对账摘要。

---

## 3. 协议与开源栈全景：互操作在加速，但经济协议仍稀缺

我们用一条清晰主线把外界拼起来：

**MCP（接入）→ ACP（通信）→ A2A（委托协作）→ ANP（开放网络）→ OpenClaw（交易与结算）**

### 3.1 MCP（Model Context Protocol）：事实标准正在形成（但它不解决交易）

- 定位：MCP 像 AI 应用的“USB-C 端口”，标准化连接外部数据源与工具（官方：`https://modelcontextprotocol.io/`）。
- 企业信号：微软在 Copilot Studio 中引入 MCP，强调连接器基础设施与治理（官方：`https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/introducing-model-context-protocol-mcp-in-copilot-studio-simplified-integration-with-ai-apps-and-agents/`）。

结论：MCP 解决“接入与工具目录”，但不定义报价、托管、证明、争议、信誉。因此它是 OpenClaw 的互补层，而不是替代。

### 3.2 ACP / A2A / ANP：互联互通的不同野心

- ACP（Agent Communication Protocol）：强调身份（AID）、接入点（AP）、会话与授权交易规范（官方：`https://acp.agentunion.cn/introduction/`）。
- A2A（Agent-to-Agent Protocol）：强调“不透明执行”的跨组织协作（官方：`https://www.a2aprotocol.net/zh/docs`）。
- ANP（Agent Network Protocol）：以“Agentic Web 的 HTTP”为愿景，分层包括 identity/meta-protocol/application（官方：`https://www.agent-network-protocol.com/`）。

学术综述：对 MCP/ACP/A2A/ANP 的对比与分阶段采用路线（arXiv：`https://arxiv.org/abs/2505.02279`）。

结论：这些协议在解决“互操作”，但离经济闭环仍差一层：**交易对象标准化（Service Wrapper）与交付可验证（Proof of Service）**。

### 3.3 Agent 编排框架：解决“如何跑”，不解决“如何结算”

以 OpenAI Agents SDK 为代表：抽象明确（Agents/Tools/Guardrails/Human-in-the-loop/Sessions/Tracing），并支持 MCP 等工具形态（项目：`https://github.com/openai/openai-agents-python`）。

结论：编排框架擅长多 agent 工作流与可观测性，但通常不提供托管结算/争议/最小披露审计这类经济基础设施。

---

## 4. OpenClaw 已实现能力：经济底座已具备，下一步是“服务一等公民”

### 4.1 已实现的硬能力（以仓内代码与文档为证）

- 单入口对外（编排层）：`web3-core` 提供 `web3.*` 与 `web3.market.*` 的网关方法、命令、工具与 hooks（见：[/plugins/web3-core](/plugins/web3-core)）。
- 市场权威执行层：`market-core` 提供内部权威 `market.*`（Offer/Order/Settlement/Dispute/Resource/Lease/Ledger 等，见：[/plugins/market-core](/plugins/market-core) 与 [/reference/web3-market-dev](/reference/web3-market-dev)）。
- 最小披露与默认脱敏：对外输出不泄露 endpoint/token/真实路径（见：[/reference/web3-market-output-redaction](/reference/web3-market-output-redaction)）。
- 可分享对账摘要：双栈支付与结算口径已定义（见：[/reference/web3-dual-stack-payments-and-settlement](/reference/web3-dual-stack-payments-and-settlement)）。

### 4.2 与 EaaS 愿景对齐的关键缺口

- **Service Wrapper 仍以“概念/规划”为主**：当前实现中对 service 主要以 `serviceSchema` 表达输入输出与 SLA，而愿景中 “Service Wrapper” 需要成为统一可交易对象模型（详见：[/reference/web3-everything-as-a-service-vision](/reference/web3-everything-as-a-service-vision)、[/reference/ai-steward-service-market-plan](/reference/ai-steward-service-market-plan)）。
- **Proof 的统一入口仍需演进**：当前已实现 `service` 专用的证明提交接口（`*.service.proof.*`），但“统一 proof.submit（覆盖 API/Human/RWA）”仍是规划项。
- **PendingVerification 等验证态尚未成为主流程状态机**：现有订单与结算状态机偏“交付完成即结算/或争议窗口”的模式；对“可验证交付”的细粒度状态与验收门禁需进一步固化。

---

## 5. 关键问题：AI 自动发现怎么做？是否要接 MCP？自由市场还需要吗？

### 5.1 AI 自动发现（Discovery）不是“找节点”，而是“找可交易 Offer”

Discovery 的对象应是 **可交易的 Offer/Resource/ServiceSchema**（将来演进到 Service Wrapper），并能被 Agent 按预算、SLA、信誉、证明方式、支付链支持进行比较。

建议的三段式发现：

1. **传播与查询承载（p2p）**：负责把“可用 Offer 的摘要元数据”分发出去。
2. **市场与合同层（market）**：负责可交易对象、定价、托管结算、争议与信誉。
3. **调用与编排层（tools/MCP）**：负责标准化工具调用、会话管理与观测。

### 5.2 是否链接 MCP：是，但按分层互补

- **MCP 负责“怎么调用工具”**。
- **OpenClaw Market 负责“该调用谁以及怎么付/怎么验/出事怎么办”**。

推荐两种互补集成方式：

- **Market as MCP server**：把市场动作封装为 MCP façade tools；当前最贴近实现的映射是 `web3.market.resource.list` / `web3.market.lease.issue` / `web3.market.service.proof.submit`，而下单与锁资则由受信服务端继续落到内部 `market.order.create` + `market.settlement.lock`。
- **Provider as MCP server (lease-gated)**：Provider 自己暴露 MCP server，但必须由 Market 发放 lease 后才允许调用（敏感连接信息永不出现在发现层）。

### 5.3 自由市场还需要吗：需要（p2p 不等于市场）

p2p 解决“路”，市场解决“规则与激励”。没有市场，你会卡在：无法规模化选择、无法低摩擦交易、无法形成供给侧激励、也难以形成可审计的可分享对账。

---

## 6. 最短落地路线图（对外表达版）

### Phase 1（现在到 Q2）Digital Services

- 把 `serviceSchema` 产品化为“可交易服务描述”（并保持最小披露）。
- 把 `service.proof.*` 做成可用闭环（先支持 TLSNotary/zkTLS 路线的一个子集）。

### Phase 2（Q3）Human Services

- 引入“人在环路验收”：多签回执、争议与仲裁节点接入。
- 让信誉/质押与争议成本形成可运行机制。

### Phase 3（Q4+）RWA Pilot

- 引入 Oracle（物流/IoT）与多源验证；严格预算门禁。

---

## 7. 继续阅读

- 愿景：[/reference/web3-everything-as-a-service-vision](/reference/web3-everything-as-a-service-vision)
- 规划：[/reference/ai-steward-service-market-plan](/reference/ai-steward-service-market-plan)
- 开发规范（现状接口与状态机）：[/reference/web3-market-dev](/reference/web3-market-dev)
- 资源共享 API：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
- 双栈支付与对账：[/reference/web3-dual-stack-payments-and-settlement](/reference/web3-dual-stack-payments-and-settlement)
- 输出脱敏验收：[/reference/web3-market-output-redaction](/reference/web3-market-output-redaction)
- 工具与命令评审：[/reference/web3-market-tools-review](/reference/web3-market-tools-review)
