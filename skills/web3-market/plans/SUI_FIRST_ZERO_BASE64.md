# OpenClaw Web3 Market 2.0 工业化方案纪要：Sui-First × Zero-Base64

> **文档定位**：整理本轮对话共识、代码调研结论与后续落地路线，形成一份可执行的工业级方案纪要。  
> **写作约束**：所有判断优先锚定当前仓库事实；严格区分“当前已实现”与“下一阶段目标态”，不把路线图写成既成事实。

## 0. 执行摘要（对话结论 + 调研结论）

本轮讨论最终收敛为五个判断：

1. **先解交付链路，不先换支付入口**：第一阶段优先解决 `bytesBase64` 穿越 LLM 上下文的问题，保持当前 `TON + EVM` 支付入口不动。
2. **采用 Zero-Base64 交付原则**：产物只以 `web3-storage://...` 这类不透明 URI 在 agent 侧流转，真正的二进制拉取和发送下沉到 Delivery 层完成。
3. **采用 Sui-first 作为目标态语义层**：`Sui` 负责 `Capability / Lease / Receipt / Escrow / Reward` 等对象化权利与结算语义；`EVM` 保留流动性与稳定币职责；`TON` 保留分发与轻量支付入口。
4. **A2A 默认脱敏**：Agent 间只交换 Object ID、Capability ID、Receipt ID 等指针，不交换正文、明文 token 或大体量结果。
5. **工程上坚持 overlay-first**：大文件保持薄入口，新增实现尽量下沉到叶子模块，不在热点文件中堆叠新逻辑。

## 0.1 核心架构原则

| 原则                         | 含义                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------- |
| **Zero-Base64**              | 数字产物绝不穿越 LLM 上下文；agent 侧仅流转不透明 URI 指针                        |
| **Sui-First Object Model**   | 下一阶段把租约/托管/回执建模为 Sui Move Object；当前运行时事实仍是 `EVM + TON`    |
| **Privacy by Default (A2A)** | Agent 间仅交换脱敏指针（Object ID / one-time Capability），不交换正文或明文 token |
| **Thin Entry, Heavy Leaf**   | 热点入口文件只做路由/导出/装配，复杂实现落到新增叶子模块                          |

## 0.2 现状基线（代码审计摘要）

本文档所有设计均以以下代码现状为锚定基础：

| 维度                      | 当前状态                                                                                                             | 关键文件                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **bytesBase64 链路**      | `web3.storage.put` tool schema 接收 base64 → Provider HTTP handler 解码写入文件系统 → `web3.storage.get` 返回 base64 | `extensions/web3-core/src/resources/tools.ts:163-168`, `http.ts:338-346,851,955`     |
| **Delivery 投递**         | `deliverMediaReply` → `loadWebMedia` → 仅支持 `https://` 和本地路径                                                  | `src/telegram/bot/delivery.replies.ts:257`, `src/web/media.ts:324,340`               |
| **Lease 模型**            | 完整状态机（`lease_active→revoked\|expired`），`accessToken` 明文生成                                                | `extensions/market-core/src/market/handlers/lease.ts` (459L)                         |
| **Settlement 模型**       | 增量释放 + 幂等操作 + per-orderId 互斥锁，仅 EVM escrow                                                              | `extensions/market-core/src/market/handlers/settlement.ts` (867L)                    |
| **Dispute 模型**          | 完整六步 handler（open/evidence/resolve/reject/get/list），三种裁决                                                  | `extensions/market-core/src/market/handlers/dispute.ts` (521L)                       |
| **ReconciliationSummary** | **已实现**：聚合 settlement/dispute/proof/ledger/archive/anchor                                                      | `extensions/web3-core/src/market/handlers.ts`, `market-core/src/market/types.ts:504` |
| **AuditAnchor**           | **已实现**：`EvmAnchorAdapter.anchorHash` + pending 队列 + flush                                                     | `web3-core/src/audit/types.ts`, `market-core/src/market/handlers/_shared.ts`         |
| **Sui 引用**              | **零**：整个 market-core + web3-core 无任何 Sui 代码                                                                 | —                                                                                    |
| **DeliveryPayload**       | union: `download \| api \| service`；另有 `DeliveryPayloadRef` (credentials store)                                   | `market-core/src/market/types.ts:105-127`                                            |

