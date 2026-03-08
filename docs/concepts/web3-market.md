---
summary: "OpenClaw Web3 Market 概览：AI 管家为你发现、租用、支付与验收服务、资源与现实世界资产。"
read_when:
  - You want to use OpenClaw with wallets, on-chain anchoring, and decentralized archives
  - You want the default Web3 payment policy (escrow) and user-facing flows
  - You are onboarding users to Web3 market mode
  - You want to understand what the Agent Economy means for end users
title: "Web3 Market (概览)"
doc_family: "web3"
doc_layer: "guide"
normative: false
---

## 什么是 Web3 Market 模式

可以把 Web3 Market 理解成 **"属于 AI Agent 的淘宝 + 支付宝"**。

在传统互联网里，你要自己搜索、比价、沟通、付款、确认收货；在 OpenClaw 里，这些复杂步骤可以交给 **AI 管家（Steward）** 代办。

- **你只做少量决策**：买什么、卖什么、预算多少、是否执行、以及可选的支付链。
- **复杂执行由 AI 管家完成**：发现资源、签发租约、代管一次性 token（不回显）、调用服务、记账、进入结算队列、生成可审计记录。

它强调两个底层原则：

- **最小披露**：`accessToken`、Provider endpoint、真实路径属于敏感资产，不能出现在文档示例、日志、错误消息或状态输出里。
- **可审计**：关键动作可被追踪，便于对账、仲裁和回放。

## 它不只是"算力市场"

Web3 Market 的长期目标不是只卖 GPU 或 API，而是走向 **Everything as a Service (EaaS)**：

- **数字服务**：搜索、数据查询、模型推理、自动化工作流
- **人类服务**：代码审查、咨询、创作、运营等可验收劳务
- **现实世界资产（RWA）**：设备、物流、租赁物、IoT 驱动的交付对象

### 例子一：租一只猫

你对 AI 说："我想周末租一只布偶猫，预算 $50。"

AI 管家会替你完成：

1. 发现可交易 Offer
2. 锁定预算与签发租约
3. 根据物流或 IoT 信号验证交付
4. 确认无误后释放款项

### 例子二：找人审代码

你对 AI 说："帮我找个安全专家审一下这段代码。"

AI 管家会替你完成：

1. 根据价格、信誉、SLA 选择服务方
2. 锁定咨询费
3. 收集交付证明（例如 `tlsnotary`）
4. 进入自动结算或争议流程

## 当前已经实现了什么

截至当前仓库实现，Web3 Market 已经具备一条可运行的底座：

- **资源发布与租约**：`web3.market.resource.*`、`web3.market.lease.*`
- **账本与结算**：`web3.market.ledger.*`、`web3.market.settlement.query`
- **争议与状态摘要**：`web3.market.dispute.*`、`web3.market.status.summary`
- **服务类证明**：`web3.market.service.proof.*`
- **双栈支付口径**：默认 EVM；TON 端到端结算主路径已实现，并统一到同一对账摘要口径
- **任务市场协议**：`web3.market.task.*`——任务发布、竞标、授标、交付、验收、回执、争议全闭环
- **隐私与 Consent 闭环**：`web3.market.consent.*`、`web3.market.privacy.assets`、`web3.market.privacy.replay.*`、`web3.market.privacy.erase`——授权管理、知识资产脱敏、撤销后合规回放、删除/保留策略
- **Discovery 身份映射**：DID/Key 到 PeerID 映射、去重、新鲜度管理、P2P 不可用时 static/HTTP 回退
- **监控与告警**：规则化告警引擎，覆盖支付、结算、Discovery、任务、隐私维度

用户侧看到的是一个"可购买、可结算、可追责、可竞标、可验收"的体验层；底层仍由 `web3-core` 与 `market-core` 负责权威执行。

### 任务市场协议

任务市场是在现有 Offer/Order/Settlement 基础上的增量协议，支持人类服务与 Agent 协作：

1. **发布任务**（`publishTask`）：设置需求、预算、截止日期与验收标准
2. **竞标与授标**（`placeBid` / `awardBid`）：多方竞标，卖家选择最佳竞标者并自动创建订单与结算锁定
3. **交付与验收**（`submitResult` / `reviewResult`）：交付物提交、买家验收（通过/拒绝）、自动触发结算释放或争议
4. **回执与审计**（`getReceipt` / `listReceipts`）：全流程可审计的交付回执

