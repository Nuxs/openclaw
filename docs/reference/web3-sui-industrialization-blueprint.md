---
title: "Sui Move 工业化整改蓝图 — 可组合 PTB API + 权限能力 + 交付闭环"
summary: "将 OpenClaw 的 Sui Move 协议草图升级为工业级实现蓝图：P0/P1/P2 整改清单、角色对齐的对象所有权模型、可组合 PTB 内核 API、wrapper entry 和 CI 验收门禁。"
description: "面向下一轮实现的 Sui Move 工业化设计稿，解决当前草图在 PTB 可组合性、对象所有权、权限能力、交付回执闭环与治理裁决方面的关键缺口。"
read_when:
  - You are hardening the OpenClaw Sui Move protocol from sketch to production-grade design
  - You need a PTB-composable API that aligns ownership, authorization, and settlement flow
  - You are reviewing implementation gates for Sui capability / lease / receipt / escrow / reward
doc_family: "web3"
doc_layer: "reference"
normative: false
---

# Sui Move 工业化整改蓝图 — 可组合 PTB API + 权限能力 + 交付闭环

> **Status**: Industrialization Blueprint (Draft)
> **Updated**: 2026-03-10
> **前置文档**: [Sui Move 协议草图](/reference/web3-sui-move-protocol)
> **架构背景**: [Sui-first 架构草案](/reference/web3-sui-first-architecture)
> **定位**: 本文不是“推翻草图”，而是把草图升级为**下一轮可实现、可验证、可进入 CI 的工业级设计稿**。

---

## 1. 执行摘要

当前 `openclaw_protocol` 草图有三个值得保留的核心判断：

1. **五件套业务语义是对的**：`Capability / Lease / Receipt / Escrow / Reward`
2. **对象优先路径是对的**：优先走 `Owned Object`，只保留最小共享面
3. **链上最小披露是对的**：敏感信息只保留 `hash / pointer / policy anchor`

但如果目标从“协议草图”升级到“工业级实现”，必须补齐四个硬缺口：

- **PTB 不可组合**：当前 `create_escrow()` / `create_lease()` 无法在同一笔 PTB 中稳定传递中间结果
- **角色与所有权错位**：Provider 需要引用 `Lease`，Buyer 需要验收 `Receipt`，但对象当前不在正确的 owner 手上
- **权限能力缺失**：`create_reward()`、`revoke_capability()`、争议裁决等缺少明确的 capability gating
- **结算闭环没落到代码约束**：`receipt_required` 写进了字段，但没真正变成释放托管的强约束

**本文给出的核心答案**是：

> **保留五件套业务对象，但引入少量“辅助能力对象”与“三层 API 结构”：可组合 PTB 内核、场景 wrapper entry、治理/仲裁能力对象。**

这样既不破坏 `Sui-first` 的对象化表达，也能让实现进入真正的工业级路径。

---

## 2. 设计判决：哪些保留，哪些必须改

### 2.1 保留项（不改方向）

| 项目                          | 判决     | 原因                                         |
| ----------------------------- | -------- | -------------------------------------------- |
| 五件套业务语义                | **保留** | 与 OpenClaw 的 Agentic Commerce 表达高度一致 |
| `Owned Object first`          | **保留** | 避免热点交易压进共享对象                     |
| `MarketRegistry` 最小共享索引 | **保留** | 索引是合理共享点                             |
| `Balance<T>` 内管             | **保留** | 适合托管资金内部管理                         |
| `hash-only` 最小披露          | **保留** | 满足隐私与安全边界                           |

### 2.2 必改项（不改就达不到工业级）

| 项目                                                 | 判决       | 说明                                                        |
| ---------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| `create_escrow()` / `create_lease()` 直接 `transfer` | **必须改** | 需要拆成可在 PTB 内组合的构造函数 + wrapper entry           |
| `Lease` 与 `Receipt` 所有权路径                      | **必须改** | 需要让 Provider 与 Buyer 都能拿到自己应持有的对象或能力凭证 |
| `create_reward()` 无治理约束                         | **必须改** | 必须引入 `RewardIssuerCap` / `GovernanceCap`                |
| `receipt_required` 未参与释放条件                    | **必须改** | 必须把“验收回执后才能放款”做成代码不变量                    |
| 争议流程只有 `dispute` 没有 `resolve`                | **必须改** | 争议必须形成完整闭环                                        |

