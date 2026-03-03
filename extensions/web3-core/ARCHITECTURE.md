# Web3 Core Plugin 架构文档

## 📋 概述

OpenClaw Web3 Core 插件是 OpenClaw Web3 “自由市场”叙事的基础设施与入口层，包括：

- 🔐 **钱包身份认证** (SIWE EIP-4361)
- 📝 **审计追踪** (本地日志 + 链上锚定)
- 💾 **去中心化归档** (IPFS/Arweave/Filecoin)
- 💰 **使用计费** (配额追踪 + 支付保护)
- 🔒 **隐私保护** (归档加密 + 敏感字段脱敏；链上默认仅锚定哈希)

---

## 🏗️ 模块架构

```
extensions/web3-core/
├── src/
│   ├── index.ts              # 插件入口与注册
│   ├── config.ts             # 配置类型与默认值
│   │
│   ├── identity/             # 身份认证模块
│   │   ├── types.ts          # SIWE 类型定义
│   │   ├── commands.ts       # /bind_wallet, /whoami_web3
│   │   └── gateway.ts        # web3.siwe.challenge/verify
│   │
│   ├── audit/                # 审计追踪模块
│   │   ├── types.ts          # 审计事件类型
│   │   ├── hooks.ts          # llm_input/output, tool_call hooks
│   │   └── canonicalize.ts   # 规范化与哈希
│   │
│   ├── billing/              # 计费保护模块
│   │   ├── types.ts          # 配额记录类型
│   │   ├── commands.ts       # /credits, /pay_status
│   │   └── guard.ts          # before_tool_call 配额检查
│   │
│   ├── resources/            # 资源发布/租用/Provider 路由
│   ├── market/               # market.* 代理与工具
│   ├── discovery/            # MDL 去中心化发现层 (libp2p DHT/Rendezvous)
│   ├── monitor/              # 监控与告警
│   ├── metrics/              # 指标快照
│   │
│   ├── storage/              # 去中心化存储
│   │   ├── ipfs/             # IPFS 实现 (Pinata)
│   │   ├── arweave/          # Arweave 实现
│   │   └── filecoin/         # Filecoin 实现
│   │
│   ├── chain/                # 链上锚定
│   │   ├── evm/              # EVM 链实现 (Base/Optimism/Arbitrum)
│   │   └── types.ts          # 链配置与交易类型
│   │
│   └── state/                # 本地状态管理
│       └── store.ts          # JSON/JSONL 持久化
│
├── openclaw.plugin.json      # 插件元数据与配置 schema
├── package.json              # 依赖清单
└── demo.ts                   # 功能演示脚本
```

---

## 🔄 数据流

### 1️⃣ 身份认证流程 (SIWE)

```
用户请求绑定钱包
  ↓
Gateway: web3.siwe.challenge
  → 生成 nonce + EIP-4361 消息
  → 返回待签名消息
  ↓
用户钱包签名
  ↓
Gateway: web3.siwe.verify
  → 验证签名有效性
  → 恢复钱包地址
  → 存储钱包绑定 (state/bindings.json)
  ↓
/bind_wallet 命令确认绑定
```

### 2️⃣ 审计追踪流程

```
LLM 交互发生
  ↓
Hook: llm_input / llm_output / after_tool_call
  → 捕获事件 payload
  → 规范化 JSON (canonicalize)
  → 计算 SHA-256 哈希
  → 追加到 audit-log.jsonl (本地)
  ↓
Hook: session_end
  → 打包会话所有事件
  → 加密 payload (AES-256-GCM)
  → 上传到去中心化存储 (IPFS)
  → 获取 CID (内容寻址标识符)
  ↓
后台服务 (每 60 秒)
  → 批量锚定哈希到链上 (Base/Optimism)
  → 记录交易哈希 (anchor-receipts.json)
  ↓
用户可查询:
  • 本地日志: /audit_status
  • Gateway API: web3.audit.query
  • 链上查询: Etherscan/Basescan
```

