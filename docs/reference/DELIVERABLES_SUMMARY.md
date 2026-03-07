# OpenClaw Web3 自由市场 - 设计文档汇总

## 📦 交付成果

根据你的需求，我已完成以下三项任务：

### 1. ✅ 信誉评分算法设计

**文档位置**: [/reference/reputation-scoring-algorithm](/reference/reputation-scoring-algorithm)

**核心内容**:

- **多维度评分模型**: 可靠性(35%) + 质量(30%) + 性能(20%) + 信任度(15%)
- **时间衰减机制**: 70% 权重给近期表现，30% 给历史
- **防刷分机制**: Sybil Attack 检测、Wash Trading 检测、评价可信度加权
- **冷启动保护**: 新 Provider 获得初始加分，避免不公平竞争
- **评分等级系统**: 传奇(95-100) → 卓越(85-94) → 良好(70-84) → 一般(50-69) → 较差(30-49) → 不可信(0-29)
- **实现细节**: 包含数据存储方案(链上+链下)、计算服务架构、测试用例

**亮点**:

```typescript
// 综合评分公式
overallScore =
  reliabilityScore * 0.35 + // 任务成功率、在线率、争议记录
  qualityScore * 0.3 + // 用户评分、样本量修正
  performanceScore * 0.2 + // 响应时间、吞吐量
  trustScore * 0.15; // 质押金额、账户年龄、长期稳定性

// 时间衰减
finalScore = recentScore * 0.7 + historicalScore * 0.3;
```

---

### 2. ✅ 市场仪表盘原型

**演示文稿**: [`docs/reference/OpenClaw_Market_Dashboard_Prototype.pptx`](./OpenClaw_Market_Dashboard_Prototype.pptx) (309KB)

**生成脚本**: [`docs/reference/market-dashboard-prototype.js`](./market-dashboard-prototype.js)

**包含页面** (共 9 页):

| 页码 | 页面名称            | 说明                                      |
| ---- | ------------------- | ----------------------------------------- |
| 1    | 封面页              | OpenClaw 自由市场品牌展示                 |
| 2    | Provider 市场搜索页 | Consumer 视角 - 搜索、筛选、比较 Provider |
| 3    | Provider 详情页     | 详细性能指标、用户评价、定价策略          |
| 4    | 市场行情仪表盘      | 实时价格、供需统计、趋势图                |
| 5    | Provider 管理后台   | Provider 视角 - 收入统计、订单管理        |
| 6    | 定价策略配置页      | 动态定价规则配置界面                      |
| 7    | 信誉评分详情页      | 多维度评分展示、关键指标                  |
| 8    | 订单簿界面          | 实时供需撮合、市场深度图                  |
| 9    | 总结页              | 核心特点汇总                              |

**设计亮点**:

- 🎨 采用 **Teal Trust** 配色方案(深青色主题)，体现自由市场的专业感
- 📊 包含多种可视化图表: 价格分布柱状图、趋势折线图、市场深度图
- 🎯 用户体验流畅: Provider 搜索 → 详情查看 → 一键选择
- 💡 信息层次清晰: 关键指标突出、次要信息适度展示

---

### 3. ✅ 完整技术文档

**文档位置**: [/reference/web3-free-market-technical-doc](/reference/web3-free-market-technical-doc) (43KB)

**章节目录** (共 13 章):

1. **概述** - 项目背景、核心价值主张、技术栈
2. **核心理念** - 详细阐述"真正的自由市场需要什么"
   - ✅ 价格自由: 动态定价机制
   - ✅ 信息透明: 实时市场数据、Provider 透明度
   - ✅ 自由竞争: 多维度排序、竞争激励
   - ✅ 低门槛: 3 分钟上架、1 分钟使用
   - ✅ 去中心化: 链上+链下混合存储
3. **系统架构** - 完整架构图、核心组件详解
4. **核心功能** - 动态定价、订单簿、争议仲裁
5. **信誉评分系统** - 引用独立算法文档
6. **市场仪表盘 UI** - 界面设计说明
7. **API 接口文档** - RESTful API 完整规范
8. **智能合约设计** - Solidity 代码示例
9. **安全与防作弊机制** - 防女巫攻击、防对敲交易、防价格操纵
10. **部署指南** - 环境要求、部署步骤
11. **开发路线图** - 5 个阶段的实施计划
12. **常见问题** - Q&A 汇总
13. **参考资料** - 相关文档、外部链接、术语表

