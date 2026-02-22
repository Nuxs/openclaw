# OpenClaw Web3 Market 评估报告

> **评估时间**: 2026-02-22  
> **代码基线**: OpenClaw `2026.2.22`（repo `package.json`）  
> **关键插件版本**: `web3-core@2026.2.16`、`market-core@2026.2.21`（以插件内 `version` 字段为准）  
> **评估目标**: 以 OpenClaw 为入口，构建“可审计、可计费、可交易”的 AI 资源共享市场（模型 / 搜索 / 存储）

---

## 0️⃣ 执行摘要

当前代码实现已经形成一套清晰的“**可落地 MVP**”：

- **`web3-core`** 负责横切能力：钱包身份（SIWE）、审计事件（本地 JSONL + 可选去中心化归档 + 可选链上锚定）、计费与配额、资源共享的 Provider/Consumer 编排、以及一套“安全可分享”的状态/工具输出（强制脱敏）。
- **`market-core`** 提供市场内核：资源发布/下架、租约签发/撤销/过期清理、账本追加与汇总、纠纷与透明度接口、以及可选的 EVM 合约托管结算（Escrow）。
- **双栈路线（TON+EVM，统一口径）**：已补齐“支付双入口、结算单出口、最小披露与零泄露”的规划口径（见 `docs/WEB3_DUAL_STACK_STRATEGY.md` 与 `docs/reference/web3-dual-stack-payments-and-settlement.md`）；当前代码关键路径仍以 EVM 为主，TON 侧链能力位于 `extensions/blockchain-adapter`（尚未纳入主线编排/结算关键路径）。

**关键判断**：

- **架构边界与安全默认做得正确**：`market.*` 作为内核接口，默认受访问控制；工具输出默认脱敏，避免把 Token、Endpoint、真实路径泄露到外部消息通道。
- **可用性仍是最大短板**：当前的资源发现/接入仍偏“运维式”，需要外部配置或带外分发 Provider endpoint；没有一体化 UI/Dashboard。
- **“经济/质量/网络效应”从代码层面刚起步**：账本、租约、纠纷等基础设施已经具备，但去中心化发现、信誉/质量、以及完整代币经济仍处于规划阶段。

---

## 1️⃣ 架构评估

### 1.1 模块边界与职责

```
┌─────────────────────────────────────────────────────────────────────┐
│                           OpenClaw Gateway                           │
│                                                                     │
│  ┌──────────────────────┐     ┌──────────────────────────────────┐  │
│  │      web3-core        │     │            market-core           │  │
│  │  - SIWE 身份          │◄───►│  - market.* 内核方法             │  │
│  │  - 审计: 本地+归档     │     │  - 资源/租约/账本/纠纷/透明度     │  │
│  │  - 计费/配额/结算队列  │     │  - 可选 Escrow 合约结算 (EVM)     │  │
│  │  - Provider HTTP 路由 │     │  - 状态落盘: SQLite/WAL           │  │
│  │  - Index(签名+TTL)    │     │  - 访问控制 + 错误脱敏            │  │
│  └──────────────────────┘     └──────────────────────────────────┘  │
│                                                                     │
│  外部:                                                             │
│  - 去中心化归档：IPFS(Pinata)/Arweave/Filecoin(web3.storage)        │
│  - 链上锚定：EVM calldata (OPCLAW:<anchorId>:<payloadHash>)          │
└─────────────────────────────────────────────────────────────────────┘
```

**评分**: ⭐⭐⭐⭐☆（4/5）

- **优点**:
  - **边界清晰**：`web3-core` 做横切，`market-core` 做交易与状态机；接口通过 `web3.*` 与 `market.*` 明确分层。
  - **安全默认合理**：`market.*` 预期由受控客户端调用；`web3-market` 工具与状态输出默认脱敏，不暴露 `accessToken`/endpoint/真实路径。
  - **工程化完整**：落盘（SQLite/file）、审计（JSONL）、重试队列（pending）与后台 flush 周期都已实现。

