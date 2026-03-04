# OpenClaw Web3 Market 上线核实证据矩阵（2026-03-03，v2.2 安全修复完成版）

> 目的：把"上线评审"中的关键结论与可复核证据一一绑定，避免夸大或失真。  
> 判定等级：**已证实** / **条件成立** / **未证实（需降级）**  
> 证据等级：**A**=仓内代码/测试/主计划；**B**=仓内评审文档；**C**=外部二手资料/不可稳定复现信息。  
> **v2 变更**：新增 §6 安全审计证据、§7 测试盲区证据、§8 功能完整性证据。  
> **v2.1 变更**：同步 `git pull d794482b4` 后代码，修正 §6.2（autopay maxRetries 硬上限已确认存在），新增 x402 安全体系正面证据。  
> **v2.2 变更**：§6.1 Settlement TOCTOU 已修复（per-orderId 互斥锁 + 事务内乐观重校验），§6.3 escrow-ton 已修复（结构化 TonError + 指数退避重试 + 超时 + 幂等 queryId）。**3 个安全阻断项全部清零**。
> **v2.3 变更**：执行《`WEB3_SETTLEMENT_BEST_PRACTICE_PLAN_2026_03_03.md`》：P0（确认等待/真实超时/强 CAS/错误码归一）+ P1（settlement operation log + poller）+ P2（请求级幂等键）已落地到代码。

---

## 1) 能力与架构事实核验

| 结论项                                 | 判定                | 证据等级 | 证据锚点                                                                                                                                                          | 说明                                                         |
| -------------------------------------- | ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `web3.wallet.*` 已完成运行时注册       | 已证实              | A        | `extensions/web3-core/src/index.ts`（L289-L293）                                                                                                                  | 已注册 `web3.wallet.create/balance/sign/send/autopay`        |
| `web3.wallet.*` 已进入能力目录         | 已证实              | A        | `extensions/web3-core/src/capabilities/catalog/core.ts`（L179-L287）                                                                                              | wallet 分组条目存在                                          |
| ENS 解析能力在 catalog 中可见          | 已证实              | A        | `extensions/web3-core/src/capabilities/catalog/core.ts`（L124-L177）                                                                                              | `web3.identity.resolveEns/reverseEns` 存在                   |
| Discovery 已有 libp2p backend 实现     | 已证实              | A        | `extensions/web3-core/src/discovery/backend-libp2p.ts`（L82-L398）                                                                                                | 含 init/start/publish/discover/stop                          |
| Discovery 服务已接入插件启动流程       | 已证实              | A        | `extensions/web3-core/src/index.ts`（L603-L676）                                                                                                                  | 启动后周期执行 publish + discover                            |
| Discovery 存在 static fallback         | 已证实              | A        | `extensions/web3-core/src/discovery/factory.ts`（L28-L47）, `extensions/web3-core/src/config.ts`（L345-L347）                                                     | disabled 或未知 backend 时回退 static                        |
| TON+EVM 结算适配已落地（统一接口）     | 已证实              | A        | `extensions/market-core/src/market/escrow-factory.ts`（L21-L33）                                                                                                  | `ton-*` 分发 TonEscrowAdapter，其余 EVM                      |
| TON Escrow 执行链路可调用 provider     | 已证实              | A        | `extensions/market-core/src/market/escrow-ton.ts`（L73-L153）                                                                                                     | lock/release/refund 均通过 TON provider transfer             |
| blockchain-adapter 已注册 TON Provider | 已证实              | A        | `extensions/blockchain-adapter/src/factory.ts`（L62-L85）                                                                                                         | `ton-mainnet/ton-testnet` 与 EVM 并存                        |
| 结算业务路径已使用统一 Escrow 工厂     | 已证实              | A        | `extensions/market-core/src/market/handlers/settlement.ts`（L123-L126, L229-L231, L370-L373）                                                                     | 合约模式下走 `createEscrowAdapter`                           |
| x402 签名令牌 v2 防伪造与防重放        | 已证实（v2.1 新增） | A        | `billing/payment-required.ts` L126-130（HMAC-SHA256 签名）+ L132-143（timing-safe 验签）+ L145-163（生命周期校验）+ L444-534（consumePaymentRequired 一次性消费） | 完整的 issue → sign → verify → consume 链路                  |
| Gateway autopay maxRetries 硬上限      | 已证实（v2.1 修正） | A        | `tools-invoke-http.ts` L804 `Math.min(1, resolveAutoPayMaxRetries(...))`                                                                                          | v2 评审误判已修正；调用层硬限为 1 次                         |
| 生产环境 autopay 基线校验              | 已证实（v2.1 新增） | A        | `tools-invoke-http.ts` L339-378 `validateAgentWalletProductionBaseline()`                                                                                         | `NODE_ENV=production` 下强制 policy caps，缺失时拒绝 autopay |
| Health guard 滑窗降级与冷却恢复        | 已证实（v2.1 新增） | A        | `tools-invoke-http.ts` L490-516 + `metrics.ts` L23-26（阈值常量）+ L125-141（滑窗计算）+ L281-300（冷却状态管理）                                                 | 非全量累计，10min 窗口 + 50% 失败率 → 5min 冷却 → 自动恢复   |
| x402 幂等记录治理（TTL + 容量上限）    | 已证实（v2.1 新增） | A        | `state/store.ts` L486-516 `prunePaymentRequiredMap()`：24h TTL + 500 条硬上限 + 懒清理                                                                            | 防止 payment-required.json 无限膨胀                          |
| `/web3-market enable ok` 一键启用      | 已证实（v2.1 新增） | A        | `web3-market-command.ts` L150-359 含 agent-wallet policy 基线注入（perTxCap/dailyCap/maxAutoPayPerRequest）                                                       | 用户友好的一键配置                                           |