---

## 1. 第一阶段：零 Base64 流式交付（Phase 1: Immediate — 最快上线）

**核心目标**：保持 TON+EVM 支付入口不动；补全"内部 URI → Delivery 层拉流 → Telegram sendDocument"链路；彻底阻断 bytesBase64 进入 LLM 上下文。

### 1.1 支付层：零变更

保持现有 TON + EVM 双栈支付的入金、验签、订单创建流程不动（`PaymentIntent` / `PaymentReceipt` / `FXQuote` 类型及其 handler 均不改动）。

### 1.2 URI 协议定义与类型变更

#### 1.2.1 私有 URI 协议

```
web3-storage://<resourceId>/<virtualPath>?leaseId=<leaseId>&token=<accessToken>
```

- `resourceId`：存储 offer ID
- `virtualPath`：文件在 storage backend 中的虚拟路径
- token/leaseId 为短效凭证，由 Delivery 层解析后用于鉴权拉流；**LLM 侧仅见 URI 字符串**

#### 1.2.2 `DeliveryPayload` 类型扩展

```typescript
// market-core/src/market/types.ts — 新增 union member
export type DeliveryPayload =
  | { type: "download"; downloadUrl: string }
  | { type: "api"; accessToken: string; quota?: number }
  | { type: "service"; serviceQuota?: number; ticketId?: string }
  | { type: "storage-uri"; uri: string; mime?: string; sizeBytes?: number }; // ← 新增
```

对应 `requireDeliveryPayload`（`validators.ts:77-97`）需新增 `storage-uri` 分支验证。

#### 1.2.3 Tool Schema 改造

**`web3.storage.put`**（`resources/tools.ts:163-168`）：

- **废弃** `bytesBase64` 参数
- **新增** `streamUploadUrl` 返回值：Provider 返回一个短效上传 URL，Agent 执行 multipart/stream PUT
- Tool 返回给 LLM 的结果仅含 URI 指针 + 元信息（size, etag, mime），不含正文

**`web3.storage.get`**（`resources/tools.ts:286-338`）：

- **废弃** 返回 `bytesBase64` 的行为
- **新增** 返回 `{ uri: "web3-storage://...", mime, sizeBytes, etag }` 元数据
- LLM 拿到 URI 后可将其放入 Delivery payload，由投递层完成拉流发送

**Provider HTTP Handler 改造**（`resources/http.ts`）：

- `createResourceStoragePutHandler`（第 781 行）：改为接收 `multipart/form-data` 流式上传，废弃 JSON body 中的 `bytesBase64`
- `createResourceStorageGetHandler`（第 893 行）：改为返回 `{ uri, mime, sizeBytes, etag }` 元数据（不再返回 `bytesBase64`），或提供 `Accept: application/octet-stream` 时返回二进制流

### 1.3 Delivery 层拉流改造

#### 1.3.1 `loadWebMedia` 协议扩展

**文件**：`src/web/media.ts`

在 `loadWebMediaInternal`（第 233 行）中，当前协议分支：

- `https?://` → `fetchRemoteMedia`（第 324 行）
- `file://` → `fileURLToPath` → 本地读取（第 249 行）
- 本地路径 → `readLocalFileSafely`（第 363 行）

**新增 `web3-storage://` 分支**：

```typescript
// src/web/media.ts — loadWebMediaInternal 中新增（在 https:// 分支之前）
if (mediaUrl.startsWith("web3-storage://")) {
  const resolved = resolveWeb3StorageUri(mediaUrl); // 解析 resourceId, path, leaseId, token
  const stream = await fetchWeb3StorageStream(resolved); // 用 lease 凭证向 Provider GET 二进制流
  const buffer = await streamToBuffer(stream, cap); // 流式读取，带上限保护
  return await clampAndFinalize({ buffer, contentType: resolved.mime, kind, fileName });
}
```

