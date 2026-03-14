---
summary: "Web3/PayFi GA 运维 Runbook：发布门禁、降级、回滚、值班处置与验收清单"
title: "Web3 GA Runbook"
doc_family: "web3"
doc_layer: "reference"
normative: true
---

# Web3 GA Runbook

> 本文面向值班与运维：GA 发布前的门禁校验、运行时降级策略、回滚操作与验收清单。

---

## 1. 发布门禁（Release Gate）

发布前必须通过 `scripts/release-check.ts` 中的 Web3/PayFi 门禁项：

### 1.1 必过项

- [ ] **钱包连接**：至少一个 EVM 钱包可用（`web3.wallet.balance` 返回成功）
- [ ] **结算链路**：`market.settlement.lock` + `market.settlement.release` 端到端可执行（anchor_only 模式即可）
- [ ] **Discovery 健康**：至少一个 backend（libp2p 或 static）可达，`web3.index.list` 返回非空
- [ ] **支付链路**：`web3.billing.handlePaymentRequired` 的 autopay 路径完成至少一次成功流转
- [ ] **监控引擎**：`web3.market.status.summary` 返回运行摘要且无 critical 告警
- [ ] **双存储一致性**：file-store 与 sqlite-store 对同一数据集返回一致结果

### 1.2 任务市场门禁

- [ ] **任务全状态机**：`publish → bid → award → submit → review(accept) → receipt` 端到端通过
- [ ] **争议路径**：`review(reject)` 创建 dispute，dispute 可被 resolve/reject
- [ ] **过期清扫**：`expireSweep` 正确处理超期任务
- [ ] **事务安全**：publish/award/submit/review 写操作使用 `store.runInTransaction()` 包裹
- [ ] **状态机守卫**：`task-state-machine.ts` 四个 `assertTask*Transition` 函数拒绝非法迁移
- [ ] **审计锚定**：所有状态变更通过 `recordAuditWithAnchor()` 记录

### 1.3 隐私合规门禁

- [ ] **Consent 查询**：`web3.market.consent.list` 返回正确状态
- [ ] **回放生成**：撤销后 `web3.market.privacy.replay.generate` 输出脱敏摘要与保留策略
- [ ] **回放哈希**：`hashReplaySummary()` 使用 SHA-256（via `hashCanonical`），而非 hex 编码
- [ ] **删除执行**：`web3.market.privacy.erase` 对已撤销 consent 执行成功
- [ ] **删除事务**：consent 保存 + replay 擦除使用 `store.runInTransaction()` 原子执行
- [ ] **保留策略推导**：`deriveRetentionAction()` 返回 `erase | retain_anonymized | retain_with_consent`

### 1.4 UI 门禁

- [ ] **Web3 总览页**：身份、支付、发现、市场、GA readiness 五组卡片正常渲染
- [ ] **任务工作台**：任务列表、竞标、交付、回执区块可切换
- [ ] **隐私工作台**：授权、资产、回放、删除区块可见

### 1.5 状态聚合门禁

- [ ] **市场状态摘要**：`web3.market.status.summary` 返回 `tasks`（open/awarded/closed）和 `privacy`（active/revoked/pendingErasure）字段
- [ ] **AI 助手四主线**：MarketAssistant 覆盖基础市场、任务市场、隐私合规、运营诊断，所有输出 paste-safe
- [ ] **运营全景**：`handleQueryOpsStatus` 并行抓取 task/consent/status 数据，输出完整摘要

---

## 2. 降级策略

### 2.1 支付降级

| 触发条件         | 降级行为                                      | 恢复条件         |
| ---------------- | --------------------------------------------- | ---------------- |
| autopay 后端超时 | 回退手动支付，返回 `E_TIMEOUT` + retry budget | autopay 恢复响应 |
| 链不可达         | `anchor_only` 模式（仅审计，不上链）          | 链恢复           |
| 钱包余额不足     | 拒绝 lock，返回 `E_INSUFFICIENT_FUNDS`        | 充值后重试       |

### 2.2 Discovery 降级

| 触发条件                | 降级行为                        | 恢复条件          |
| ----------------------- | ------------------------------- | ----------------- |
| libp2p bootstrap 不可达 | 回退 static/HTTP 索引           | bootstrap 恢复    |
| 签名验证失败            | 拒绝入库，记录 `rejectedReason` | 发布方修复签名    |
| 全部 backend 不可达     | 使用最后一次成功缓存 + 告警     | 任一 backend 恢复 |

### 2.3 结算降级

| 触发条件                | 降级行为                           | 恢复条件          |
| ----------------------- | ---------------------------------- | ----------------- |
| escrow 合约调用失败     | 回退 `anchor_only` + 告警          | 合约恢复          |
| 幂等冲突 `E_CONFLICT`   | 返回已有结果，不重复操作           | 无需恢复          |
| settlement release 失败 | 保持 `settlement_locked`，等待重试 | 手动/自动重试成功 |

### 2.4 任务市场降级

| 触发条件                    | 降级行为                    | 恢复条件           |
| --------------------------- | --------------------------- | ------------------ |
| 授标时 settlement lock 失败 | 拒绝授标，返回错误          | 支付链路恢复后重试 |
| 验收时 release 失败         | 保持 `task_awarded`，不关闭 | 手动释放后重试     |
| 过期清扫异常                | 跳过本轮，下一周期重试      | 自动恢复           |