---

## 3. 工业级整改清单

### 3.1 P0（进入下一轮实现前必须完成）

| P0 项             | 目标                                                                     | 交付标准                                             |
| ----------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| **API 可组合化**  | 把核心构造逻辑从 `entry` wrapper 中拆出                                  | `Escrow` / `Lease` / `Receipt` 均支持 PTB 内原子编排 |
| **角色-对象对齐** | Buyer / Provider / Governance 各自只持有自己需要的对象或能力凭证         | Happy path 不再依赖“借用别人 Owned Object”           |
| **权限能力补齐**  | 发布、撤下、奖励发放、争议裁决都必须由 capability 控制                   | 无裸函数可被任意地址滥用                             |
| **引用绑定校验**  | `lease_id` / `escrow_id` / `capability_id` / `receipt_id` 全量一致性检查 | 任一跨对象伪造都能被 abort                           |
| **CI 证据补齐**   | 构建、测试、lint、最小仿真                                               | PR 中必须能证明“不是纸面协议”                        |

### 3.2 P1（P0 完成后紧接着做）

| P1 项              | 目标                                                             | 备注                             |
| ------------------ | ---------------------------------------------------------------- | -------------------------------- |
| **争议裁决落链**   | 增加 `DisputeCase<T>` + `resolve_dispute()`                      | 建议治理角色/多签执行            |
| **重放保护**       | Provider 提交回执、治理裁决、奖励领取均需 nonce / 一次性能力约束 | 防止重复执行                     |
| **事件版本化**     | 关键事件加版本字段或稳定 schema                                  | 方便索引器与多语言 SDK 演化      |
| **费用与找零规范** | Coin 拆分、找零、失败回滚路径固定化                              | 提升 SDK 集成稳定性              |
| **测试矩阵**       | happy / unhappy / edge / invariant tests                         | 覆盖时间窗口、权限错误、对象错配 |

### 3.3 P2（生产化增强）

| P2 项                  | 目标                                       |
| ---------------------- | ------------------------------------------ |
| **zkLogin / 企业身份** | 企业钱包 / agent 身份更平滑地进入 Sui 路径 |
| **多资产与策略化结算** | 稳定币、积分映射、桥接资产统一抽象         |
| **跨链锚定**           | 与 EVM / TON 的摘要或结算回执互锚          |
| **观测性**             | indexer、告警、SLO、回放工具、应急 Runbook |
| **形式化验证**         | 至少覆盖关键状态机和资金安全不变量         |

---

## 4. 新的工业级架构原则

### 4.1 业务对象仍然只有“五件套”

对外产品语义仍维持：

- `Capability`
- `Lease`
- `Receipt`
- `Escrow<T>`
- `Reward`

这样可以保证文档、产品、索引层、外部 SDK 不需要推翻重来。

### 4.2 工业级实现允许“少量辅助对象”

为了让对象所有权与权限路径真正闭环，工业实现应新增少量**辅助能力对象**：

- `PublisherCap`：只有发布者能撤下 / 更新 `Capability`
- `ExecutionRight`：Provider 用它提交 `Receipt`，不再依赖借用 Buyer 的 `Lease`
- `GovernanceCap`：治理/仲裁角色专用
- `RewardIssuerCap`：发行奖励语义专用
- `DisputeCase<T>`：争议开启后承载裁决状态；可设计为 Shared，且只在争议路径出现

> 关键点：**五件套是业务语言，辅助对象是工程语言。** 工业级设计不能为了“概念优雅”而牺牲可执行性。

### 4.3 三层 API 结构

#### Layer A — 可组合 PTB 内核

- 负责“构造对象 / 校验约束 / 返回中间对象”
- 不直接 `transfer`
- 允许在一笔 PTB 中串联多个对象创建与绑定