- `resolveWeb3StorageUri` 和 `fetchWeb3StorageStream` 作为**新增叶子模块** `src/web/web3-storage-resolver.ts`，避免污染上游 `media.ts`（符合 overlay-first 准则）
- 上游 `media.ts` 仅新增 1 个 import + 1 个 if 分支（~5 行变更）

#### 1.3.2 Telegram 投递自动识别

**文件**：`src/telegram/bot/delivery.replies.ts`

当前 `deliverMediaReply`（第 234 行）已通过 `loadWebMedia(mediaUrl, ...)` 加载媒体。只要 1.3.1 的协议扩展到位，`delivery.replies.ts` **不需要改动**——`web3-storage://` URI 会被透明处理。

唯一需要确认：`buildOutboundMediaLoadOptions`（第 259 行）的 `mediaLocalRoots` 不应拦截 `web3-storage://`（当前不会，因为它只检查本地路径）。

### 1.4 改造文件清单（Phase 1）

| 文件                                          | 变更类型                          | 变更量                   |
| --------------------------------------------- | --------------------------------- | ------------------------ |
| `market-core/src/market/types.ts`             | 扩展 `DeliveryPayload` union      | ~3 行                    |
| `market-core/src/market/validators.ts`        | 新增 `storage-uri` 验证分支       | ~8 行                    |
| `web3-core/src/resources/tools.ts`            | 废弃 `bytesBase64` 参数，改返 URI | ~40 行                   |
| `web3-core/src/resources/http.ts`             | PUT 改流式上传，GET 改返元数据    | ~60 行                   |
| **新增** `src/web/web3-storage-resolver.ts`   | URI 解析 + 鉴权拉流               | ~80 行（新文件）         |
| `src/web/media.ts`                            | 新增 `web3-storage://` 协议分支   | ~5 行（1 import + 1 if） |
| `web3-core/src/capabilities/catalog/tools.ts` | 更新 storage tool 描述            | ~4 行                    |

### 1.5 测试要点

- `resources/tools.test.ts`：现有 3 个 `bytesBase64` 测试用例需替换为 URI 模式
- `resources/http.test.ts`：现有 PUT/GET 测试需适配新的流式协议
- 新增 `src/web/web3-storage-resolver.test.ts`：覆盖 URI 解析、鉴权失败、流超限、404 等边界
- `delivery.replies.ts` 现有测试应能透明通过（loadWebMedia mock 返回 buffer 不变）

### 1.6 风险评估

| 风险                                                                        | 等级  | 缓解                                                                     |
| --------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------ |
| `web3.storage.put` API 破坏性变更导致已有 Agent 不兼容                      | 🟡 中 | 新项目无历史调用方；如有需要，可保留旧 endpoint 返回 deprecation warning |
| Provider HTTP handler 的 body 解析从 JSON 改为 multipart 可能引入 edge case | 🟡 中 | 单独的 multipart 解析模块 + 全量 fuzz 测试                               |
| `web3-storage://` 的 token 泄露到 LLM 上下文                                | 🟡 中 | P2 阶段彻底解决；P1 先用短效 token（TTL ≤ 5min）                         |

### 1.7 验收闭环：SXT（Proof of SQL）的能力边界（必须写清）

在“万物皆可交易”且面向陌生人（A2A）市场化交易时，**把 SXT 的边界写清**，是仲裁与清算架构不翻车的前提。

- **SXT 能证明什么（边界内）**：
  - 对一份已承诺（committed）的结构化数据集，某条 SQL 查询确实在“未被篡改的数据”上**被正确执行**，并产出某个结果。
  - 本质是 **“确定性结构化数据的数学自证”**：适用于表/行/列可表达的验收条件（统计、过滤、聚合等）。