---

## 2) 上线门禁核验（与主计划一致性）

基线文件：`skills/web3-market/internal/WEB3_DEV_PLAN_PAYFI.md`

| 门禁项                                         | 判定                 | 证据等级 | 证据锚点                                 | 备注                                           |
| ---------------------------------------------- | -------------------- | -------- | ---------------------------------------- | ---------------------------------------------- |
| Phase 4 Discovery P0/P1 全项闭合               | 未证实（需降级）     | A        | L135-L145（均未勾选）                    | discovery 仍在推进，不宜表述为"全量就绪"       |
| Phase 5 GA Readiness 已闭合                    | 未证实（需降级）     | A        | L161-L175（多项未勾选）                  | runbook、灰度复盘、发布包门禁未全闭合          |
| Phase 2 DoD "单测/集成/回归全部通过"           | **未证实（需降级）** | A        | L343（未勾选 `[ ]`）                     | 团队自评未达标，与评审"核心闭环已完成"表述冲突 |
| 回滚演练已完成                                 | 未证实（需降级）     | A        | L364, L371（未勾选）                     | 只能给出"Beta 条件上线"                        |
| 发布说明草案已完成                             | 未证实（需降级）     | A        | L365, L372（未勾选）                     | 不满足 GA 完整门禁                             |
| x402 核心闭环已完成                            | 已证实               | A        | L86-L107, L120-L124, L347-L352（已勾选） | 可作为 Beta 强项                               |
| `web3.wallet.*` 统一入口与 capabilities 已完成 | 已证实               | A        | L10（已勾选）+ 代码锚点见上              | 与旧差距报告存在时间差，需以新状态为准         |

---

## 3) 评审文案高风险点（需修订）

| 原表述风险                       | 判定                            | 修订方向                                                                                                                                     |
| -------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| "discovery 尚未完全落地 libp2p"  | 不严谨                          | 改为"libp2p 已实现并接入服务；生产级门禁（P0/P1 完整验收与运营门禁）未闭合"                                                                  |
| "批准上线（无条件）"             | 不严谨                          | 改为"**Conditional Go（Public Beta）**，安全修复前置条件已清零"                                                                              |
| "竞品结论确定性过高"             | 证据不足                        | 改为"观察项/趋势判断"，并标注 C 级证据，不参与硬结论                                                                                         |
| ~~"结算增量释放核心逻辑已具备"~~ | ~~**需追加限定**~~ → **已修正** | v2.2：并发安全缺陷（TOCTOU）已通过 per-orderId 互斥锁 + 事务内乐观重校验修复，限定已移除                                                     |
| "x402 含幂等与熔断关键项"        | 已充分验证                      | 无需修订——v2.1 核实确认 autopay maxRetries 调用层已有 `Math.min(1, ...)` 硬上限（L804），签名令牌 v2 + 一次性消费防重放 + 生产基线校验均完整 |

