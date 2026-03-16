# OpenClaw Web3 Market vX.Y.Z Release Notes

> **发布日期**：YYYY-MM-DD
> **发布类型**：Stable / Beta / Experimental
> **最低 Node 版本**：22+

---

## 概述

[一句话描述本版本的主要变化]

---

## 新功能

### Feature 1: [功能名称]

**描述**：[功能描述，面向用户的价值]

**配置**：

```bash
openclaw config set web3.feature.enabled true
```

**影响范围**：[受影响的用户/场景]

**相关方法**：

- `web3.market.feature.action`

---

### Feature 2: [功能名称]

[同上格式]

---

## 改进

- **[组件]**：[改进描述]
- **[组件]**：[改进描述]

---

## 修复

- **[问题]**：[修复描述] (Fixes #issue-number)
- **[问题]**：[修复描述]

---

## 已知问题

- [已知问题及临时解决方案]
- [已知问题及临时解决方案]

---

## 破坏性变更

### [变更标题]

**影响**：[受影响的用户/场景]

**迁移步骤**：

1. [步骤 1]
2. [步骤 2]

**示例**：

```bash
# 旧配置
openclaw config set old.key value

# 新配置
openclaw config set new.key value
```

---

## 升级指南

### 从 vX.Y.Z 升级

1. **备份当前状态**

   ```bash
   cp -r ~/.openclaw ~/.openclaw.backup
   ```

2. **安装新版本**

   ```bash
   npm install -g openclaw@X.Y.Z
   # 或
   pnpm install -g openclaw@X.Y.Z
   ```

3. **重启 Gateway**

   ```bash
   pkill -f openclaw-gateway
   openclaw gateway run --bind loopback --port 18789 --force &
   ```

4. **验证升级**
   ```bash
   openclaw web3 status
   openclaw market status
   ```

---

## 回滚方案

如果升级后出现问题，可以回滚到上一个版本：

```bash
scripts/rollback-web3-market.sh <previous-version>
```

**回滚时间**：约 X 分钟

**数据兼容**：[说明数据是否兼容]

---

## 风险提示

### 熔断机制

所有自动支付受 `web3.x402.autopay.enabled` 配置控制：

```bash
# 紧急禁用自动支付
scripts/kill-switch-web3-market.sh disable-autopay

# 禁用所有 Web3 Market 功能
scripts/kill-switch-web3-market.sh disable-all
```

### 预算控制

- **每日限额**：`web3.maxDailySpend`（默认 100 USDC）
- **单笔限额**：`web3.maxOrderAmount`（默认 50 USDC）
- **自动支付重试**：`web3.x402.maxRetries`（默认 3 次）

### 数据安全

- 所有交易记录存储在 `~/.openclaw/ledger/`
- 敏感信息（token、endpoint）永不暴露
- 审计日志完整保留

---

## 支持的支付链

| 链       | 角色         | 状态 |
| -------- | ------------ | ---- |
| Ethereum | 主结算链     | ✅   |
| Polygon  | 低费用结算   | ✅   |
| Arbitrum | L2 结算      | ✅   |
| TON      | 轻量支付入口 | ✅   |

---

## 相关文档

- [Web3 Market 概念](/concepts/web3-market)
- [配置参考](/reference/web3-market-dev)
- [Beta FAQ](/web3/BETA_FAQ)
- [风险披露](/web3/RISK_DISCLOSURE)

---

## 致谢

感谢以下贡献者对本版本的贡献：

- @contributor1
- @contributor2

---

**完整变更日志**：https://github.com/openclaw/openclaw/compare/vPREV...vX.Y.Z