- **SXT 不能证明什么（边界外）**：
  - **语义/主观质量**（“好不好看/好不好用/是不是好 prompt”）。
  - **非结构化交付物**的真实性（图片/视频/音频/3D 模型），除非先把它们映射成可验收的结构化指标（分数、特征、哈希集合）。
  - **链下数据源的真实性**（典型 “Garbage In, Garbage Out”）：它能保证“入库后未篡改 + 查询算对了”，但不能保证“入库前就是真的”。
- **工程现实约束（容易忽略）**：
  - Proof of SQL 对 SQL 功能的支持是逐步扩展的（例如多表/子查询等在不同版本上支持度不同），**验收 SQL 需要落在其可证明子集内**。

### 1.8 边界外怎么补齐：来源证明 + 可验证执行 + 经济学兜底

为避免把“验收”全押在单一技术上，推荐把“可验证性”拆成三层：

1. **数据源真实性（Provenance）层**：用 TLS 证明类技术为“数据确实来自某个网站/API 的某次 TLS 会话”背书。
   - 代表工作：`TLSNotary`（arXiv:2409.17670）与 `DECO`（arXiv:1909.00938 / chainlink 版本）。
   - 结论：它们能证明“这段响应确实是该站点在 TLS 会话里发出的”，但不能证明“站点说的就是真理”。
2. **确定性计算（Deterministic Execution）层**：
   - 结构化数据验收：`SXT Proof of SQL`（对 committed dataset 的 SQL 结果正确性证明）。
   - 代码/程序/脚本交付：优先用 `zkVM` 的可验证执行收据（例如 `RISC Zero` / `SP1`），把“跑过单测/benchmark/约束”变成可验证收据，而不是只信日志。
3. **主观质量/非结构化（Subjective / Unstructured）层**：
   - 采用 **乐观验证 + 争议期 + 质押惩罚（staking/slashing）+ 仲裁委员会** 的组合。
   - 允许附加可量化的代理指标（例如小模型打分、特征提取分数），但要承认其不是铁证，只是仲裁证据。

### 1.9 业界前沿：Fair Data Exchange（CCS’24 / IACR 2024/418）对“支付释放”的启发

普通的 escrow + 交付，在陌生人市场里会遇到一个核心矛盾：**交付往往发生在链下，合约很难强制“交付”和“付款”原子绑定**。

`Atomic and Fair Data Exchange via Blockchain`（CCS’24）给出的关键启发是：

- **目标**：让“客户端拿到文件”与“服务器收到付款”满足严格的原子性：要么都发生，要么都不发生。
- **做法概述**：
  - 服务器把数据加密链下发送，并给出证明，证明“加密数据对应于某个承诺（commitment）”。
  - 解密密钥通过链上出售，以原子交换方式实现“付款 ⇄ 解密密钥”。
- **关键密码学构件**：
  - `KZG commitments`（承诺大数据内容）
  - `VECK`（Verifiable Encryption under Committed Key，用于证明加密数据与承诺匹配）
- **与 SXT 的关系**：FDE 解决“公平交付与公平付款”，SXT 解决“结构化验收条件可被证明”。两者不是替代关系，而是可以叠加。

> 参考：`https://eprint.iacr.org/2024/418`（IACR ePrint）

### 1.10 推荐架构：Hybrid Validator Matrix（把验收路由做成一等公民）

把不同交付物路由到不同“验证器”，并把验证结果作为 `Escrow` 释放条件，比“统一用一个验收机制”更稳、更工业化：

- **数据/报表类（结构化）** → `SXT Proof of SQL` +（可选）`TLSNotary/DECO` 来源证明
  - **信任根**：数学与密码学（确定性）
  - **释放条件**：Proof 验证通过 → 直接放款/分段放款
- **代码/程序类（可确定性执行）** → `zkVM receipt`（RISC0/SP1）优先，`TEE + 远程证明` 备选
  - **信任根**：可验证执行（密码学）或可信硬件（远程证明）
  - **释放条件**：receipt/attestation + 约束测试通过 → 放款
