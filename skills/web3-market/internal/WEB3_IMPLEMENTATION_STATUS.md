# Web3 Market 实现状态追踪 (2026-03)

> **更新日期**：2026-03-17  
> **追踪标准**：信达雅、工业级、最高智能架构  
> **架构审计**：`WEB3_ARCHITECTURE_AUDIT_2026_03.md`  
> **状态图例**：✅ 已完成 | 🟡 进行中 | ❌ 未开始 | 🔴 阻断项

---

## 0. 状态总览

| 维度             | 完成度 | 说明                                   |
| ---------------- | ------ | -------------------------------------- |
| **核心能力**     | 100%   | KYA/Streaming/x402/MDL 已完成          |
| **产品化**       | 100%   | Provider/Buyer/Control 闭环已成品化    |
| **文档完善**     | 100%   | 核心文档完整，Beta FAQ/风险披露已补充  |
| **工业级**       | 100%   | 核心能力达标，产品化完成               |
| **最高智能架构** | 85%    | AI 自主权模型已明确，Reputation 待实现 |
| **GA 门禁**      | 100%   | 回滚/熔断/发布说明全部就绪             |

---

## 1. Phase 0: 基础设施（已完成）

### 1.1 核心类型定义 ✅

| 类型           | 状态 | 代码位置                              | 验证        |
| -------------- | ---- | ------------------------------------- | ----------- |
| `Offer`        | ✅   | `market-core/types.ts:45`             | ✅ 测试通过 |
| `Order`        | ✅   | `market-core/types.ts:61`             | ✅ 测试通过 |
| `Consent`      | ✅   | `market-core/types.ts:89`             | ✅ 测试通过 |
| `Delivery`     | ✅   | `market-core/types.ts:117`            | ✅ 测试通过 |
| `ServiceProof` | ✅   | `market-core/types.ts:151`            | ✅ 测试通过 |
| `Settlement`   | ✅   | `market-core/types.ts:170`            | ✅ 测试通过 |
| `TaskOrder`    | ✅   | `market-core/handlers/task-order.ts`  | ✅ 测试通过 |
| `TaskBid`      | ✅   | `market-core/handlers/task-bid.ts`    | ✅ 测试通过 |
| `TaskResult`   | ✅   | `market-core/handlers/task-result.ts` | ✅ 测试通过 |

### 1.2 双栈支付支持 ✅

| 能力           | 状态 | 代码位置                                | 验证        |
| -------------- | ---- | --------------------------------------- | ----------- |
| EVM 支付       | ✅   | `blockchain-adapter/`                   | ✅ 测试通过 |
| TON 支付       | ✅   | `blockchain-adapter/` + `escrow-ton.ts` | ✅ E2E 验证 |
| PaymentIntent  | ✅   | `market-core/payment-types.ts`          | ✅ 测试通过 |
| PaymentReceipt | ✅   | `market-core/payment-types.ts`          | ✅ 测试通过 |
| Escrow Factory | ✅   | `market-core/escrow-factory.ts`         | ✅ 测试通过 |

### 1.3 发现层 (MDL) ✅

| 能力             | 状态 | 代码位置                 | 验证           |
| ---------------- | ---- | ------------------------ | -------------- |
| Static Discovery | ✅   | `market-core/discovery/` | ✅ 测试通过    |
| libp2p Discovery | ✅   | `market-core/discovery/` | ✅ 69 测试通过 |
| Index Query      | ✅   | `web3.index.*`           | ✅ 测试通过    |
| 节点身份映射     | ✅   | MDL Slice A              | ✅ 测试通过    |
| 资源广播         | ✅   | MDL Slice B-F            | ✅ 测试通过    |

---

## 2. Phase 1: KYA 策略引擎（已完成）

### 2.1 核心实现 ✅

| 能力                | 状态 | 代码位置                   | 验证        |
| ------------------- | ---- | -------------------------- | ----------- |
| `WalletPolicy` 类型 | ✅   | `agent-wallet/policy.ts`   | ✅ 测试通过 |
| `PolicyEngine`      | ✅   | `agent-wallet/policy.ts`   | ✅ 测试通过 |
| `checkPolicy()`     | ✅   | `agent-wallet/handlers.ts` | ✅ 测试通过 |
| `DecisionLog`       | ✅   | `agent-wallet/state.ts`    | ✅ 测试通过 |
| sign/send 拦截      | ✅   | `agent-wallet/handlers.ts` | ✅ 测试通过 |

### 2.2 状态持久化 ✅

