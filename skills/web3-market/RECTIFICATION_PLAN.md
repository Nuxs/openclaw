---
name: web3-market-rectification-plan
version: v1.0
updated: 2026-02-22
status: draft
owner: OpenClaw Web3 扩展团队
---

## 📌 OpenClaw Web3 扩展整改计划（对齐官方方向）

### 背景与目标

本整改计划用于对齐 OpenClaw 官方文档方向与现有实现现状，重点收敛 `web3-core` + `market-core` 扩展的安全、错误契约、能力自描述、双存储一致性与运维可观测性，确保“**单入口 `web3.*`、权威 `market-core`、敏感信息零泄露**”的原则可被验证。

### 适用范围

- **范围内**：`extensions/web3-core`、`extensions/market-core`、核心 hooks（`resolve_stream_fn` 相关）、相关工具与 Provider HTTP 路由、能力自描述、索引、审计与结算闭环。
- **范围外**：完整任务市场协议、去中心化网络传输层、完整 DAO 仲裁与成熟 Web 管理台（列入后续阶段）。

### 权威原则（必须遵守）

- **单入口体验层**：对外能力以 `web3.*` 为准，`market.*` 仅内部编排。
- **敏感信息零泄露**：任何对外输出不得包含 `accessToken`、Provider `endpoint`、真实文件路径。
- **权威账本**：`market.ledger.append` 只能由 Provider 写入，Consumer 不能伪造。
- **双存储一致性**：File/SQLite 行为必须一致，并通过双模式测试验证。
- **不破坏现有行为**：不得改变 `/pay_status` 既有语义。

---

## 1) 现状与差距（基于仓库文档对齐）

### 1.1 已达成（可维持）

- `resolve_stream_fn` 已接入，具备主脑切换与回退基础能力。
- `market-core` 资源/租约/账本基础能力已落地。
- Provider 侧 `model/search/storage` 路由与 Consumer tools 基础可用。
- 结算队列与 `flushPendingSettlements` 基础闭环已实现。

### 1.2 主要差距（必须整改）

- **Gate-SEC-01 未达标**：错误与响应中存在原始错误透传、`endpoint` 暴露等泄露风险。
- **Gate-ERR-01 未达标**：错误码与错误契约未统一，影响可预测性与客户端降级。
- **Gate-CAP-01 部分达标**：能力自描述 `paramsSchema` 仍偏占位，无法让管家“仅靠能力描述”构造请求。
- **Gate-STORE-01 部分达标**：File 模式原子性与一致性存在风险，需要明确策略与测试。
- **索引信任模型不足**：索引条目仍可能暴露 `endpoint`，缺少消费侧验签与信任策略。
- **运维与可观测不足**：缺少 P0/P1 告警与指标聚合口径，无法支撑上线运维闭环。

> 注：评审文档 `skills/web3-market/references/web3-market-assessment-2026-02-19.md` 仅作参考，不替代规范性文档。

---

## 2) 整改目标（验收口径）

### 2.1 安全与契约

- **对外输出 0 泄露**：错误、日志、CLI、HTTP 响应、tool 结果与能力描述均不暴露敏感信息。
- **错误码统一**：遵循稳定错误码集合（如 `E_INVALID_ARGUMENT`、`E_FORBIDDEN`、`E_NOT_FOUND`、`E_CONFLICT`、`E_INTERNAL`）。
- **能力自描述可操作**：`web3.capabilities.*` 必须提供参数级 schema、前置条件与风险提示。

### 2.2 一致性与可维护

- **File/SQLite 行为一致**：以相同用例通过双模式 E2E 测试。
- **状态机与原子性可验证**：关键写入在事务/锁内，失败不产生部分写入。

### 2.3 体验与运维

- **单入口体验清晰**：对外只面向 `web3.*`。
- **可观测闭环**：提供基础指标与告警，可用于 `web3.status.summary` 与 `/pay_status` 展示。

---

## 3) 整改策略与阶段

### Phase 0：安全与契约收敛（P0，必须先行）

**目标**：Gate-SEC-01 / Gate-ERR-01 / Gate-CAP-01 达标。

- **错误契约统一**：
  - 整理 `web3-core` / `market-core` 对外返回结构，替换原始 `err.message` 透传。
  - 为 Provider HTTP 路由与 tools 返回统一错误码与短消息。
- **敏感信息脱敏**：
  - 索引列表与工具响应默认不含 `endpoint`。
  - `accessToken` 只允许在 `market.lease.issue` 一次性返回；后续任何输出全部脱敏。