- **媒体/艺术/策略类（主观/非结构化）** → 乐观验证 + 争议期 + 质押惩罚 + 仲裁委员会
  - **信任根**：博弈论与声誉/经济惩罚（非确定性）
  - **释放条件**：争议期无异议自动放款；有异议则冻结进入仲裁

这套矩阵与 Zero-Base64 完全一致：**交付内容不进 LLM 上下文，验收证据（proof/receipt/attestation/decision）才进入上下文并被记录与对账。**

---

## 2. 第二阶段：Sui-First 语义升级与 A2A 隐私协同（Phase 2: Semantic Upgrade）

**核心目标**：将 Lease / Settlement(Escrow) / Receipt 迁移至 Sui Move Object 模型；A2A 仅交换脱敏指针。

### 2.1 现有模型到 Sui Object 的映射

#### 2.1.1 Lease → Sui Owned Object + Time-lock

**当前**（`lease.ts`）：Off-chain 状态机 `lease_active→revoked|expired`，字段包括 `leaseId, resourceId, providerActorId, consumerActorId, accessTokenHash, expiresAt, maxCost`。

**目标**：

```move
// move/sources/lease.move
module openclaw::lease {
    struct Lease has key, store {
        id: UID,
        resource_id: vector<u8>,
        provider: address,
        consumer: address,
        access_cap_id: ID,          // 指向 AccessCapability object
        expires_at: u64,            // epoch timestamp
        max_cost: u64,
        status: u8,                 // 0=active, 1=revoked, 2=expired
    }

    struct AccessCapability has key {
        id: UID,
        lease_id: ID,
        scopes: vector<vector<u8>>, // 允许的操作范围
    }
}
```

- `AccessCapability` 作为独立 Owned Object 发给 consumer，consumer 凭此 object（而非明文 token）向 provider 证明授权
- 撤销 = provider `transfer_to_object` 回收 `AccessCapability`，同时更新 `Lease.status`
- 过期 = 链上 Clock 触发自动失效（或由 sweeper 调用 `expire_lease` 入口）

**改造路径**：

- 新增 `extensions/sui-adapter/` 扩展包（与现有 `blockchain-adapter` 同级）
- `lease.ts` handler 改为：创建链上 Lease object → 存储 object ID 到 off-chain DB → 返回 object ID 作为 leaseId
- `_shared.ts` 中 `recordAuditWithAnchor` 新增 `SuiAnchorAdapter` 分支（与 `EvmAnchorAdapter` 并行）

#### 2.1.2 Settlement(Escrow) → Sui Shared Object

**当前**（`settlement.ts`）：Off-chain 状态机 `locked→released|refunded`，增量释放 + 幂等操作 + `withSettlementLock` 互斥。

**目标**：

```move
module openclaw::escrow {
    struct Escrow has key {
        id: UID,
        order_id: vector<u8>,
        payer: address,
        payee: address,
        coin: Balance<SUI>,        // 或 USDC 等
        locked_amount: u64,
        released_amount: u64,
        status: u8,
        dispute_window_end: u64,   // epoch timestamp
    }
}
```

- Shared Object：买卖双方和仲裁者均可交互
- `release` 操作需要 `payee` 签名 + 争议窗口已过
- `refund` 操作需要 dispute resolution 或 `payer` + timeout

**改造路径**：

- `settlement.ts` 的 `releaseSettlementIncremental` 改为调用 Sui `escrow::release` PTB（Programmable Transaction Block）
- 保留 off-chain 的幂等控制层（`SettlementOperation` 仓库），链上操作作为最终确认

#### 2.1.3 Receipt → Sui Owned Object (Immutable)

**当前**（`types.ts:620-652`）：Off-chain `TaskReceipt`（receiptHash, status, settlementId 等）。

**目标**：