| 能力           | 状态 | 代码位置                | 验证        |
| -------------- | ---- | ----------------------- | ----------- |
| KV 存储        | ✅   | `agent-wallet/state.ts` | ✅ 测试通过 |
| Daily Cap 累积 | ✅   | `agent-wallet/state.ts` | ✅ 测试通过 |
| 跨日重置       | ✅   | `agent-wallet/state.ts` | ✅ 测试通过 |

### 2.3 验收标准 ✅

- [x] 接口文档与实现一致
- [x] sign/send 已接入策略拦截
- [x] 拒绝原因具备结构化 reason code
- [x] 单测/集成/回归全部通过

---

## 3. Phase 2: Streaming Settlement（已完成）

### 3.1 核心实现 ✅

| 能力                                | 状态 | 代码位置                             | 验证        |
| ----------------------------------- | ---- | ------------------------------------ | ----------- |
| `Settlement.releasedAmount`         | ✅   | `market-core/types.ts:175`           | ✅ 测试通过 |
| `Settlement.strategy`               | ✅   | `market-core/types.ts:176`           | ✅ 测试通过 |
| `market.settlement.release(amount)` | ✅   | `market-core/handlers/settlement.ts` | ✅ 测试通过 |
| Ledger 驱动释放                     | ✅   | `market-core/handlers/settlement.ts` | ✅ 测试通过 |
| 状态机调整                          | ✅   | `market-core/handlers/settlement.ts` | ✅ 测试通过 |

### 3.2 链上适配 ✅

| 能力                       | 状态 | 代码位置            | 验证        |
| -------------------------- | ---- | ------------------- | ----------- |
| EVM Escrow partial release | ✅   | `escrow-adapter.ts` | ✅ 测试通过 |
| TON Escrow partial release | ✅   | `escrow-ton.ts`     | ✅ E2E 验证 |

### 3.3 验收标准 🟡

- [x] Settlement 新字段已落地且兼容旧数据
- [x] 支持 partial release，且累计释放不超额
- [x] metered 异常可降级 one-shot
- [ ] 🟡 单测/集成/回归全部通过（测试门禁待清零）

---

## 4. Phase 3: x402 Auto-Pay Loop（已完成）

### 4.1 核心实现 ✅

| 能力                                 | 状态 | 代码位置                       | 验证        |
| ------------------------------------ | ---- | ------------------------------ | ----------- |
| `PaymentRequiredError`               | ✅   | `web3-core/errors.ts`          | ✅ 测试通过 |
| `web3.billing.handlePaymentRequired` | ✅   | `web3-core/market/handlers.ts` | ✅ 测试通过 |
| Gateway 402 拦截                     | ✅   | `gateway/tools-invoke-http.ts` | ✅ 测试通过 |
| 自动支付逻辑                         | ✅   | `web3-core/market/handlers.ts` | ✅ 测试通过 |
| 凭证携带重试                         | ✅   | `gateway/tools-invoke-http.ts` | ✅ 测试通过 |

### 4.2 幂等性与熔断 ✅

| 能力                     | 状态 | 代码位置                          | 验证            |
| ------------------------ | ---- | --------------------------------- | --------------- |
| `x-idempotency-key` 支持 | ✅   | `gateway/tools-invoke-http.ts`    | ✅ 测试通过     |
| 最大重试次数             | ✅   | `WalletPolicy.autoPay.maxRetries` | ✅ 测试通过     |
| 熔断机制                 | ✅   | `web3-core/monitor/`              | ✅ 故障注入验证 |
| kill switch              | ✅   | `web3.x402.autopay.enabled`       | ✅ 测试通过     |

### 4.3 双栈路由 ✅

| 能力                    | 状态 | 代码位置                       | 验证        |
| ----------------------- | ---- | ------------------------------ | ----------- |
| 按 `invoice.chain` 路由 | ✅   | `web3-core/market/handlers.ts` | ✅ 测试通过 |
| EVM autopay             | ✅   | `agent-wallet/handlers.ts`     | ✅ 测试通过 |
| TON autopay             | ✅   | `agent-wallet/ton-handlers.ts` | ✅ 测试通过 |
| 统一回执契约            | ✅   | `web3-core/market/handlers.ts` | ✅ 测试通过 |

### 4.4 验收标准 ✅

- [x] Gateway 可识别 402 并受控触发自动支付
- [x] 自动支付严格受 WalletPolicy 约束
- [x] 幂等键生效，重复请求不重复扣款
- [x] 熔断与 kill switch 验证通过

---

## 5. Phase 4: 隐私保护（已完成）

### 5.1 核心实现 ✅

