### OpenClaw MDL（Market Discovery Layer）：基于 libp2p 的去中心化发现层实施计划

> **版本**：v1.0 (Execution Ready)  
> **创建日期**：2026-03-03  
> **状态**：⏳ 执行中  
> **适用范围**：`extensions/web3-core/src/discovery/`（主），`extensions/web3-core/src/resources/`、`extensions/web3-core/src/state/`、`extensions/web3-core/src/config.ts`、`extensions/web3-core/src/index.ts`（辅）  
> **前置依赖**：Phase 1 资源共享闭环已完成（B-2）；`web3.index.*` 索引体系已稳定运行

---

## 0. 定义与约束（硬边界）

### 0.1 术语

| 术语 | 含义 |
| --- | --- |
| **MDL** | Market Discovery Layer，去中心化资源发现层 |
| **DiscoveryBackend** | 可插拔发现后端接口（publish / discover / stop） |
| **DiscoveryRecord** | 发现记录：可验证摘要 + peerId + reachability hint |
| **DHT key** | `/openclaw/resource/<kind>/<sha256(resourceId)>` |
| **Rendezvous NS** | `openclaw:market:<kind>`（如 `openclaw:market:model`） |
| **v1 payload** | 现有 `buildSignaturePayload()` 的字段集（不改） |
| **v2 payload** | v1 字段集 + `{ peerId, reachability, payloadVersion: 2 }` |

### 0.2 安全红线（不可妥协）

- **SEC-MDL-01**：DiscoveryRecord 对外输出**永远不含** endpoint、multiaddr、accessToken、meta、resources[].metadata
- **SEC-MDL-02**：libp2p 节点的 multiaddr **永远不暴露**给 `web3.index.list` / `web3.index.peers.list` 消费者
- **SEC-MDL-03**：连接材料（endpoint + token）仅在 `market.lease.issue` 签发后通过 `ConsumerLeaseAccess` 本地缓存获取
- **SEC-MDL-04**：v1 签名路径**零修改**——任何现有签名验证逻辑不受影响
- **SEC-MDL-05**：`market.lease.issue` 零改动——本次不修改 market-core 核心
- **SEC-MDL-06**：默认 `config.discovery.enabled = false`，不启用时零副作用

### 0.3 爆炸半径控制

| 约束 | 说明 |
| --- | --- |
| 新增代码集中在 | `extensions/web3-core/src/discovery/` 目录（全部新建文件） |
| 现有文件修改控制 | `signature-verification.ts` 仅增加 v2 分支（v1 路径零改）；`store.ts` 仅增加可选字段；`config.ts` 仅增加 discovery 配置节；`index.ts` 仅增加 discovery 生命周期注入 |
| market-core | 零修改 |
| 对外 API 面 | `web3.index.*` 返回结构不变（新增字段为可选，默认不出现） |

---

## 1. 架构总览

```
extensions/web3-core/
├── src/
│   ├── discovery/                          ← 全部新建
│   │   ├── types.ts                        # Slice A
│   │   ├── namespace.ts                    # Slice A
│   │   ├── signature-v2.ts                 # Slice B
│   │   ├── ingest.ts                       # Slice C
│   │   ├── backend-static.ts              # Slice C
│   │   ├── backend-libp2p.ts              # Slice D
│   │   ├── factory.ts                      # Slice D
│   │   ├── types.test.ts                   # Slice A
│   │   ├── namespace.test.ts              # Slice A
│   │   ├── signature-v2.test.ts           # Slice B
│   │   ├── ingest.test.ts                 # Slice C
│   │   └── backend-static.test.ts         # Slice C
│   │
│   ├── resources/
│   │   └── signature-verification.ts      # [MODIFY] Slice B
│   ├── state/
│   │   └── store.ts                        # [MODIFY] Slice B
│   ├── config.ts                           # [MODIFY] Slice E
│   └── index.ts                            # [MODIFY] Slice E
│
├── package.json                            # [MODIFY] Slice D
└── ARCHITECTURE.md                         # [MODIFY] Slice F
```

