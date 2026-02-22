# OpenClaw Web3 Core Plugin

> 🌐 OpenClaw Web3：AI 服务的自由市场（身份 / 审计 / 归档 / 计费 / 市场入口）

[![Version](https://img.shields.io/badge/version-2026.2.16-blue.svg)](./package.json)
[![Status](https://img.shields.io/badge/status-active-success.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)](../../LICENSE)

## 产品一句话

让用户在 AI 时代拥有**选择权、成本透明与可迁移性**：同一套 `web3.*` 入口可以发现/租用/提供能力，行为可审计、可归档、可结算。

## ✨ 特性

- 🔐 **钱包身份认证** - 基于 SIWE (EIP-4361) 的以太坊钱包登录
- 📝 **审计追踪** - 完整的 LLM 交互日志记录与链上锚定
- 💾 **去中心化归档** - 会话数据可归档到 IPFS/Arweave/Filecoin
- 💰 **使用计费** - 配额管理与支付保护机制
- 🔒 **隐私保护** - 归档加密（AES-256-GCM）+ 敏感字段脱敏（默认仅哈希上链）

## 🚀 快速开始

```bash
# 1. 启用插件
pnpm openclaw plugins enable web3-core

# 2. 运行演示
cd extensions/web3-core
node --import tsx demo.ts

# 3. 查看文档
cat ARCHITECTURE.md
```

## 📦 包含功能

### 命令

- `/bind_wallet` - 校验地址并引导 SIWE 绑定
- `/unbind_wallet` - 解绑钱包
- `/whoami_web3` - 查看身份
- `/credits` - 查看配额
- `/pay_status` - 支付状态
- `/audit_status` - 审计事件

### Gateway API

- `web3.siwe.challenge` - SIWE 挑战生成
- `web3.siwe.verify` - SIWE 签名验证
- `web3.audit.query` - 审计日志查询
- `web3.billing.status` - 计费状态
- `web3.billing.summary` - 计费汇总
- `web3.status.summary` - Web3 整体状态
- `web3.resources.*` - 资源发布/租用/状态
- `web3.market.*` - 市场代理（资源/租约/账本/争议/监控）
- `web3.index.*` - 资源索引上报/查询
- `web3.monitor.*` - 监控与告警

### Hooks

- `llm_input` - LLM 输入审计
- `llm_output` - LLM 输出审计 + 计费
- `before_tool_call` - 工具调用前配额检查
- `after_tool_call` - 工具调用后审计
- `session_end` - 会话结束归档与锚定

## 🏗️ 架构

```
web3-core/
├── identity/    # SIWE 认证
├── audit/       # 审计追踪
├── billing/     # 计费保护
├── storage/     # 去中心化存储 (IPFS/Arweave/Filecoin)
├── chain/       # 链上锚定 (Base/Optimism/Arbitrum)
└── state/       # 本地状态管理
```

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)

## ⚙️ 配置示例

```json
{
  "plugins": {
    "web3-core": {
      "enabled": true,
      "chain": {
        "network": "base",
        "rpcUrl": "https://mainnet.base.org"
      },
      "storage": {
        "provider": "ipfs",
        "pinataJwt": "..."
      },
      "privacy": {
        "onChainData": "hash_only",
        "archiveEncryption": true
      },
      "billing": {
        "enabled": true,
        "quotaPerSession": 1000
      }
    }
  }
}
```

## 🔐 安全最佳实践

✅ 私钥通过环境变量注入  
✅ 归档加密默认启用  
✅ 仅哈希上链 (默认隐私策略)  
✅ SIWE 挑战有过期时间  
✅ 敏感字段自动脱敏

## 📚 文档

- [架构文档](./ARCHITECTURE.md) - 完整技术设计
- [配置 Schema](./openclaw.plugin.json) - 配置项说明
- [演示脚本](./demo.ts) - 功能演示

## 🧪 测试

```bash
# 运行演示
node --import tsx demo.ts

# 单元测试
pnpm test extensions/web3-core/src/**/*.test.ts
```

## 🛠️ 技术栈

- **身份**: `siwe`, `viem`
- **链**: `ethers.js` v6, `viem` v2
- **存储**: IPFS (Pinata), Arweave, Filecoin
- **加密**: Node.js `crypto` (AES-256-GCM)

## 📝 更新日志

### v2026.2.16

- ✨ 初始版本发布
- 🔐 SIWE 认证实现
- 📝 审计追踪系统
- 💾 IPFS/Arweave/Filecoin 支持
- 💰 计费保护机制
- 🔒 隐私保护层

## 🤝 贡献

欢迎提交 Issue 和 PR！

## 📄 许可证

MIT © OpenClaw Team

---

**文档**: [ARCHITECTURE.md](./ARCHITECTURE.md)  
**仓库**: https://github.com/openclaw/openclaw