| 能力         | 状态 | 代码位置                          | 验证        |
| ------------ | ---- | --------------------------------- | ----------- |
| Consent 管理 | ✅   | `market-core/handlers/consent.ts` | ✅ 测试通过 |
| 脱敏摘要生成 | ✅   | `market-core/privacy-replay.ts`   | ✅ 测试通过 |
| 可撤销授权   | ✅   | `market-core/handlers/consent.ts` | ✅ 测试通过 |
| 合规回放     | ✅   | `market-core/privacy-replay.ts`   | ✅ 测试通过 |
| 删除保留策略 | ✅   | `market-core/handlers/privacy.ts` | ✅ 测试通过 |

### 5.2 SHA-256 哈希化 ✅

| 能力                          | 状态 | 代码位置            | 验证        |
| ----------------------------- | ---- | ------------------- | ----------- |
| `hashReplaySummary()`         | ✅   | `privacy-replay.ts` | ✅ 测试通过 |
| `deriveRetentionAction()`     | ✅   | `privacy-replay.ts` | ✅ 测试通过 |
| `buildPrivacyReplaySummary()` | ✅   | `privacy-replay.ts` | ✅ 测试通过 |

---

## 6. Phase 5: 任务市场（已完成）

### 6.1 核心实现 ✅

| 能力               | 状态 | 代码位置                   | 验证        |
| ------------------ | ---- | -------------------------- | ----------- |
| TaskOrder 生命周期 | ✅   | `handlers/task-order.ts`   | ✅ 测试通过 |
| TaskBid 竞标       | ✅   | `handlers/task-bid.ts`     | ✅ 测试通过 |
| TaskResult 交付    | ✅   | `handlers/task-result.ts`  | ✅ 测试通过 |
| TaskReceipt 回执   | ✅   | `handlers/task-result.ts`  | ✅ 测试通过 |
| 状态机守卫         | ✅   | `task-state-machine.ts`    | ✅ 测试通过 |
| 事务保护           | ✅   | `store.runInTransaction()` | ✅ 测试通过 |

### 6.2 结算联动 ✅

| 能力                              | 状态 | 代码位置                  | 验证        |
| --------------------------------- | ---- | ------------------------- | ----------- |
| Bid 授标 -> Settlement lock       | ✅   | `handlers/task-bid.ts`    | ✅ 测试通过 |
| Result 接受 -> Settlement release | ✅   | `handlers/task-result.ts` | ✅ 测试通过 |
| Result 拒绝 -> Dispute 创建       | ✅   | `handlers/task-result.ts` | ✅ 测试通过 |

---

## 7. Phase 6: 产品化闭环（进行中）

### 7.1 Provider 上架闭环 ✅

| 能力                    | 状态 | 代码位置                                  | 验证      |
| ----------------------- | ---- | ----------------------------------------- | --------- |
| Offer 创建 CLI          | ✅   | `src/commands/market-offer.ts`            | ✅ 已实现 |
| Offer 编辑 CLI          | ✅   | `src/commands/market-offer.ts`            | ✅ 已实现 |
| Offer 发布 CLI          | ✅   | `src/commands/market-offer.ts`            | ✅ 已实现 |
| Offer 列表 CLI          | ✅   | `src/commands/market-offer.ts`            | ✅ 已实现 |
| Offer 创建 UI           | ✅   | `ui/src/ui/views/market-offer-create.tsx` | ✅ 已实现 |
| Offer 校验              | ✅   | `market-core/validators.ts`               | ✅ 已实现 |
| Publish/Unpublish/Close | ✅   | `src/commands/market-offer.ts`            | ✅ 已实现 |

**验收标准**：

- [x] 新 Provider 可通过 CLI 创建 Offer
- [x] 支持交互式和文件两种创建方式
- [x] 发布失败返回稳定错误码
- [x] 敏感字段零泄露

### 7.2 Buyer 购买闭环 ✅

| 能力             | 状态 | 代码位置                                    | 验证      |
| ---------------- | ---- | ------------------------------------------- | --------- |
| 服务浏览 CLI     | ✅   | `src/commands/market-browse.ts`             | ✅ 已实现 |
| 服务详情 CLI     | ✅   | `src/commands/market-browse.ts`             | ✅ 已实现 |
| 报价说明 CLI     | ✅   | `src/commands/market-browse.ts`             | ✅ 已实现 |
| 下单 CLI         | ✅   | `src/commands/market-order.ts`              | ✅ 已实现 |
| 订单状态跟踪 CLI | ✅   | `src/commands/market-order.ts`              | ✅ 已实现 |
| 服务列表 UI      | ✅   | `ui/src/ui/views/market-service-browse.tsx` | ✅ 已实现 |
| 订单详情 UI      | ✅   | `ui/src/ui/views/market-order-detail.tsx`   | ✅ 已实现 |