### 数据流

```
Publish 流:
  Provider → web3.index.report → indexer 签名(v2) → store
           → DiscoveryBackend.publish()
           → DHT putProvider + Rendezvous register

Discover 流:
  Background Service → DiscoveryBackend.discover()
           → DiscoveryRecord[] → ingest pipeline (验签+过期过滤)
           → store.upsertResourceIndex() + store.upsertP2pPeer()
           → web3.index.list 可见 (经 redact)

Connect 流:
  Consumer → web3.index.list (peerId + reachability)
           → web3.resources.lease → market.lease.issue
           → ConsumerLeaseAccess (+ connectionRef)
           → relay/direct connect (Slice B 阶段)
```

---

## 2. 实施切片与验收标准

### Slice A：类型与命名空间（无外部依赖）

**目标**：定义 MDL 的接口契约、数据类型、命名空间构造工具。

| 序号 | 文件 | 操作 | 具体产出 |
| --- | --- | --- | --- |
| A-1 | `discovery/types.ts` | NEW | `DiscoveryBackend` 接口（publish/discover/stop）、`DiscoveryRecord` 类型、`DiscoveryQuery` 类型、`DiscoveryConfig` 类型、`Reachability` 类型、`DiscoveryResourceSummary` 类型 |
| A-2 | `discovery/namespace.ts` | NEW | `buildDhtKey(kind, resourceId)` → `/openclaw/resource/<kind>/<sha256(resourceId)>`、`buildRendezvousNs(kind)` → `openclaw:market:<kind>`、`parseDhtKey(key)` → `{ kind, resourceIdHash }` |
| A-3 | `discovery/types.test.ts` | NEW | 类型守卫测试（DiscoveryRecord 结构校验） |
| A-4 | `discovery/namespace.test.ts` | NEW | DHT key 构造/解析往返测试、Rendezvous NS 格式验证、边界输入（空字符串/特殊字符）处理 |

**接口定义（精确到字段）**：

```typescript
// DiscoveryRecord — 发现网络中传播的记录
type DiscoveryRecord = {
  providerId: string;
  peerId: string;
  resources: DiscoveryResourceSummary[];
  reachability: Reachability; // "direct" | "relay" | "unknown"
  updatedAt: string;          // ISO 8601
  expiresAt?: string;         // ISO 8601
  signature?: IndexSignature & { payloadVersion: 2 };
};

// DiscoveryResourceSummary — 资源摘要（不含 endpoint/meta/metadata）
type DiscoveryResourceSummary = {
  resourceId: string;
  kind: "model" | "search" | "storage";
  label?: string;
  tags?: string[];
  price?: string;
  unit?: string;
};

// DiscoveryBackend — 可插拔发现后端接口
interface DiscoveryBackend {
  publish(record: DiscoveryRecord): Promise<void>;
  discover(query: DiscoveryQuery): Promise<DiscoveryRecord[]>;
  stop(): Promise<void>;
}

// DiscoveryQuery — 发现查询条件
type DiscoveryQuery = {
  kind?: "model" | "search" | "storage";
  tags?: string[];
  limit?: number;
};

// DiscoveryConfig — 配置节
type DiscoveryConfig = {
  enabled: boolean;           // default: false
  backend: "libp2p" | "static"; // default: "static"
  bootstrapPeers: string[];   // default: []
  rendezvousIntervalMs: number; // default: 30_000
  dhtKeyPrefix: string;       // default: "/openclaw/resource"
};
```

**Namespace / Key 设计**：

| 用途 | 格式 | 示例 |
| --- | --- | --- |
| DHT Provider Record key | `<dhtKeyPrefix>/<kind>/<sha256(resourceId)>` | `/openclaw/resource/model/a1b2c3...` |
| Rendezvous namespace | `openclaw:market:<kind>` | `openclaw:market:model` |
| PeerId 来源 | 复用 `index-signing.json` Ed25519 密钥转换 | `12D3KooW...` |