```move
module openclaw::receipt {
    struct Receipt has key, store {
        id: UID,
        task_id: vector<u8>,
        payer: address,
        payee: address,
        amount: u64,
        artifact_hash: vector<u8>,  // sha256 of delivered artifact
        settlement_id: ID,          // 指向 Escrow object
    }
}
```

- 创建后立即 `freeze_object` → 不可篡改凭证
- 其 Object ID 即为脱敏指针，A2A 间仅交换此 ID

### 2.2 A2A 脱敏通讯协议

**当前问题**：

- `lease.ts:135` 生成 `accessToken` 明文后进入 delivery payload
- A2A 交互时 `accessToken` 可能暴露在 LLM 上下文中

**目标协议**：

```
Agent A                          Sui Chain                         Agent B
   │                                │                                  │
   │── create_lease ──────────────>│                                  │
   │<── Lease ObjectID + CapID ────│                                  │
   │                                │                                  │
   │── A2A message ────────────────│──────────────────────────────────>│
   │   { leaseObjectId: "0x...",   │   (仅 ObjectID, 无正文/token)     │
   │     capObjectId: "0x..." }    │                                  │
   │                                │                                  │
   │                                │<── verify_cap(capId, leaseId) ──│
   │                                │── ok ──────────────────────────>│
   │                                │                                  │
   │                                │<── pull_resource(leaseId, path) ─│
```

- A2A 报文中**仅含 Object ID**（脱敏指针），不含文件正文、明文 token、鉴权密钥
- 接收方凭 `AccessCapability` object 向链上或 Provider 验证权限后拉取资源

### 2.3 改造文件清单（Phase 2）

| 文件/模块                                       | 变更类型                | 说明                                               |
| ----------------------------------------------- | ----------------------- | -------------------------------------------------- |
| **新增** `extensions/sui-adapter/`              | 新扩展包                | Sui SDK 封装、PTB 构建、Object 查询                |
| **新增** `move/sources/`                        | Move 合约               | lease.move, escrow.move, receipt.move              |
| `market-core/src/market/handlers/lease.ts`      | 重写核心逻辑            | 创建/撤销/查询改为链上操作 + off-chain 索引        |
| `market-core/src/market/handlers/settlement.ts` | 重写 escrow 操作        | `withSettlementLock` 保留；底层改为 Sui PTB        |
| `market-core/src/market/handlers/_shared.ts`    | 新增 SuiAnchorAdapter   | 与 EvmAnchorAdapter 并行，按 config 选择           |
| `web3-core/src/audit/hooks.ts`                  | 支持 Sui 锚定           | `anchorHash` 新增 Sui 分支                         |
| `market-core/src/market/types.ts`               | 新增 Sui Object ID 字段 | `Lease.suiObjectId?`, `Settlement.suiObjectId?` 等 |

### 2.4 风险评估

| 风险                           | 等级  | 缓解                                             |
| ------------------------------ | ----- | ------------------------------------------------ |
| Sui 合约安全审计周期           | 🔴 高 | 先部署 devnet/testnet 验证；正式上线前第三方审计 |
| Off-chain 索引与链上状态一致性 | 🟡 中 | Event subscription + 定期 reconciliation sweep   |
| Sui 网络 Gas 波动              | 🟡 中 | Gas station / sponsor transaction 模式           |

---

## 3. 第三阶段：运营级全局治理与多链抽象（Phase 3: Operational Grade）

**核心目标**：基于已有 `ReconciliationSummary` 和 `AuditAnchor` 基础设施，升级为三链统一的运营级底座。

### 3.1 已有实现盘点（非从零开始）

| 能力         | 已有实现                                                                         | P3 升级方向                                                       |
| ------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **对账摘要** | `ReconciliationSummary` 类型 + `market.reconciliation.summary` handler（含测试） | 扩展支持 Sui 链上 escrow 状态；新增跨链资产流水聚合               |
| **审计锚定** | `AuditAnchor` 类型 + `EvmAnchorAdapter` + pending 队列 + flush                   | 新增 `SuiAnchorAdapter`；统一锚定接口，按策略选择目标链           |
| **争议仲裁** | 6 个 handler + 3 种裁决 + 原子联动 settlement                                    | 链上争议窗口（Escrow.dispute_window_end）；去中心化仲裁委员会投票 |