#### Layer B — 场景 wrapper entry

- 负责“常见单步交易体验”
- 内部调用 Layer A
- 对 SDK 用户提供更稳定、更少参数的入口

#### Layer C — 治理与仲裁能力层

- 发布者、治理者、奖励发行者都必须显式持有 capability
- 争议裁决、奖励发放、撤下能力等操作统一经由 capability 校验

---

## 5. V2 对象模型（业务对象 + 辅助对象）

### 5.1 业务对象所有权矩阵

| 对象         | Owner          | 说明                                        |
| ------------ | -------------- | ------------------------------------------- |
| `Capability` | Publisher      | 表示“卖的是什么能力”                        |
| `Lease`      | Buyer / Lessee | 表示“买到了什么访问权”                      |
| `Receipt`    | Buyer / Lessee | Provider 提交后，**直接转给 Buyer 验收**    |
| `Escrow<T>`  | Buyer / Payer  | 资金托管对象，和 `Lease` 属于同一交易参与方 |
| `Reward`     | Subject        | 奖励对象归被奖励者                          |

### 5.2 辅助对象所有权矩阵

| 对象              | Owner                                | 用途                                  |
| ----------------- | ------------------------------------ | ------------------------------------- |
| `PublisherCap`    | Publisher                            | 撤下 / 更新 `Capability`              |
| `ExecutionRight`  | Provider / Lessor                    | 提交 `Receipt` 的一次性或有界次数授权 |
| `GovernanceCap`   | Governance / Multisig                | 争议裁决、系统级参数变更              |
| `RewardIssuerCap` | Governance / System                  | 发放 `Reward`                         |
| `DisputeCase<T>`  | Shared（仅争议时）或 Governance 托管 | 承载裁决流程                          |

### 5.3 为什么 `Receipt` 应归 Buyer，而不是 Provider

这是当前草图最需要翻转的一点。

工业版中，Provider 负责**创建** `Receipt`，但不应长期**持有** `Receipt`。更合理的做法是：

1. Provider 通过 `ExecutionRight` 证明自己有资格提交交付
2. 合约创建 `Receipt`
3. `Receipt` **直接 transfer 给 Buyer / Lessee**
4. Buyer 用自己手上的 `Lease + Receipt + Escrow` 完成验收与放款

这样交易闭环会非常顺：

- Provider 不需要借用 Buyer 的 `Lease`
- Buyer 不需要向 Provider 要回 `Receipt`
- `accept_and_release()` 可以在 Buyer 手里一次性完成

---

## 6. 推荐的模块重构

### 6.1 从“两模块”升级到“三模块”

```text
openclaw_protocol/
├── openclaw_market.move      # Capability / Lease / Receipt / PublisherCap / ExecutionRight
├── openclaw_settlement.move  # Escrow<T> / DisputeCase<T> / Reward / GovernanceCap / RewardIssuerCap
└── openclaw_trade.move       # wrapper entry + PTB orchestration helpers
```

### 6.2 这样拆分的原因

- `market`：负责权利对象与交付语义
- `settlement`：负责资金安全、争议、奖励
- `trade`：负责把两者编排成“购买 / 交付 / 验收 / 放款”的可用流程

> 如果当前阶段不想立刻增第三模块，也至少要先做“**内核函数 + wrapper entry**”的层次拆分。模块名可以第二步再调整，但**分层必须先出现**。

---

## 7. 新 API 草图（工业级 V2）

### 7.1 `openclaw_market.move`