**验收标准**：

- [ ] `DiscoveryBackend` 接口导出且可 `implements`
- [ ] `buildDhtKey("model", "res-123")` 返回 `/openclaw/resource/model/<sha256("res-123")>`
- [ ] `buildRendezvousNs("model")` 返回 `"openclaw:market:model"`
- [ ] `parseDhtKey(buildDhtKey("model", "res-123"))` 返回 `{ kind: "model", resourceIdHash: "<sha256>" }`
- [ ] 空字符串/特殊字符输入抛出明确错误
- [ ] 所有单测通过（`vitest run discovery/types.test.ts discovery/namespace.test.ts`）

**回归点**：Slice A 仅新增文件，零外部改动，回滚 = 删除 `discovery/types.ts` + `discovery/namespace.ts` + 对应测试文件。

---

### Slice B：签名 v2（依赖 Slice A）

**目标**：新增 v2 签名 payload 构建与签名逻辑，修改验签入口增加 v2 分支，扩展 store 类型。

| 序号 | 文件 | 操作 | 具体产出 |
| --- | --- | --- | --- |
| B-1 | `discovery/signature-v2.ts` | NEW | `buildSignaturePayloadV2(entry)` — 在 v1 字段集上追加 `peerId`/`reachability`/`payloadVersion: 2`；`signEntryV2(entry, privateKey)` — 使用 Ed25519 签名 |
| B-2 | `resources/signature-verification.ts` | MODIFY | 在 `verifyIndexSignature()` 入口增加分支：`entry.signature?.payloadVersion === 2` → 调用 `buildSignaturePayloadV2()`，否则走现有 v1 路径。**v1 路径代码零修改** |
| B-3 | `state/store.ts` | MODIFY | `ResourceIndexEntry` 增加可选字段 `peerId?: string`、`reachability?: Reachability`；`IndexSignature` 增加可选字段 `payloadVersion?: number` |
| B-4 | `discovery/signature-v2.test.ts` | NEW | v2 payload 构建测试（字段完整性、stableStringify 确定性）、签名+验签往返测试、v1 签名不受影响回归测试 |

**签名兼容方案（精确逻辑）**：

```
验签入口 verifyIndexSignature(entry):
  if entry.signature?.payloadVersion === 2:
    payload = buildSignaturePayloadV2(entry)  ← 新增函数
  else:
    payload = buildSignaturePayload(entry)    ← 现有函数，零修改

  hash = sha256(payload)
  verify(publicKey, hash, signature)
```

**store.ts 变更（精确 diff 预览）**：

```typescript
// ResourceIndexEntry — 仅增加可选字段
export type ResourceIndexEntry = {
  providerId: string;
  endpoint?: string;
  resources: IndexedResource[];
  updatedAt: string;
  expiresAt?: string;
  lastHeartbeatAt?: string;
  meta?: Record<string, unknown>;
  signature?: IndexSignature;
  peerId?: string;                              // ← NEW (MDL)
  reachability?: "direct" | "relay" | "unknown"; // ← NEW (MDL)
};

// IndexSignature — 仅增加可选字段
export type IndexSignature = {
  scheme: "ed25519";
  publicKey: string;
  signature: string;
  payloadHash: string;
  signedAt: string;
  payloadVersion?: number;                       // ← NEW (MDL)
};
```

**验收标准**：

- [ ] `buildSignaturePayloadV2()` 输出包含 `peerId`、`reachability`、`payloadVersion: 2` 字段
- [ ] `signEntryV2()` 签名 → `verifyIndexSignature()` 验签成功（v2 路径）
- [ ] 现有 v1 签名的 `verifyIndexSignature()` 验签结果不变（**回归测试**）
- [ ] `ResourceIndexEntry` 的 `peerId`/`reachability` 为可选，不影响现有 JSON 反序列化
- [ ] `IndexSignature` 的 `payloadVersion` 为可选，不影响现有签名结构
- [ ] `signature-verification.ts` 的 v1 代码路径**无任何改动**（可 diff 验证）
- [ ] 所有单测通过

