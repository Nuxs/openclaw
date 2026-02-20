# OpenClaw Market Core Plugin

> 🧾 OpenClaw Web3 “自由市场”的权威执行层（资源 / 租约 / 账本 / 结算 / 争议）

`market-core` 是市场协议的**状态机与权威记账层**：它负责把“发布资源 → 下单/交付 → 租约签发 → 权威账本 → 结算/退款/撤销”的状态变更落到可审计的存储，并在需要时执行链上结算。

与 `web3-core` 的关系：

- **`web3-core`**：对外入口语义与体验层（推荐使用 `web3.*` / `web3.market.*`），并提供身份、审计、归档、计费等横切能力。
- **`market-core`**：对内/对运维的权威执行层（也会注册 `market.*` 低层方法；在产品化叙事上建议视为“底层 API”）。

## 快速开始

```bash
# 启用插件
pnpm openclaw plugins enable market-core

# 运行演示
cd extensions/market-core
node --import tsx demo.ts
```

## Gateway API（注册的 `market.*` 方法）

入口注册见 `src/index.ts`。主要分组：

- **Offers**：`market.offer.create` / `market.offer.publish` / `market.offer.update` / `market.offer.close`
- **Resources**：`market.resource.publish` / `market.resource.unpublish` / `market.resource.get` / `market.resource.list`
- **Orders**：`market.order.create` / `market.order.cancel`
- **Settlements**：`market.settlement.lock` / `market.settlement.release` / `market.settlement.refund` / `market.settlement.status`
- **Consents**：`market.consent.grant` / `market.consent.revoke`
- **Deliveries**：`market.delivery.issue` / `market.delivery.revoke` / `market.delivery.complete`
- **Leases**：`market.lease.issue` / `market.lease.revoke` / `market.lease.get` / `market.lease.list` / `market.lease.expireSweep`
- **Ledger**：`market.ledger.append` / `market.ledger.list` / `market.ledger.summary`
- **Disputes**：`market.dispute.open` / `market.dispute.submitEvidence` / `market.dispute.resolve` / `market.dispute.reject` / `market.dispute.get` / `market.dispute.list`
- **Transparency/ops**：`market.status.summary` / `market.metrics.snapshot` / `market.audit.query` / `market.transparency.summary` / `market.transparency.trace` / `market.repair.retry` / `market.revocation.retry`

## 安全与访问控制（强烈建议先配置）

`market-core` 支持通过配置限制访问：

- `access.mode`: `open | scoped | allowlist`
- allowlist/scopes/roles/clientIds：用于把写操作锁到受信客户端
- `access.requireActor` / `access.requireActorMatch`：用于约束 `actorId` 与买卖/支付身份匹配

默认值为 `open`，适合本地开发与演示，但**不建议在不受信环境直接暴露**。

## 数据存储

支持 `store.mode: file | sqlite`（默认 `sqlite`），用于保存市场状态与审计信息。

## 版本

- Version: `2026.2.16`（见 `package.json`）

## 许可证

MIT © OpenClaw Team
