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

## 1. 发布门禁分层

发布前必须同时通过 **3 层门禁**；任何一层通过都**不等于**整体放行：

### 1.1 Source/package gate（静态门禁）

由 `scripts/release-check.ts` 执行，负责校验：

- [ ] 发布包内容、版本、Sparkle build floor、plugin-sdk 导出、bundled extension manifest
- [ ] Web3/PayFi source marker 仍在预期注册面内
- [ ] `Web3 GA Runbook`、`Web3 Market Go Live Evidence`、`Web3 Market Release Notes` 三类发布产物存在且未漂移

> 这层门禁只证明“仓库内容与发布资产齐全”，**不证明运行时已经健康**。

### 1.2 Preset baseline verify（运行时基线）

由 `/web3-market verify <mode>` 或 `web3.market.preset.verify` 执行，负责校验：

- [ ] resources / consumer / provider listen / discovery 配置基线
- [ ] `market.status.summary`、`web3.monitor.health`、`web3.index.stats`、`market.resource.list`、`market.lease.list` 的聚合可用性
- [ ] wallet / billing / autopay capability readiness 与 paste-safe 下一步动作
- [ ] CLI 与 Control 面引用同一组 readiness 事实

> 这层门禁的定位是 **baseline verify**。它会提示下一步动作，但**不会替代**真钱包探针、`web3.index.list` 非空确认、支付/结算演练、回滚演练或发布说明留痕。

### 1.3 Operator release gate（运行时放行）

- [ ] **钱包连接**：至少一个 EVM 钱包可用（`web3.wallet.balance` 返回成功）
- [ ] **结算链路**：`market.settlement.lock` + `market.settlement.release` 端到端可执行（`anchor_only` 模式即可）
- [ ] **Discovery 发现面**：至少完成一次真实 Provider 发布后由 `web3.index.list` 返回非空；若启用 P2P，再结合日志或探针确认当前 bootstrap / discover 行为
- [ ] **支付链路**：`web3.billing.handlePaymentRequired` 的 autopay 路径完成至少一次成功流转
- [ ] **监控引擎**：`web3.market.status.summary` 返回运行摘要，且 `web3.monitor.health` 为 `healthy`、`criticalAlerts = 0`
- [ ] **双存储一致性**：file-store 与 sqlite-store 对同一数据集返回一致结果
- [ ] **回滚演练**：至少完成一次降级或回滚演练，并留存 operator 记录
- [ ] **发布说明**：发布摘要、风险、观察项、回滚入口和 evidence 链接已填写到 [/reference/web3-market-release-notes](/reference/web3-market-release-notes)

### 1.4 任务市场门禁

- [ ] **任务全状态机**：`publish → bid → award → submit → review(accept) → receipt` 端到端通过
- [ ] **争议路径**：`review(reject)` 创建 dispute，dispute 可被 resolve/reject
- [ ] **过期清扫**：`expireSweep` 正确处理超期任务
- [ ] **事务安全**：publish/award/submit/review 写操作使用 `store.runInTransaction()` 包裹
- [ ] **状态机守卫**：`task-state-machine.ts` 四个 `assertTask*Transition` 函数拒绝非法迁移
- [ ] **审计锚定**：所有状态变更通过 `recordAuditWithAnchor()` 记录

### 1.5 隐私合规门禁

- [ ] **Consent 查询**：`web3.market.consent.list` 返回正确状态
- [ ] **回放生成**：撤销后 `web3.market.privacy.replay.generate` 输出脱敏摘要与保留策略
- [ ] **回放哈希**：`hashReplaySummary()` 使用 SHA-256（via `hashCanonical`），而非 hex 编码
- [ ] **删除执行**：`web3.market.privacy.erase` 对已撤销 consent 执行成功
- [ ] **删除事务**：consent 保存 + replay 擦除使用 `store.runInTransaction()` 原子执行
- [ ] **保留策略推导**：`deriveRetentionAction()` 返回 `erase | retain_anonymized | retain_with_consent`

### 1.6 UI 门禁

- [ ] **Web3 总览页**：身份、支付、发现、市场、GA readiness 五组卡片正常渲染
- [ ] **任务工作台**：任务列表、竞标、交付、回执区块可切换
- [ ] **隐私工作台**：授权、资产、回放、删除区块可见

### 1.7 状态聚合门禁

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

| 触发条件                | 降级行为                                                                                                       | 恢复条件                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| libp2p bootstrap 不可达 | 保持当前索引主路径可用，记录 warn 日志；如需止血，由 operator 切换 `discovery.backend: "static"` 停止 P2P 发现 | bootstrap 恢复或 operator 重新启用 libp2p |
| 签名验证失败            | 拒绝入库并输出 `[mdl:ingest]` warn 日志                                                                        | 发布方修复签名后重新发布                  |
| discovery 需保底        | 切换 `static` backend，停止新的 P2P discover/publish，仅保留现有本地 index / gossip 查询面                     | operator 恢复 `libp2p` backend            |

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
- 查看 `[mdl:ingest]` warn 日志，确认 providerId 与拒绝原因

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
- [ ] Discovery 发布 → 入库 → 搜索 → operator 降级切换
- [ ] AI 助手：任务市场意图（发布/查询/投标/提交/验收）→ 正确路由 → 脱敏输出
- [ ] AI 助手：隐私意图（授权查询/回放/删除）→ scope-aware 展示 → 脱敏输出
- [ ] AI 助手：运营意图（状态总览/告警）→ 并行数据抓取 → 全景摘要
- [ ] AI 助手：预设意图（预览 / 应用 / 验证）→ 走 `web3.market.preset.*` + `/web3-market enable` / 配置写 helpers 闭环

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

## 6. Evidence 留痕与可分享结果

- **统一口径**：CLI 侧使用 `/web3-market verify <mode>`，Control 面使用 `Operations & Health` 与 `Preset Baseline Gates`；两边必须引用同一组 readiness 事实。
- **最小证据集**：至少留存一次 baseline verify、一次钱包探针成功结果、一次支付 readiness 结果、一次 discovery/index 成功结果，以及一次 Provider 发布前检查结果。
- **paste-safe 原则**：证据只能包含状态、计数、模式、检查项与建议动作；不得包含 token、endpoint、真实路径或可复用凭证。
- **模板与样例**：使用 [/reference/web3-market-go-live-evidence](/reference/web3-market-go-live-evidence) 中的 checklist、记录模板和样例片段沉淀 go-live 证据。

## 7. 相关文档

- Web3 Market 概览：[/concepts/web3-market](/concepts/web3-market)
- Web3 Market 开发文档：[/reference/web3-market-dev](/reference/web3-market-dev)
- Web3 Market go-live evidence：[/reference/web3-market-go-live-evidence](/reference/web3-market-go-live-evidence)
- EaaS 协议规范：[/reference/web3-eaas-protocol-spec](/reference/web3-eaas-protocol-spec)
- EaaS 开发指南：[/reference/web3-eaas-developer-guide](/reference/web3-eaas-developer-guide)
- 输出脱敏验收：[/reference/web3-market-output-redaction](/reference/web3-market-output-redaction)