**回归点**：`signature-verification.ts` 的 v2 分支为纯追加（`if` 分支），回滚 = 删除分支 + 删除 `signature-v2.ts` + 删除 store 新增字段。

---

### Slice C：Ingest 管线与静态后端（依赖 Slice B）

**目标**：实现发现结果到 store 的落地管线，以及作为默认 fallback 的静态后端。

| 序号 | 文件 | 操作 | 具体产出 |
| --- | --- | --- | --- |
| C-1 | `discovery/ingest.ts` | NEW | `ingestDiscoveryRecords(records, store, config)` — 验签 → 过期过滤 → 转换为 `ResourceIndexEntry` + `P2pPeerRecord` → upsert store |
| C-2 | `discovery/backend-static.ts` | NEW | `StaticDiscoveryBackend` — `DiscoveryBackend` 的空实现（publish/discover 为 no-op，stop 为 no-op），作为 `discovery.backend="static"` 的默认行为 |
| C-3 | `discovery/ingest.test.ts` | NEW | 验签通过的记录被 upsert、验签失败的记录被丢弃、过期记录被过滤、P2pPeerRecord 正确创建（transport="dht"）、空输入不报错 |
| C-4 | `discovery/backend-static.test.ts` | NEW | StaticDiscoveryBackend 的 publish/discover/stop 均为 no-op 且不抛错 |

**Ingest 管线逻辑（精确步骤）**：

```
ingestDiscoveryRecords(records: DiscoveryRecord[], store: Web3StateStore):
  for record in records:
    1. 验签：verifyIndexSignature(toIndexEntry(record))
       - 失败 → skip（log warn）
    2. 过期检查：record.expiresAt && new Date(record.expiresAt) < now
       - 过期 → skip
    3. 转换 ResourceIndexEntry:
       { providerId, peerId, resources(完整摘要), reachability, updatedAt, expiresAt, signature }
       - 注意：endpoint 不设值（发现记录不含 endpoint）
    4. store.upsertResourceIndex(entry)
    5. 转换 P2pPeerRecord:
       { peerId: record.peerId, transport: "dht", lastSeenAt: now, source: record.providerId }
    6. store.upsertP2pPeer(peer)
```

**验收标准**：

- [ ] 有效签名的 `DiscoveryRecord` 被成功 upsert 到 store
- [ ] 无效签名的记录被跳过（不抛错，仅日志）
- [ ] 过期记录被跳过
- [ ] 转换后的 `ResourceIndexEntry.endpoint` 为 `undefined`（不泄露）
- [ ] 转换后的 `P2pPeerRecord.transport` 为 `"dht"`
- [ ] `StaticDiscoveryBackend.publish()` 返回 `Promise<void>` 不报错
- [ ] `StaticDiscoveryBackend.discover()` 返回空数组
- [ ] 所有单测通过

**回归点**：全部新建文件，零外部改动，回滚 = 删除文件。

---

### Slice D：libp2p 后端与工厂（依赖 Slice C）

**目标**：实现基于 libp2p 的 DHT + Rendezvous 发现后端，以及后端工厂。

| 序号 | 文件 | 操作 | 具体产出 |
| --- | --- | --- | --- |
| D-1 | `discovery/backend-libp2p.ts` | NEW | `Libp2pDiscoveryBackend` — 创建 libp2p 节点（DHT + Noise + Yamux + CircuitRelayV2），实现 publish（DHT putProvider + Rendezvous register）、discover（DHT findProviders + Rendezvous discover）、stop（graceful shutdown）。包含 lazy init、错误容忍 |
| D-2 | `discovery/factory.ts` | NEW | `createDiscoveryBackend(config, store)` — 根据 `config.discovery.backend` 值创建后端实例 |
| D-3 | `package.json` | MODIFY | 新增依赖：`@libp2p/interface`、`libp2p`、`@libp2p/kad-dht`、`@libp2p/circuit-relay-v2`、`@chainsafe/libp2p-noise`、`@chainsafe/libp2p-yamux` |