**核心内容对比表**:

| 维度     | 传统中心化平台     | OpenClaw 自由市场 |
| -------- | ------------------ | ----------------- |
| **定价** | 平台统一定价       | Provider 自主定价 |
| **选择** | 无法选择服务商     | 根据价格/质量筛选 |
| **竞争** | 无竞争             | Provider 竞争客户 |
| **信息** | 不透明             | 实时市场行情      |
| **费用** | 高额中介费(20-30%) | 低手续费(2-5%)    |
| **审查** | 平台可随意下架     | 无法审查          |

---

## 🎯 核心设计思想

### 从"计划经济"到"自由市场"

**之前的问题**:

```json
{
  "model": "llama-3.3-70b",
  "pricing": { "inputPerToken": 0.00001 } // ❌ 固定定价
}
```

这不是自由市场，这是**计划经济**！

**改进后**:

```json
{
  "pricingStrategy": {
    "type": "dynamic",
    "basePrice": 0.008,
    "surgeMultiplier": {
      "highDemand": 1.5, // 高峰+50%
      "lowLatency": 1.3 // 低延迟+30%
    },
    "discounts": {
      "bulkOrder": 0.9, // 大单-10%
      "loyalCustomer": 0.95 // 老客户-5%
    }
  }
}
```

**结果**:

- Provider A: $0.008/1K (高性价比)
- Provider B: $0.012/1K (快速+SLA)
- Provider C: $0.005/1K (便宜但不稳定)

Consumer 根据需求选择，**市场自动平衡供需**。

---

## 🚀 快速上手

### Provider 上架 (3 分钟)

```bash
# 1. 安装 CLI
$ npm install -g openclaw-provider

# 2. 注册
$ openclaw-provider register
✓ 钱包地址: 0xABC...
✓ Provider ID: prov_xyz123

# 3. 配置资源
$ openclaw-provider add-resource
? 选择模型: Llama-3.3-70B
? 定价策略: 动态定价(基础 $0.008/1K)

✓ 已注册到市场,开始接单!
```

### Consumer 使用 (1 分钟)

```bash
# 搜索服务
$ openclaw market search llama-3-70b --max-price 0.01

找到 23 个 Provider:
🥇 prov_fast   $0.009  |  0.8s  |  99.5%  |  95 💎

# 直接调用
$ openclaw chat "Explain quantum computing" --budget 0.50

✓ 本次费用: $0.12
✓ 满意吗? [Y/n] Y
```

---

## 📊 关键指标

### 信誉评分构成

```
综合评分 (0-100)
├── 可靠性 (35%)
│   ├── 任务成功率
│   ├── 在线率
│   └── 争议记录
├── 质量 (30%)
│   ├── 用户评分 (加权平均)
│   └── 样本量修正
├── 性能 (20%)
│   ├── 响应时间
│   └── 吞吐量
└── 信任度 (15%)
    ├── 质押金额
    ├── 账户年龄
    └── 长期稳定性
```

### 评分等级与特权

| 等级    | 分数   | 手续费 | 优先级 | 特权               |
| ------- | ------ | ------ | ------ | ------------------ |
| 🏆 传奇 | 95-100 | 2.5%   | 最高   | 认证徽章、优先推荐 |
| 💎 卓越 | 85-94  | 3.5%   | 高     | 认证徽章           |
| ⭐ 良好 | 70-84  | 5.0%   | 中     | -                  |
| 👍 一般 | 50-69  | 5.0%   | 低     | -                  |

---

## 🔒 安全机制

### 1. 防 Sybil Attack (女巫攻击)

```typescript
// 只有链上可验证的交易才计入评分
if (!rating.verified || !rating.txHash) {
  return 0; // 权重为 0
}

// 检测同一 IP 的异常评价
if (ratingsFromSameIP > 3) {
  flagAsSuspicious();
}

// 新账户评价权重降低
const weight = Math.min(accountAge / 30, 1.0);
```

### 2. 防 Wash Trading (对敲交易)

