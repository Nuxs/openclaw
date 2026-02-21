# OpenClaw 信誉评分算法 (Reputation Scoring Algorithm)

## 概述

信誉评分系统是 OpenClaw Web3 自由市场的核心机制，用于量化 Provider 和 Consumer 的历史表现，帮助市场参与者做出明智决策。

### 设计目标

1. **公平性**: 新老参与者都有机会建立信誉
2. **抗作弊**: 难以通过刷单、串通等手段操纵评分
3. **实时性**: 评分快速反映最新表现
4. **透明性**: 算法逻辑公开，评分可验证
5. **激励相容**: 诚实行为获得奖励，作弊成本高

---

## 1. Provider 信誉评分 (Provider Reputation Score)

### 1.1 评分模型

Provider 信誉评分采用**多维度加权模型**，综合考虑以下因素:

```typescript
interface ProviderReputation {
  providerId: string;
  overallScore: number; // 综合评分 (0-100)

  // 核心指标
  metrics: {
    reliabilityScore: number; // 可靠性评分 (0-100)
    qualityScore: number; // 质量评分 (0-100)
    performanceScore: number; // 性能评分 (0-100)
    trustScore: number; // 信任评分 (0-100)
  };

  // 原始数据
  rawData: {
    totalJobs: number; // 总任务数
    completedJobs: number; // 完成任务数
    failedJobs: number; // 失败任务数
    avgResponseTime: number; // 平均响应时间 (ms)
    uptimePercent: number; // 在线率 (0-100)
    disputesInitiated: number; // 被发起争议次数
    disputesLost: number; // 败诉争议次数
    userRatings: UserRating[]; // 用户评价
    accountAge: number; // 账户年龄 (天)
    stakeAmount: number; // 质押金额
  };

  // 时间衰减权重
  decay: {
    recentWeight: number; // 近期数据权重 (0-1)
    historicalWeight: number; // 历史数据权重 (0-1)
  };

  // 元数据
  lastUpdated: number; // 最后更新时间
  nextUpdateAt: number; // 下次更新时间
}

interface UserRating {
  consumerId: string;
  rating: number; // 1-5 星
  comment: string;
  jobId: string;
  timestamp: number;
  verified: boolean; // 是否实际交易产生
}
```

---

### 1.2 评分计算公式

#### 综合评分 (Overall Score)

```typescript
function calculateOverallScore(metrics: ProviderMetrics): number {
  const weights = {
    reliability: 0.35, // 可靠性权重最高
    quality: 0.3, // 质量次之
    performance: 0.2, // 性能
    trust: 0.15, // 信任
  };

  return (
    metrics.reliabilityScore * weights.reliability +
    metrics.qualityScore * weights.quality +
    metrics.performanceScore * weights.performance +
    metrics.trustScore * weights.trust
  );
}
```

---

#### 1. 可靠性评分 (Reliability Score)

衡量 Provider 完成任务的稳定性和在线率。

```typescript
function calculateReliabilityScore(data: RawData): number {
  // 1. 任务成功率 (Success Rate)
  const successRate = data.completedJobs / data.totalJobs;
  const successScore = successRate * 100;

  // 2. 在线率 (Uptime)
  const uptimeScore = data.uptimePercent;

  // 3. 争议失败惩罚
  const disputePenalty = Math.min(
    data.disputesLost * 5, // 每次败诉扣 5 分
    30, // 最多扣 30 分
  );

  // 4. 新手保护 (冷启动问题)
  const coldStartBonus =
    data.totalJobs < 10
      ? Math.max(10 - data.totalJobs, 0) * 2 // 前 10 单每单加 2 分
      : 0;

  // 综合计算
  const rawScore = successScore * 0.6 + uptimeScore * 0.4 + coldStartBonus - disputePenalty;

  // 限制在 0-100
  return Math.max(0, Math.min(100, rawScore));
}
```

**示例:**

- Provider A: 100 任务, 98 成功, 99% 在线, 0 败诉
  → `(98% * 100 * 0.6 + 99 * 0.4) - 0 = 98.2`
- Provider B: 5 任务, 5 成功, 95% 在线, 0 败诉 (新手)
  → `(100 * 0.6 + 95 * 0.4) + (10-5)*2 = 108 → 100` (冷启动加分)

---

#### 2. 质量评分 (Quality Score)

基于用户评价和实际服务质量。