```move
module openclaw_protocol::openclaw_market {
    struct MarketRegistry has key { /* shared */ }
    struct PublisherCap has key, store { /* publisher authority */ }
    struct Capability has key, store { /* business object */ }
    struct Lease has key, store { /* buyer-owned access right */ }
    struct ExecutionRight has key, store { /* provider-owned delivery right */ }
    struct Receipt has key, store { /* buyer-owned acceptance object */ }

    // 发布阶段
    public entry fun publish_capability(
        registry: &mut MarketRegistry,
        category: vector<u8>,
        service_ref_hash: vector<u8>,
        pricing_policy_ref: vector<u8>,
        visibility_policy: u8,
        sla_policy_ref: vector<u8>,
        settlement_asset_policy: u8,
        metadata_hash: vector<u8>,
        ctx: &mut TxContext,
    );

    public entry fun revoke_capability(
        publisher_cap: &PublisherCap,
        registry: &mut MarketRegistry,
        cap: &mut Capability,
        ctx: &TxContext,
    );

    // PTB 内核：只构造，不直接 transfer
    public(package) fun new_lease_bundle<T>(
        cap: &Capability,
        escrow_id: ID,
        lessee: address,
        expire_at: u64,
        usage_budget: u64,
        allowed_scopes: vector<u8>,
        credential_delivery_ref_hash: vector<u8>,
        dispute_window_sec: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Lease, ExecutionRight);

    // Provider 交付：消耗或递减 ExecutionRight，Receipt 直接转给 Buyer
    public entry fun submit_receipt(
        exec_right: &mut ExecutionRight,
        usage_summary_hash: vector<u8>,
        result_pointer_hash: vector<u8>,
        proof_ref_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    );

    // Buyer 验收：必须同时持有 Lease，并且 sender == lessee
    public entry fun accept_receipt(
        lease: &mut Lease,
        receipt: &mut Receipt,
        audit_anchor_ref: vector<u8>,
        ctx: &TxContext,
    );

    public entry fun reject_receipt(
        lease: &mut Lease,
        receipt: &mut Receipt,
        reason_hash: vector<u8>,
        ctx: &TxContext,
    );
}
```

### 7.2 `openclaw_settlement.move`

```move
module openclaw_protocol::openclaw_settlement {
    struct GovernanceCap has key, store { /* dispute authority */ }
    struct RewardIssuerCap has key, store { /* reward minting authority */ }
    struct Escrow<phantom T> has key, store { /* buyer-owned escrow */ }
    struct DisputeCase<phantom T> has key { /* optional shared dispute object */ }
    struct Reward has key, store { /* subject-owned reward */ }

    // PTB 内核：只构造，不直接 transfer
    public(package) fun new_escrow<T>(
        payment: Coin<T>,
        payer: address,
        payee: address,
        receipt_required: bool,
        dispute_window_sec: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Escrow<T>;

    // Buyer 放款：如果 receipt_required == true，则必须提供已 ACCEPTED 的 Receipt + 对应 Lease
    public entry fun release_escrow<T>(
        escrow: &mut Escrow<T>,
        lease: &Lease,
        receipt: &Receipt,
        ctx: &mut TxContext,
    );

    // Buyer 退款：窗口过后，无已验收回执，且无争议中对象
    public entry fun refund_escrow<T>(
        escrow: &mut Escrow<T>,
        lease: &Lease,
        clock: &Clock,
        ctx: &mut TxContext,
    );

    public entry fun open_dispute<T>(
        escrow: &mut Escrow<T>,
        lease: &Lease,
        receipt: &Receipt,
        reason_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    );

    public entry fun resolve_dispute<T>(
        governance_cap: &GovernanceCap,
        dispute: &mut DisputeCase<T>,
        escrow: &mut Escrow<T>,
        ruling: u8,
        ctx: &mut TxContext,
    );

    public entry fun issue_reward(
        issuer_cap: &RewardIssuerCap,
        subject: address,
        reason_code: u8,
        asset_type_hash: vector<u8>,
        amount: u64,
        claim_policy: u8,
        vesting_policy: u8,
        source_event_hash: vector<u8>,
        ctx: &mut TxContext,
    );

    public entry fun claim_reward(
        reward: &mut Reward,
        ctx: &TxContext,
    );
}
```

### 7.3 `openclaw_trade.move`

