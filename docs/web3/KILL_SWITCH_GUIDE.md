---
summary: "Web3 Market 熔断与恢复指南：kill switch、恢复流程、监控与回滚前后检查。"
title: "Web3 Market Kill Switch Guide"
doc_family: "web3"
doc_layer: "reference"
normative: true
---

# Web3 Market 熔断指南

> **版本**：v1.0
> **最后更新**：2026-03-17
> **适用范围**：OpenClaw Web3 Market

---

## 概述

熔断（Kill Switch）是一种紧急保护机制，用于在检测到异常或风险时快速禁用 Web3 Market 功能，防止进一步损失。

### 熔断类型

| 类型         | 触发方式 | 影响范围       | 用途         |
| ------------ | -------- | -------------- | ------------ |
| **自动熔断** | 系统自动 | 单个功能       | 连续失败保护 |
| **手动熔断** | 人工操作 | 全部/部分      | 紧急情况处理 |
| **紧急停止** | 人工操作 | 全部 + Gateway | 极端情况     |

---

## 快速参考

### 常用命令

```bash
# 查看熔断状态
scripts/kill-switch-web3-market.sh status

# 禁用自动支付
scripts/kill-switch-web3-market.sh disable-autopay

# 禁用所有功能
scripts/kill-switch-web3-market.sh disable-all

# 启用所有功能
scripts/kill-switch-web3-market.sh enable-all

# 紧急停止
scripts/kill-switch-web3-market.sh emergency-stop
```

### 配置项

```bash
# 查看配置
openclaw config get web3.x402.autopay.enabled
openclaw config get web3.market.enabled
openclaw config get web3.kya.enabled

# 手动修改
openclaw config set web3.x402.autopay.enabled false
openclaw config set web3.market.enabled false
```

---

## 自动熔断

### 触发条件

自动熔断在以下情况触发：

| 条件         | 默认阈值 | 可配置项说明                 |
| ------------ | -------- | ---------------------------- |
| 连续支付失败 | 5 次     | x402 自动支付重试与失败保护  |
| 失败率过高   | 50%      | circuit-breaker 失败率阈值   |
| 请求量过低   | 10 次    | circuit-breaker 最小评估样本 |

### 熔断状态

```
CLOSED (关闭) → OPEN (开启) → HALF_OPEN (半开) → CLOSED/OPEN
```

- **CLOSED**：正常状态，请求正常通过
- **OPEN**：熔断状态，所有请求被拒绝
- **HALF_OPEN**：试探状态，允许少量请求通过测试

### 恢复机制

| 参数               | 默认值  | 说明                       |
| ------------------ | ------- | -------------------------- |
| `openDuration`     | 60000ms | OPEN 状态持续时间          |
| `halfOpenRequests` | 3       | HALF_OPEN 状态允许的请求数 |

### 配置

```bash
# 设置失败率阈值
openclaw config set web3.circuitBreaker.failureRateThreshold 0.5

# 设置 OPEN 状态持续时间（毫秒）
openclaw config set web3.circuitBreaker.openDuration 60000

# 设置 HALF_OPEN 请求数
openclaw config set web3.circuitBreaker.halfOpenRequests 3
```

---

## 手动熔断

### 场景 1：禁用自动支付

**适用情况**：

- 发现异常支付模式
- 怀疑 Provider 有问题
- 临时暂停支付

```bash
# 禁用
scripts/kill-switch-web3-market.sh disable-autopay
# 或
openclaw config set web3.x402.autopay.enabled false

# 验证
openclaw config get web3.x402.autopay.enabled

# 恢复
openclaw config set web3.x402.autopay.enabled true
```

**影响**：

- 新的 402 响应不会自动支付
- 已有的支付会正常完成
- AI 需要人工确认支付

### 场景 2：禁用所有 Web3 Market 功能

**适用情况**：

- 发现安全漏洞
- 系统异常行为
- 需要全面暂停

```bash
# 禁用
scripts/kill-switch-web3-market.sh disable-all

# 验证
scripts/kill-switch-web3-market.sh status

# 重启 Gateway 使配置生效
pkill -f openclaw-gateway
openclaw gateway run --bind loopback --port 18789 --force &

# 恢复
scripts/kill-switch-web3-market.sh enable-all
# 然后重启 Gateway
```