- **需要注意**:
  - **“去中心化”与“可用性”之间存在现实落差**：资源发现与接入目前仍以“同一网关实例的索引/带外配置”为主，未形成节点间 P2P 广播与路由。

---

### 1.2 状态与数据落盘（按代码）

- **默认状态目录**：`~/.openclaw`（可通过环境变量 `OPENCLAW_STATE_DIR` 覆盖）。
- **`web3-core` 插件状态**（`STATE_DIR/web3/`）：
  - `bindings.json`: 钱包绑定
  - `siwe-challenges.json`: SIWE challenge（带 TTL）
  - `audit-log.jsonl`: 审计事件（append-only）
  - `archive-key.json`: 归档加密使用的本地随机 32-byte key
  - `archive-receipt.json`: 最近一次归档回执（CID/URI）
  - `pending-archive.json`: 归档重试队列
  - `pending-tx.json`: 锚定重试队列
  - `anchor-receipts.json`: 锚定回执
  - `usage.json`: 计费/配额
  - `pending-settlements.json`: 结算锁定重试队列
  - `resource-index.json`: 资源索引（Ed25519 签名 + TTL）

- **`market-core` 插件状态**（`STATE_DIR/market/`）：
  - 默认启用 SQLite：`market.db`（WAL 模式）
  - 兼容 file store：`offers.json`/`resources.json`/`orders.json`/`leases.json`/`ledger.jsonl` 等

- **敏感交付载荷（可选）**：当 `market-core.credentials.mode=external` 时，交付载荷会加密落盘到 `~/.openclaw/credentials/market-core/`（默认路径，可配置 `credentials.storePath`）。

---

## 2️⃣ 数据流与关键路径（按代码对齐）

### 2.1 资源发布（Provider → Market）

**调用入口（面向用户/编排）**：`web3.resources.publish`（内部代理到 `market.resource.publish`）

```
Provider（开启 resources + advertiseToMarket）
  ↓
[1] web3.resources.publish(resource)
  ↓  (proxy)
[2] market.resource.publish
    - 原子写入 offer + resource
    - 记录 market audit
    - 可选：EVM 锚定（config.chain.privateKey 存在时）
  ↓
[3] 落盘：STATE_DIR/market/market.db（或 resources.json 等）
```

**实现要点**:

- **资源类型**：`model` / `search` / `storage`
- **定价单位**（受 kind 限制）：
  - `model`: `token` / `call`
  - `search`: `query`
  - `storage`: `gb_day` / `put` / `get`
- **输入校验较严格**：长度、枚举、地址格式、policy 约束等都有兜底。

**评分**: ⭐⭐⭐⭐☆（4/5）

---

### 2.2 租约签发与消费（Consumer → Provider）

这里需要特别澄清：**代码实现的“消费闭环”以“租约 + Provider HTTP 访问令牌”为核心**，而不是必然先走链上托管结算。

**消费侧入口（对 LLM 工具友好）**：

- `web3.market.lease`（工具）：调用 `web3.resources.lease`，仅返回“已存储/leaseId/orderId”等脱敏信息。
- `web3.search.query` / `web3.storage.put|get|list`（工具）：使用本地缓存的租约令牌去调用 Provider HTTP。

**底层实际调用链**：

```
Consumer
  ↓
[1] web3.resources.lease({ resourceId, consumerActorId, sessionKey?, providerEndpoint? })
  ↓
[2] market.lease.issue
    - 原子创建 order + consent + delivery + lease
    - 生成 accessToken，并仅在此处返回一次
    - 只存 hash（accessTokenHash）到 lease
    - 可选：把 accessToken 加密存到 external credentials store
  ↓
[3] web3-core 在本进程内缓存 accessToken（按 resourceId）
    - providerEndpoint 来自：入参 providerEndpoint（带外提供）或 config.brain.endpoint
  ↓
[4] Consumer 工具访问 Provider HTTP
    - Header: Authorization: Bearer tok_***
    - Header: X-OpenClaw-Lease: <leaseId>
    - Provider 侧会二次校验：lease 是否 active、是否过期、token hash 匹配、resource 是否仍 published
```

