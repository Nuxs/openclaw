# OpenClaw Web3 架构演进

## 🎯 核心问题

**"为什么还要加这两个扩展？"**

因为我们需要的不是"UI自动化工具"，而是"稳定可信的能力契约"：

- ✅ 身份/签名可信性
- ✅ 审计与追溯
- ✅ 计费与预算控制
- ✅ 状态机一致性
- ✅ 可观测与可恢复

这些能力用浏览器"点击UI"无法实现。

---

## 📊 架构演进对比

### ❌ 方案A：独立MCP服务（被否决）

```
┌─────────────┐
│  OpenClaw   │
└──────┬──────┘
       │ HTTP/MCP
       ▼
┌─────────────┐     ┌──────────────┐
│ Web3 Market │────▶│ External DB  │
│   Service   │     │ & Blockchain │
└─────────────┘     └──────────────┘

问题：
❌ 部署复杂（需独立服务器）
❌ 鉴权繁琐（HTTP认证+Token）
❌ 运维负担（版本升级、监控）
❌ 用户门槛高（需配置服务地址）
```

### ❌ 方案B：浏览器UI自动化（不可行）

```
┌─────────────┐
│  OpenClaw   │
│  + Browser  │
└──────┬──────┘
       │ Click/Fill/Screenshot
       ▼
┌─────────────┐
│  DApp 前端  │
└─────────────┘

问题：
❌ 脆弱契约（DOM改变就失效）
❌ 无法可证明（点击不等于交易确认）
❌ 安全风险（自动签名=灾难）
❌ 无法做预算闸门（点击前拦截不了）
```

### ✅ 方案C：OpenClaw扩展（最终选择）

```
┌───────────────────────────────────────────────┐
│              OpenClaw 核心                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Browser │  │ Terminal │  │   LLM    │      │
│  │  Tool   │  │   Tool   │  │  Brain   │      │
│  └─────────┘  └──────────┘  └──────────┘      │
└───────┬───────────────────────────────────────┘
        │
        │ Plugin API (In-Process)
        │
┌───────▼───────────────────────────────────────┐
│           web3-core 扩展                       │
│  ┌─────────────────────────────────────────┐  │
│  │  Identity (SIWE, Wallet Binding)        │  │
│  │  Audit Trail (Hooks, Chain Anchoring)   │  │
│  │  Billing Guard (Pre-call Budget Check)  │  │
│  │  Gateway: web3.* (Single Entry Point)   │  │
│  └─────────┬───────────────────────────────┘  │
└────────────┼──────────────────────────────────┘
             │
             │ Facade API (Type-safe)
             │
┌────────────▼──────────────────────────────────┐
│          market-core 引擎                      │
│  ┌─────────────────────────────────────────┐  │
│  │  Resource Registry                      │  │
│  │  Lease Manager (State Machine)          │  │
│  │  Settlement Engine (Lock/Release)       │  │
│  │  Dispute Resolution (Open/Evidence)     │  │
│  │  Ledger (Authoritative Accounting)      │  │
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘

优势：
✅ 一键启用（无需独立部署）
✅ 统一安全（单一认证边界）
✅ 零配置（开箱即用）
✅ 类型安全（TypeScript接口）
✅ 稳定契约（facade版本化）
```

---

## 🔑 关键设计决策

### 决策1：作为扩展 vs 独立服务

**选择**：OpenClaw扩展  
**原因**：

- 用户体验优先（零配置 > 轻量化）
- 安全边界统一（单进程 > 跨进程）
- 开发效率高（类型安全 > HTTP调用）

### 决策2：Browser工具 vs 稳定API

**选择**：两者分层使用  
**原因**：

- Browser层：UI引导、信息抓取（辅助能力）
- Web3层：签名、审计、状态机（核心能力）
- 各司其职，不能互相替代

### 决策3：Gateway命名空间

**Before**: `market.*` + `web3.market.*` （重复）  
**After**: 只有 `web3.*` （统一）  
**原因**：

- 对外收敛为单一入口
- 降低用户理解成本
- 便于集中安全管控

---

## 📈 架构层次

```
┌─────────────────────────────────────────────────┐
│  Layer 1: 用户层                                 │
│  - Commands: /pay_status, /credits, etc.        │
│  - AI Agent: 通过自然语言调用                    │
├─────────────────────────────────────────────────┤
│  Layer 2: 接口层 (web3-core)                     │
│  - Gateway: web3.market.* (单一命名空间)         │
│  - Security: 认证、计费、审计、权限               │
│  - Hooks: LLM input/output, tool calls          │
├─────────────────────────────────────────────────┤
│  Layer 3: 能力层 (market-core)                   │
│  - Facade: 18个核心操作的稳定接口                 │
│  - State Machine: 状态转换与一致性                │
│  - Persistence: 双存储（本地+链上）               │
└─────────────────────────────────────────────────┘
```

### 职责边界