**影响**：

- 所有市场操作被拒绝
- 已有订单不受影响
- 需要重启 Gateway

### 场景 3：紧急停止

**适用情况**：

- 发现正在进行的攻击
- 严重资金损失风险
- 系统完全失控

```bash
# 紧急停止（会提示确认）
scripts/kill-switch-web3-market.sh emergency-stop

# 或手动执行
openclaw config set web3.x402.autopay.enabled false
openclaw config set web3.market.enabled false
pkill -f openclaw-gateway
```

**影响**：

- 所有功能立即禁用
- Gateway 立即停止
- 需要手动恢复

---

## 恢复流程

### 自动熔断恢复

1. **等待自动恢复**
   - OPEN 状态持续时间后自动进入 HALF_OPEN
   - HALF_OPEN 测试通过后恢复 CLOSED

2. **手动恢复**
   ```bash
   # 重置熔断状态
   openclaw config set web3.circuitBreaker.forceClosed true
   ```

### 手动熔断恢复

```bash
# 1. 启用功能
scripts/kill-switch-web3-market.sh enable-all

# 2. 重启 Gateway
pkill -f openclaw-gateway
openclaw gateway run --bind loopback --port 18789 --force &

# 3. 验证
openclaw web3 status
openclaw market status

# 4. 检查审计日志
openclaw market audit query --from "2026-03-17T00:00:00Z"
```

---

## 监控与告警

### 监控指标

```bash
# 查看熔断状态
openclaw web3 status --deep

# 查看支付统计
openclaw market stats --period 24h

# 查看失败记录
openclaw market audit query --kind payment_failed --limit 20
```

### 告警配置

在 `~/.openclaw/alerts.json` 中配置：

```json
{
  "rules": [
    {
      "name": "circuit_breaker_open",
      "condition": "web3.circuitBreaker.state == 'open'",
      "action": "notify",
      "channels": ["discord", "email"]
    },
    {
      "name": "high_failure_rate",
      "condition": "web3.payment.failureRate > 0.3",
      "action": "notify",
      "channels": ["discord"]
    }
  ]
}
```

---

## 最佳实践

### 1. 定期演练

- 每月至少执行一次熔断演练
- 记录演练结果到 `docs/web3/drills/`
- 验证恢复流程有效性

### 2. 监控先行

- 设置合理的监控告警
- 在异常发生前介入
- 不要依赖熔断作为第一道防线

### 3. 分层保护

```
第一层：预算控制（maxDailySpend, maxOrderAmount）
第二层：KYA 策略（策略引擎拦截异常）
第三层：自动熔断（连续失败保护）
第四层：手动熔断（人工介入）
```

### 4. 文档化

- 记录每次熔断的原因和结果
- 更新应急预案
- 培训团队成员

---

## 故障排查

### 熔断无法触发

```bash
# 检查配置
openclaw config get web3.circuitBreaker.failureRateThreshold
openclaw config get web3.circuitBreaker.minRequestsForEvaluation

# 检查日志
tail -f /tmp/openclaw-gateway.log | grep -i "circuit"

# 手动触发
openclaw config set web3.circuitBreaker.forceOpen true
```

### 熔断无法恢复

```bash
# 检查当前状态
openclaw config get web3.circuitBreaker.state

# 强制恢复
openclaw config set web3.circuitBreaker.forceClosed true

# 重启 Gateway
pkill -f openclaw-gateway
openclaw gateway run --bind loopback --port 18789 --force &
```

### 配置不生效

```bash
# 检查配置文件
cat ~/.openclaw/config.json | grep -A5 web3

# 验证配置
openclaw config validate

# 重启 Gateway
pkill -f openclaw-gateway
openclaw gateway run --bind loopback --port 18789 --force &
```

---

## 相关文档

- [Beta FAQ](/web3/BETA_FAQ)
- [风险披露](/web3/RISK_DISCLOSURE)
- [回滚演练模板](/web3/ROLLBACK_DRILL_TEMPLATE)
- [安全政策](/security)