**Provider HTTP 路由（当前实现）**：

- `POST /web3/resources/model/chat`（以及兼容 `POST /v1/chat/completions`）
- `POST /web3/resources/search/query`
- `POST /web3/resources/storage/put`
- `GET  /web3/resources/storage/get?path=...`
- `POST /web3/resources/storage/list`

**账本（ledger）写入**：由 Provider 侧“权威追加”（fire-and-forget），调用 `market.ledger.append`；Consumer 无法伪造账本条目（这是系统设计的安全底线之一）。

**评分**: ⭐⭐⭐⭐☆（4/5）

- 强项：令牌从不在工具输出中回显（`accessToken` 仅签发瞬间出现一次），Provider 端校验完整；租约/资源状态一致性检查到位。
- 短板：Provider endpoint 仍需要带外配置或同网关默认值；“真正的跨节点发现”尚未形成。

---

### 2.3 审计与归档（Audit → Archive → Anchor）

**Hook 覆盖（代码已实现）**：`llm_input` / `llm_output` / `after_tool_call` / `session_end`

```
任意会话事件
  ↓
[1] 生成 AuditEvent
    - payload 做字段级脱敏（默认键：token/apiKey/password/privateKey...）
    - 计算 payloadHash
    - 写入 STATE_DIR/web3/audit-log.jsonl
  ↓
[2] 可选：归档到去中心化存储
    - 需要配置 storage provider 凭证（如 Pinata JWT / Arweave keyfile / Filecoin token）
    - 可选 AES-256-GCM 加密（默认开启）
    - 成功后写入 archive-receipt.json
    - 失败进入 pending-archive.json，后台每 60s 重试
  ↓
[3] 可选：链上锚定（EVM）
    - 有 privateKey：即时尝试 anchorHash
    - 无 privateKey：写入 pending-tx.json，后台每 60s 重试
    - 锚定形式：发送一笔最小交易，calldata 为 OPCLAW:<anchorId>:<payloadHash>
    - 成功写入 anchor-receipts.json
```

**重要现实**：当前归档加密 key 默认存为本地随机 key（`web3/archive-key.json`），不是“钱包派生/签名派生”。因此这更像“本地可恢复的加密归档”，而不是严格的“链上身份派生密钥体系”。

**评分**: ⭐⭐⭐⭐⭐（5/5）

---

## 3️⃣ 易用性评估

### 3.1 开发者体验

| 维度             | 评分       | 说明                                                                |
| ---------------- | ---------- | ------------------------------------------------------------------- |
| **API 分层**     | ⭐⭐⭐⭐⭐ | `web3.*` 对用户/编排，`market.*` 对内核；清晰且可控                 |
| **状态可观测性** | ⭐⭐⭐⭐☆  | 有 `web3.status.summary` 与 `web3_market_status` 工具（输出可分享） |
| **安全默认**     | ⭐⭐⭐⭐⭐ | 工具输出/错误信息默认脱敏（token/endpoint/path 等）                 |
| **可测试性**     | ⭐⭐⭐☆    | 有单测与部分 e2e，但跨插件/跨节点的端到端仍偏少                     |
| **配置复杂度**   | ⭐⭐⭐     | 多模块开关多，且 Provider endpoint 带外配置仍占比高                 |

### 3.2 最终用户体验

当前体验更接近“开发者/运维可用”，离“普通用户可用”尚有距离：

- **钱包与 Gas 概念仍是认知门槛**：虽然系统对链上锚定做了“可选启用”，但一旦进入 Web3 语境，用户仍容易被私钥、RPC、合约地址等概念阻塞。
- **资源发现是核心短板**：代码提供了 `web3.index.*`（签名 + TTL + 心跳）作为索引机制，但列表接口默认会**脱敏 endpoint**，使其天然更适合作为“可分享的市场概览”，而不是“自动接入的路由系统”。

---

## 4️⃣ 功能完善性评估（按代码实现重算）

### 4.1 已实现（✅）与部分实现（⚠️）