### 3️⃣ 计费保护流程

```
LLM 或工具调用前
  ↓
Hook: before_tool_call
  → 查询会话配额 (state/usage.json)
  → 计算成本 (costPerLlmCall / costPerToolCall)
  → 检查剩余配额
  → 如不足，拒绝调用并提示充值
  ↓
调用完成后
  ↓
Hook: llm_output
  → 记录实际消耗 (token 数量)
  → 更新配额记录
  ↓
用户查询:
  • /credits: 显示剩余配额
  • /pay_status: 显示支付状态
  • Gateway: web3.billing.summary
```

---

## 🗄️ 状态存储结构

所有状态存储在 `STATE_DIR/web3/`（默认 `STATE_DIR=~/.openclaw`，可通过 `OPENCLAW_STATE_DIR` 覆盖）:

```
web3/
├── bindings.json           # 钱包绑定列表
├── siwe-challenges.json    # SIWE 挑战缓存 (持久化到 state 目录)
├── audit-log.jsonl         # 审计事件日志 (追加模式)
├── usage.json              # 配额记录 (sessionIdHash → UsageRecord)
├── pending-archive.json    # 待归档队列 (重试)
├── pending-tx.json         # 待锚定交易队列 (重试)
├── anchor-receipts.json    # 链上锚定回执 (anchorId → receipt)
├── archive-receipt.json    # 最近归档回执 (CID/URI)
└── archive-key.json        # 归档加密密钥 (AES-256 key)
```

---

## 🔌 集成点

### 命令 (Commands)

| 命令                       | 描述                                  | 用法                           |
| -------------------------- | ------------------------------------- | ------------------------------ |
| `/bind_wallet`             | 校验地址并引导 SIWE 绑定              | `/bind_wallet 0x123...`        |
| `/unbind_wallet`           | 解绑钱包地址                          | `/unbind_wallet 0x123...`      |
| `/whoami_web3`             | 查看已绑定钱包                        | `/whoami_web3`                 |
| `/credits`                 | 查看配额余额                          | `/credits`                     |
| `/pay_status`              | 查看支付状态                          | `/pay_status`                  |
| `/audit_status`            | 查看最近审计事件                      | `/audit_status`                |
| `/alerts`                  | 查看告警与监控概览                    | `/alerts`                      |
| `/alert_ack <alertId>`     | 确认告警                              | `/alert_ack abc123`            |
| `/alert_resolve <alertId>` | 关闭告警（可选备注）                  | `/alert_resolve abc123 已修复` |
| `/health`                  | 健康检查                              | `/health`                      |
| `/web3-market`             | Web3 Market 运维入口（只读/指引为主） | `/web3-market status`          |

### Hooks (生命周期钩子)

| Hook               | 触发时机       | 功能                    |
| ------------------ | -------------- | ----------------------- |
| `llm_input`        | LLM 请求发送前 | 记录用户输入审计日志    |
| `llm_output`       | LLM 响应返回后 | 记录 AI 输出 + 更新配额 |
| `before_tool_call` | 工具调用前     | 配额检查 (计费保护)     |
| `after_tool_call`  | 工具调用后     | 记录工具使用审计日志    |
| `session_end`      | 会话结束时     | 归档加密 + 链上锚定     |

### Gateway API (RPC 方法)