---

## 4) 上线判定口径（核实版 v2.2）

- **建议判定**：`Conditional Go (Public Beta)` — **安全修复前置条件已全部清零**（§6.1 + §6.2 + §6.3 均已修复）
- **不建议判定**：`Unconditional Go` 或 `GA Ready`

### 触发条件（必须写入主评审）

1. 必须明确 GA 门禁未闭合项：runbook、回滚演练、灰度复盘、发布说明。
2. 必须把 discovery 表述为"已实现基础能力 + 待完成 P0/P1 验收"。
3. 竞品与趋势结论不得作为上线硬门禁证据。
4. ~~必须修复 2 个安全阻断项后方可进入 Beta~~ → **已满足**（v2.2：3 个 Hard Blocker 全部已修复并通过测试验证）。

---

## 5) 证据变更与冲突处理原则

- 同主题文档冲突时，优先级：**代码事实 > 主计划（PAYFI）> 差距报告/评估报告**。
- 旧文档中与代码现状冲突条目（如 `web3.wallet.*` 未注册）必须标注"历史状态"，不得作为当前结论。
- 若无稳定证据链，统一降级为"观察项"。

---

## 6) 安全深度审计证据（v2 新增）

| 问题                                   | 风险等级                              | 证据锚点                                                                                                                                                                                                                                      | 攻击路径/影响                                                                                            | 修复建议                                                    |
| -------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ~~**Settlement TOCTOU 并发超额释放**~~ | ~~**CRITICAL**~~ → **已修复（v2.3）** | `settlement-lock.ts`（per-orderId 互斥锁）+ `settlement.ts`（强 CAS：`status+releasedAmount+revision`）+ `settlement/operation-repository.ts`（操作日志）+ `settlement/poller.ts`（补偿轮询）+ `settlement-lock.test.ts`/`settlement.test.ts` | 原攻击路径已阻断：同 orderId 串行 + 事务内强校验 + 操作日志可恢复                                        | 已修复并进入最优方案执行阶段                                |
| ~~**autopay maxRetries 无硬上限**~~    | ~~**HIGH**~~ → **已修复（v2.1）**     | `tools-invoke-http.ts` L804 `Math.min(1, resolveAutoPayMaxRetries(...))`                                                                                                                                                                      | v2 评审误判：函数内部无上限，但调用层已有 `Math.min(1, ...)` 硬约束，实际重试最多 1 次                   | 无需修复，已确认安全                                        |
| ~~**escrow-ton 无 try/catch 无重试**~~ | ~~**HIGH**~~ → **已修复（v2.2）**     | `escrow-ton.ts`（重写：TonError + withRetry + AbortController 超时 + deterministicQueryId）+ `escrow-ton.test.ts`（10 用例全通过）                                                                                                            | 原风险已消除：瞬时故障自动重试（指数退避 2 次），永久错误快速失败，30s 超时保护，幂等 queryId 防链上重复 | 已修复；GA 遗留：tx receipt 确认等待                        |
| ~~**escrow-ton 不等待交易确认**~~      | ~~**MEDIUM**~~ → **已修复（v2.3）**   | `escrow-ton.ts`：`provider.waitForTransaction(txHash, confirmations)` + `confirmationTimeoutMs`                                                                                                                                               | 原风险已消除：达到确认深度前不返回成功，避免“仅 txHash 即成功”的误判                                     | 已修复；GA 前继续优化确认深度策略（按网络配置）             |
| **libp2p 无消息大小限制**              | **MEDIUM**                            | `backend-libp2p.ts` L48-50 `encodeRecord` + L178 DHT put：无大小校验                                                                                                                                                                          | 恶意 peer 注入超大 record → 内存耗尽/DoS                                                                 | 增加 64KB 大小上限检查                                      |
| **libp2p 缓存无主动清理**              | **MEDIUM**                            | `backend-libp2p.ts` L261(写入缓存) + L349(跳过过期但不删除)                                                                                                                                                                                   | 长时间运行 → 过期条目堆积 → 内存泄漏                                                                     | 增加定时清理或 discover 时顺删过期条目                      |
| **libp2p 无 peer 黑名单/白名单**       | **MEDIUM**                            | `backend-libp2p.ts` L143-157(bootstrap) + L264-357(discover)：无 peer 过滤                                                                                                                                                                    | 恶意 peer 可注入虚假发现记录                                                                             | clientMode 已降低风险，Beta 可接受；GA 前需增加记录签名验证 |

