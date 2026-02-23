## Web3 Butler Ops Playbook（工业级运行手册）

> 本手册是 `skills/web3-butler/SKILL.md` 的可执行扩展：面向 **AI 管家/一线支持/运营操盘手**。

---

## 0) 统一输出模板（建议固定格式）

- **Verdict**：OK / degraded / blocked
- **Blocker（若有）**：一句话描述“缺哪个前置条件/权限/配置”
- **Evidence**：引用 2-4 个关键字段（全部脱敏）
- **Next step**：给 1 条最小动作（优先 1 条命令）

> 任何时候：不要在输出中包含 `accessToken`、endpoint、真实文件路径。

---

## 1) 单次排障（single-pass triage）

### Step A — 能力发现（不猜测）

调用：

- `web3.capabilities.list`

判读：

- 缺 capability：用 `availability.reason` 作为**主诊断**。
- 需要做写操作前：先 `web3.capabilities.describe` 获取 params shape / prerequisites / 风险提示。

### Step B — Core 健康度（身份/计费/证据链）

调用：

- `web3.status.summary`

聚焦：

- Identity 是否就绪（SIWE 开关、绑定数）
- Billing 是否就绪（credits/quota、exhausted）
- Evidence 是否健康（audit 近期事件、anchor/archive 队列、失败计数）

### Step C — Market 健康度（执行闭环）

调用：

- `web3.market.status.summary`

可选：

- `web3_market_status`（生成可分享的脱敏快照）

### Step D — 输出“最小下一步”

- 只给 **1 条**下一步动作（避免给用户一串待办）。
- 如果下一步是写操作：进入“确认门槛（Approval gate）”。

---

## 2) 确认门槛（Approval gates：哪些必须明确确认）

必须明确确认（复述影响 + 用户回复确认）后才能执行：

- **启用/写配置**：`/web3-market enable ok`
- **资源发布/下线**：`web3.resources.publish/unpublish` 或 `web3.market.resource.publish/unpublish`
- **租约签发/撤销**：`web3.resources.lease/revokeLease` 或 `web3.market.lease.issue/revoke`
- **争议裁决**：`web3.market.dispute.resolve/reject`（或等价写操作）
- **任何资金类动作**：跨链桥接、token economy 写入（mint/burn/configure/governance update）

复述模板（建议照抄）：

- “我将执行：<动作>”
- “影响：<谁/什么会改变>”
- “可回滚：<是/否/取决于…>”
- “成本/风险：<一句话>”
- “你确认继续吗？”

---

## 3) 常见场景脚本（recipes）

### 3.1 “启用并验证 Web3 Market”（guided）

1. 只读引导：`/web3-market start`
2. 用户确认后启用：`/web3-market enable ok`
3. 重启 gateway（按仓库推荐方式）
4. 复验：`/web3-market status` + `web3.status.summary`

输出：

- 说明启用后哪些能力变为 available
- 给出“第一条可验证动作”（例如：`/bind_wallet` 或 `web3.market.status.summary`）

### 3.2 “为什么用户租不到资源？”

1. `web3.capabilities.describe`：租约签发能力（优先 `web3.resources.lease`）
2. 检查 prerequisites：身份/权限/市场是否启用/资源是否可见
3. `web3.market.status.summary`：确认资源目录/租约系统是否健康

常见阻断原因（输出必须具体到一条）：

- 未绑定钱包（提示 `/bind_wallet`）
- credits 不足（提示 `/credits`）
- 市场未启用（提示 `/web3-market start`）
- 权限不足（提示需要管理员/actor 权限）

### 3.3 “租约签发返回 token，怎么处理？”（非常关键）

原则（权威约束）：

- 明文 token **只能**在租约签发响应中出现一次（`market.lease.issue` 及其对外入口）。
- Butler **永远不要复述/转发** token（哪怕用户粘贴了也要立刻提醒撤回/轮换）。

标准回应：

- 提醒用户把 token 立即存到安全位置（密码管理器/安全变量）
- 后续排障只看：`leaseId/orderId/expiresAt`（全部可脱敏）

### 3.4 “帮主人把资源分享出去（发布/下线/定价）”（偏赚钱）

目标：把主人的资源发布成市场可租用的条目，并用信誉与账本做持续运营。

1. 只读摸底：`web3.market.index.list`（或 `web3.market.resource.list`）看同类价格与单位
2. 定价建议（不承诺收益）：
   - 解释单位（token/call/query/gb_day/put/get）
   - 给出 1-2 个保守定价方案（更偏稳定成交）
3. 二次确认后发布：`web3.resources.publish`（或 `web3.market.resource.publish`）
4. 复验可见性：`web3.resources.list` / `web3.market.resource.get`
5. 运营复盘：
   - `web3.market.reputation.summary`（信誉变化）
   - `web3.market.ledger.summary`（收入/成本对账）

下线资源：二次确认后 `web3.resources.unpublish` / `web3.market.resource.unpublish`。

### 3.5 “争议处理（Dispute handling）”（必须谨慎）

