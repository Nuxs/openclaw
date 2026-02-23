### OpenClaw Web3：单页仪表盘（/web3 + Web3 Tab）与黄金路径交付计划

- **版本**：v1.0
- **更新时间**：2026-02-23
- **定位**：把现有 `web3-core` + `market-core` 的分散入口，收敛成“一个命令 / 一个页面”的**单页 Web3 面板**，并补齐面向 AI 管家的**黄金路径叙事**与**API 稳定性分级**。

---

## 0. 本文适用范围（重要）

### 0.1 本文是“产品化重编排计划”，不是新协议设计

- **做**：
  - 新增 `/web3` slash 命令（单页大面板）。
  - Web 控制台新增 Web3 Tab（单页仪表盘视图）。
  - 给 `web3.capabilities.*` 增加 `stability` 分级（Stable/Experimental/Internal）。
  - 把“AI 管家如何安全自动化”的流程写成黄金路径文档（含确认点与风险边界）。
- **不做**：
  - 不新增链/provider/状态机大分支。
  - 不引入 Postgres/Supabase 实现与迁移（仅输出规划与接口预留）。
  - 不要求重写 `market-core` 现有模块或替换 store backend。

### 0.2 权威文档与冲突处理

- **不可妥协约束（最高优先级）**：见 `skills/web3-market/SKILL.md` 与 `skills/web3-market/RECTIFICATION_PLAN.md`。
- **接口与错误契约权威**：`docs/reference/web3-resource-market-api.md`。
- **输出脱敏验收清单**：`docs/reference/web3-market-output-redaction.md`。
- **如果本文与实现冲突**：以实现 + 上述权威契约为准；本文需被更新。

---

## 1. 产品一句话（10 秒懂）

> **这是给 AI 管家用的钱包与账本系统**：
> 让用户用一个面板就确认：
> 1）AI 是否在“我的身份”下行动；
> 2）钱/额度是否可控（不会无限刷）；
> 3）每一步是否可追溯（证据链健康）；
> 4）市场执行是否健康（订单/租约/结算可用）。

---

## 2. 当前现状（已核验）与本计划的缺口

### 2.1 已经存在但入口分散

- **身份**：`/bind_wallet`、`/whoami_web3` + `web3.siwe.*`。
- **审计/锚定/归档**：hooks 写入 `audit-log.jsonl`，并可归档/锚定；已有 `web3.status.summary`、`web3.audit.query`、`/audit_status`。
- **计费与配额**：`before_tool_call` credits guard + `web3.billing.*` + `/credits`。
- **市场/资源**：`web3.market.*`（对外代理）+ `market.*`（内部权威）；已有 `/web3-market` 与 `web3_market_status`。
- **UI**：已有 Market 页面（`ui/src/ui/controllers/market-status.ts`）和 Web3 状态/Usage/Debug 等页面，但缺少“单页聚合”。

### 2.2 本计划要补的“产品缺口”

- 缺一个**单一入口**：用户不应靠拼图理解 Web3 状态。
- 缺一个**单一故事**：外部用户容易把它理解为“infra SDK”，而非“AI 管家安全花钱/可追溯”。
- 缺一份**AI 可执行的黄金路径**：目前有契约与约束，但缺“何时确认、何时自动化、如何降级/退款/争议”的脚本。

---

## 3. 硬性 Gate（上线门槛）

> 本计划的所有输出面必须满足这些 Gate，任何一个不满足都应视为阻断。

- **Gate-SEC-01（敏感信息零泄露）**
  - 任何对外输出（slash 命令、gateway method、UI、tools、HTTP route 错误、logs、能力自描述）不得包含：
    - `accessToken` 明文
    - Provider `endpoint` 或可直接访问的网络地址
    - 真实文件系统路径
- **Gate-ERR-01（稳定错误码）**
  - 对外返回必须使用稳定错误码集合（最低集合参考 `docs/reference/web3-resource-market-api.md`）。
- **Gate-CAP-01（能力自描述可操作）**
  - `web3.capabilities.*` 必须让 agent “只靠能力描述”构造安全请求（至少：参数结构、前置条件、风险/成本提示、错误码）。