### 隐私与 Consent

- **授权管理**：查看活跃/撤销/过期的授权范围与知识资产分类
- **合规回放**：撤销后可生成包含脱敏摘要、保留策略、审计事件的合规回放记录
- **删除/保留策略**：基于授权条款自动推导 `erase` / `retain_anonymized` / `retain_with_consent` 策略
- **知识资产脱敏**：所有输出默认脱敏，不返回 token、endpoint、真实路径

## 还在演进什么

如果把今天的 Web3 Market 看作"资源共享市场 + 服务证明 + 任务市场"，那么下一阶段的重点是：

- 更通用的 **Service Wrapper**（统一表达数字服务 / 人类服务 / RWA）
- 更统一的 **Proof of Service** 提交与验证入口
- 更明确的 **人在环路验收 / 仲裁 / 预算门禁**
- 更强的 **Discovery + MCP 接入**，让 Agent 自动发现并安全调用可交易能力
- **A2A 任务协作**：跨 Agent 任务标识贯通（taskId/orderId/proofId/settlementId）
- **GA 发布门禁与运维 Runbook**：覆盖降级、回滚、值班处置与验收清单

## 用户视角的极简流程

### 卖资源（赚钱）

1. **发布资源**：选择你要提供的能力，设置价格与规则。
2. **等待租用**：AI 管家负责签发租约、发放一次性 token，并在后台维护生命周期。
3. **查看收益与结算状态**：你只看结果（收入、待结算、失败重试等）。

### 买资源（省钱或补能力）

1. **发现并选择资源**：你看到的是摘要信息（能力、价格、SLA、信誉），而不是 endpoint。
2. **选择支付网络并租用**：当前默认走 EVM；TON 已纳入统一双栈结算口径。
3. **发起使用并查看对账**：AI 管家自动路由到正确 Provider；你看到脱敏后的账本、escrow 与对账摘要。

## 与系统工具的关系

- **`web_search` / `browser`**：OpenClaw 的通用执行工具，用于搜索网页、浏览页面和执行通用流程。
- **Web3 Market**：OpenClaw 的可选协议层，用于能力的发现、租约、记账、结算与争议。
- 即使某个资源类型是"搜索"，它也不等同于内置 `web_search`：market 里的搜索能力来自外部 Provider，具备 **可计费、可审计、可结算** 的属性。

## 常见误区

- **这不是炒币工具**：区块链在这里主要承担支付、托管、证明、审计与仲裁，不是金融投机本身。
- **p2p 不等于市场**：p2p 负责传播和发现，市场负责合同、结算、争议与信誉。
- **MCP 不等于市场**：MCP 更像"怎么接工具"；Web3 Market 解决的是"该调用谁、怎么付钱、怎么验收、出事怎么办"。

## 相关文档

- `web3-core` 插件：[/plugins/web3-core](/plugins/web3-core)
- `market-core` 插件：[/plugins/market-core](/plugins/market-core)
- Web3 Market 开发文档：[/reference/web3-market-dev](/reference/web3-market-dev)
- Web3 资源共享 API 契约：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
- 双栈策略总规划：[/web3/WEB3_DUAL_STACK_STRATEGY](/web3/WEB3_DUAL_STACK_STRATEGY)
- 双栈支付与结算参考：[/reference/web3-dual-stack-payments-and-settlement](/reference/web3-dual-stack-payments-and-settlement)
- EaaS 愿景：[/reference/web3-everything-as-a-service-vision](/reference/web3-everything-as-a-service-vision)
- EaaS 白皮书：[/reference/web3-eaas-protocol-upgrade-report-2026](/reference/web3-eaas-protocol-upgrade-report-2026)
- EaaS 协议规范：[/reference/web3-eaas-protocol-spec](/reference/web3-eaas-protocol-spec)
- EaaS 开发指南：[/reference/web3-eaas-developer-guide](/reference/web3-eaas-developer-guide)
- EaaS 研发计划：[/reference/ai-steward-service-market-plan](/reference/ai-steward-service-market-plan)
- GA 运维 Runbook：[/reference/web3-ga-runbook](/reference/web3-ga-runbook)