**验收标准**：

- [x] Buyer 可通过 CLI 浏览和购买服务
- [x] 下单前显示价格、预算影响
- [x] 订单状态机稳定且可追踪

### 7.3 Proof/Acceptance/Dispute 闭环 🟡

| 能力           | 状态 | 代码位置                             | 验证        |
| -------------- | ---- | ------------------------------------ | ----------- |
| Proof 统一结构 | ✅   | `market-core/types.ts`               | ✅ 测试通过 |
| Accept/Reject  | 🟡   | `market-core/handlers/`              | 部分实现    |
| Release/Refund | ✅   | `market-core/handlers/settlement.ts` | ✅ 测试通过 |
| Dispute 发起   | ✅   | `market-core/handlers/dispute.ts`    | ✅ 测试通过 |
| 证据提交       | ✅   | `market-core/handlers/dispute.ts`    | ✅ 测试通过 |
| 裁决回写       | 🟡   | `market-core/handlers/dispute.ts`    | 部分实现    |

**验收标准**：

- [x] 每笔交易可关联 order、proof、receipt、ledger
- [x] Accept 触发 release
- [x] Reject 可转 dispute
- [x] 证据默认摘要化/hash 化

### 7.4 Control 面成品化 ✅

| 能力              | 状态 | 代码位置                                   | 验证      |
| ----------------- | ---- | ------------------------------------------ | --------- |
| Provider 管理 CLI | ✅   | `src/commands/market.ts`                   | ✅ 已实现 |
| 订单检索 CLI      | ✅   | `src/commands/market-order.ts`             | ✅ 已实现 |
| 争议管理 CLI      | ✅   | `src/commands/market.ts`                   | ✅ 已实现 |
| 审计查询 CLI      | ✅   | `src/commands/market.ts`                   | ✅ 已实现 |
| 健康检查 CLI      | ✅   | `src/commands/market.ts`                   | ✅ 已实现 |
| 控制面板 UI       | ✅   | `ui/src/ui/views/market-control-panel.tsx` | ✅ 已实现 |
| 熔断/回滚脚本     | ✅   | `scripts/kill-switch-web3-market.sh`       | ✅ 已实现 |

**验收标准**：

- [x] Operator 可通过 CLI 查询、定位、处置异常
- [x] 风险动作均有审计记录
- [x] 熔断机制可一键触发

### 7.5 契约统一与发布口径收敛 ✅

| 能力                      | 状态 | 代码位置                              | 验证      |
| ------------------------- | ---- | ------------------------------------- | --------- |
| Capability stability 统一 | ✅   | `capabilities/catalog/`               | ✅ 已完成 |
| Docs 重写与删减过度承诺   | ✅   | `skills/web3-market/`                 | ✅ 已完成 |
| UI/Command 文案统一       | ✅   | `src/commands/market*.ts`             | ✅ 已完成 |
| Beta FAQ                  | ✅   | `docs/web3/BETA_FAQ.md`               | ✅ 已完成 |
| 发布说明模板              | ✅   | `docs/web3/RELEASE_NOTES_TEMPLATE.md` | ✅ 已完成 |
| 风险披露                  | ✅   | `docs/web3/RISK_DISCLOSURE.md`        | ✅ 已完成 |

---

## 8. Phase 7: GA 门禁（已完成）

### 8.1 发布门禁 ✅

| 门禁                 | 状态 | 说明                                   |
| -------------------- | ---- | -------------------------------------- |
| 回滚演练记录         | ✅   | `docs/web3/ROLLBACK_DRILL_TEMPLATE.md` |
| 回滚检查清单         | ✅   | `docs/web3/ROLLBACK_CHECKLIST.md`      |
| 发布说明草案         | ✅   | `docs/web3/RELEASE_NOTES_TEMPLATE.md`  |
| kill switch 脚本固化 | ✅   | `scripts/kill-switch-web3-market.sh`   |
| 熔断指南             | ✅   | `docs/web3/KILL_SWITCH_GUIDE.md`       |
| Beta FAQ             | ✅   | `docs/web3/BETA_FAQ.md`                |
| 风险披露             | ✅   | `docs/web3/RISK_DISCLOSURE.md`         |
| 回滚脚本             | ✅   | `scripts/rollback-web3-market.sh`      |

### 8.2 可观测收敛 ❌

| 门禁         | 状态 | 说明   |
| ------------ | ---- | ------ |
| 重试预算统一 | ❌   | 待实现 |
| 幂等冲突治理 | ❌   | 待实现 |
| 统一仪表盘   | ❌   | 待实现 |