```typescript
// 检测循环交易
const hasCircularTrade = detectCircularPattern(provider, consumers);

// 单一客户占比限制
const topConsumerRatio = topConsumer.count / totalJobs;
if (topConsumerRatio > 0.5) {
  flagAsSuspicious();
}
```

### 3. 防价格操纵

```typescript
// 异常价格检测
if (price > marketAverage * 2 || price < marketAverage * 0.5) {
  flagAsAnomalous();
}
```

---

## 📁 文件清单

```
openclaw/docs/reference/
├── reputation-scoring-algorithm.md          (21KB) - 信誉评分算法
├── market-dashboard-prototype.js            (28KB) - 仪表盘生成脚本
├── OpenClaw_Market_Dashboard_Prototype.pptx (309KB) - 市场仪表盘演示
└── web3-free-market-technical-doc.md        (43KB) - 完整技术文档
```

---

## 🎨 视觉预览

### 市场搜索页

```
┌─────────────────────────────────────────────────────────┐
│  🔍 搜索: llama-3-70b  |  最高价: $0.01  |  排序: 综合 ▼ │
├─────────────────────────────────────────────────────────┤
│  找到 23 个 Provider                                     │
├─────────────────────────────────────────────────────────┤
│  🥇 prov_fast      $0.009 | 0.8s | 99.5% | 95 💎  [选择]│
│  🥈 prov_cheap     $0.006 | 2.1s | 97.2% | 88 ⭐ [选择]│
│  🥉 prov_stable    $0.010 | 1.2s | 98.9% | 92 💎  [选择]│
└─────────────────────────────────────────────────────────┘
```

### 市场行情仪表盘

```
┌─────────────────────────────────────────────────────────┐
│  Llama-3-70B 市场行情                                    │
├─────────────────────────────────────────────────────────┤
│  当前平均: $0.0089 (↑12%)  |  可用 Provider: 47 个      │
│  价格范围: $0.005-$0.015   |  平均响应: 1.2s (↓0.2s)   │
├─────────────────────────────────────────────────────────┤
│  价格分布:              │  24h 趋势:                     │
│  ████ $0.005-0.007      │   ╱╲                          │
│  ████████ $0.007-0.010  │  ╱  ╲╱╲                       │
│  ███ $0.010-0.015       │     ╱    ╲                    │
└─────────────────────────────────────────────────────────┘
```

---

## ⚡ 实施计划

### Phase 1: 价格发现 (2 周)

- [ ] Provider 自主定价
- [ ] Consumer 价格筛选
- [ ] 实时价格图表

### Phase 2: 质量评分 (2 周)

- [ ] 自动收集性能指标
- [ ] 用户评价系统
- [ ] 信誉分算法

### Phase 3: 订单簿 (3 周)

- [ ] Asks/Bids 撮合
- [ ] 限价单/市价单
- [ ] 深度图展示

### Phase 4: 激励机制 (2 周)

- [ ] 做市商奖励
- [ ] 推荐返利
- [ ] VIP 会员体系

---

## 💡 下一步行动

### 建议优先级

1. **立即开始**: 实现动态定价接口 (Week 1)
2. **尽快完成**: 信誉评分系统基础版 (Week 2)
3. **逐步优化**: 市场仪表盘前端开发 (Week 3-4)
4. **持续迭代**: 订单簿和激励机制 (Week 5-8)

### 需要的资源

- **后端开发**: 2 人 (API + 数据库)
- **智能合约开发**: 1 人 (Solidity)
- **前端开发**: 1 人 (React + UI/UX)
- **测试**: 1 人 (自动化测试 + QA)

---

## 📞 联系方式

**项目维护者**: OpenClaw Team  
**邮箱**: [team@openclaw.io](mailto:team@openclaw.io)  
**GitHub**: [openclaw/openclaw](https://github.com/openclaw/openclaw)  
**Discord**: [discord.gg/openclaw](https://discord.gg/openclaw)

---

## 📝 版本历史

- **v2.0** (2026-02-20): 增加自由市场设计、信誉评分算法、市场仪表盘原型
- **v1.0** (2026-02-15): 初始 Web3 扩展版本

---

**感谢你的使用! 🚀**

如有任何问题或建议，欢迎联系我们。