| 层级            | 职责                         | 不负责             |
| --------------- | ---------------------------- | ------------------ |
| **用户层**      | 发起命令、接收结果           | 不需要知道内部实现 |
| **web3-core**   | 统一入口、安全管控、审计追踪 | 不处理市场逻辑细节 |
| **market-core** | 资源管理、状态机、结算逻辑   | 不直接暴露给用户   |

---

## 🛡️ 安全模型

### 单一安全边界

```
用户请求
   │
   ▼
┌──────────────────────────────────────┐
│     web3-core Security Gates          │
│  ✅ 身份验证 (SIWE)                   │
│  ✅ 预算检查 (before_tool_call)       │
│  ✅ 审计记录 (after_tool_call)        │
│  ✅ 错误码标准化                       │
│  ✅ 能力自描述                         │
└──────────┬───────────────────────────┘
           │ 通过所有检查后
           ▼
     market-core 执行
```

### 为什么不是双边界？

- ❌ Before: market-core + web3-core 各自检查（重复、可能冲突）
- ✅ After: 只有web3-core检查（统一、可信）

---

## 💼 实际使用场景

### 场景1：AI发布数据集到市场

```
用户: "把我的训练数据集发布到Web3市场"
  │
  ▼
OpenClaw AI Agent
  │
  ├─ 调用: web3.market.resource.publish
  │         ↓ (通过安全门)
  │       market-core.publishResource()
  │         ↓ (状态机 + 存储)
  │       写入本地DB + 上传IPFS + 链上锚定
  │
  └─ 返回: { success: true, resourceId: "0xabc...", cid: "Qm..." }
```

### 场景2：计费与预算控制

```
AI尝试调用: web3.market.lease.issue
  │
  ▼
web3-core: before_tool_call Hook
  │
  ├─ 检查当前session的credits: 100 / 1000
  ├─ 检查本次操作成本: 50 credits
  ├─ 判断: 100 + 50 <= 1000 ✅ 通过
  │
  ▼
market-core: 执行租约发放逻辑
  │
  ▼
web3-core: after_tool_call Hook
  │
  └─ 记录: 扣费50 credits, 审计日志上链
```

### 场景3：浏览器+Web3协同

```
用户: "帮我在OpenSea上架我的NFT作品"
  │
  ▼
OpenClaw Browser Tool (Layer 1)
  │ 打开OpenSea网站
  │ 填写标题、描述、价格
  │ 点击"Connect Wallet"按钮
  │
  └─ 但签名确认不自动点击 ❌（安全风险）

此时切换到Web3 Tool (Layer 2)
  │
  ├─ 调用: web3.siwe.verify (钱包签名验证)
  │         ↓
  │       用户确认签名（通过硬件钱包/MetaMask）
  │
  ├─ 调用: web3.market.resource.publish
  │         ↓
  │       market-core处理上架逻辑
  │
  └─ 审计记录: "NFT上架操作完成，交易hash: 0x..."
```

---

## 📏 设计原则验证

### ✅ OpenClaw VISION.md 对齐

> "Core stays lean; optional capability should usually ship as plugins"

- ✅ market-core是可选插件（可禁用）
- ✅ 不侵入OpenClaw核心代码
- ✅ 通过标准Plugin API集成

### ✅ 复杂度管理

- ✅ **对外简单**：用户只看到 `web3.*` 命名空间
- ✅ **对内可复杂**：6900行市场逻辑被允许（正确性优先）
- ✅ **职责清晰**：web3-core（入口） + market-core（引擎）

### ✅ 安全优先

- ✅ 单一安全边界（web3-core）
- ✅ 最小权限原则（before_tool_call拦截）
- ✅ 可审计性（所有操作上链）

---

## 🚀 下一步

### Phase 2: 安全加固

- [ ] P0-SEC-01: 敏感信息脱敏
- [ ] P0-ERR-01: 稳定错误码
- [ ] P0-CAP-01: 能力自描述完善

### Phase 3: 功能补全

- [ ] 争议仲裁机制
- [ ] 索引签名验证
- [ ] E2E测试覆盖

### Phase 4: 用户体验

- [ ] 用户文档（只含web3.\*）
- [ ] Demo视频（端到端流程）
- [ ] 快速开始指南

---

## 📝 总结

**为什么需要这两个扩展？**

因为Web3市场需要的核心能力（身份、审计、计费、状态机）无法通过浏览器UI自动化实现。

**为什么不做成独立MCP服务？**

因为OpenClaw-first定位：用户体验（零配置）> 架构轻量化。

**复杂度会失控吗？**

不会。通过Facade模式和明确的职责边界，复杂度被驯服在产品边界内。

**最终方案：**

- ✅ 作为OpenClaw扩展（一键启用）
- ✅ web3-core提供统一入口（web3.\*）
- ✅ market-core作为内部引擎（隐藏细节）
- ✅ Browser工具作为辅助能力（UI交互）

**核心价值：**
稳定契约 > UI自动化  
用户体验 > 架构轻量  
安全可控 > 分布式理想
