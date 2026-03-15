# OpenClaw Digital Service Market v1 执行计划

> **状态**：Approved for execution  
> **发布日期**：2026-03-13  
> **产品口径**：Invite Beta（邀请制 Beta），不是公开 GA  
> **产品定义**：`OpenClaw Private Steward + Verifiable Digital Service Market v1`

---

## 0. 执行摘要

本计划用于将 OpenClaw 当前的 Web3 / Market 能力，从“能力底座 + 运营面雏形”收束为一个可交付的成品：

- **前台**：`Private Steward`
- **交易底座**：`Web3 Market`
- **治理后台**：`OpenClaw Control`

第一版只承诺 **可验证数字服务** 的发现、购买、交付、验收、结算、争议与审计闭环。

### 0.1 第一版明确范围

仅纳入以下供给类型：

- 搜索
- 数据增强
- 模型推理
- 自动化工作流
- 代码 / 安全审查

### 0.2 第一版明确排除

以下内容不进入 v1 主承诺：

- RWA 交易
- 开放式人类服务市场
- 开放 A2A 市场化
- 泛化 Service Wrapper 重构
- “万物皆可交易” 对外叙事
- 全面迁移到 `Sui` 生产主线
- 链优先 / 代币优先的对外叙事

### 0.3 战略默认值（2026-03 冻结口径）

- **主线**：数字服务闭环产品化
- **生产链**：`EVM + TON`
- **未来账本**：`Sui-first` 并行原型
- **商业叙事**：卖 `accountable execution`，不卖“链”
- **表达标准**：所有方案、评估、PRD、RFC、实现说明默认遵循“信达雅”——可核验、讲清边界、不过度宣称

---

## 1. 产品原则

### 1.1 对外叙事

对外只卖一句话：

> **OpenClaw 是你的私人 AI 管家，能替你发现、购买、验证、结算并审计外部数字服务。**

### 1.2 协议分层

- `MCP`：工具 / 数据入口层
- `A2A` / `ACP`：协同层
- `OpenClaw Market`：报价、租约、proof、争议、结算、对账层
- `chain / wallet / identity`：信任锚、签名、支付与审计层

### 1.3 不可违背的架构约束

- 公共契约保持在 `web3.*`
- 权威执行与经济状态保持在 `market.*`
- token / provider endpoint / 真实路径不得出现在普通输出面
- proof、settlement、dispute 必须绑定，不能拆成互不关联的孤立流程
- `file` / `sqlite` 两种 store 行为必须一致
- `EVM + TON` 是当前生产闭环，不得因未来账本研究而被无计划扰动
- `Sui-first` 研究默认走并行原型线，不得伪装成已迁移完成的现网事实

### 1.4 链角色分工

- **`EVM`**：稳定币流动性、Treasury、跨链桥与外部 DeFi 兼容
- **`TON`**：分发、轻量支付入口、Telegram 生态触达
- **`Sui`**：能力 / 租约 / 回执 / 托管 / 奖励等对象化账本的未来方向

> 约束：默认采用 **链下 discovery / quote + 链上 lease / settlement / audit**。Prompt、数据、模型权重、推理结果保持链下，只把哈希承诺、回执与策略锚点上链。

### 1.5 从可观察 A2A 到 accountable execution

近期公开 A2A 案例说明，真正产生网络效应的，不是协议名词本身，而是以下四个产品要素同时成立：

- **公共可观察性**：agent 行为一旦可围观，就会形成传播、模仿、角色分层与 reputation 聚集。
- **周期性 agent 行为**：`heartbeat` 让 agent 网络不是一次性 demo，而是具有持续存在感的活动系统。
- **社交表面**：论坛、线程、社区、回复等交互表面，比抽象 protocol 更容易被用户理解和传播。
- **低门槛接入**：`skill` 驱动的加入方式，本质上既是扩展机制，也是网络增长机制。

但 `OpenClaw` 的主线响应不是复制“公开 agent 社交网络”，而是将这四点翻译为 **可观察的 accountable execution**：

- 让重要执行过程可见，但默认分级可见、默认脱敏
- 让 `heartbeat` 服务于 quote、delivery、SLA、risk、acceptance 等治理场景，而不是无边界远端指令拉取
- 让产品表面优先呈现任务线程、执行时间线、proof 摘要、settlement / dispute 状态，而不是抽象协议术语
- 让 `skill` / preset / template 成为 provider、buyer 与 operator 进入市场闭环的低摩擦入口

一句话：**我们要的不是 agent 社交网络，而是带网络效应的可问责执行网络。**

---

## 2. 单一执行真相源

### 2.1 代码真相源

按优先级使用：

1. `extensions/web3-core/src/index.ts`
2. `extensions/market-core/src/index.ts`
3. `extensions/web3-core/src/register-market.ts`
4. `extensions/web3-core/src/register-resources.ts`
5. `extensions/web3-core/src/capabilities/catalog/**`

### 2.2 文档真相源

本计划优先级高于旧的泛路线图叙事；若旧文档仍保留长期愿景，应明确区分：

1. 当前已实现事实
2. Invite Beta 可承诺能力
3. 未来规划能力

---

## 3. P0 成品执行清单

## P0-1：Provider 上架闭环成品化

### 目标

将“启用 market + 手工补 offers + 重启 gateway”收束成真正的卖家上架体验。

### 范围

- offer 创建
- offer 编辑
- offer 校验
- publish / unpublish / close
- 首次上架向导
- 发布前检查

### 模块落点

- `extensions/market-core/src/market/handlers/offer.ts`
- `extensions/web3-core/src/register-market.ts`
- `extensions/web3-core/src/capabilities/catalog/*`
- `extensions/web3-core/src/resources/market-tools.ts`
- `ui/src/ui/controllers/market-status.ts`
- `ui/src/ui/views/market.ts`