| 模块     | 子能力                                    | 状态 | 备注                                                         |
| -------- | ----------------------------------------- | ---- | ------------------------------------------------------------ |
| 身份     | SIWE challenge/verify                     | ✅   | `web3.siwe.*`，EVM 体系                                      |
| 身份     | 钱包绑定/解绑/查询                        | ✅   | `/bind_wallet`、`/unbind_wallet`、`/whoami_web3`             |
| 审计     | 事件采集（input/output/tool/session_end） | ✅   | 本地 JSONL + 哈希                                            |
| 审计     | 去中心化归档（IPFS/Arweave/Filecoin）     | ⚠️   | 需配置 provider 凭证才会启用                                 |
| 审计     | 链上锚定（EVM calldata）                  | ⚠️   | 需配置 `chain.privateKey` 才会启用                           |
| 市场     | 资源发布/下架/查询/列表                   | ✅   | `market.resource.*`（经 `web3.resources.*` 代理）            |
| 市场     | 租约签发/撤销/过期清理                    | ✅   | `market.lease.*`，令牌只返回一次                             |
| 市场     | 账本追加/列表/汇总                        | ✅   | Provider 权威追加，Consumer 不可伪造                         |
| 市场     | 纠纷（dispute）与透明度/指标快照          | ✅   | 已有 handler 与状态落盘                                      |
| 资源共享 | Provider HTTP（model/search/storage）     | ✅   | token + lease header 校验 + policy 约束                      |
| 资源发现 | 索引上报/心跳/签名验证/TTL                | ⚠️   | 存在但分发/路由仍非 P2P，endpoint 默认不对外展示             |
| 计费     | 配额守卫（before_tool_call）              | ✅   | tool/llm 按配置扣费                                          |
| 计费     | 结算队列（pending）与后台 flush           | ⚠️   | 依赖 session settlement 元数据                               |
| 结算     | Escrow 合约 lock/release/refund（EVM）    | ⚠️   | 需要 `escrowContractAddress` + `tokenAddress` + `privateKey` |

### 4.2 明确未实现（❌）

| 模块 | 子能力                         | 状态 | 说明                                             |
| ---- | ------------------------------ | ---- | ------------------------------------------------ |
| 身份 | ENS/链上名称解析               | ❌   | 代码未见实现                                     |
| 发现 | 真正的节点间 P2P 发现/路由     | ❌   | 目前无 DHT/PubSub/Gossip                         |
| 质量 | 评分系统 / 信誉分 / 反作弊     | ❌   | 未形成可执行闭环                                 |
| 经济 | 代币发行/通胀/销毁/治理        | ❌   | 仍属于产品与合约层设计                           |
| 双栈 | TON+EVM 支付/回执/结算口径统一 | ❌   | 已完成文档口径定义（见双栈策略），工程接入待推进 |
| 跨链 | 多链资产与跨链桥               | ❌   | 当前关键路径主要是 EVM                           |
| UI   | 面向用户的市场 Dashboard       | ❌   | UI 侧目前仅有状态读取接口的基础 wiring           |

---

## 5️⃣ 风险与技术债（按代码可验证点）

### 5.1 安全风险

| 风险           | 描述                                                  | 代码现状                                                 | 缓解建议                                              |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| 私钥/凭证泄露  | RPC 私钥、Pinata JWT、Filecoin token 等配置不当会泄露 | 工具/错误默认脱敏，但配置仍由用户提供                    | 建议引导使用环境变量/外部密钥管理；提供配置自检命令   |
| 端点暴露       | Provider endpoint 暴露会导致资源被探测/滥用           | 工具输出会红action endpoint；Provider 访问需 token+lease | 建议默认仅绑定 loopback；LAN 模式需明确 allowlist     |
| 账本伪造       | Consumer 冒充 Provider 写账本                         | Provider 侧权威追加，调用 `market.ledger.append`         | 保持 `market.ledger.append` 权限与 actor 校验为硬门槛 |
| 数据留存与合规 | 审计/归档涉及隐私与合规                               | 默认“hash_only”上链，归档可加密                          | 建议增加数据轮转/保留策略配置与提示                   |