- **Gate-STORE-01（双存储一致性）**
  - file/sqlite 模式行为一致（本计划不改 store backend，但新增/修改行为必须不破坏一致性测试矩阵）。

---

## 4. 交付物清单（小闭环）

### 4.1 Slash 命令：`/web3`（单页大面板）

**目标**：用一条命令回答“身份/预算/证据链/市场是否健康”，并给出下一步动作。

- **内容结构（建议）**
  - **Identity**：已绑定地址数量、主地址（截断）、链（如 Base）、最近验证时间
  - **Budget**：creditsQuota / creditsUsed、是否接近耗尽、最近活动时间
  - **Evidence**：audit 近期事件数、last anchor tx（截断）、pending 队列长度、archive last cid（截断）
  - **Market**：market status summary（orders/leases/ledger/disputes 计数摘要，若可得）
  - **Next actions**：
    - 未绑定 → 提示 `/bind_wallet`
    - credits 临界 → 提示 `/credits` 与“建议降低自动化级别/要求确认”
    - pending anchors > 0 → 提示 `/audit_status`
    - market 未启用/不可用 → 提示 `/web3-market start` 或 `/web3-market status`

**输出原则**：

- 默认“可分享粘贴”，所有敏感字段必须脱敏。
- 不做写操作；只读聚合。

### 4.2 Web 控制台：新增 Web3 Tab（单页仪表盘）

**目标**：在 UI 一页聚合展示与 `/web3` 同一套事实来源，提供 drill-down 到 Usage/Market/Debug。

- **顶部概览卡**：Identity / Billing / Audit / Market
- **风险提示**：P0/P1 风险用醒目但克制的 callout（例如“证据链未锚定”“余额接近耗尽”“市场 API 未就绪”）。
- **快捷动作**：复制命令、跳转 Market/Usage/Debug、手动刷新。

**性能要求**：

- 不引入高频轮询；页面进入时加载 + 手动刷新；建议 30s 以上刷新间隔。

### 4.3 `web3.capabilities.*`：稳定性分级（Stability）

**目标**：让外部团队与 AI 能明确区分：哪些 API 可依赖（Stable），哪些是试验（Experimental），哪些仅内部（Internal）。

- **新增字段**：`stability: "stable" | "experimental" | "internal"`（可选字段，保持向后兼容）。
- **落点**：
  - `web3.capabilities.list` 与 `describe` 输出中携带。
  - 文档侧以 `capabilities` 输出为“单一事实来源”。

### 4.4 文档：AI 管家黄金路径（必须场景化）

**目标**：补上“AI 如何合理自动化”的缺失章节。

至少给出两条场景：

- **场景 A：AI 管家租用资源（模型/搜索/存储）并控制成本**
  1. 发现资源：`web3.resources.list` / `web3.market.index.list`
  2. 解释价格与风险（必须包含：单位、上限、超限行为）
  3. 用户确认点（必须）：首次租用、超过预算阈值、跨链/桥接
  4. 租约签发：`web3.market.lease.issue`（一次性 token 处理规则）
  5. 调用 Provider routes（或 tools）：`web3.search.query` / `web3.storage.*` / `resolve_stream_fn`
  6. 对账与展示：`web3.market.ledger.summary` + `web3.billing.summary`
  7. 撤销/过期：`web3.market.lease.revoke` / `market.lease.expireSweep`

- **场景 B：AI 管家处理支付路径（TON / EVM 双栈）并保证可对账**
  - 只讲“如何解释与如何降级”，不要求本阶段落地双栈实现。
  - 统一口径引用：`docs/web3/WEB3_DUAL_STACK_STRATEGY.md` 与 `docs/reference/web3-dual-stack-payments-and-settlement.md`。

### 4.5 测试：最小覆盖矩阵

- `/web3` 输出脱敏测试（抽样检查禁止字段）。
- `web3.status.summary` 新增字段的向后兼容测试。
- `web3.capabilities.*` stability 字段输出测试。
- UI：Web3 Tab 能在“插件未加载/方法缺失”场景下给出可操作提示（参考 `market-status` controller 的 fail-fast 逻辑）。

---

## 5. 事实来源与数据聚合策略（避免 N 次 RPC）

### 5.1 单一快照：以 `web3.status.summary` 为主

