# OpenClaw Web3 Market 结算安全最优方案落地清单（2026-03-03，v1）

## 0. 目标与结论

- 目标：将当前“Beta 可用修复”升级为“业界 best-in-class 生产级方案”。
- 范围：仅覆盖 `settlement` 与 `escrow-ton` 的一致性、幂等、重试/超时、确认语义、可恢复性与回归验证。
- 原则：最小侵入、可灰度、可回滚、双存储（SQLite/File）一致。

---

## 1. 现状差距（对标业界最优）

1. 仍存在“链上成功、DB失败”的恢复窗口（链上先执行，DB后提交）。
2. `release` 的重试语义未绑定“请求级幂等键”。
3. 超时需保证“真实生效”（不是仅打标）。
4. 事务内并发冲突校验应升级为强 CAS（状态+金额+版本/更新时间）。
5. 错误码需要统一映射，便于上层稳定判定与告警。
6. 缺少结算操作日志（outbox-like）与后台补偿执行器。
7. 缺少请求级幂等、指标告警与运行手册的治理闭环。

---

## 2. 分阶段落地（P0/P1/P2）

## P0（立即收敛风险，1~2 个 PR）

### P0-A：确认语义 + 真实超时 + 错误码归一

- 目标
  - `escrow-ton` 支持“可配置确认等待深度 + 最长等待时长”。
  - 超时通过 `Promise.race` + provider wait/confirm API 保证真实超时退出。
  - 错误统一映射到稳定业务错误码（可观测、可告警、可重试分类）。

- 最小改造文件
  - `extensions/market-core/src/config.ts`
  - `extensions/market-core/src/market/escrow-ton.ts`
  - `extensions/market-core/src/market/escrow-factory.ts`
  - `extensions/blockchain-adapter/src/types/error.ts`（仅必要最小变更）

- 验收标准
  - 临时故障：按策略退避重试；永久故障：快速失败。
  - `confirmRequired=true` 时，未达确认深度不得返回成功。
  - 超时后不再无限等待，错误码可区分 `TIMEOUT`/`TRANSACTION_FAILED`/`CONNECTION_FAILED`。

### P0-B：Settlement 强 CAS 并发防护

- 目标
  - 在现有 per-orderId 锁基础上，事务内增加强 CAS 条件：`status + releasedAmount + version(updatedAt)`。
  - 并发冲突统一返回 `E_CONFLICT:*`，可被客户端/调用方识别并安全重试。

- 最小改造文件
  - `extensions/market-core/src/market/handlers/settlement.ts`
  - `extensions/market-core/src/market/types.ts`
  - `extensions/market-core/src/state/store-types.ts`
  - `extensions/market-core/src/state/store.ts`
  - `extensions/market-core/src/state/sqlite-store.ts`
  - `extensions/market-core/src/state/file-store.ts`

- 验收标准
  - 同一 `orderId` 并发 `release/lock/refund` 无资金超发、无状态穿透。
  - 冲突路径稳定返回冲突错误并可重放。

---

## P1（一致性最优：可恢复，2~3 个 PR）

### P1-A：结算操作日志（outbox-like）

- 目标
  - 引入 `settlement_operation`（或等价结构），记录待执行链上动作与状态机：`pending -> running -> succeeded/failed/retry_wait`。
  - handler 从“直接链上执行”过渡到“写任务 + 可同步触发一次执行 + 持久化结果”。

- 最小改造文件
  - `extensions/market-core/src/market/settlement/operation-types.ts`（new）
  - `extensions/market-core/src/market/settlement/operation-repository.ts`（new）
  - `extensions/market-core/src/state/*`（新增表/文件结构与迁移）
  - `extensions/market-core/src/market/handlers/settlement.ts`

- 验收标准
  - 注入 DB 写失败/进程崩溃后，任务可重放并收敛到终态。
  - 不出现重复记账与重复释放。

### P1-B：后台补偿调度器（Poller）