---

## 7) 测试覆盖盲区证据（v2 新增）

| 模块                                  | 测试状态            | 证据锚点                                                                                                                                                                                                                            | 风险等级                | 行动项                          |
| ------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------- |
| **Dispute handler**（6 路径，518 行） | **零专项测试**      | `handlers/dispute.ts` 全文；搜索 `*dispute*.test*` 返回 0 结果                                                                                                                                                                      | **P1**                  | 必须补充                        |
| **Delivery handler**                  | 无独立测试文件      | `handlers/delivery.ts`（247行）；仅在 `handlers.test.ts` L254-292 有外部凭证存储路径测试                                                                                                                                            | P2                      | 建议补充                        |
| **Consent revoke 级联**               | 基础测试有，级联无  | `handlers.test.ts` L198-252 + `revocation.test.ts`（31行）；但 revoke→delivery→webhook 无覆盖                                                                                                                                       | P2                      | 建议补充                        |
| **Metered settlement 链上失败重试**   | 已覆盖（v2.2 新增） | `settlement-lock.test.ts`（4 用例：串行/并行/错误释放/FIFO）+ `settlement.test.ts`（6 用例：并发释放串行化/计量释放/幂等/并发 lock/并发 release+refund）；`escrow-ton.test.ts`（10 用例：含瞬时故障重试/永久错误快速失败/重试耗尽） | ~~**P1**~~ → **已修复** | 已完成                          |
| **x402 autopay**                      | 充分（30+ 用例）    | `tools-invoke-http.test.ts`（1283行，18+ autopay 用例）+ `payment-required.test.ts`(553行，9 用例含 TON/幂等/过期/消费) + `metrics.test.ts`(112行，3 用例) + `autopay-router.test.ts`(144行)                                        | P2                      | 优秀——v2.1 核实确认覆盖显著增强 |
| **TON autopay 策略**                  | 有覆盖              | `ton-handlers.policy.test.ts` L196-309（2 用例）；`autopay-router.test.ts`（含 TON 路由）                                                                                                                                           | P2                      | 良好                            |

---

## 8) 功能完整性证据（v2 新增）

### 8.1 市场交易全链路

| 环节       | Handler 文件             | 行数 | 路径数                                          | 测试覆盖                               | 综合评定       |
| ---------- | ------------------------ | ---- | ----------------------------------------------- | -------------------------------------- | -------------- |
| Offer      | `handlers/offers.ts`     | —    | 完整                                            | 有                                     | 良好           |
| Order      | `handlers/orders.ts`     | —    | 完整                                            | 有                                     | 良好           |
| Consent    | `handlers/consent.ts`    | 247  | grant + revoke                                  | 有基础                                 | 中等           |
| Settlement | `handlers/settlement.ts` | 477  | lock + release + refund + status                | 有（7+6 用例），并发安全已修复（v2.2） | 良好           |
| Delivery   | `handlers/delivery.ts`   | 247  | issue + complete + revoke                       | 薄弱                                   | 需加强         |
| Dispute    | `handlers/dispute.ts`    | 518  | open + evidence + resolve + reject + get + list | **零覆盖**                             | **需紧急补充** |
| Revocation | `revocation.ts`          | 75   | webhook + HMAC + 重试                           | 有基础（2用例）                        | 中等           |

### 8.2 EVM/TON 双栈对称性

| 能力           | EVM 证据                          | TON 证据                        | 对齐度                                                           |
| -------------- | --------------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| Wallet CRUD    | `handlers.ts`                     | `ton-handlers.ts`               | 对齐                                                             |
| Autopay        | `handlers.ts` L257                | `ton-handlers.ts` L231          | 对齐（命名不对称但功能完整）                                     |
| Autopay Router | `autopay-router.ts` L28-79        | 同文件（`isTONNetwork()` 分发） | 对齐                                                             |
| Escrow         | `escrow-factory.ts` → EVM default | `escrow-ton.ts`                 | 对齐（v2.2：TON 侧已增加 TonError + 重试 + 超时 + 幂等 queryId） |
| 交易确认等待   | 待验证                            | **缺失**（直接 return txHash）  | 不对齐——需修复                                                   |
