---
summary: "Web3 Market 发布说明模板：统一发布摘要、风险、观察项、回滚入口与 operator sign off。"
title: "Web3 Market Release Notes"
doc_family: "web3"
doc_layer: "reference"
normative: true
---

# Web3 Market Release Notes

> 本页提供 **Web3 Market / PayFi 发布说明模板**。`runbook` 定义门禁、降级和回滚动作，`go-live evidence` 记录核验结果，本页负责沉淀面向审批、值班交接和发布沟通的摘要。

## 1. 适用范围

- **适用对象**：Web3 Market、PayFi、Preset baseline verify、Provider onboarding、Buyer execution、Discovery/index 相关发布。
- **默认原则**：只记录 paste-safe 摘要，不记录 token、endpoint、真实路径或可复用凭证。
- **最小要求**：每份发布说明都必须引用最新一轮 `release-check`、baseline verify、operator drill 和 rollback drill 结论。

## 2. 发布摘要模板

```text
Release: 2026-03-XX-web3-market
Channel: stable | beta | internal
Owner: <owner>
Window: 2026-03-XXT09:00Z -> 2026-03-XXT10:00Z
Mode: trusted-circle
Scope:
- Provider onboarding / Buyer execution / MDL health / PayFi gate
Summary:
- <一句话说明本次发布目标>
Gate status:
- release-check: pass
- baseline verify: pass with 1 warn
- operator release gate: pass
Evidence bundle:
- <link or PR reference>
```

## 3. 本次变更

- **产品面**：描述本次用户可感知变化，例如 Provider 上架向导、Buyer 审批卡、MDL 健康面板。
- **运行面**：描述本次运维或门禁收敛，例如 verify 输出、release-check、evidence 模板、回滚脚本。
- **边界说明**：明确这次发布没有覆盖的能力，避免把原型或远期路线写成现状。

## 4. 风险与观察项

| 项目              | 预期风险                   | 观察指标                | 处理策略                         |
| ----------------- | -------------------------- | ----------------------- | -------------------------------- |
| Payment / autopay | 失败率升高、重复扣款风险   | `x402.autopay.*`        | 达阈值立即降级到手动支付         |
| Settlement        | release 卡住或 refund 异常 | `settlement.*`          | 切换 `anchor_only`，保留审计     |
| Discovery         | `libp2p` 不稳定、索引为空  | `web3.index.*`          | 回退 `static` backend 或成功缓存 |
| Provider publish  | provider.offers 不完整     | preset preview / verify | 阻塞发布，补齐模型 offer         |

## 5. 放行前证据

至少附带以下链接或片段：

- `scripts/release-check.ts` 结果
- `/web3-market verify <mode>` 摘要
- `web3.wallet.balance` 真探针摘要
- `web3.index.list` / discovery 健康摘要
- 一次 payment / settlement drill 摘要
- 一次 rollback drill 摘要
- Control 面 operator 复核片段

详情模板见 [/reference/web3-market-go-live-evidence](/reference/web3-market-go-live-evidence)。

## 6. 回滚与降级

发布说明必须包含至少一个明确可执行的回滚入口：

- **支付降级**：关闭 x402 autopay 开关，回退到手动支付。
- **结算降级**：把 `settlement.mode` 调整为 `anchor_only`。
- **Discovery 降级**：把 `discovery.backend` 调整为 `static`，并确认本地 index / gossip 查询面仍可解释。
- **代码回滚**：按 [/reference/web3-ga-runbook](/reference/web3-ga-runbook) 执行回滚步骤。

建议在发布说明里明确：触发条件、执行人、验证人、恢复条件和预计恢复窗口。

## 7. Operator sign off

```text
Operator: <name>
Reviewer: <name>
Decision: go | hold | rollback
Reason:
- <一句话结论>
Timestamp: 2026-03-XXT10:15:00Z
```

## 8. 相关文档

- Web3 GA Runbook：[/reference/web3-ga-runbook](/reference/web3-ga-runbook)
- Web3 Market Go Live Evidence：[/reference/web3-market-go-live-evidence](/reference/web3-market-go-live-evidence)
- Web3 Market 开发文档：[/reference/web3-market-dev](/reference/web3-market-dev)