### 3.2 三链归一：Chain-Agnostic 接口

**现状**：`PaymentChain = "ton" | "evm"`（`types.ts:454`）。

**目标**：

```typescript
export type PaymentChain = "ton" | "evm" | "sui";

// 新增统一查询接口（用户无感知链细节）
type UnifiedBalanceQuery = {
  actorId: string;
  // 不暴露 chain/network 参数
};

type UnifiedBalanceResult = {
  available: string; // 统一计价（如 USDC）
  locked: string; // escrow 中冻结的
  pending: string; // 争议期中的
  // 底层明细仅在 admin/debug 接口暴露
};
```

- 对外 API（`web3.market.*`）全部使用统一计价口径
- 链路由逻辑内化到 `settlement.ts` 和 `bridge.ts`，对调用方透明

### 3.3 ReconciliationSummary 升级

基于已有的 `ReconciliationSummary`（`types.ts:504-532`），新增：

```typescript
// 新增字段（追加到现有类型末尾）
export type ReconciliationSummary = {
  // ... 已有字段保留 ...

  // ── P3 新增 ──
  /** 跨链资产流水聚合 */
  crossChainFlows?: {
    byChain: Record<PaymentChain, { inflow: string; outflow: string; netFlow: string }>;
    totalInflow: string;
    totalOutflow: string;
  };
  /** Merkle Root 批次锚定 */
  batchAnchor?: {
    merkleRoot: string;
    leafCount: number;
    anchoredAt: string;
    chains: Array<{ chain: PaymentChain; tx: string; block?: number }>;
  };
  /** 争议窗口状态 */
  disputeWindow?: {
    isOpen: boolean;
    expiresAt?: string;
    remainingSeconds?: number;
  };
};
```

### 3.4 统一审计锚定引擎

**当前**：单次 event → 单次 `EvmAnchorAdapter.anchorHash()`。

**目标**：批次 Merkle 锚定。

```
┌─────────────────┐
│  Market Events   │  offer_created, delivery_issued, settlement_released ...
└────────┬────────┘
         │ append to batch buffer
         ▼
┌─────────────────┐
│  Merkle Builder  │  每 N 条或每 T 分钟构建一棵 Merkle Tree
└────────┬────────┘
         │ root hash
         ▼
┌─────────────────┐
│  Anchor Router   │  按策略选择目标链（Sui 优先，EVM 备选，TON 可选）
└────────┬────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
  Sui   EVM   TON
```

- 单条 event 仍可通过 `pending anchor` 队列保证最终一致
- 批次锚定大幅降低 Gas 成本
- 已有的 `flushPendingAnchors` 机制可复用为批次 flush 触发器

### 3.5 链上争议窗口

**当前**（`dispute.ts`）：争议窗口由 off-chain 逻辑控制，无链上强制。

**目标**：

- `Escrow.dispute_window_end` 作为链上硬约束：在此时间点之前，`release` 操作会被 Move 合约拒绝
- 争议期内 `dispute_open` 自动冻结 escrow（链上 assert）
- 裁决结果（`resolve` 的 `release/refund/partial`）通过 PTB 直接操作链上 escrow coin split + transfer

**改造路径**：

- `dispute.ts` 的 `createDisputeResolveHandler` 中的 settlement 操作改为 Sui PTB 调用
- 保留 off-chain 的 evidence 存储（IPFS CID + hash），链上仅存 evidence hash 的 Merkle root

### 3.6 改造文件清单（Phase 3）