1. 只读收集：`web3.market.dispute.get/list`
2. 让用户提供**可脱敏证据**：订单/租约/账本摘要（不要 token/endpoint/路径）
3. 给出 2-3 个裁决路径（release/refund/partial 等），说明后果
4. 用户明确确认后执行：`web3.market.dispute.resolve` 或 `web3.market.dispute.reject`
5. 输出脱敏复盘：disputeId + 状态变更 + 下一步对账入口

### 3.6 “隐私 / consent / 撤销（Privacy workflow）”

运营口径必须对齐 `docs/reference/web3-resource-market-api.md` 与 `skills/web3-market/references/web3-market-privacy-knowledge.md`：

- 默认最小披露
- 默认可撤销
- 全程可审计

建议输出中必须包含：

- 数据类别分级（P0/P1/P2）的提醒
- 用户确认点（首次授权/扩大范围/跨域共享）
- 撤销后的预期行为（访问应立即失败/租约撤销/审计记录产生）

若 capability 未暴露 privacy/consent 的对外入口：

- 只读诊断现状
- 明确告知“需要开发侧补齐对外 `web3.*` 入口”，不要引导用户直接调用 `market.*` 写接口

### 3.7 “监控告警：我现在是不是要出事了？”（偏保运气）

1. `/alerts` 或 `web3.monitor.alerts.list`
2. `/health` 或 `web3.monitor.health`
3. `web3.monitor.snapshot`（若需要一屏汇总）

输出：

- 把告警按严重度分层（P0/P1/P2）
- 给 1 条“最小缓解动作”（例如“先停发布/先下线资源/先暂停桥接写入”）

> 对任何“会扩大损失”的动作（继续桥接/继续签发大额租约）必须进入二次确认。

### 3.8 “市场动态简报（资讯 + 自由市场变化）”（只读、不给收益承诺）

目标：让主人快速知道市场发生了什么、哪里更稳、哪里风险更高。

推荐调用（只读）：

- `web3.market.metrics.snapshot`
- `web3.market.reputation.summary`
- `web3.market.tokenEconomy.summary`
- `web3.market.index.list`

输出建议结构：

- **今日市场温度**：供给/需求/成交活跃（来自 metrics）
- **信誉变化**：高信誉资源比例、异常信号（来自 reputation）
- **成本与预算提醒**：credits/结算 pending（来自 status/billing）
- **一个可执行下一步**：例如“把某类资源下线/把某类资源加价 5%/先观望并设预算阈值”

### 3.9 “跨链桥接（高风险，默认不执行）”

1. 只读：`web3.market.bridge.routes`（可行路径、预估成本/时间）
2. 二次确认后：`web3.market.bridge.request`
3. 跟踪：`web3.market.bridge.status` / `web3.market.bridge.list`
4. 更新（受信调用）：`web3.market.bridge.update`

安全提醒：桥接是资金类动作，必须让主人明确确认金额、目标链、接受的滑点/延迟与失败后处理策略。

### 3.10 “Agent Wallet（AI 自己的钱包）相关支持（可选插件）”

当未来启用 `agent-wallet`（或能力目录出现相应项）时：

- 明确区分：
  - **用户钱包（SIWE 绑定）**：代表主人身份与授权
  - **AI 钱包（agent-wallet）**：代表 AI 的经济主体
- 所有涉及 AI 钱包的签名/转账属于高风险，必须二次确认。
- 排障只输出：地址截断、余额区间、最近交易 tx 截断（如果能力提供），不输出私钥/密钥/存储路径。

---

## 4) 生产级“安全与合规”检查点（务必遵守）

- **不泄露三件套**：token / endpoint / real path（见 `docs/reference/web3-market-output-redaction.md`）
- **不要让用户把 secrets 粘贴到聊天**：看到后立刻提示撤回与轮换
- **不猜测**：方法名、参数、权限、资源可用性都以 `web3.capabilities.*` 为准
- **风险分级输出**：对资金/授权/争议类操作明确标注“不可逆/有成本/需要确认”

---

## 5) 运行期已知风险（用于解释“为什么不一致/为什么不稳定”）

- 若出现“方法名漂移/同义别名混乱”：优先以 `web3.*` 对外稳定入口为准，并记录需要开发侧对齐。
- 若出现“脱敏不一致”：立即停止让用户贴全文日志，改用 `web3_market_status` 或最小字段摘要。
- 若出现“争议处理缺口”：明确告知当前能力不完整，建议走人工流程并要求开发侧补齐 `web3.market.dispute.*`。

---

## 6) 扩展：规模化与并行执行（规划态口径）

当用户问“多设备并行/资源调度”时：

- 解释口径以 `skills/web3-market/references/web3-market-plan-parallel-execution-ray-celery.md` 为准。
- Butler 当前只做：读路径解释、容量风险提示、建议下一步（例如让开发/运维补齐指标与 capability 描述）。
- 不承诺“已经支持”，除非 `web3.capabilities.list` 明确可用。
