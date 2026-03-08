---
summary: "Historical bridge doc for the older Web3 free-market design. Use current EaaS and Web3 Market docs for implemented behavior."
read_when:
  - You are reviewing historical free-market design ideas or earlier gate definitions
  - You need context on superseded Web3 market plans and drafts
  - You want non-normative background for current Web3 market reference docs
title: "OpenClaw Web3 自由市场技术文档"
doc_family: "web3"
doc_layer: "historical"
normative: false
---

# OpenClaw Web3 自由市场技术文档

> 本文现已降级为 **历史桥接文档**。
>
> 它保留“自由市场”阶段的一些设计思路（动态定价、评分、订单簿、市场 UI 等），但这些内容不应再被当作当前实现规范。

## 现在应该读什么

### 用户与产品心智

- Web3 Market 概览：[/concepts/web3-market](/concepts/web3-market)
- EaaS 愿景：[/reference/web3-everything-as-a-service-vision](/reference/web3-everything-as-a-service-vision)
- EaaS 白皮书：[/reference/web3-eaas-protocol-upgrade-report-2026](/reference/web3-eaas-protocol-upgrade-report-2026)

### 当前实现与协议真相

- Web3 Market 开发文档：[/reference/web3-market-dev](/reference/web3-market-dev)
- 资源共享 API：[/reference/web3-resource-market-api](/reference/web3-resource-market-api)
- 双栈支付与结算：[/reference/web3-dual-stack-payments-and-settlement](/reference/web3-dual-stack-payments-and-settlement)
- `web3-core` 插件：[/plugins/web3-core](/plugins/web3-core)
- `market-core` 插件：[/plugins/market-core](/plugins/market-core)

### 规划与演进方向

- EaaS 研发计划：[/reference/ai-steward-service-market-plan](/reference/ai-steward-service-market-plan)
- EaaS 协议规范：[/reference/web3-eaas-protocol-spec](/reference/web3-eaas-protocol-spec)
- EaaS 开发指南：[/reference/web3-eaas-developer-guide](/reference/web3-eaas-developer-guide)

## 这份历史文档还剩什么价值

它仍然可以帮助理解早期的产品方向与探索主题：

- 动态定价与价格发现
- 信誉评分与反作弊
- 市场仪表盘与可视化
- 订单簿 / 撮合 / 竞争机制
- 更强的自由市场叙事

这些内容今天仍然有参考价值，但属于：

- **历史设计输入**
- **产品想法池**
- **尚未完全产品化的方向**

而不是当前的运行时契约。

## 使用建议

如果你的问题是以下任一类，请不要再以本文为第一入口：

- “现在已经实现了哪些接口？”
- “当前状态机怎么走？”
- “服务证明、双栈支付、对账、争议的权威口径是什么？”
- “Agent 怎么接 MCP / Discovery / Service Wrapper？”

这些问题请改读上面的当前文档。

## 历史结论与今天的关系

可以把这份文档理解成一个旧阶段的总装草稿：

- 它提出了“自由市场需要什么”的很多命题；
- 今天的 `web3-core` / `market-core` 已经把其中一部分落成了可运行底座；
- 新增的 EaaS 文档则把“愿景、协议、开发指南、计划”拆分成更准确的层次。

因此，本页保留路径与上下文价值，但不再承担“完整技术文档”的角色。
