---
summary: "Web3 Market 对外输出脱敏验收清单：禁止字段、审查面与抽样步骤"
title: "Web3 Market Output Redaction Checklist"
---

## 目标与范围

本清单用于验证 Web3 Market 对外输出的最小披露规则是否被严格执行，覆盖 Gateway RPC、Tools 输出、Provider HTTP routes 与 UI/CLI 状态面。

## 禁止字段与泄露信号

以下内容在任何对外输出中都必须被移除或替换：

- `accessToken` 明文或其原始值
- Provider endpoint 或任何可直接访问的网络地址
- `Authorization` 头或其派生值
- 真实文件系统路径与可定位的本地目录结构
- 原始上游错误文本中包含的 endpoint、token、路径

## 必须审查的输出面

- **Gateway RPC**
  - `web3.*` 对外入口响应
  - `market.*` 内部接口的对外转译输出
- **Tools 输出**
  - `web3.search.query`
  - `web3.storage.put/get/list`
  - `web3.market.*` 编排工具输出
- **Provider HTTP routes**
  - `/web3/resources/*` 的错误响应与日志输出
- **CLI 与 UI 状态面**
  - `web3.status.summary`
  - `web3.market.status.summary`
  - `web3.monitor.snapshot`
  - `web3_market_status` 工具输出

## 抽样检查步骤（最小集）

1. **租约签发**：确认 `web3.resources.lease` 与 `web3.market.lease` 不回显 token 或 endpoint。
2. **索引发现**：确认 `web3.index.list` 不返回 endpoint。
3. **工具输出**：确认 `web3.search.query` 与 `web3.storage.*` 输出无 token、endpoint、真实路径。
4. **错误路径**：在权限失败、参数缺失、上游失败等代表性错误下，输出仍不包含敏感字段。
5. **状态面**：UI/CLI/工具输出均可直接分享且不暴露敏感信息。

## 验收通过标准

- 抽样输出中未出现任何禁止字段
- 发现异常时可追溯到具体输出面并具备修复路径

## 相关文档

- Web3 Resource Market API: [/reference/web3-resource-market-api](/reference/web3-resource-market-api)