**libp2p 节点配置（精确参数）**：

```typescript
createLibp2p({
  privateKey: deriveFromEd25519(store.getIndexSigningKey()),
  transports: [tcp(), circuitRelayTransport()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    kadDHT: kadDHT({ protocol: "/openclaw/kad/1.0.0" }),
    circuitRelay: circuitRelayServer(),
  },
  connectionGater: {
    // 限制入站连接到 bootstrap peers（安全边界）
  },
})
```

**生命周期**：

| 阶段 | 行为 |
| --- | --- |
| 创建 | lazy init — 首次 `publish()` 或 `discover()` 时才创建 libp2p 节点 |
| publish | DHT `provide(buildDhtKey(...))` + Rendezvous `register(buildRendezvousNs(...))` |
| discover | DHT `findProviders(buildDhtKey(...))` + Rendezvous `discover(buildRendezvousNs(...))` → 解码为 `DiscoveryRecord[]` |
| stop | `libp2p.stop()` + 清理定时器 |
| 错误 | 所有 P2P 操作 catch + log warn，不向上抛出（发现层失败不阻断索引功能） |

**验收标准**：

- [ ] `createDiscoveryBackend({ backend: "static" })` 返回 `StaticDiscoveryBackend` 实例
- [ ] `createDiscoveryBackend({ backend: "libp2p" })` 返回 `Libp2pDiscoveryBackend` 实例
- [ ] `Libp2pDiscoveryBackend` 首次调用前不创建 libp2p 节点（lazy init）
- [ ] `stop()` 后所有资源释放，无内存泄漏
- [ ] P2P 操作失败时不抛错，仅日志
- [ ] `package.json` 新增依赖可 `pnpm install` 成功
- [ ] 依赖版本固定（不用 `^` / `~`——除非非 patched 依赖）

**回归点**：新增文件 + `package.json` 依赖追加，回滚 = 删除文件 + revert `package.json` 变更。

---

### Slice E：插件集成（依赖 Slice D）

**目标**：在 web3-core 插件中接入 DiscoveryBackend 的生命周期管理。

| 序号 | 文件 | 操作 | 具体产出 |
| --- | --- | --- | --- |
| E-1 | `config.ts` | MODIFY | 新增 `DiscoveryConfig` 类型定义 + `Web3PluginConfig.discovery` 字段（默认 `{ enabled: false, backend: "static", bootstrapPeers: [], rendezvousIntervalMs: 30_000, dhtKeyPrefix: "/openclaw/resource" }`） |
| E-2 | `index.ts` | MODIFY | 在 `register()` 中根据 `config.discovery.enabled` 创建 `DiscoveryBackend` → 在 background service start 时启动定期 discover → 在 `web3.index.report` 成功后触发 publish → 在 plugin stop 时调用 backend.stop() |
| E-3 | `resources/leases.ts` | MODIFY | `ConsumerLeaseAccess` 增加可选字段 `connectionRef?: string`（peerId 引用，为 Slice B 阶段的连接闭环预留） |

**config.ts 变更预览**：

```typescript
// 新增 DiscoveryConfig 类型
export type DiscoveryConfig = {
  enabled: boolean;
  backend: "libp2p" | "static";
  bootstrapPeers: string[];
  rendezvousIntervalMs: number;
  dhtKeyPrefix: string;
};

// Web3PluginConfig 新增字段
export type Web3PluginConfig = {
  // ... 现有字段不变
  discovery: DiscoveryConfig;
};
```

**index.ts 集成逻辑（伪代码）**：