### 5.2 性能与可运营性

| 瓶颈                  | 影响                                       | 代码现状                    | 优化方向                                     |
| --------------------- | ------------------------------------------ | --------------------------- | -------------------------------------------- |
| 归档/锚定依赖外部网络 | 上传慢/失败会积压 pending                  | 有 pending 队列 + 60s flush | 需要指标与告警聚合，提供更可见的失败原因统计 |
| SQLite 并发与状态增长 | 市场/账本增长后影响查询                    | 默认 SQLite/WAL             | 后续可按需拆表/加索引或迁移到服务化存储      |
| Provider 资源隔离     | 存储 offer 的 rootDir 与 policy 需要强约束 | 已有路径净化与 policy 校验  | 继续强化 rootDir 的最小权限与审计            |

---

## 6️⃣ 路线图建议（从“能跑”到“能增长”）

### 短期（1-4 周）：把 MVP 变成可运营

- **资源发现“最小可用”**：补齐“从索引到接入”的闭环（在不泄露 endpoint 的前提下，引入可授权的 endpoint 分发机制）。
- **默认配置/向导**：把 Web3 相关开关、凭证、Provider listen、索引上报做成一条“可复制的最短路径”。
- **双栈口径落地（TON+EVM）**：按 `docs/WEB3_DUAL_STACK_STRATEGY.md` 先补齐“支付回执 + 对账摘要”的统一输出，再逐步接入 TON 侧链能力（`extensions/blockchain-adapter`）。
- **可观测性增强**：围绕 pending（archive/anchor/settlement）提供统计、告警、快速定位。

### 中期（1-3 个月）：形成网络效应

- **发现层升级**：引入可插拔的发现层（中心化索引服务 → 混合方案 → P2P）。
- **质量与信誉**：从“最简单评分 + 纠纷流程”开始，逐步引入 stake/slash 或 oracle 抽检。
- **结算策略分层**：把“租约签发”“账本计量”“结算锁定/释放”进一步解耦，形成可替换的结算后端（anchor_only / contract / L2 批结算）。

### 长期（3-12 个月）：协议化与治理

- **代币经济与治理**：明确 token 发行、激励与治理边界，避免过早“金融化”稀释产品价值。
- **跨链与多链资源**：在 EVM 路径稳定后，再引入更多链与跨链桥（避免早期复杂度爆炸）。

---

## 7️⃣ 最终结论

从代码实现看，OpenClaw Web3 已经完成了“**可信闭环的工程底座**”：审计（可归档、可锚定）、市场（资源/租约/账本/纠纷）、资源共享（Provider HTTP + token/lease 校验）都已具备。

短板也同样明确：**发现/接入/易用性**仍决定能否真正形成网络效应。若未来 1-3 个月内能把“索引→接入→消费”的体验做成低摩擦的闭环，并把失败可观测性与运营工具补齐，则具备向更强去中心化演进的现实基础。

---

## 📎 附录

### A. 关键代码入口（便于复核）

- `extensions/web3-core/src/index.ts`：插件注册（commands/hooks/gateway/tools/http/service）
- `extensions/web3-core/src/audit/hooks.ts`：审计事件采集、归档、锚定与 pending 队列
- `extensions/web3-core/src/storage/*`：IPFS/Arweave/Filecoin 归档适配
- `extensions/web3-core/src/resources/*`：Provider HTTP、Consumer 工具、索引上报
- `extensions/market-core/src/index.ts`：`market.*` 方法注册
- `extensions/market-core/src/market/handlers/*`：资源/租约/账本/纠纷/结算/透明度
- `extensions/market-core/src/state/store.ts`：SQLite/file store

### B. 参考资源

- [SIWE 标准 (EIP-4361)](https://eips.ethereum.org/EIPS/eip-4361)
- [IPFS 文档](https://docs.ipfs.tech)
- [Arweave 文档](https://docs.arweave.org)
- [Base 链文档](https://docs.base.org)