| 方法                    | 参数                       | 返回                          | 描述                                   |
| ----------------------- | -------------------------- | ----------------------------- | -------------------------------------- |
| `web3.siwe.challenge`   | `{ address, chainId }`     | `{ message, nonce }`          | 生成 SIWE 挑战                         |
| `web3.siwe.verify`      | `{ message, signature }`   | `{ ok, address }`             | 验证 SIWE 签名                         |
| `web3.audit.query`      | `{ limit? }`               | `{ events }`                  | 查询审计日志                           |
| `web3.billing.status`   | `{ sessionIdHash }`        | `{ usage }`                   | 查询计费状态                           |
| `web3.billing.summary`  | `{ sessionKey, senderId }` | `{ usage }`                   | 计费汇总                               |
| `web3.status.summary`   | -                          | `{ auditStats, anchorStats }` | Web3 整体状态                          |
| `web3.resources.*`      | 各方法参数                 | 各方法返回                    | 资源发布/租用/状态（对外编排入口）     |
| `web3.market.*`         | 各方法参数                 | 各方法返回                    | 市场代理（资源/租约/账本/桥接/争议等） |
| `web3.index.*`          | 各方法参数                 | 各方法返回                    | 资源索引上报/查询                      |
| `web3.monitor.*`        | 各方法参数                 | 各方法返回                    | 监控与告警                             |
| `web3.market.dispute.*` | 各方法参数                 | 各方法返回                    | 争议（对外单入口）                     |
| `web3.capabilities.*`   | 各方法参数                 | 各方法返回                    | 能力自描述（供 UI/Agent 构造调用）     |

### 后台服务 (Background Service)

- **ID**: `web3-anchor-service`
- **频率**: 每 60 秒
- **任务**:
  1. 重试失败的归档上传 (`flushPendingArchives`)
  2. 重试失败的链上锚定 (`flushPendingAnchors`)

- **ID**: `web3-discovery-service` (仅当 `config.discovery.enabled = true`)
- **频率**: `config.discovery.rendezvousIntervalMs`（默认 30s）
- **任务**:
  1. 周期发现远端 provider 资源并入库 (`discover` + `ingest`)
  2. 周期执行兜底重发布（避免仅依赖事件触发导致公告丢失）

> 说明：主发布触发点是 `web3.index.report` 成功回调；后台周期发布仅作为容错补偿。

---

## ⚙️ 配置示例

在 OpenClaw 配置文件中启用插件:

```json
{
  "plugins": {
    "web3-core": {
      "enabled": true,
      "chain": {
        "network": "base",
        "rpcUrl": "https://mainnet.base.org",
        "privateKey": "0x..."
      },
      "storage": {
        "provider": "ipfs",
        "gateway": "https://w3s.link",
        "pinataJwt": "..."
      },
      "privacy": {
        "onChainData": "hash_only",
        "archiveEncryption": true,
        "redactFields": ["apiKey", "token", "password"]
      },
      "identity": {
        "allowSiwe": true,
        "domain": "openclaw.ai"
      },
      "billing": {
        "enabled": true,
        "quotaPerSession": 1000,
        "costPerLlmCall": 1,
        "costPerToolCall": 0.5
      }
    }
  }
}
```

---

## 🌐 Discovery 模块 (MDL — Market Discovery Layer)

### 概述

MDL 是基于 libp2p（KAD-DHT + Rendezvous）的去中心化资源发现层，作为 `web3-core` 内的可插拔发现后端。发现结果仅包含"可验证摘要 + peerId + reachability"，连接信息（endpoint/token）仅在 lease 签发后受控下发。

**安全红线**: DiscoveryRecord **永远不含** endpoint、multiaddr、accessToken、meta、resources[].metadata。

### 模块结构

```
extensions/web3-core/src/discovery/
├── types.ts              # DiscoveryBackend 接口、DiscoveryRecord/Query 类型
├── namespace.ts          # DHT key / Rendezvous namespace 构造工具
├── signature-v2.ts       # v2 签名 payload 构建与 Ed25519 签名
├── backend-static.ts     # 静态 no-op 后端（默认 fallback）
├── backend-libp2p.ts     # libp2p DHT + Rendezvous + Relay 后端
├── ingest.ts             # 发现结果 → store 的 ingest 管道
└── factory.ts            # 后端工厂（根据配置创建后端实例）
```

### 数据流