- 目标
  - 周期扫描 `retry_wait/pending` 任务，按重试预算与退避策略执行补偿。
  - 记录审计日志、失败原因、最终死信（DLQ-like）状态。

- 最小改造文件
  - `extensions/market-core/src/market/settlement/poller.ts`（new）
  - `extensions/market-core/src/index.ts`（注册服务）
  - `extensions/market-core/src/config.ts`（调度参数）

- 验收标准
  - 故障演练中任务最终收敛；超过预算进入终态并告警。

---

## P2（治理长期化，1~2 个 PR）

### P2-A：请求级幂等（API/handler 层）

- 目标
  - 引入 `idempotencyKey`（客户端可传；服务端可生成回传）。
  - 相同语义请求重复提交返回同一结果快照，避免“重复链上动作”。

- 最小改造文件
  - `extensions/market-core/src/market/handlers/settlement.ts`
  - `extensions/market-core/src/market/types.ts`
  - `extensions/market-core/src/state/*`（幂等索引/映射）

- 验收标准
  - 客户端重试与网络抖动下结果稳定且无副作用放大。

### P2-B：可观测与运行手册

- 目标
  - 增加关键指标：冲突率、重试次数、确认耗时、补偿成功率、死信数。
  - 输出 runbook：故障分级、人工补偿、回滚策略与演练步骤。

- 最小改造文件
  - `extensions/market-core/src/market/settlement/*`
  - `skills/web3-market/internal/WEB3_LAUNCH_READINESS_*`
  - `skills/web3-market/internal/WEB3_OVERALL_PROGRESS.md`

- 验收标准
  - 有明确 SLO/SLA 与告警阈值；演练可重复执行。

---

## 3. 最小改造 PR 拆分（建议）

| PR   | 阶段 | 主题                                 | 主要文件                                                              | 风险 | 回滚策略                       |
| ---- | ---- | ------------------------------------ | --------------------------------------------------------------------- | ---- | ------------------------------ |
| PR-1 | P0   | TON 确认等待 + 真实超时 + 错误码归一 | `config.ts`, `escrow-ton.ts`, `escrow-factory.ts`, `error.ts`         | 中   | 关闭确认等待开关，回退到旧策略 |
| PR-2 | P0   | Settlement 强 CAS                    | `settlement.ts`, `types.ts`, `state/*`                                | 中   | 保留锁逻辑，关闭 CAS 严格模式  |
| PR-3 | P1   | 结算操作日志（outbox-like）          | `settlement/operation-*.ts`, `state/*`, `settlement.ts`               | 高   | 任务写入开关关闭，回退直连执行 |
| PR-4 | P1   | 补偿 Poller                          | `settlement/poller.ts`, `index.ts`, `config.ts`                       | 中   | 关闭 poller 服务               |
| PR-5 | P2   | 请求级幂等                           | `settlement.ts`, `types.ts`, `state/*`                                | 中   | 关闭幂等校验开关               |
| PR-6 | P2   | 指标告警 + 文档收口                  | `settlement/*`, `WEB3_LAUNCH_READINESS_*`, `WEB3_OVERALL_PROGRESS.md` | 低   | 回退指标与文档变更             |

---

## 4. 验证矩阵（必须通过）

1. 并发安全：同 `orderId` 100 并发混合请求无超发。
2. 幂等重放：相同 `idempotencyKey` 重试返回同结果。
3. 链上确认：未确认不得成功；确认后状态一致。
4. 故障恢复：链上成功/DB失败后可自动补偿收敛。
5. 双存储一致：SQLite 与 FileStore 行为与错误语义一致。
6. 回归稳定：现有测试不回退，新增测试覆盖关键负路径。

---

## 5. 执行顺序与里程碑

- M1（当天）：完成 PR-1, PR-2 设计与实现，测试过线。
- M2（+1~2天）：完成 PR-3, PR-4，实现可恢复一致性。
- M3（+1天）：完成 PR-5, PR-6，交付治理闭环与评审证据。

> 发布门禁：P0 全量通过后可继续 Beta；P1/P2 全量通过后可申请 GA 安全复审。
