---
summary: "Web3 Market go-live evidence：整理 bootstrap、钱包、支付、Discovery、Provider 发布前检查与 operator 留痕模板。"
title: "Web3 Market Go Live Evidence"
doc_family: "web3"
doc_layer: "reference"
normative: true
---

# Web3 Market Go Live Evidence

> 本文用于沉淀 **Web3 Market go-live 的可复核证据**。`runbook` 负责操作顺序、故障处置与回滚；本页负责记录 **检查结果、样例片段与 operator 留痕模板**。

## 1. Evidence 原则

- **同一口径**：CLI、Gateway 和 Control 面必须引用同一组 readiness 事实，避免出现“命令行通过但控制台不通过”的双口径。
- **最小披露**：证据中只保留模式、检查项、状态、计数、时间戳与建议动作；不得记录 token、endpoint、真实路径或可复用凭证。
- **可复制**：每条 evidence 都应该说明来自哪个命令、哪个界面或哪个接口，便于另一位 operator 复核。
- **可分享**：默认采用 paste-safe 片段，便于直接贴到 issue、PR、值班交接或发布审批流中。

## 2. 必备证据矩阵

| 证据项                     | 来源                                                        | 通过标准                                              | 建议留痕                           |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------- |
| Source/package gate        | `scripts/release-check.ts`                                  | 发布包、source gate、release artifacts 全部通过       | 记录脚本版本、执行时间、结果       |
| Bootstrap baseline         | `/web3-market verify <mode>` 或 `web3.market.preset.verify` | 返回 pass/warn/fail 与 `recommendedActions`           | 记录模式、摘要、失败项、下一步动作 |
| Wallet readiness           | `web3.wallet.balance`                                       | 至少一个钱包探针成功                                  | 记录链、符号、余额是否可读         |
| Payment readiness          | `web3.market.preset.verify` + staging autopay 演练          | payment gate 通过，且至少一次 autopay 演练成功        | 记录 gate 状态、演练时间、结果编号 |
| Discovery health           | `web3.index.stats` / `web3.index.list`                      | 多机模式下至少发现一个 provider；单机模式下结果可解释 | 记录 provider 数、资源数、模式     |
| Provider publish preflight | `web3.market.preset.preview`                                | `detectedProviders`、`provider.offers`、建议动作齐全  | 记录角色、运行时、缺失项           |
| Control 面 operator 复核   | `Operations & Health` / `Preset Baseline Gates`             | 与 CLI 呈现相同的 readiness 事实                      | 记录时间、模式、告警数、关键 gate  |
| Release / rollback drill   | runbook 演练记录                                            | 降级、恢复、回滚路径至少各完成一次                    | 记录触发条件、执行动作、恢复结论   |
| Release notes              | `Web3 Market Release Notes`                                 | 发布摘要、风险、观察项、回滚入口、sign off 齐全       | 记录审批链接、owner、evidence 链接 |

## 3. 推荐留痕顺序

1. 先执行 `scripts/release-check.ts`，确认 source/package gate 与 release artifacts 已齐全。
2. 执行 `web3.market.preset.preview`，确认模式、角色和 Provider 线索。
3. 执行 `/web3-market verify <mode>`，记录 baseline readiness 摘要。
4. 在 Control 面 `Operations & Health` 中复核 wallet/payment/discovery/settlement gates。
5. 完成一次 Provider 发布前检查、一次消费链路验证，以及至少一次钱包 / index / payment drill。
6. 记录一次降级或回滚演练结果，并把摘要写入发布说明。

## 4. CLI 留痕模板

```text
Date: 2026-03-16T09:30:00Z
Mode: trusted-circle
Source: /web3-market verify trusted-circle
Summary: 8 pass / 1 warn / 0 fail
Warnings:
- resource.publish · 尚未发布资源。
Recommended actions:
- 补齐 provider offers 后执行发布资源。
- 从 consumer 发起一次租约并完成调用。
```

> 如果需要贴到审批流，优先保留 `Mode`、`Summary`、`Warnings` 与 `Recommended actions`，不要附带敏感原始 payload。

## 5. Control 面留痕模板

```text
Surface: Market Control > Operations & Health
Observed at: 2026-03-16T09:35:00Z
Mode: trusted-circle
Active alerts: 0
Discovery: OK
Payment: OK
Settlement: OK
Preset summary: 8 pass / 1 warn / 0 fail
Open actions:
- 补齐 provider offers 后执行发布资源。
```

## 6. Provider 发布前模板

| 字段               | 示例                          | 说明                           |
| ------------------ | ----------------------------- | ------------------------------ |
| Mode               | `trusted-circle`              | 与部署拓扑一致                 |
| Intent             | `provider`                    | 供给优先                       |
| Detected providers | `ollama`, `lmstudio`          | 只记录运行时标签               |
| Offer readiness    | `warn`                        | 缺模型 offer 时标记            |
| Publish blockers   | `provider.offers empty`       | 阻塞项写清楚                   |
| Next action        | `补齐 provider.offers.models` | 应与 preview / verify 输出一致 |

## 7. 演练与审批建议

- **值班交接**：至少附带最新一份 CLI verify 结果和一份 Control 面复核片段。
- **发布审批**：必须同时附带 runbook 中的必过项状态、本页 evidence 模板和一份发布说明摘要。
- **回归验证**：每次修改 `preset verify`、ops 面或 Provider onboarding 后，都要更新 evidence 样例。

## 8. 建议产物结构

建议把一次 go-live 的可分享产物打包为：

- `release-check` 执行结果
- baseline verify 摘要
- wallet / discovery / payment / settlement drill 摘要
- rollback drill 记录
- 发布说明（见 [/reference/web3-market-release-notes](/reference/web3-market-release-notes)）

## 9. 相关文档

- Web3 GA Runbook：[/reference/web3-ga-runbook](/reference/web3-ga-runbook)
- Web3 Market Release Notes：[/reference/web3-market-release-notes](/reference/web3-market-release-notes)
- Web3 Market 概览：[/concepts/web3-market](/concepts/web3-market)
- Web3 Market 开发文档：[/reference/web3-market-dev](/reference/web3-market-dev)
- 输出脱敏验收：[/reference/web3-market-output-redaction](/reference/web3-market-output-redaction)