```move
module openclaw_protocol::openclaw_trade {
    // 简单购买路径：一笔交易完成 Escrow + Lease + ExecutionRight 的创建与分发
    public entry fun buy_capability<T>(
        registry: &MarketRegistry,
        cap: &Capability,
        payment: Coin<T>,
        expire_at: u64,
        usage_budget: u64,
        allowed_scopes: vector<u8>,
        credential_delivery_ref_hash: vector<u8>,
        dispute_window_sec: u64,
        receipt_required: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    );

    // Buyer 一键验收并放款
    public entry fun accept_and_release<T>(
        lease: &mut Lease,
        receipt: &mut Receipt,
        escrow: &mut Escrow<T>,
        audit_anchor_ref: vector<u8>,
        ctx: &mut TxContext,
    );

    // Buyer 一键拒绝并发起争议
    public entry fun reject_and_dispute<T>(
        lease: &mut Lease,
        receipt: &mut Receipt,
        escrow: &mut Escrow<T>,
        reason_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    );
}
```

### 7.4 关于 `public(package)`

如果当前工具链 / 团队约束暂时不方便全面采用 `public(package)`，可先退一步使用：

- `internal fun` + 同模块 wrapper
- 或 `public(friend)` + `openclaw_trade` 作为唯一 friend orchestrator

但**设计目标不变**：

> **对象构造逻辑必须能在 PTB 内返回中间对象，不能一上来就 `transfer`。**

---

## 8. 工业级 Happy Path（V2）

### 8.1 购买（Buyer）

```typescript
const tx = new Transaction();

const [payment] = tx.splitCoins(tx.gas, [quote.amount]);

tx.moveCall({
  target: `${PACKAGE_ID}::openclaw_trade::buy_capability`,
  typeArguments: [quote.assetType],
  arguments: [
    tx.object(marketRegistryId),
    tx.object(capabilityId),
    payment,
    tx.pure.u64(expireAt),
    tx.pure.u64(quote.amount),
    tx.pure.vector("u8", allowedScopes),
    tx.pure.vector("u8", credentialHash),
    tx.pure.u64(86400),
    tx.pure.bool(true),
    tx.object("0x6"),
  ],
});
```

`buy_capability()` 内部完成：

1. 校验 `Capability` 仍处于 `ACTIVE`
2. 调用 `new_escrow<T>()`
3. 调用 `new_lease_bundle<T>()`，生成 `Lease + ExecutionRight`
4. `Lease` 转给 Buyer
5. `Escrow<T>` 转给 Buyer
6. `ExecutionRight` 转给 Provider
7. 发射 `LeaseCreated` / `EscrowLocked` 事件

### 8.2 交付（Provider）

```typescript
const txReceipt = new Transaction();

txReceipt.moveCall({
  target: `${PACKAGE_ID}::openclaw_market::submit_receipt`,
  arguments: [
    txReceipt.object(executionRightId),
    txReceipt.pure.vector("u8", usageSummaryHash),
    txReceipt.pure.vector("u8", resultPointerHash),
    txReceipt.pure.vector("u8", proofRefHash),
    txReceipt.object("0x6"),
  ],
});
```

`submit_receipt()` 内部完成：

1. 校验 `sender == lessor / executor`
2. 校验 `ExecutionRight` 未用尽 / 未撤销 / 未过期
3. 构造 `Receipt`
4. `Receipt` **直接转给 Buyer**
5. 递减或销毁 `ExecutionRight`

### 8.3 验收并放款（Buyer）

```typescript
const txAccept = new Transaction();

txAccept.moveCall({
  target: `${PACKAGE_ID}::openclaw_trade::accept_and_release`,
  typeArguments: [assetType],
  arguments: [
    txAccept.object(leaseId),
    txAccept.object(receiptId),
    txAccept.object(escrowId),
    txAccept.pure.vector("u8", auditAnchorRef),
  ],
});
```

`accept_and_release()` 内部完成：

1. `accept_receipt(lease, receipt, ...)`
2. 校验 `receipt.lease_id == lease.id`
3. 校验 `escrow.linked_lease_id == lease.id`
4. 若 `escrow.receipt_required == true`，则要求 `receipt.status == ACCEPTED`
5. `release_escrow(escrow, lease, receipt, ...)`