- **原则**：UI 与 `/web3` 尽量依赖 `web3.status.summary` 获取“大部分事实”，减少额外读盘/探测。
- **计划增强**：给 `web3.status.summary` 追加（可选）identity 摘要与 nextActions（不破坏旧字段语义）。

### 5.2 Market 聚合策略

- 对“单页大面板”只需要摘要：
  - 优先用 `web3.market.status.summary` / `web3.market.metrics.snapshot`。
  - 深详情仍在 Market Tab / `/web3-market status deep`。

---

## 6. 信息脱敏与展示规范（/web3 + UI）

- 地址/tx/cid：只展示截断（例如 `0x1234…abcd`、`bafy…wxyz`）。
- 不显示 endpoint、token、Authorization、真实路径。
- 错误显示：
  - 用户/面板看到的是稳定错误码 + 可操作短消息。
  - 原始错误不得透传到对外输出面（避免包含 endpoint/path）。

---

## 7. API 稳定性分级建议（初版）

> 初版以“对外主线最少依赖”为原则：

- **Stable**（面板主线依赖）
  - `web3.status.summary`
  - `web3.billing.summary`
  - `web3.siwe.challenge` / `web3.siwe.verify`
  - `web3.capabilities.list` / `web3.capabilities.describe`
  - `/bind_wallet` `/whoami_web3` `/credits` `/audit_status` `/pay_status` `/web3-market`
- **Experimental**（可展示但不作为面板硬依赖）
  - `web3.market.reputation.summary`
  - `web3.market.tokenEconomy.*`
  - `web3.market.bridge.*`
  - `web3.monitor.*`（视当前实现成熟度）
- **Internal**
  - `market.*` 全部（仅供 `web3-core` 与受信运维）
  - `web3.index.*`（发现/测试面，默认不暴露 endpoint）

---

## 8. Postgres/Supabase 演进规划（本次不落地实现）

### 8.1 目标

- 解决 file 模式多实例/并发与一致性问题。
- 让 Web3/Market 状态可观测、可查询、可审计（不依赖扫描 JSON/JSONL）。

### 8.2 建议路线

- **短期**：文档明确单实例/共享卷要求（运行指导）。
- **中期**：统一 store 抽象（market 已有 sqlite 模式；web3 侧可对齐）。
- **长期**：引入 Postgres（可选 Supabase），但要求：
  - schema 明确（审计表、usage 表、pending 队列表、bindings 表）
  - 迁移与回滚可控
  - 多实例锁/幂等策略明确

---

## 9. 分阶段里程碑（可并行但要有依赖顺序）

- **M0（Day 0）**：/web3 的信息架构 + 脱敏规范 + nextActions 列表确定
- **M1（Week 1）**：新增 `/web3` + `web3.status.summary` identity 摘要 + `capabilities.stability`
- **M2（Week 1-2）**：Web UI Web3 Tab 上线（只读聚合 + drill-down）
- **M3（Week 2）**：黄金路径文档上线（场景 A/B）+ 文档引用对齐
- **M4（Week 2）**：关键测试补齐（脱敏、兼容性、UI degrade）

---

## 10. 验收标准（Definition of Done）

- `/web3` 输出：
  - 一屏回答身份/预算/证据链/市场健康度
  - 满足 Gate-SEC-01（抽样检查通过）
  - 不引入任何写操作
- Web3 Tab：
  - 在插件未加载/方法缺失时给出可操作提示
  - 聚合信息与 `/web3` 语义一致
- `web3.capabilities.*`：
  - 输出稳定性分级
  - 不破坏旧客户端
- 文档：
  - 黄金路径可被 AI 团队直接照着实现
  - 明确确认点、降级策略、敏感信息处理规则

---

## 11. 备注：已知文档漂移与待对齐点

- `market-core/ARCHITECTURE.md` 中提到的“market-core 不再注册 gateway methods”的迁移叙述，需要与当前实现核对与更新（当前 `market-core/src/index.ts` 仍注册大量 `market.*`）。
- `web3.dispute.*` 与 `market.dispute.*` 同时存在，且状态命名不同；对外稳定 API 的边界需要在 capabilities + docs 中明确标注。
