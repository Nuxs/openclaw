---
summary: "Web3 Market Beta 常见问题：边界、能力、预算、安全与回滚入口。"
title: "OpenClaw Web3 Market Beta FAQ"
doc_family: "web3"
doc_layer: "guide"
normative: false
---

# OpenClaw Web3 Market Beta FAQ

> **最后更新**：2026-03-17
> **适用版本**：OpenClaw Web3 Market Beta

---

## 概述

### 什么是 Web3 Market？

OpenClaw Web3 Market 是一个**可问责的数字服务市场**，让你的 AI 管家可以：

1. **自主发现**：在可信网络中发现外部服务
2. **安全购买**：在预算约束下自动完成支付
3. **验证交付**：通过加密证明验证服务执行
4. **结算争议**：完整的争议处理和仲裁机制

**核心价值**：让你的 AI 管家能够安全地使用外部服务，同时保持完全的可追溯性和问责能力。

### Web3 Market 不是什么？

- ❌ 不是加密货币交易平台
- ❌ 不是 DeFi 应用
- ❌ 不是投机工具
- ❌ 不是匿名市场

### Beta 期间有哪些限制？

| 限制项       | 说明                                         |
| ------------ | -------------------------------------------- |
| **邀请制**   | 仅限受邀用户使用                             |
| **服务范围** | 仅支持数字服务（搜索、数据增强、模型推理等） |
| **支付限额** | 单日支出上限可配置，默认 100 USDC            |
| **争议处理** | 需人工介入，尚未完全自动化                   |
| **服务类型** | 不支持人力服务和实物资产                     |

---

## 入门

### 如何启用 Web3 Market？

```bash
# 1. 启用 Web3 功能
openclaw config set web3.enabled true

# 2. 启用市场
openclaw config set web3.market.enabled true

# 3. 启用 KYA（Know Your Agent）策略
openclaw config set web3.kya.enabled true

# 4. 重启 Gateway
pkill -f openclaw-gateway
openclaw gateway run --bind loopback --port 18789 --force &
```

### 如何设置预算？

```bash
# 设置每日支出上限（USDC）
openclaw config set web3.maxDailySpend 100

# 设置单笔交易上限（USDC）
openclaw config set web3.maxOrderAmount 50

# 查看当前预算状态
openclaw wallet policy show
```

### 如何配置支付方式？

**EVM 链（Ethereum、Polygon、Arbitrum）**：

```bash
# 导入钱包
openclaw wallet import --chain evm

# 查看余额
openclaw wallet balance --chain evm
```

**TON 链**：

```bash
# 导入钱包
openclaw wallet import --chain ton

# 查看余额
openclaw wallet balance --chain ton
```

---

## 使用

### AI 如何自主购买服务？

在策略边界内，AI 管家会：

1. **发现服务**：通过 `web3.market.resource.list` 发现可用服务
2. **评估选择**：根据价格、声誉、可用性选择服务
3. **自动下单**：在预算内自动完成支付
4. **验证交付**：检查服务执行证明
5. **确认结算**：验收后触发资金释放

**何时需要人工确认**？

| 场景                 | AI 行为                |
| -------------------- | ---------------------- |
| 日常搜索（< $10）    | 完全自主，事后审计     |
| 中额购买（$10-$100） | 边界内自主，超预算审批 |
| 大额交易（> $100）   | 执行前审批             |
| 首次 Provider        | 执行前审批             |
| 争议处理             | 人工裁决               |

### 如何禁用自动支付？

```bash
# 仅禁用 x402 自动支付
openclaw config set web3.x402.autopay.enabled false

# 或使用熔断脚本
scripts/kill-switch-web3-market.sh disable-autopay
```

### 如何查看交易记录？

```bash
# 查看最近订单
openclaw market order list

# 查看特定订单详情
openclaw market order status <order-id>

# 查看账本记录
openclaw market ledger list

# 查看审计日志
openclaw market audit query --limit 100
```

### 如何处理争议？

```bash
# 查看争议状态
openclaw market dispute status <dispute-id>

# 提交证据
openclaw market dispute evidence <dispute-id> --summary "..." --file ./evidence.json

# 查看所有争议
openclaw market dispute list --status open
```

---

## 安全

### 如何保护我的资产？

1. **预算控制**：设置合理的每日/单笔限额
2. **KYA 策略**：启用策略引擎拦截异常交易
3. **熔断机制**：必要时立即禁用功能
4. **审计追踪**：所有操作完整记录

```bash
# 查看当前安全配置
openclaw config get web3.maxDailySpend
openclaw config get web3.maxOrderAmount
openclaw config get web3.kya.enabled
```

### 熔断机制如何工作？

**自动熔断**：

- 连续失败超过阈值时自动禁用
- 可配置失败率和恢复时间

**手动熔断**：

```bash
# 禁用所有功能
scripts/kill-switch-web3-market.sh disable-all

# 紧急停止（禁用 + 停止 Gateway）
scripts/kill-switch-web3-market.sh emergency-stop
```

### 敏感信息如何保护？

- **Token/Endpoint**：永不暴露在日志、UI 或审计记录中
- **私钥**：本地加密存储，不传输到服务器
- **交易哈希**：仅在必要时显示完整值

---

## 故障排查

### Gateway 无法启动

```bash
# 检查端口占用
lsof -i :18789

# 检查日志
tail -f /tmp/openclaw-gateway.log

# 尝试强制启动
openclaw gateway run --bind loopback --port 18789 --force
```

### 支付失败

```bash
# 检查钱包余额
openclaw wallet balance

# 检查预算状态
openclaw wallet policy status

# 检查链连接
openclaw web3 status --deep
```

### 服务无法发现

```bash
# 检查发现服务状态
openclaw web3 discovery status

# 刷新发现索引
openclaw web3 discovery refresh

# 检查网络连接
openclaw web3 status --deep
```

### 遇到问题如何回滚？

```bash
# 回滚到上一个版本
scripts/rollback-web3-market.sh <previous-version>

# 查看可用版本
npm view openclaw versions
```

---

## 支持的支付链

| 链       | 角色         | 最低确认数 | 手续费 |
| -------- | ------------ | ---------- | ------ |
| Ethereum | 主结算链     | 12         | ~$2-10 |
| Polygon  | 低费用结算   | 128        | ~$0.01 |
| Arbitrum | L2 结算      | 64         | ~$0.1  |
| TON      | 轻量支付入口 | 3          | ~$0.01 |

---

## 相关文档

- [Web3 Market 概念](/concepts/web3-market)
- [配置参考](/reference/web3-market-dev)
- [风险披露](/web3/RISK_DISCLOSURE)
- [回滚演练模板](/web3/ROLLBACK_DRILL_TEMPLATE)
- [熔断指南](/web3/KILL_SWITCH_GUIDE)

---

## 获取帮助

- **Discord**：https://discord.gg/openclaw
- **GitHub Issues**：https://github.com/openclaw/openclaw/issues
- **文档**：https://docs.openclaw.ai

---

**注意**：Beta 期间功能可能随时变化。请关注更新公告。