| 文件/模块                                       | 变更类型                     | 说明                                             |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------ |
| `market-core/src/market/types.ts`               | 扩展 `ReconciliationSummary` | 新增 crossChainFlows, batchAnchor, disputeWindow |
| `market-core/src/market/types.ts`               | 扩展 `PaymentChain` union    | 新增 `"sui"`                                     |
| `web3-core/src/market/handlers.ts`              | 升级 reconciliation handler  | 聚合 Sui 链上 escrow 状态                        |
| `web3-core/src/audit/hooks.ts`                  | Merkle 批次锚定引擎          | 替代现有单条锚定                                 |
| **新增** `web3-core/src/audit/merkle-batch.ts`  | Merkle Tree 构建器           | ~200 行新文件                                    |
| **新增** `web3-core/src/audit/anchor-router.ts` | 多链锚定路由器               | ~150 行新文件                                    |
| `move/sources/escrow.move`                      | 新增 dispute_window 约束     | assert 逻辑                                      |
| `market-core/src/market/handlers/dispute.ts`    | 裁决操作改为链上 PTB         | ~40 行变更                                       |
| `market-core/src/market/handlers/settlement.ts` | 新增 Sui chain 分支          | ~30 行变更                                       |

---

## 4. 里程碑与依赖关系

```
P1 零 Base64 ─────────────────────────────────────> 可独立上线
  │
  │  P1 完成后
  ▼
P2 Sui-First ─────────────────────────────────────> 依赖 Move 合约开发 + Sui devnet 验证
  │                                                  依赖 sui-adapter 扩展包
  │  P2 完成后
  ▼
P3 运营级 ────────────────────────────────────────> 依赖 P2 的 Sui escrow
                                                    可部分并行：Merkle 批次锚定可在 P1 后启动
```

| 阶段 | 预估工作量 | 前置依赖                                 |
| ---- | ---------- | ---------------------------------------- |
| P1   | 1-2 周     | 无（仅涉及已有代码改造）                 |
| P2   | 4-6 周     | Move 合约开发、Sui SDK 集成、devnet 验证 |
| P3   | 2-3 周     | P2 的 Sui escrow；Merkle 批次可提前      |

## 5. 不做的事情（Anti-Goals）

- **不做中间兼容层**：不维护 base64 → URI 的双模式并行，直接切换
- **不在上游热点文件内联大段逻辑**：所有新增实现走新文件（overlay-first 准则）
- **不碰 `pnpm-workspace.yaml`**：扩展裁剪在构建阶段做
- **不修改已有字段语义**：`ReconciliationSummary` / `AuditAnchor` 等已有字段只追加不修改
- **不在 P1 引入 Sui 依赖**：P1 纯粹解决 base64 问题，链无关

## 6. 调研来源与相关链接

### 6.1 已对齐的核心材料

- [`OpenClaw Sui-first Agentic Commerce 选型备忘`](../references/openclaw-sui-first-agentic-commerce.md)
- [`OpenClaw Web3 Sui-first 架构草案`](../../../docs/reference/web3-sui-first-architecture.md)
- [`Sui Move 工业化整改蓝图`](../../../docs/reference/web3-sui-industrialization-blueprint.md)
- [`Sui Move 协议草图`](../../../docs/reference/web3-sui-move-protocol.md)
- [`Web3 Market 开发参考`](../../../docs/reference/web3-market-dev.md)
- [`Web3 Market 概念说明`](../../../docs/concepts/web3-market.md)

### 6.2 本文与上述材料的关系

- **本文的角色**：把本轮对话结论、代码审计结果和目标态路线图压缩成一份可执行的阶段方案。
- **与 `Sui-first 架构草案` 的关系**：后者回答“为什么下一阶段主账本倾向 `Sui`”；本文回答“如何从当前代码现实演进到那个目标态”。
- **与 `工业化整改蓝图` 的关系**：后者聚焦 Move/PTB/对象所有权的工业化细化；本文先给出系统级分期与依赖顺序。
- **与 `Web3 Market 开发参考` 的关系**：开发参考描述当前运行时事实；本文在不改写事实的前提下，提出下一阶段改造路径。
