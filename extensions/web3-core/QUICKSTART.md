# Web3 Core Plugin 快速开始

## 🎯 5 分钟上手指南

### 1. 启用插件

```bash
# 启用插件
pnpm openclaw plugins enable web3-core

# 验证状态
pnpm openclaw plugins list | grep web3
```

### 2. 基础配置

编辑 `~/.openclaw/openclaw.json` 添加配置:

```json
{
  "plugins": {
    "web3-core": {
      "enabled": true,
      "chain": {
        "network": "base"
      },
      "storage": {
        "provider": "ipfs",
        "gateway": "https://w3s.link"
      },
      "identity": {
        "allowSiwe": true
      },
      "billing": {
        "enabled": false
      }
    }
  }
}
```

### 3. 运行演示

```bash
cd extensions/web3-core
node --import tsx demo.ts
```

---

## 🔐 身份认证示例

### SIWE 认证流程

```typescript
// 1. 生成挑战
const challenge = await gateway.request("web3.siwe.challenge", {
  address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  chainId: 8453, // Base
});

// 2. 用户钱包签名
const signature = await wallet.signMessage(challenge.message);

// 3. 验证签名
const result = await gateway.request("web3.siwe.verify", {
  message: challenge.message,
  signature: signature,
});

if (result.ok) {
  console.log("✅ 认证成功:", result.address);
}
```

### 命令行使用

```bash
# 绑定钱包
/bind_wallet 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

# 查看身份
/whoami_web3

# 解绑钱包
/unbind_wallet 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

---

## 📝 审计追踪示例

### 查询审计日志

```typescript
// Gateway API
const result = await gateway.request("web3.audit.query", {
  limit: 50,
});

console.log(`找到 ${result.events.length} 条审计记录`);
result.events.forEach((event) => {
  console.log(`[${event.timestamp}] ${event.kind} - ${event.payloadHash}`);
});
```

### 命令行使用

```bash
# 查看最近审计事件
/audit_status
```

### 本地日志查看

```bash
# 查看完整审计日志
cat ~/.openclaw/web3/audit-log.jsonl | jq .

# 查看最后 10 条
tail -10 ~/.openclaw/web3/audit-log.jsonl | jq .
```

---

## 💰 计费与配额示例

### 配置计费

```json
{
  "plugins": {
    "web3-core": {
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

### 查询配额

```typescript
// Gateway API
const result = await gateway.request("web3.billing.summary", {
  sessionKey: "demo-session",
  senderId: "user-123",
});

console.log("配额状态:", {
  used: result.usage.totalCost,
  quota: result.usage.quota,
  remaining: result.usage.quota - result.usage.totalCost,
});
```

### 命令行使用

```bash
# 查看配额
/credits

# 查看支付状态
/pay_status
```

---

## 🗄️ 存储配置示例

### IPFS (Pinata)

```json
{
  "storage": {
    "provider": "ipfs",
    "gateway": "https://w3s.link",
    "pinataJwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Arweave

```json
{
  "storage": {
    "provider": "arweave",
    "gateway": "https://arweave.net",
    "arweaveKeyfile": "/path/to/arweave-key.json"
  }
}
```

### Filecoin

```json
{
  "storage": {
    "provider": "filecoin",
    "gateway": "https://w3s.link",
    "filecoinToken": "REPLACE_WITH_TOKEN",
    "filecoinEndpoint": "https://api.web3.storage/upload"
  }
}
```

---

## ⛓️ 链上锚定配置

### Base (推荐 - 最低 Gas)

```json
{
  "chain": {
    "network": "base",
    "rpcUrl": "https://mainnet.base.org",
    "privateKey": "0x..."
  }
}
```

### Optimism

```json
{
  "chain": {
    "network": "optimism",
    "rpcUrl": "https://mainnet.optimism.io",
    "privateKey": "0x..."
  }
}
```

### 测试网 (Sepolia)

```json
{
  "chain": {
    "network": "sepolia",
    "rpcUrl": "https://rpc.sepolia.org",
    "privateKey": "0x..."
  }
}
```

---

## 🔒 隐私设置

### 仅哈希上链 (默认 - 最隐私)

```json
{
  "privacy": {
    "onChainData": "hash_only",
    "archiveEncryption": true,
    "redactFields": ["apiKey", "token", "password", "secret"]
  }
}
```

### 哈希 + 元数据

```json
{
  "privacy": {
    "onChainData": "hash_and_meta",
    "archiveEncryption": true
  }
}
```

### 完整加密内容

```json
{
  "privacy": {
    "onChainData": "encrypted_content",
    "archiveEncryption": true
  }
}
```

---

## 🧪 开发测试

### 运行单元测试

```bash
# 测试配置解析
pnpm test extensions/web3-core/src/config.test.ts

# 测试审计规范化
pnpm test extensions/web3-core/src/audit/canonicalize.test.ts
```

### 本地开发调试

```bash
# 启动 gateway 并启用插件
pnpm openclaw gateway run --force

# 在另一个终端发送测试消息
pnpm openclaw message send "测试 Web3 插件"
```

### 查看插件日志

```bash
# macOS 系统日志
./scripts/clawlog.sh --follow --category plugins

# 直接查看 gateway 日志
tail -f /tmp/openclaw-gateway.log | grep web3
```

---

## 🐛 常见问题

### Q: 插件未加载？

```bash
# 检查插件状态
pnpm openclaw plugins list

# 重启 gateway
pnpm openclaw gateway restart
```

### Q: IPFS 上传失败？

检查 Pinata JWT 是否有效:

```bash
curl -X GET "https://api.pinata.cloud/data/testAuthentication" \
  -H "Authorization: Bearer YOUR_JWT"
```

### Q: 链上交易失败？

1. 检查 RPC URL 连接性
2. 确认私钥有 Gas 费
3. 查看错误日志: `~/.openclaw/web3/pending-tx.json`

### Q: 配额不生效？

确认计费已启用:

```json
{
  "billing": {
    "enabled": true // 必须为 true
  }
}
```

---

## 📚 更多资源

- 📖 [完整架构文档](./ARCHITECTURE.md)
- 🔧 [插件配置 Schema](./openclaw.plugin.json)
- 🧪 [功能演示脚本](./demo.ts)
- 🌐 [OpenClaw 官方文档](https://docs.openclaw.ai)

---

## 🚀 生产部署检查清单

- [ ] 私钥通过环境变量注入 (不硬编码)
- [ ] 配置正确的 RPC URL (避免公共节点限流)
- [ ] IPFS JWT/Arweave 密钥已设置
- [ ] 归档加密已启用 (`archiveEncryption: true`)
- [ ] 链上数据策略设为 `hash_only`
- [ ] 敏感字段脱敏列表已更新
- [ ] 计费配额根据业务调整
- [ ] 后台服务正常运行 (检查日志)
- [ ] 测试网验证通过后再切换主网

---

**祝你使用愉快！** 🎉

如有问题，请查看 [Issue Tracker](https://github.com/openclaw/openclaw/issues) 或加入社区讨论。