### 验收标准

- 新 provider 在 30 分钟内完成首次上架
- 无需手改配置文件即可完成首次发布
- 发布失败返回稳定错误码
- 敏感字段零泄露

---

## P0-2：Buyer 购买闭环成品化

### 目标

把 tool / RPC 入口收束成买家可理解的购买路径。

### 范围

- 服务列表
- 服务详情
- 报价说明
- 下单确认
- 预算 / 授权确认
- 订单状态跟踪

### 模块落点

- `extensions/market-core/src/market/handlers/order.ts`
- `extensions/web3-core/src/market/*`
- `extensions/web3-core/src/register-market.ts`
- `ui/src/ui/controllers/market-status.ts`
- `ui/src/ui/views/market.ts`

### 验收标准

- 新 buyer 在 10 分钟内完成首次购买
- 下单前能看到价格、供给方、交付方式、proof 方式、预算影响
- 订单状态机稳定且可追踪

---

## P0-3：Proof / Acceptance / Dispute 闭环

### 目标

将“服务调用成功”升级为“可验证交付、可验收、可争议”的交易闭环。

### 范围

- proof 统一结构
- accept / reject
- release / refund
- dispute 发起、证据提交、裁决回写

### 模块落点

- `extensions/market-core/src/market/handlers/service-proof.ts`
- `extensions/market-core/src/market/handlers/dispute.ts`
- `extensions/market-core/src/market/handlers/task-result.ts`
- `extensions/web3-core/src/market/*`
- `ui/src/ui/views/market.ts`

### 验收标准

- 每笔交易均可关联 order、proof、receipt、ledger
- accept 触发 release
- reject 可转 dispute
- 证据默认摘要化 / hash 化

---

## P0-4：Control 面成品化

### 目标

将 market UI 从“读看板”补成“可运营、可治理、可排障”的后台。

### 范围

- provider 管理
- 订单 / 交付 / 争议检索
- 风险与预算治理
- 告警 / 健康探针
- 审计与回滚辅助视图

### 模块落点

- `ui/src/ui/controllers/market-status.ts`
- `ui/src/ui/views/market.ts`
- `ui/src/ui/views/market-*.ts`
- `extensions/web3-core/src/monitor/*`

### 验收标准

- operator 可独立查询、定位、处置 Beta 常见异常
- 风险动作均有审计记录
- UI 不再只有“启用 + 刷新”两类动作

---

## P0-5：Go-live 运维闭环

### 目标

将“内核可跑”升级到“受控上线可值班”。

### 范围

- 部署拓扑说明
- 单实例 / 多实例边界
- webhook / poller 故障处理
- 关键指标
- runbook / rollback / degrade

### 模块落点

- `docs/reference/web3-ga-runbook.md`
- `docs/plugins/market-core.md`
- `docs/plugins/web3-core.md`
- `extensions/market-core/src/state/*`
- `extensions/web3-core/src/monitor/*`

### 验收标准

- 值班同学无需阅读源码即可完成基础排障
- 监控、回滚、熔断和降级策略成文
- 单实例 / 多实例支持边界明确

---

## P0-6：契约统一与发布口径收敛

### 目标

让代码、docs、catalog、UI、命令和测试使用同一套说法。

### 范围

- capability stability 统一
- docs 重写与删减过度承诺
- UI / command 文案统一
- catalog schema 完整化
- Beta FAQ 与发布说明

### 模块落点

- `extensions/web3-core/src/capabilities/catalog/**`
- `extensions/web3-core/src/market/web3-market-command.ts`
- `docs/concepts/web3-market.md`
- `docs/plugins/web3-core.md`
- `docs/plugins/market-core.md`

### 验收标准

- 仅对外承诺 Invite Beta 级能力
- experimental 能力不进入主卖点
- catalog 能独立支撑 agent 构造请求

---

## 4. 上线硬门禁（必须全部通过）

- **Gate-SEC-01**：敏感信息零泄露
- **Gate-ERR-01**：稳定错误码
- **Gate-LEDGER-01**：权威记账不可伪造
- **Gate-STORE-01**：`file/sqlite` 行为一致
- **Gate-SETTLE-01**：结算闭环可执行
- **Gate-ATOMIC-01**：多对象写入原子性
- **Gate-TEST-01**：关键路径测试覆盖

---

## 5. 实施顺序

### Phase A：冻结成品边界

- 冻结产品定义
- 冻结供给类型
- 冻结状态机与门禁

### Phase B：卖家能卖

- 上架向导
- offer flow
- publish / unpublish

### Phase C：买家能买

- 浏览
- 下单
- 授权
- 订单跟踪

### Phase D：交易能闭

- proof
- accept / reject
- dispute
- settlement

### Phase E：运营能控

- Control 面
- 告警与健康探针
- 风险处置

### Phase F：发布能扛

- runbook
- rollout / rollback
- Beta 文档与演练

---

## 6. Done 定义

Invite Beta 级成品必须同时满足：

- Provider 能上架
- Buyer 能购买
- 服务能交付
- 用户能验收
- 系统能结算
- 异常能争议
- Operator 能值班
- 文档与契约口径一致

---

## 7. 本计划与既有路线图的关系

- 本计划 **优先于** “万物皆可交易” 的宽口径叙事
- 本计划是对现有运行时事实的 **产品化收束**，不是对未来长期路线图的否定
- 任务市场、隐私市场、A2A Market、RWA 等能力如继续推进，必须作为 **后续阶段** 或 **实验能力** 明确标注，不得污染 v1 主承诺
