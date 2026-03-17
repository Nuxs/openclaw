---
summary: "Web3 Market 回滚检查清单：执行前记录、执行中检查与回滚后核验。"
title: "Web3 Market Rollback Checklist"
doc_family: "web3"
doc_layer: "reference"
normative: true
---

# Web3 Market 回滚检查清单

> **用途**：回滚操作前后验证清单，确保回滚成功且数据完整

---

## 回滚前检查

### 环境确认

- [ ] 确认当前运行环境（dev/staging/prod）
- [ ] 确认当前版本号：`openclaw --version`
- [ ] 确认目标回滚版本存在：`npm view openclaw@<version> version`
- [ ] 确认有足够的权限执行回滚

### 状态记录

- [ ] 记录当前 Gateway 状态

  ```bash
  openclaw web3 status --json > /tmp/pre-rollback-status.json
  ```

- [ ] 记录当前市场状态

  ```bash
  openclaw market status --json > /tmp/pre-rollback-market.json
  ```

- [ ] 记录当前钱包余额

  ```bash
  openclaw wallet balance --json > /tmp/pre-rollback-balance.json
  ```

- [ ] 记录当前订单列表
  ```bash
  openclaw market order list --limit 100 > /tmp/pre-rollback-orders.txt
  ```

### 备份确认

- [ ] 确认备份目录存在且有写权限
- [ ] 确认磁盘空间足够存储备份
- [ ] 确认备份包含以下目录：
  - `~/.openclaw/web3/`
  - `~/.openclaw/market/`
  - `~/.openclaw/ledger/`
  - `~/.openclaw/config.json`

---

## 回滚执行检查

### 脚本执行

- [ ] 执行回滚脚本

  ```bash
  scripts/rollback-web3-market.sh <version>
  ```

- [ ] 检查脚本输出无错误
- [ ] 确认备份已创建
- [ ] 确认新版本已安装
- [ ] 确认 Gateway 已重启

---

## 回滚后验证

### Gateway 验证

- [ ] Gateway 进程运行中

  ```bash
  pgrep -f openclaw-gateway
  ```

- [ ] Gateway 健康检查通过

  ```bash
  curl http://localhost:18789/health
  ```

- [ ] Gateway 版本正确
  ```bash
  openclaw --version
  ```

### 功能验证

- [ ] web3 状态正常

  ```bash
  openclaw web3 status
  ```

- [ ] 市场状态正常

  ```bash
  openclaw market status
  ```

- [ ] 钱包连接正常
  ```bash
  openclaw wallet balance
  ```

### 数据完整性验证

- [ ] 订单数量一致

  ```bash
  # 对比回滚前后订单数量
  diff <(cat /tmp/pre-rollback-orders.txt) <(openclaw market order list --limit 100)
  ```

- [ ] 钱包余额一致

  ```bash
  # 对比回滚前后余额
  diff <(cat /tmp/pre-rollback-balance.json) <(openclaw wallet balance --json)
  ```

- [ ] 账本记录完整

  ```bash
  openclaw market ledger list --limit 10
  ```

- [ ] 无数据丢失

### 敏感信息验证

- [ ] 无 token 泄露在日志中

  ```bash
  grep -r "accessToken" /tmp/openclaw-gateway.log
  # 应该无结果
  ```

- [ ] 无 endpoint 泄露

  ```bash
  grep -r "endpoint.*http" /tmp/openclaw-gateway.log
  # 应该无结果或已脱敏
  ```

- [ ] 审计日志正常
  ```bash
  openclaw market audit query --limit 10
  ```

---

## 回滚失败处理

### 如果 Gateway 无法启动

1. 检查日志：`tail -f /tmp/openclaw-gateway.log`
2. 尝试强制启动：`openclaw gateway run --bind loopback --port 18789 --force`
3. 如果仍然失败，恢复备份：
   ```bash
   cp -r ~/.openclaw/backups/rollback-*/web3 ~/.openclaw/
   ```

### 如果数据不一致

1. 不要慌张，数据已在链上
2. 检查是否有同步延迟
3. 必要时联系支持团队

### 如果需要回滚到另一个版本

1. 先恢复到备份版本
2. 再次执行回滚脚本到目标版本

---

## 回滚报告

### 基本信息

| 项目     | 值  |
| -------- | --- |
| 回滚时间 |     |
| 回滚版本 |     |
| 操作人   |     |
| 总耗时   |     |

### 验证结果

| 检查项       | 结果 | 备注 |
| ------------ | ---- | ---- |
| Gateway 启动 |      |      |
| web3 状态    |      |      |
| 市场状态     |      |      |
| 钱包余额     |      |      |
| 订单数据     |      |      |
| 账本数据     |      |      |

### 问题记录

[记录遇到的问题及解决方案]

---

## 完成签名

- 操作人签名：**\*\***\_\_\_\_**\*\***
- 复核人签名：**\*\***\_\_\_\_**\*\***
- 日期：**\*\***\_\_\_\_**\*\***