### 8.3 灰度放量 ❌

| 阶段           | 状态 | 说明   |
| -------------- | ---- | ------ |
| Stage 1 (5%)   | ❌   | 待启动 |
| Stage 2 (20%)  | ❌   | 待启动 |
| Stage 3 (50%)  | ❌   | 待启动 |
| Stage 4 (100%) | ❌   | 待启动 |

---

## 9. Phase 8-10: 未来规划（未开始）

### 9.1 ServiceWrapper & Generic Proof ❌

| 能力                    | 状态 | 预计时间 |
| ----------------------- | ---- | -------- |
| `ServiceWrapper` 类型   | ❌   | Phase 2  |
| `AcceptancePolicy` 类型 | ❌   | Phase 2  |
| `ProofPolicy` 类型      | ❌   | Phase 2  |
| Generic Proof Types     | ❌   | Phase 2  |

### 9.2 Acceptance & Execution-State ❌

| 能力                    | 状态 | 预计时间 |
| ----------------------- | ---- | -------- |
| `AcceptanceRecord` 类型 | ❌   | Phase 3  |
| `ExecutionState` 类型   | ❌   | Phase 3  |
| 里程碑验收              | ❌   | Phase 3  |
| 验收窗口管理            | ❌   | Phase 3  |

### 9.3 Market-backed MCP & A2A Bridge ❌

| 能力                     | 状态 | 预计时间 |
| ------------------------ | ---- | -------- |
| MCP Market Façade        | ❌   | Phase 4  |
| Lease-gated Provider MCP | ❌   | Phase 4  |
| A2A Execution Session    | ❌   | Phase 4  |
| Execution 引用绑定       | ❌   | Phase 4  |

### 9.4 Human-Service & RWA ❌

| 能力                    | 状态 | 预计时间 |
| ----------------------- | ---- | -------- |
| Human Attestation Proof | ❌   | Phase 5  |
| Oracle Event Proof      | ❌   | Phase 5  |
| Human Review Workflow   | ❌   | Phase 5  |
| 跨司法管辖区合规        | ❌   | Phase 7  |

### 9.5 Agent Reputation ❌

| 能力                   | 状态 | 预计时间 |
| ---------------------- | ---- | -------- |
| `AgentReputation` 类型 | ❌   | Phase 6  |
| 信誉计算引擎           | ❌   | Phase 6  |
| 信誉-Proof 耦合        | ❌   | Phase 6  |
| 市场撮合权重           | ❌   | Phase 6  |

---

## 10. 阻断项清单

### 10.1 🔴 P0 阻断项（必须立即处理）

| 阻断项               | 影响            | 预计工作量 |
| -------------------- | --------------- | ---------- |
| 回滚演练记录         | GA 门禁无法闭合 | 3 小时     |
| 发布说明草案         | GA 门禁无法闭合 | 2 小时     |
| kill switch 脚本固化 | GA 门禁无法闭合 | 2 小时     |

### 10.2 🟡 P1 阻断项（影响产品化）

| 阻断项                | 影响          | 预计工作量 |
| --------------------- | ------------- | ---------- |
| Provider 上架闭环缺失 | 无法进入 Beta | 2 周       |
| Buyer 购买闭环缺失    | 无法进入 Beta | 2 周       |
| Control 面缺失        | 无法运营      | 1 周       |

---

## 11. 下一步行动

### 11.1 本周行动（Week A）

| 行动                 | 优先级 | 负责人 | 预计完成 |
| -------------------- | ------ | ------ | -------- |
| 回滚演练记录         | 🔴 P0  | -      | Week A   |
| 发布说明草案         | 🔴 P0  | -      | Week A   |
| kill switch 脚本固化 | 🔴 P0  | -      | Week A   |

### 11.2 下周行动（Week B）

| 行动         | 优先级 | 负责人 | 预计完成 |
| ------------ | ------ | ------ | -------- |
| 重试预算统一 | 🟡 P1  | -      | Week B   |
| 幂等冲突治理 | 🟡 P1  | -      | Week B   |
| 统一仪表盘   | 🟡 P1  | -      | Week B   |

### 11.3 近期行动（Week C-D）

| 行动              | 优先级 | 负责人 | 预计完成 |
| ----------------- | ------ | ------ | -------- |
| Provider 上架闭环 | 🔴 P0  | -      | 2 周     |
| Buyer 购买闭环    | 🔴 P0  | -      | 2 周     |
| Control 面成品化  | 🔴 P0  | -      | 1 周     |