> 这样就把“**验收**”和“**放款**”封成一个 Buyer 侧单交易动作，既符合心智，也减少操作失误。

---

## 9. 关键安全不变量（V2）

### 9.1 资金安全

- `Escrow<T>` 释放前必须验证：
  - `sender == payer`
  - `escrow.status == LOCKED`
  - `lease.id == escrow.linked_lease_id`
  - 如 `receipt_required == true`，则 `receipt.status == ACCEPTED`
  - `receipt.lease_id == lease.id`

### 9.2 交付安全

- Provider 不再直接借用 Buyer 的 `Lease`
- `submit_receipt()` 仅接受 `ExecutionRight`
- `ExecutionRight` 必须是一枚**一次性或有界次数**的交付授权对象

### 9.3 权限安全

- `revoke_capability()` 必须要求 `PublisherCap`
- `issue_reward()` 必须要求 `RewardIssuerCap`
- `resolve_dispute()` 必须要求 `GovernanceCap`

### 9.4 一致性安全

任何跨对象操作前，都要做四类绑定检查：

- `Capability ↔ Lease`
- `Lease ↔ Escrow`
- `Lease ↔ Receipt`
- `DisputeCase ↔ Escrow / Lease / Receipt`

> 工业级实现不是“有字段就算关联”，而是“**每一次跨对象状态转移都要校验绑定关系**”。

---

## 10. 实施顺序（建议 4 个里程碑）

### Milestone 1 — API 重构

- 引入 `PublisherCap` / `ExecutionRight`
- 拆出 `new_escrow()` / `new_lease_bundle()`
- 删除“构造即 transfer”的关键 PTB 阻塞点

### Milestone 2 — 交付闭环

- `Receipt` 改为直接转给 Buyer
- 实现 `accept_receipt()` 对 `Lease` 的强绑定校验
- 实现 `accept_and_release()` wrapper

### Milestone 3 — 争议与治理

- 引入 `GovernanceCap`
- 实现 `open_dispute()` / `resolve_dispute()`
- 明确 `DisputeCase<T>` 生命周期

### Milestone 4 — 工程门禁

- `sui move build`
- `sui move test`
- happy / unhappy / invariant tests
- package publish dry-run / devnet deploy
- 索引器事件验收

---

## 11. CI / 评审门禁

在 PR 评审中，至少应满足以下门禁：

### 11.1 编译门禁

```bash
sui move build
sui move test
```

### 11.2 场景门禁

- Happy path：购买 → 交付 → 验收 → 放款
- Refund path：购买 → 未交付 / 未验收 → 窗口后退款
- Dispute path：购买 → 交付争议 → 开案 → 裁决 → 放款/退款
- Auth path：无 `PublisherCap` / `GovernanceCap` / `RewardIssuerCap` 时应失败

### 11.3 不变量门禁

- 不能用假 `lease_id` 释放别人的 `Escrow`
- 不能重复提交相同 `ExecutionRight`
- 不能在 `Receipt` 未验收时提前放款（当 `receipt_required == true`）
- 不能越权发奖励
- 不能绕过争议态直接结算

---

## 12. 与当前草图的关系

应当把当前 `web3-sui-move-protocol.md` 定位为：

> **“概念正确、工程待加固”的 V1 草图。**

而把本文定位为：

> **“下一轮实现的工业级蓝图 / 设计合同”。**

这两份文档应并存，而不是互相替代：

- `web3-sui-first-architecture.md`：为什么是 `Sui-first`
- `web3-sui-move-protocol.md`：五件套对象与 PTB 草图
- `web3-sui-industrialization-blueprint.md`：如何把草图做成真正的工业级实现

---

## 相关文档

- [Sui-first 架构草案](/reference/web3-sui-first-architecture)
- [Sui Move 协议草图](/reference/web3-sui-move-protocol)
- [双栈支付与结算参考](/reference/web3-dual-stack-payments-and-settlement)
- [Web3 Market Dev](/reference/web3-market-dev)