- **能力自描述强化**：
  - `web3.capabilities.list/describe` 补齐字段级 schema、前置条件、风险与成本提示。

**验收**：通过 Gate-SEC-01 / Gate-ERR-01 / Gate-CAP-01。

### Phase 1：资源共享闭环巩固（P0）

**目标**：调用链路稳定、双存储一致性达标。

- **租约/账本一致性**：
  - Provider 记账与 Consumer 预估账本对齐，确保结算以 Provider 账本为准。
- **双存储一致性**：
  - File 模式下关键写入链路加入一致的锁/事务策略或明确上线限制。
  - E2E 用例必须在 file/sqlite 双模式跑通。
- **索引信任模型补齐**：
  - Index entry 默认脱敏，不直接暴露可路由 endpoint。
  - 引入消费侧验签与信任策略。

**验收**：通过 Gate-STORE-01 与 E2E 最小矩阵。

### Phase 2：运维与可观测性（P1）

**目标**：监控告警与运行诊断可用。

- **基础指标与告警**：
  - 结算队列、ledger 失败率、租约失效、audit/anchor 失败率。
- **运维任务规范化**：
  - `expireSweep` / `revocation.retry` / `repair.retry` 输出结构化统计。

**验收**：可观测指标可用，告警可触发。

### Phase 3：仲裁与平台化能力（P2）

**目标**：争议仲裁入口与管理台能力逐步上线。

- **争议仲裁入口**：
  - `market.dispute.*` / `web3.dispute.*` 最小链路。
- **管理台最小可用**：
  - 资源、租约、账本、结算状态可视化。

**验收**：争议可发起并可落账；管理台可完成“发布 → 租约 → 结算”闭环。

---

## 4) 具体整改任务清单（按模块）

### 4.1 `extensions/market-core`

- **安全与契约**：
  - 统一错误码映射与稳定错误结构。
  - 严格脱敏输出，禁止泄露 token/endpoint/真实路径。
- **一致性与原子性**：
  - 多对象写入采用事务/锁边界；失败回滚。
  - File/SQLite 行为一致性验证。
- **状态机与校验**：
  - 资源与租约迁移断言完整覆盖。
  - 输入校验严格对齐规范。

### 4.2 `extensions/web3-core`

- **能力自描述**：
  - `web3.capabilities.*` 补齐参数结构、权限/风控/成本提示。
- **Provider 路由**：
  - 认证与限流默认开启。
  - 统一错误码与脱敏响应。
- **Consumer tools**：
  - 错误契约与脱敏一致。
  - 索引结果默认不含 endpoint。

### 4.3 Core hooks（`resolve_stream_fn`）

- **回退策略一致**：
  - 仅在租约可用时提供自定义流，否则走默认主脑。
- **审计与结算对齐**：
  - `session_end` 结算入口与 `pendingSettlements` 可靠性兜底。

### 4.4 测试与验收

- **E2E 双模式用例**：
  - 发布 → 租约 → 调用 → 记账 → 撤销/过期。
- **安全测试**：
  - 错误响应不含敏感信息。
- **契约测试**：
  - 错误码稳定且可解析。

---

## 5) 验收标准（硬 Gate）

- **Gate-SEC-01**：敏感信息零泄露。
- **Gate-ERR-01**：稳定错误码契约。
- **Gate-CAP-01**：能力自描述可操作。
- **Gate-LEDGER-01**：Provider-only 权威账本。
- **Gate-STORE-01**：双存储一致性与双模式测试通过。

---

## 6) 风险与应对

- **File 模式回滚能力不足**：上线前优先 SQLite 或加强 file 锁与原子写策略。
- **索引信任模型缺失**：先补验签与默认脱敏，再扩展去中心化索引。
- **错误码与能力描述不一致**：在能力自描述中显式列出错误码集合与示例。

---

## 7) 输出物（文档与交付）

- **整改实施清单**：与 `web3-market-resource-implementation-checklist.md` 对齐。
- **整改验收记录**：每个 Gate 的通过证据与测试报告。
- **风险清单与回滚策略**：每个风险项的可回滚路径与最小影响范围。

---

## 8) 下一步执行建议

- 先完成 Phase 0 的安全与契约收敛，再进行 Phase 1 的一致性与索引整改。
- 每个阶段完成后进行 Gate 验收，避免跨阶段叠加风险。