```typescript
function calculateQualityScore(data: RawData): number {
  // 1. 用户评分 (User Ratings)
  const verifiedRatings = data.userRatings.filter((r) => r.verified);

  if (verifiedRatings.length === 0) {
    return 50; // 默认分数（新 Provider）
  }

  // 2. 加权平均（时间衰减）
  const now = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;

  verifiedRatings.forEach((rating) => {
    // 时间衰减: 30 天内的评价权重为 1, 之后每 30 天衰减 10%
    const ageInDays = (now - rating.timestamp) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.pow(0.9, Math.floor(ageInDays / 30));
    const weight = decayFactor;

    weightedSum += (rating.rating / 5) * 100 * weight;
    totalWeight += weight;
  });

  const avgScore = weightedSum / totalWeight;

  // 3. 样本量修正 (Wilson Score)
  // 评价数少时，向均值 (50) 回归
  const confidenceFactor = Math.min(verifiedRatings.length / 20, 1);
  const adjustedScore = avgScore * confidenceFactor + 50 * (1 - confidenceFactor);

  return adjustedScore;
}
```

**示例:**

- Provider A: 50 评价, 平均 4.5 星
  → `(4.5/5 * 100) * 1.0 + 50 * 0 = 90`
- Provider B: 2 评价, 平均 5.0 星 (新手)
  → `100 * 0.1 + 50 * 0.9 = 55` (样本量少，向均值回归)

---

#### 3. 性能评分 (Performance Score)

衡量响应速度和处理效率。

```typescript
function calculatePerformanceScore(data: RawData, benchmarks: Benchmarks): number {
  // 1. 响应时间评分
  const avgResponseTime = data.avgResponseTime;
  const benchmarkTime = benchmarks.avgResponseTime; // 市场平均值

  // 相对于基准的性能
  const performanceRatio = benchmarkTime / avgResponseTime;

  // 归一化到 0-100
  let responseScore: number;
  if (performanceRatio >= 1.5) {
    responseScore = 100; // 快 50% 以上
  } else if (performanceRatio >= 1.0) {
    responseScore = 50 + (performanceRatio - 1.0) * 100; // 50-100 分
  } else if (performanceRatio >= 0.5) {
    responseScore = performanceRatio * 100; // 0-50 分
  } else {
    responseScore = 0; // 慢 50% 以上
  }

  // 2. 吞吐量评分 (可选, 如果有数据)
  const throughputScore = 50; // 暂时默认

  return responseScore * 0.7 + throughputScore * 0.3;
}
```

**示例:**

- 市场平均响应时间: 2000ms
- Provider A: 1000ms → `2000/1000 = 2.0 → 100 分`
- Provider B: 3000ms → `2000/3000 = 0.67 → 67 分`

---

#### 4. 信任评分 (Trust Score)

衡量 Provider 的经济承诺和长期表现。

```typescript
function calculateTrustScore(data: RawData, config: TrustConfig): number {
  // 1. 质押金评分
  const stakeRatio = data.stakeAmount / config.minStakeRequired;
  const stakeScore = Math.min(stakeRatio * 40, 40); // 最多 40 分

  // 2. 账户年龄评分
  const accountAgeInMonths = data.accountAge / 30;
  const ageScore = Math.min(accountAgeInMonths * 5, 30); // 最多 30 分

  // 3. 长期稳定性 (总任务数)
  const volumeScore = Math.min(data.totalJobs / 10, 30); // 最多 30 分

  return stakeScore + ageScore + volumeScore;
}
```

**示例:**

- Provider A: 质押 10 ETH (最低 5 ETH), 账户 6 个月, 200 任务
  → `(10/5 * 40) + (6 * 5) + min(200/10, 30) = 40 + 30 + 30 = 100`

---

### 1.3 时间衰减机制

为了让评分反映 Provider 的**最新表现**, 引入时间衰减:

```typescript
function applyTimeDecay(score: number, data: RawData): number {
  const recentJobs = data.jobs.filter(
    (job) => Date.now() - job.timestamp < 30 * 24 * 60 * 60 * 1000, // 30 天内
  );

  const recentScore = calculateScoreForJobs(recentJobs);
  const historicalScore = score;

  // 70% 权重给近期表现, 30% 给历史
  return recentScore * 0.7 + historicalScore * 0.3;
}
```

---

### 1.4 防刷分机制

#### 1. Sybil Attack 防御 (女巫攻击)

**问题**: Provider 创建多个假 Consumer 账户刷好评。

**解决方案**:

```typescript
function detectSybilAttack(ratings: UserRating[]): boolean {
  // 1. 检查同一 IP 地址的评价数
  const ipCounts = countByIP(ratings);
  if (Math.max(...Object.values(ipCounts)) > 3) {
    return true; // 同一 IP 超过 3 个评价
  }

  // 2. 检查评价时间模式 (是否集中在短时间内)
  const timestamps = ratings.map((r) => r.timestamp).sort();
  const clusters = findTimeClusters(timestamps, 3600000); // 1 小时窗口
  if (clusters.some((c) => c.length > 5)) {
    return true; // 1 小时内超过 5 个评价
  }

  // 3. 检查 Consumer 账户年龄
  const newAccountRatings = ratings.filter(
    (r) => getAccountAge(r.consumerId) < 7, // 7 天内新账户
  );
  if (newAccountRatings.length > ratings.length * 0.3) {
    return true; // 30% 以上来自新账户
  }

  return false;
}
```

#### 2. Wash Trading 防御 (对敲交易)

**问题**: Provider 和 Consumer 串通，创建假任务刷评分。

**解决方案**:

```typescript
function detectWashTrading(provider: string, consumers: string[]): boolean {
  // 1. 检查是否存在循环交易
  // Provider A → Consumer B → Provider B → Consumer A
  const circularTrades = detectCircularPattern(provider, consumers);
  if (circularTrades.length > 0) {
    return true;
  }

  // 2. 检查单一 Consumer 占比
  const topConsumer = getMostFrequentConsumer(provider);
  const topConsumerRatio = topConsumer.count / getTotalJobs(provider);
  if (topConsumerRatio > 0.5) {
    return true; // 单一客户占比超过 50%
  }

  return false;
}
```

#### 3. 评价可信度加权

只有**真实交易**产生的评价才计入评分:

```typescript
interface UserRating {
  verified: boolean; // 是否链上可验证的交易
  txHash: string; // 交易哈希
  amount: number; // 交易金额
}

function calculateVerifiedRatingWeight(rating: UserRating): number {
  if (!rating.verified) return 0;

  // 交易金额越大, 评价权重越高
  const amountWeight = Math.log(rating.amount + 1) / 10;
  return Math.min(amountWeight, 1.0);
}
```

---

### 1.5 评分更新频率

- **实时更新**: 每次任务完成后立即重新计算
- **批量更新**: 每小时更新一次所有 Provider 的市场排名
- **缓存策略**: 评分缓存 5 分钟, 避免频繁计算

```typescript
class ReputationScoreCache {
  private cache: Map<string, CachedScore> = new Map();
  private readonly TTL = 5 * 60 * 1000; // 5 分钟

  async getScore(providerId: string): Promise<number> {
    const cached = this.cache.get(providerId);

    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.score;
    }

    // 重新计算
    const score = await this.calculateFreshScore(providerId);
    this.cache.set(providerId, { score, timestamp: Date.now() });

    return score;
  }
}
```

---

## 2. Consumer 信誉评分 (Consumer Reputation Score)

Consumer 的信誉评分相对简单, 主要用于:

1. 防止恶意 Consumer 滥用争议机制
2. 给高信誉 Consumer 提供优先服务

### 2.1 评分模型

```typescript
interface ConsumerReputation {
  consumerId: string;
  score: number; // 0-100

  metrics: {
    paymentReliability: number; // 支付可靠性
    disputeFairness: number; // 争议公平性
    accountTrust: number; // 账户信任度
  };

  rawData: {
    totalOrders: number;
    completedOrders: number;
    disputesInitiated: number;
    disputesWon: number;
    avgPaymentTime: number; // 平均支付时间
    accountAge: number;
    stakeAmount: number;
  };
}
```

### 2.2 评分计算

```typescript
function calculateConsumerScore(data: ConsumerRawData): number {
  // 1. 支付可靠性 (40%)
  const paymentScore = (data.completedOrders / data.totalOrders) * 100;

  // 2. 争议公平性 (30%)
  // 频繁发起争议但败诉 → 降分
  const disputeRatio = data.disputesInitiated / data.totalOrders;
  const disputeWinRate = data.disputesWon / data.disputesInitiated;

  let disputeScore = 50; // 默认
  if (disputeRatio > 0.2) {
    // 争议率超过 20%, 根据胜率调整
    disputeScore = disputeWinRate * 100;
  }

  // 3. 账户信任度 (30%)
  const trustScore = calculateTrustScore(data, {
    minStakeRequired: 1, // ETH
  });

  return paymentScore * 0.4 + disputeScore * 0.3 + trustScore * 0.3;
}
```

---

## 3. 评分展示与应用

### 3.1 评分等级

将 0-100 的分数映射到用户友好的等级:

```typescript
enum ReputationTier {
  LEGENDARY = "🏆 传奇", // 95-100
  EXCELLENT = "💎 卓越", // 85-94
  GOOD = "⭐ 良好", // 70-84
  AVERAGE = "👍 一般", // 50-69
  POOR = "⚠️ 较差", // 30-49
  UNTRUSTED = "🚫 不可信", // 0-29
}

function getTier(score: number): ReputationTier {
  if (score >= 95) return ReputationTier.LEGENDARY;
  if (score >= 85) return ReputationTier.EXCELLENT;
  if (score >= 70) return ReputationTier.GOOD;
  if (score >= 50) return ReputationTier.AVERAGE;
  if (score >= 30) return ReputationTier.POOR;
  return ReputationTier.UNTRUSTED;
}
```

### 3.2 市场排序

Consumer 搜索时的默认排序:

```typescript
function sortProviders(providers: Provider[], sortBy: string): Provider[] {
  switch (sortBy) {
    case "reputation":
      return providers.sort((a, b) => b.reputation.score - a.reputation.score);

    case "price":
      return providers.sort((a, b) => a.pricing.basePrice - b.pricing.basePrice);

    case "balanced":
      // 综合评分: reputation * 0.6 + (1 - priceRatio) * 0.4
      return providers.sort((a, b) => {
        const aScore = a.reputation.score * 0.6 + (1 - a.pricing.basePrice / maxPrice) * 100 * 0.4;
        const bScore = b.reputation.score * 0.6 + (1 - b.pricing.basePrice / maxPrice) * 100 * 0.4;
        return bScore - aScore;
      });

    default:
      return providers;
  }
}
```

### 3.3 信誉加成

高信誉 Provider 可享受:

```typescript
interface ReputationBenefits {
  feeDiscount: number; // 平台手续费折扣
  priorityRanking: boolean; // 搜索结果优先展示
  higherStakeLimit: number; // 更高的质押上限
  verifiedBadge: boolean; // 认证徽章
}

function getBenefits(score: number): ReputationBenefits {
  if (score >= 90) {
    return {
      feeDiscount: 0.5, // 5% → 2.5%
      priorityRanking: true,
      higherStakeLimit: 100, // ETH
      verifiedBadge: true,
    };
  } else if (score >= 70) {
    return {
      feeDiscount: 0.3, // 5% → 3.5%
      priorityRanking: false,
      higherStakeLimit: 50,
      verifiedBadge: false,
    };
  } else {
    return {
      feeDiscount: 0,
      priorityRanking: false,
      higherStakeLimit: 10,
      verifiedBadge: false,
    };
  }
}
```

---

## 4. 实现细节

### 4.1 数据存储

```typescript
// 链上存储 (Solidity)
contract ReputationRegistry {
  struct ProviderReputation {
    uint8 overallScore;
    uint32 totalJobs;
    uint32 completedJobs;
    uint32 failedJobs;
    uint16 disputesLost;
    uint64 lastUpdated;
  }

  mapping(address => ProviderReputation) public reputations;

  function updateReputation(
    address provider,
    bool success,
    bool disputed
  ) external onlyOracle {
    // 更新链上数据
  }
}
```

```typescript
// 链下存储 (PostgreSQL)
CREATE TABLE provider_reputations (
  provider_id VARCHAR(66) PRIMARY KEY,
  overall_score NUMERIC(5,2) NOT NULL,
  reliability_score NUMERIC(5,2),
  quality_score NUMERIC(5,2),
  performance_score NUMERIC(5,2),
  trust_score NUMERIC(5,2),

  -- 原始数据
  total_jobs INTEGER DEFAULT 0,
  completed_jobs INTEGER DEFAULT 0,
  avg_response_time INTEGER,
  uptime_percent NUMERIC(5,2),

  -- 元数据
  last_updated TIMESTAMP NOT NULL,
  next_update_at TIMESTAMP,

  -- 索引
  CONSTRAINT score_range CHECK (overall_score >= 0 AND overall_score <= 100)
);

CREATE INDEX idx_overall_score ON provider_reputations(overall_score DESC);
CREATE INDEX idx_last_updated ON provider_reputations(last_updated);
```

### 4.2 计算服务