---

## 3. 回滚操作

### 3.1 代码回滚

```bash
# 回滚到上一个已验证版本
git revert HEAD --no-commit
pnpm install && pnpm build && pnpm test
git commit -m "revert: rollback Web3 GA changes"
```

### 3.2 数据回滚

- **file-store**：恢复 `~/.openclaw/market/` 目录备份
- **sqlite-store**：恢复 market 数据库备份文件
- **注意**：回滚后必须验证 file/sqlite 双存储一致性

### 3.3 配置回滚

- 降级开关：设置 `settlement.mode: "anchor_only"` 关闭链上结算
- Discovery 开关：设置 `discovery.backend: "static"` 关闭 P2P
- 任务市场开关：移除 `market.task.*` 的 gateway 注册

---

## 4. 值班处置

### 4.1 告警响应

| 告警等级   | 响应时间   | 处置方式                |
| ---------- | ---------- | ----------------------- |
| `critical` | 5 分钟     | 立即降级 + 通知值班     |
| `warning`  | 30 分钟    | 排查根因 + 决定是否降级 |
| `info`     | 下一工作日 | 记录 + 趋势观察         |

### 4.2 常见问题排查

**Q: Settlement 一直卡在 `settlement_locked`**

- 检查 `settlement.mode` 配置
- 检查 `releaseSettlementIncremental` 日志
- 如果是 `contract` 模式，检查链状态
- 回退：切换到 `anchor_only` 模式

**Q: Discovery 记录重复暴增**

- 检查 `ingest.ts` 去重逻辑
- 检查 provider 是否在短间隔内重复发布
- 查看 `rejectedReason` 统计

**Q: 任务验收后未生成回执**

- 检查 `releaseSettlementIncremental` 是否成功
- 检查 Order 状态是否已到 `settlement_completed`
- 检查 Task 状态是否已到 `task_closed`

**Q: 隐私回放生成失败**

- 确认 consent 状态为 `revoked`（非 `granted`）
- 检查关联的 offer/order 数据是否存在
- 查看 `buildPrivacyReplaySummary` 日志
- 验证 `hashReplaySummary()` 输出格式（`sha256:...`，64 字符十六进制）

**Q: 任务状态迁移被拒绝（E_CONFLICT）**

- 检查 `task-state-machine.ts` 中的合法迁移表
- 常见问题：试图对已关闭/已取消的任务执行操作
- 自迁移（如 `task_open → task_open`）同样被拒绝

**Q: 删除数据时部分回放未擦除**

- 检查 `store.runInTransaction()` 是否正常完成
- 确认 consent 先被撤销（`consent_revoked`）再执行删除
- 查看 `eraseReason` 和 `replayCount` 确认影响范围

---

## 5. 验收清单

### 5.1 功能验收

- [ ] 资源发布 → 租约签发 → 使用 → 结算 → 对账摘要
- [ ] 任务发布 → 竞标 → 授标 → 交付 → 验收 → 回执（事务安全、状态机守卫、审计锚定）
- [ ] 授权 → 撤销 → 回放（SHA-256 哈希验证）→ 删除（事务原子性）
- [ ] 争议创建 → 提交证据 → 解决/拒绝
- [ ] Discovery 发布 → 入库 → 搜索 → 失败回退
- [ ] AI 助手：任务市场意图（发布/查询/投标/提交/验收）→ 正确路由 → 脱敏输出
- [ ] AI 助手：隐私意图（授权查询/回放/删除）→ scope-aware 展示 → 脱敏输出
- [ ] AI 助手：运营意图（状态总览/告警）→ 并行数据抓取 → 全景摘要
- [ ] AI 助手：预设意图（预览 / 应用 / 验证）→ 走 `web3.market.preset.*` + `config.apply` 闭环

### 5.2 安全验收

- [ ] 所有对外输出不含 token/endpoint/真实路径
- [ ] 错误消息脱敏（`formatGatewayErrorResponse` 覆盖所有路径）
- [ ] 日志不含敏感字段
- [ ] 状态摘要可直接分享（paste-safe）

### 5.3 性能验收

- [ ] 市场状态查询响应 < 2s（含任务/隐私聚合摘要）
- [ ] Discovery 入库去重有效（无重复 upsert）
- [ ] UI 请求数可控（聚合 summary + 详情懒加载）
- [ ] file/sqlite 双存储一致且无竞态
- [ ] 事务操作（publish/award/submit/review/erase）原子性验证

---

## 相关文档

- Web3 Market 概览：[/concepts/web3-market](/concepts/web3-market)
- Web3 Market 开发文档：[/reference/web3-market-dev](/reference/web3-market-dev)
- EaaS 协议规范：[/reference/web3-eaas-protocol-spec](/reference/web3-eaas-protocol-spec)
- EaaS 开发指南：[/reference/web3-eaas-developer-guide](/reference/web3-eaas-developer-guide)
- 输出脱敏验收：[/reference/web3-market-output-redaction](/reference/web3-market-output-redaction)
