# Web3 Core Plugin 架构文档

## 📋 概述

OpenClaw Web3 Core 插件为 OpenClaw AI 系统提供去中心化基础设施，包括：

- 🔐 **钱包身份认证** (SIWE EIP-4361)
- 📝 **审计追踪** (本地日志 + 链上锚定)
- 💾 **去中心化存储** (IPFS/Arweave/Filecoin)
- 💰 **使用计费** (配额追踪 + 支付保护)
- 🔒 **隐私保护** (加密 + 敏感字段脱敏)

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

所有状态存储在 `~/.openclaw/web3/` (或自定义 state 目录):

```
web3/
├── bindings.json           # 钱包绑定列表
├── siwe-challenges.json    # SIWE 挑战缓存 (nonce → challenge)
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

| 命令             | 描述              | 用法                      |
| ---------------- | ----------------- | ------------------------- |
| `/bind_wallet`   | 绑定 EVM 钱包地址 | `/bind_wallet 0x123...`   |
| `/unbind_wallet` | 解绑钱包地址      | `/unbind_wallet 0x123...` |
| `/whoami_web3`   | 查看已绑定钱包    | `/whoami_web3`            |
| `/credits`       | 查看配额余额      | `/credits`                |
| `/pay_status`    | 查看支付状态      | `/pay_status`             |
| `/audit_status`  | 查看最近审计事件  | `/audit_status`           |

### Hooks (生命周期钩子)

| Hook               | 触发时机       | 功能                    |
| ------------------ | -------------- | ----------------------- |
| `llm_input`        | LLM 请求发送前 | 记录用户输入审计日志    |
| `llm_output`       | LLM 响应返回后 | 记录 AI 输出 + 更新配额 |
| `before_tool_call` | 工具调用前     | 配额检查 (计费保护)     |
| `after_tool_call`  | 工具调用后     | 记录工具使用审计日志    |
| `session_end`      | 会话结束时     | 归档加密 + 链上锚定     |

### Gateway API (RPC 方法)

| 方法                   | 参数                       | 返回                          | 描述           |
| ---------------------- | -------------------------- | ----------------------------- | -------------- |
| `web3.siwe.challenge`  | `{ address, chainId }`     | `{ message, nonce }`          | 生成 SIWE 挑战 |
| `web3.siwe.verify`     | `{ message, signature }`   | `{ ok, address }`             | 验证 SIWE 签名 |
| `web3.audit.query`     | `{ limit? }`               | `{ events }`                  | 查询审计日志   |
| `web3.billing.status`  | `{ sessionIdHash }`        | `{ usage }`                   | 查询计费状态   |
| `web3.billing.summary` | `{ sessionKey, senderId }` | `{ usage }`                   | 计费汇总       |
| `web3.status.summary`  | -                          | `{ auditStats, anchorStats }` | Web3 整体状态  |

### 后台服务 (Background Service)

- **ID**: `web3-anchor-service`
- **频率**: 每 60 秒
- **任务**:
  1. 重试失败的归档上传 (`flushPendingArchives`)
  2. 重试失败的链上锚定 (`flushPendingAnchors`)

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
        "pinataJwt": "eyJhbGci..."
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