```typescript
// register() 内
if (config.discovery.enabled) {
  const backend = createDiscoveryBackend(config.discovery, store);

  // Background discover loop
  const discoverInterval = setInterval(async () => {
    const records = await backend.discover({});
    await ingestDiscoveryRecords(records, store);
  }, config.discovery.rendezvousIntervalMs);

  // Hook into web3.index.report success → publish
  // (在 indexer report handler 成功后触发)

  // Plugin stop hook
  registerStopHook(async () => {
    clearInterval(discoverInterval);
    await backend.stop();
  });
}
```

**验收标准**：

- [ ] `config.discovery.enabled = false`（默认）时，无任何 discovery 相关行为（零副作用）
- [ ] `config.discovery.enabled = true, backend = "static"` 时，StaticDiscoveryBackend 被创建但不产生网络活动
- [ ] `config.discovery.enabled = true, backend = "libp2p"` 时，Libp2pDiscoveryBackend 被创建并定期 discover
- [ ] `web3.index.report` 成功后触发 `backend.publish()`
- [ ] 插件停止时 `backend.stop()` 被调用
- [ ] `ConsumerLeaseAccess.connectionRef` 字段可选，不影响现有租约逻辑
- [ ] 现有 `web3.index.*` API 返回结构不变
- [ ] `pnpm build` 通过（无类型错误）

**回归点**：`config.ts` / `index.ts` / `leases.ts` 的改动均为追加（新增字段/新增 `if` 分支），回滚 = revert 这三个文件的 diff。

---

### Slice F：架构文档（依赖 Slice E）

**目标**：更新 ARCHITECTURE.md 补充 Discovery 模块说明。

| 序号 | 文件 | 操作 | 具体产出 |
| --- | --- | --- | --- |
| F-1 | `ARCHITECTURE.md` | MODIFY | 新增 "Discovery Layer (MDL)" 章节：模块职责表、数据流图、配置说明、安全约束 |

**验收标准**：

- [ ] ARCHITECTURE.md 包含 Discovery 模块的架构说明
- [ ] 文档与实现一致（模块名、文件名、接口名）
- [ ] 安全红线在文档中明确标注

**回归点**：revert ARCHITECTURE.md diff。

---

## 3. 依赖关系与执行顺序

```
Slice A (types + namespace)
    ↓
Slice B (signature v2 + store)
    ↓
Slice C (ingest + static backend)
    ↓
Slice D (libp2p backend + factory + deps)
    ↓
Slice E (plugin integration)
    ↓
Slice F (architecture docs)
```

每个 Slice 完成后必须满足该 Slice 的全部验收标准才可进入下一个。

---

## 4. 文件变更矩阵（按文件维度汇总）

| 文件路径 | 操作 | Slice | 变更内容 | 预计改动行数 |
| --- | --- | --- | --- | --- |
| `discovery/types.ts` | NEW | A | 接口与类型定义 | ~60 |
| `discovery/namespace.ts` | NEW | A | DHT key / Rendezvous NS 构造 | ~50 |
| `discovery/signature-v2.ts` | NEW | B | v2 payload + 签名 | ~80 |
| `discovery/ingest.ts` | NEW | C | 发现记录 ingest 管线 | ~100 |
| `discovery/backend-static.ts` | NEW | C | 静态空实现后端 | ~25 |
| `discovery/backend-libp2p.ts` | NEW | D | libp2p 发现后端 | ~250 |
| `discovery/factory.ts` | NEW | D | 后端工厂 | ~30 |
| `discovery/types.test.ts` | NEW | A | 类型守卫测试 | ~30 |
| `discovery/namespace.test.ts` | NEW | A | NS 构造/解析测试 | ~60 |
| `discovery/signature-v2.test.ts` | NEW | B | v2 签名往返测试 | ~80 |
| `discovery/ingest.test.ts` | NEW | C | ingest 管线测试 | ~100 |
| `discovery/backend-static.test.ts` | NEW | C | 静态后端测试 | ~30 |
| `resources/signature-verification.ts` | MODIFY | B | +v2 分支（~15 行追加） | ~15 |
| `state/store.ts` | MODIFY | B | +可选字段（~5 行追加） | ~5 |
| `config.ts` | MODIFY | E | +DiscoveryConfig 类型 + 默认值 | ~25 |
| `index.ts` | MODIFY | E | +discovery 生命周期注入 | ~40 |
| `resources/leases.ts` | MODIFY | E | +connectionRef 可选字段 | ~3 |
| `package.json` | MODIFY | D | +libp2p 依赖 | ~8 |
| `ARCHITECTURE.md` | MODIFY | F | +Discovery 模块章节 | ~60 |