```
Publish: web3.index.report(success) → indexer 本地签名(v1, 保持兼容) → store
           → onReportAccepted hook / 周期 publish
           → buildSignedDiscoveryRecord(按 Discovery 摘要重签 v2)
           → DiscoveryBackend.publish()
           → DHT putProvider(按资源粒度 key) + Rendezvous register

Discover: Background Service → DiscoveryBackend.discover()
           → DHT findProviders(资源粒度 key) + Rendezvous discover(按 kind)
           → 远端记录交换/聚合 → DiscoveryRecord[]
           → ingest(payloadVersion=2 强校验 + 验签 + 过滤)
           → upsert store → web3.index.list 可见

Connect:  Consumer → web3.index.list(peerId+reachability)
           → web3.resources.lease → ConsumerLeaseAccess(connectionRef)
           → relay/direct (future Slice B)
```

### 签名兼容方案

- **v1 payload**: 现有字段集 (providerId/endpoint/resources/meta/updatedAt/expiresAt/lastHeartbeatAt) — 本地索引链路保持不变
- **v2 payload**: Discovery 摘要语义 + { peerId, reachability, payloadVersion: 2 }，在发布前由 `buildSignedDiscoveryRecord` 重签
- **ingest 准入**: discovery 入库要求 `signature.payloadVersion === 2`，否则拒绝；通过后再做 Ed25519 验签
- 验签入口仍兼容 v1（用于非 discovery 的历史/本地数据）

### 配置

```json
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

默认 `enabled: false`，零影响现有行为。

---

## 🔐 隐私与安全

### 隐私保护层级

1. **本地敏感字段脱敏**
   - 自动过滤 `apiKey`, `token`, `password`, `secret`, `privateKey`
   - 可配置额外脱敏字段

2. **归档加密**
   - 默认启用 AES-256-GCM 加密
   - 密钥存储在本地 (`archive-key.json`)
   - 仅哈希值上链，内容密文存储

3. **链上数据策略**
   - `hash_only` (默认): 仅存储哈希
   - `hash_and_meta`: 哈希 + 元数据 (timestamp, seq)
   - `encrypted_content`: 哈希 + 加密完整内容

### 安全最佳实践

- ✅ 私钥通过环境变量或密钥管理系统注入，**不硬编码**
- ✅ SIWE 挑战有过期时间 (默认 5 分钟)
- ✅ 定期清理过期挑战 (`pruneSiweChallenges`)
- ✅ 归档加密密钥自动生成，不传输
- ✅ 链上交易使用 Gas 估算，避免失败

---

## 🧪 测试与验证

### 运行 Demo

```bash
cd extensions/web3-core
node --import tsx demo.ts
```

### 单元测试

```bash
pnpm test extensions/web3-core/src/**/*.test.ts
```

### 集成测试清单

- [ ] SIWE 挑战生成与验证
- [ ] 钱包绑定/解绑流程
- [ ] 审计日志记录与查询
- [ ] 配额检查与计费保护
- [ ] IPFS 归档上传 (模拟/真实)
- [ ] 链上锚定交易 (测试网)

---

## 📚 技术栈

- **身份**: `siwe` (EIP-4361), `viem` (以太坊工具集)
- **链交互**: `ethers.js` v6, `viem` v2
- **存储**: IPFS (Pinata), Arweave, Filecoin
- **哈希**: `crypto` (Node.js 内置 SHA-256)
- **加密**: `crypto` (AES-256-GCM)
- **数据**: JSON/JSONL (本地文件)

---

## 🚀 未来路线图

- [ ] 多链支持 (Polygon, Avalanche)
- [ ] ENS 名称解析
- [ ] 链上智能合约审计锚定 (批量 Merkle tree)
- [ ] 去中心化支付网关 (ERC-20 token)
- [ ] 零知识证明审计验证
- [ ] 移动端 WalletConnect 集成

---

## 📞 反馈与贡献

如有问题或建议，请提交 Issue 或 PR 至 OpenClaw 仓库。

**版本**: 2026.2.16  
**维护**: OpenClaw Team
