### OpenClaw Web3 资源共享运维与可观测性（B-2 附录）

> 本文档是 `web3-brain-architecture.md` 的子文档，聚焦 **部署、配置、后台任务、观测与故障排查**。

---

## 1. 部署拓扑建议

- **Provider-only**：仅发布资源，不消费
- **Consumer-only**：仅租用资源，不提供
- **Hybrid**：同机既提供又消费（推荐开发期）

> Provider 对外暴露建议优先通过反代（Nginx/Caddy）+ TLS，而不是直接公网 bind。

---

## 2. 配置开关（最小集合）

- `resources.enabled`
- `resources.provider.listen.bind`（默认 loopback）
- `resources.provider.listen.publicBaseUrl?`（反代时）
- `maintenance.enabled`

---

## 3. 关键指标（建议）

- **可用性**：
  - `provider_http_requests_total{route,status}`
  - `provider_http_latency_ms{route}`
- **资源消耗**：
  - `active_leases`
  - `ledger_entries_appended_total`
- **安全**：
  - `auth_failures_total`
  - `rate_limited_total`

---

## 4. 后台任务 Runbook

- `market.lease.expireSweep`
  - 触发条件：调用失败集中出现 `E_EXPIRED` 之前也可周期运行
- `market.revocation.retry`
  - 若撤销 webhook 积压，先查 `revocations.json`/`revocations` 表
- `market.repair.retry`
  - 导入后出现 orphan/invalid 增多时运行

---

## 5. 故障排查

- **消费者无法调用 Provider**：
  - 检查 lease status/过期
  - 检查 Provider bind/反代 URL
  - 检查 rate limit 是否触发
- **账本不一致**：
  - 以 Provider ledger 为准
  - 对比 Consumer 侧预估 ledger（如启用）

---

## 6. 回滚策略

- 禁用：`resources.enabled=false`
- 停止共享面：Provider bind 回 loopback
- 不删除历史 ledger（append-only），仅停止新增