**总计**：~13 个新建文件（~895 行），6 个修改文件（~96 行追加）

---

## 5. 安全门禁（Gate 清单）

| Gate ID | 条件 | 验证方法 | 关联安全红线 |
| --- | --- | --- | --- |
| **Gate-MDL-SEC-01** | DiscoveryRecord 对外输出不含 endpoint/multiaddr/token | 单测断言 + `redactIndexEntry()` 回归 | SEC-MDL-01, SEC-MDL-02 |
| **Gate-MDL-SEC-02** | v1 签名验签结果不变 | v1 签名回归测试 | SEC-MDL-04 |
| **Gate-MDL-SEC-03** | `market.lease.issue` 零改动 | `git diff extensions/market-core/` 为空 | SEC-MDL-05 |
| **Gate-MDL-SEC-04** | `config.discovery.enabled = false` 时零副作用 | 禁用状态下 `pnpm test` 全量通过 + 无网络活动 | SEC-MDL-06 |
| **Gate-MDL-COMPAT-01** | `web3.index.list` 返回结构向后兼容 | 现有 indexer 测试全量通过 | — |
| **Gate-MDL-COMPAT-02** | 现有 `P2pPeerRecord` 的 `redactPeer()` 仍移除 address | 现有 peers.list 测试通过 | SEC-MDL-02 |

---

## 6. 测试矩阵

| 测试文件 | Slice | 覆盖内容 | 预计用例数 |
| --- | --- | --- | --- |
| `discovery/types.test.ts` | A | 类型守卫、DiscoveryRecord 结构校验 | 5-8 |
| `discovery/namespace.test.ts` | A | DHT key 构造/解析、Rendezvous NS、边界输入 | 8-12 |
| `discovery/signature-v2.test.ts` | B | v2 payload 构建、签名+验签往返、v1 回归 | 8-12 |
| `discovery/ingest.test.ts` | C | 验签通过/失败、过期过滤、store upsert、P2pPeerRecord 创建 | 10-15 |
| `discovery/backend-static.test.ts` | C | StaticDiscoveryBackend publish/discover/stop 为 no-op | 3-5 |
| `resources/signature-verification.test.ts` | B | v1 回归（**必须新增**确认 v1 路径无变化的测试） | 2-4 |

---

## 7. 配置示例

```jsonc
// ~/.openclaw/web3.json (或 openclaw.plugin.json 内)
{
  "discovery": {
    "enabled": true,
    "backend": "libp2p",
    "bootstrapPeers": [
      "/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ"
    ],
    "rendezvousIntervalMs": 30000,
    "dhtKeyPrefix": "/openclaw/resource"
  }
}
```

**默认配置（discovery 未配置时）**：

```jsonc
{
  "discovery": {
    "enabled": false,
    "backend": "static",
    "bootstrapPeers": [],
    "rendezvousIntervalMs": 30000,
    "dhtKeyPrefix": "/openclaw/resource"
  }
}
```

---

## 8. 与现有体系的衔接点

### 8.1 与 `web3.index.*` 的关系