```typescript
class ReputationService {
  async updateProviderReputation(providerId: string): Promise<void> {
    // 1. 获取原始数据
    const rawData = await this.fetchRawData(providerId);

    // 2. 计算各维度评分
    const reliabilityScore = calculateReliabilityScore(rawData);
    const qualityScore = calculateQualityScore(rawData);
    const performanceScore = calculatePerformanceScore(rawData, this.benchmarks);
    const trustScore = calculateTrustScore(rawData, this.config);

    // 3. 计算综合评分
    const overallScore = calculateOverallScore({
      reliabilityScore,
      qualityScore,
      performanceScore,
      trustScore,
    });

    // 4. 应用时间衰减
    const decayedScore = applyTimeDecay(overallScore, rawData);

    // 5. 检测作弊
    const isCheating = await this.detectCheating(providerId);
    if (isCheating) {
      await this.penalizeProvider(providerId);
    }

    // 6. 保存到数据库
    await this.saveReputation(providerId, {
      overallScore: decayedScore,
      metrics: { reliabilityScore, qualityScore, performanceScore, trustScore },
      rawData,
      lastUpdated: Date.now(),
    });

    // 7. 更新链上数据 (异步)
    await this.syncToBlockchain(providerId, decayedScore);
  }
}
```

---

## 5. 测试与验证

### 5.1 测试用例

```typescript
describe("ReputationScoring", () => {
  it("新 Provider 应该获得中等评分", () => {
    const newProvider = {
      totalJobs: 0,
      completedJobs: 0,
      accountAge: 1,
    };

    const score = calculateOverallScore(newProvider);
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(60);
  });

  it("高质量 Provider 应该获得高分", () => {
    const excellentProvider = {
      totalJobs: 1000,
      completedJobs: 990,
      uptimePercent: 99.5,
      disputesLost: 0,
      avgRating: 4.8,
      accountAge: 365,
    };

    const score = calculateOverallScore(excellentProvider);
    expect(score).toBeGreaterThan(90);
  });

  it("应该检测到刷分行为", () => {
    const suspiciousRatings = [
      { consumerId: "0x1", timestamp: 1000, verified: true },
      { consumerId: "0x2", timestamp: 1100, verified: true },
      { consumerId: "0x3", timestamp: 1200, verified: true },
      { consumerId: "0x4", timestamp: 1300, verified: true },
      { consumerId: "0x5", timestamp: 1400, verified: true },
      { consumerId: "0x6", timestamp: 1500, verified: true },
    ];

    const isSybil = detectSybilAttack(suspiciousRatings);
    expect(isSybil).toBe(true);
  });
});
```

---

## 6. 未来优化方向

### 6.1 机器学习增强

使用 ML 模型预测 Provider 未来表现:

```typescript
interface MLFeatures {
  recentTrend: number; // 近期趋势
  seasonality: number; // 季节性模式
  peerComparison: number; // 同类对比
  anomalyScore: number; // 异常检测
}

function predictFutureScore(historicalData: TimeSeriesData, mlModel: TrainedModel): number {
  const features = extractFeatures(historicalData);
  return mlModel.predict(features);
}
```

### 6.2 社交图谱分析

利用链上交易网络检测作弊:

```typescript
function analyzeTransactionGraph(providerId: string): GraphMetrics {
  const graph = buildTransactionGraph(providerId);

  return {
    clustering: calculateClusteringCoefficient(graph),
    centrality: calculateBetweennessCentrality(graph),
    community: detectCommunityStructure(graph),
  };
}
```

### 6.3 动态权重调整

根据市场状态自动调整评分权重:

```typescript
function adaptWeights(marketState: MarketState): Weights {
  if (marketState.supplyShortage) {
    // 供不应求时, 降低质量要求
    return { reliability: 0.5, quality: 0.2, performance: 0.2, trust: 0.1 };
  } else if (marketState.oversupply) {
    // 供过于求时, 提高质量要求
    return { reliability: 0.3, quality: 0.4, performance: 0.2, trust: 0.1 };
  }

  return DEFAULT_WEIGHTS;
}
```

---

## 7. 总结

OpenClaw 信誉评分算法通过**多维度评估、时间衰减、防刷分机制**三大核心设计，为自由市场提供了可靠的信任基础。

### 核心特点

✅ **公平**: 新老参与者都有机会  
✅ **透明**: 算法逻辑开源  
✅ **抗作弊**: 多重检测机制  
✅ **实时**: 快速反映最新表现  
✅ **激励相容**: 诚实获利, 作弊成本高

### 参考文献

- [Uber Driver Rating System](https://www.uber.com/us/en/drive/basics/how-ratings-work/)
- [Airbnb Trust & Safety](https://www.airbnb.com/trust)
- [eBay Feedback System](https://www.ebay.com/help/buying/feedback-reputation/feedback-basics)
- [EigenTrust: Reputation Management in P2P Networks](http://www.cs.columbia.edu/~angelos/Papers/2003/eigentrust.pdf)

---

**版本**: v1.0  
**最后更新**: 2026-02-20  
**作者**: OpenClaw Team