| 现有 Handler | MDL 影响 | 说明 |
| --- | --- | --- |
| `web3.index.report` | 触发 publish | report 成功后，若 discovery 启用则调用 `backend.publish()` |
| `web3.index.list` | 自动包含 MDL 数据 | ingest 写入 store 后，list 自动可见（经 redact） |
| `web3.index.gossip` | 不变 | gossip 仍是独立的同步通道，MDL 不影响 |
| `web3.index.heartbeat` | 不变 | heartbeat 仍是本地 TTL 刷新 |
| `web3.index.stats` | 不变 | stats 读取 store，MDL 数据自动被统计 |
| `web3.index.peers.list` | 自动包含 MDL peers | ingest 写入 P2pPeerRecord(transport="dht") |

### 8.2 与 `market.lease.issue` 的关系

- **零改动**：`market.lease.issue` 的入参/出参/逻辑完全不变
- **预留**：`ConsumerLeaseAccess.connectionRef` 为可选字段，供未来连接闭环使用
- **当前行为**：消费者通过 `web3.resources.lease` 签发租约时，`providerEndpoint` 仍从入参或配置获取；`connectionRef` 仅在消费者主动传入 `providerPeerId` 时填充

### 8.3 与签名体系的关系

- **密钥复用**：MDL 使用 `index-signing.json` 中的 Ed25519 密钥
- **peerId 派生**：libp2p peerId 从同一 Ed25519 私钥派生
- **签名兼容**：v1 和 v2 签名共存，验签入口自动分发

---

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
| --- | --- | --- | --- |
| libp2p 依赖版本冲突 | 中 | 构建失败 | 使用固定版本，`pnpm install` 后立即验证 |
| DHT 查找延迟高 | 中 | 发现慢 | 内存缓存 + Rendezvous 轮询作为补充 |
| libp2p 节点内存占用 | 低 | 资源消耗 | lazy init + 配置化连接数上限 |
| v2 签名破坏 v1 兼容 | 低（设计已规避） | 索引功能异常 | v1 路径零修改 + 回归测试 |
| 发现网络暴露敏感信息 | 极低（设计已规避） | 安全事故 | DiscoveryRecord 不含 endpoint/token + redact 兜底 |

---

## 10. 未来演进（本次不实现，仅记录方向）

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| **Slice B（连接闭环）** | 通过 libp2p relay 或 direct-dial 建立 Provider-Consumer 连接通道 | MDL Slice A 完成 |
| **Slice C（身份绑定）** | peerId 与 DID / ENS 身份绑定，实现去中心化信誉锚定 | MDL Slice B + DID 集成 |
| **Rendezvous Server** | 部署独立 Rendezvous 服务，提升发现效率 | MDL 生产运行经验 |
| **GossipSub 实时广播** | 补充 GossipSub 实时资源变更通知 | MDL 网络稳定后 |

---

## 11. 相关文档索引

| 文档 | 路径 | 用途 |
| --- | --- | --- |
| 本文档 | `skills/web3-market/references/web3-mdl-libp2p-discovery-plan.md` | MDL 实施计划（可量化追溯） |
| 资源共享 API 契约 | `docs/reference/web3-resource-market-api.md` | 安全红线与 API 契约 |
| 输出脱敏规范 | `docs/reference/web3-market-output-redaction.md` | 脱敏规则 |
| web3-core 架构 | `extensions/web3-core/ARCHITECTURE.md` | 模块架构（本次更新） |
| market-core 架构 | `extensions/market-core/ARCHITECTURE.md` | 权威状态机（本次不改） |
| 方案总纲 | `skills/web3-market/references/web3-market-plan-overview.md` | Phase 4 去中心化索引 |
| 总进度 | `skills/web3-market/internal/WEB3_OVERALL_PROGRESS.md` | 整体进度口径 |
| PayFi 计划 | `skills/web3-market/internal/WEB3_DEV_PLAN_PAYFI.md` | PayFi 主计划 |
| 评审报告 | `skills/web3-market/references/web3-market-assessment-2026-03-03.md` | 上线评审（含 P0 修复状态） |
