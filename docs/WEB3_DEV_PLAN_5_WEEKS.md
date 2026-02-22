# OpenClaw Web3 扩展开发计划

**计划周期**: 5周（2026-02-21 ~ 2026-03-27）  
**目标**: 完成 Phase 1 所有验收标准，发布 Beta 版本

> 说明：本文是“执行计划/任务拆解”；实际完成状态与统一口径以 `docs/WEB3_OVERALL_PROGRESS.md` 为准。双栈（TON+EVM）统一口径以 `docs/WEB3_DUAL_STACK_STRATEGY.md` 与 `docs/reference/web3-dual-stack-payments-and-settlement.md` 为准。

---

## 📊 总体规划

```
Week 1  ████████████████████  P0安全修复（阻断项）
Week 2  ████████████████████  Dispute + E2E测试
Week 3  ████████████████████  监控告警
Week 4  ████████████████████  Web UI仪表盘
Week 5  ████████████████████  Demo + 文档 + Beta发布
```

---

## Week 1: P0安全修复（2026-02-21 ~ 02-27）

**目标**: 解决所有P0阻断项

### 任务分解

#### Day 1-2: Gate-SEC-01（敏感信息零泄露）

**任务**：

- [ ] 移除`web3.index.list`的endpoint字段
- [ ] 统一错误处理，不泄露文件路径
- [ ] 实现日志/输出脱敏（复用 `extensions/web3-core/src/utils/redact.ts`）

**输出（示意）**：

```typescript
// web3-core/src/resources/indexer.ts
function listResources() {
  return {
    resources: resources.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      provider: r.provider,
      signature: r.signature,
      // ✅ endpoint 默认不返回/已脱敏
    })),
  };
}

// web3-core/src/utils/redact.ts
// - redactString(): 处理 Bearer/tok_*/URL/JWT/路径 等敏感模式
// - redactUnknown(): 递归脱敏未知结构（按敏感键/字符串规则）

// errors.ts
function sanitizeError(err: unknown): ErrorResponse {
  // 统一错误码 + 人类可读消息；不得泄露路径/endpoint/token
  return {
    error: ErrorCode.E_INTERNAL,
    message: "Operation failed",
  };
}
```

**验收标准**：

- [ ] `web3.index.list`不返回endpoint
- [ ] 所有错误消息不含文件路径
- [ ] 日志中敏感字段已脱敏

---

#### Day 3-4: Gate-ERR-01（稳定错误码）

**任务**：

- [ ] 定义`ErrorCode`枚举
- [ ] 更新20个`web3.*`方法
- [ ] 更新18个`market-core`facade方法
- [ ] 更新`web3.capabilities.*`包含错误码

**输出**：

```typescript
// web3-core/src/errors.ts
export enum ErrorCode {
  E_INVALID_ARGUMENT = "E_INVALID_ARGUMENT",
  E_AUTH_REQUIRED = "E_AUTH_REQUIRED",
  E_FORBIDDEN = "E_FORBIDDEN",
  E_NOT_FOUND = "E_NOT_FOUND",
  E_CONFLICT = "E_CONFLICT",
  E_QUOTA_EXCEEDED = "E_QUOTA_EXCEEDED",
  E_EXPIRED = "E_EXPIRED",
  E_REVOKED = "E_REVOKED",
  E_INTERNAL = "E_INTERNAL",
  E_UNAVAILABLE = "E_UNAVAILABLE",
  E_TIMEOUT = "E_TIMEOUT",
}

// 所有handler统一返回
interface ErrorResponse {
  error: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
```

**影响文件**：

- `web3-core/src/index.ts`
- `market-core/src/facade.ts`
- `web3-core/src/capabilities/catalog.ts`

**验收标准**：

- [ ] 所有API返回稳定的ErrorCode
- [ ] `web3.capabilities.describe`包含错误码列表
- [ ] 测试用例验证错误码稳定性

---

#### Day 5: Gate-CAP-01 + P0-5

**任务**：

- [ ] 补全10个高频API的详细`paramsSchema`
- [ ] 实现签名验证函数`verifyResourceSignature()`

**输出**：

```typescript
// web3-core/src/capabilities/catalog.ts
paramsSchema: {
  resourceId: {
    type: "string",
    required: true,
    pattern: "^[a-zA-Z0-9-]{8,64}$",
    description: "Unique identifier for the resource",
    example: "model-gpt4-provider-alice"
  },
  limit: {
    type: "number",
    required: false,
    minimum: 1,
    maximum: 100,
    default: 20,
    description: "Maximum number of results"
  }
}

// web3-core/src/resources/indexer.ts
async function verifyResourceSignature(
  resource: Resource,
  signature: string,
  providerAddress: string
): Promise<boolean> {
  const message = canonicalizeResourceMetadata(resource);
  const recovered = ethers.utils.verifyMessage(message, signature);
  return recovered.toLowerCase() === providerAddress.toLowerCase();
}
```

**验收标准**：

- [ ] 高频API有详细schema（type/required/pattern/description/example）
- [ ] 签名验证测试通过
- [ ] `web3.index.list`默认验证签名

---

### Week 1 交付物

- [x] 安全漏洞修复完成
- [x] 错误码标准化完成
- [x] 能力自描述完善
- [x] 索引签名验证可用
- [x] 测试用例通过

---

## Week 2: Dispute + E2E测试（2026-02-28 ~ 03-06）

**目标**: 补齐核心闭环测试

### 任务分解

#### Day 1: Dispute - 证据锚定

**任务**：

- [ ] 实现`submitEvidence()`完整逻辑
- [ ] 证据哈希生成
- [ ] 证据链上锚定

**输出**：

```typescript
// market-core/src/disputes/handlers.ts
async function submitEvidence(disputeId: string, evidence: Evidence) {
  const hash = canonicalizeHash(evidence);

  const tx = await chainAdapter.anchor({
    disputeId,
    evidenceHash: hash,
    timestamp: Date.now(),
  });

  await store.updateDispute(disputeId, {
    evidences: [
      ...dispute.evidences,
      {
        hash,
        txHash: tx.hash,
        submittedAt: Date.now(),
      },
    ],
  });
}
```

---

#### Day 2: Dispute - 裁决回写

**任务**：

- [ ] 实现`resolveDispute()`完整逻辑
- [ ] 裁决结果更新settlement
- [ ] 裁决结果写入ledger
- [ ] 裁决结果锚定上链

**输出**：

```typescript
async function resolveDispute(disputeId: string, decision: Decision) {
  // 1. 更新settlement
  if (decision.ruling === "provider_wins") {
    await settlementEngine.release(dispute.settlementId);
  } else {
    await settlementEngine.refund(dispute.settlementId);
  }

  // 2. 写入ledger
  await ledger.append({
    type: "dispute_resolved",
    disputeId,
    decision,
    timestamp: Date.now(),
  });

  // 3. 锚定上链
  await chainAdapter.anchor({
    disputeId,
    decisionHash: canonicalizeHash(decision),
  });
}
```

---

#### Day 3: Dispute - 超时处理

**任务**：

- [ ] 实现`checkDisputeTimeouts()`定时任务
- [ ] 集成到后台服务

**输出**：

```typescript
async function checkDisputeTimeouts() {
  const expired = await store.listDisputes({
    status: "open",
    createdBefore: Date.now() - DISPUTE_TIMEOUT,
  });

  for (const dispute of expired) {
    await resolveDispute(dispute.id, {
      ruling: "provider_wins",
      reason: "Timeout",
    });
  }
}

// 添加到anchor-service
api.registerService({
  id: "web3-anchor-service",
  start: () => {
    setInterval(checkDisputeTimeouts, 60_000);
  },
});
```

---

#### Day 4: E2E测试 - 完整流程

**任务**：

- [ ] 测试：publish → lease → settle → dispute完整流程
- [ ] 测试：正常结算路径
- [ ] 测试：争议解决路径

**输出**：

```typescript
// tests/e2e/market-flow.test.ts
describe("Market Full Flow", () => {
  test("happy path: publish → lease → settle", async () => {
    // 1. Provider发布资源
    const { resourceId } = await web3.market.resource.publish({...});

    // 2. Consumer租用
    const { leaseId } = await web3.market.lease.issue({...});

    // 3. 正常使用
    // ...

    // 4. 结算
    await market.settlement.lock({ leaseId });
    await market.settlement.release({ leaseId });

    // 验证ledger记录
    const ledger = await web3.market.ledger.list({});
    expect(ledger.entries).toHaveLength(3);
  });

  test("dispute path: publish → lease → dispute → resolve", async () => {
    // ...争议流程测试
  });
});
```

---

#### Day 5: E2E测试 - 双存储一致性

**任务**：

- [ ] 测试File模式原子性
- [ ] 测试SQLite模式原子性
- [ ] 测试高并发场景

**输出**：

```typescript
// tests/e2e/storage-consistency.test.ts
describe("Storage Consistency", () => {
  test("file mode: concurrent writes", async () => {
    // 并发写入测试
  });

  test("sqlite mode: transaction rollback", async () => {
    // 事务回滚测试
  });
});
```

---

### Week 2 交付物

- [x] Dispute机制完整可用
- [x] E2E测试覆盖主流程
- [x] 双存储一致性测试通过

---

## Week 3: 监控告警（2026-03-07 ~ 03-13）

**目标**: 补齐监控告警基础设施

### 任务分解

#### Day 1-2: 告警规则

**任务**：

- [ ] 定义P0告警规则（服务不可用、安全事件）
- [ ] 定义P1告警规则（配额耗尽、结算失败）
- [ ] 实现告警触发逻辑

**输出**：

```typescript
// web3-core/src/monitor/alerts.ts
enum AlertLevel {
  P0 = "P0", // 紧急
  P1 = "P1", // 重要
  P2 = "P2", // 一般
}

const alertRules = {
  // P0: 服务不可用
  service_unavailable: {
    level: AlertLevel.P0,
    condition: () => !serviceHealthy,
    message: "Web3 service is unavailable",
  },

  // P0: 安全事件
  unauthorized_access: {
    level: AlertLevel.P0,
    condition: (event) => event.unauthorized,
    message: "Unauthorized access attempt detected",
  },

  // P1: 配额耗尽
  quota_exceeded: {
    level: AlertLevel.P1,
    condition: (usage) => usage.creditsUsed >= usage.creditsQuota,
    message: "Session quota exceeded",
  },

  // P1: 结算失败
  settlement_failed: {
    level: AlertLevel.P1,
    condition: (tx) => tx.status === "failed",
    message: "Settlement transaction failed",
  },
};
```

---

#### Day 3-4: 告警历史

**任务**：

- [ ] 实现`web3.monitor.alerts.list` API
- [ ] 实现告警持久化（`alerts.jsonl`）
- [ ] 实现告警查询过滤

**输出**：

```typescript
// web3-core/src/monitor/handlers.ts
async function listAlerts(params: {
  level?: AlertLevel;
  since?: number;
  limit?: number;
}) {
  const alerts = await store.loadAlerts();

  return {
    alerts: alerts
      .filter(a => !params.level || a.level === params.level)
      .filter(a => !params.since || a.timestamp >= params.since)
      .slice(0, params.limit || 100)
  };
}

// web3-core/src/state/store.ts
async appendAlert(alert: Alert) {
  await fs.appendFile(
    path.join(stateDir, "alerts.jsonl"),
    JSON.stringify(alert) + "\n"
  );
}
```

---

#### Day 5: UI集成

**任务**：

- [ ] 在Control UI添加告警面板
- [ ] 实时告警展示
- [ ] 告警历史查询

**输出**：

```typescript
// control-ui/src/components/AlertsPanel.tsx
export function AlertsPanel() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    gateway.request("web3.monitor.alerts.list", { limit: 50 })
      .then(res => setAlerts(res.alerts));
  }, []);

  return (
    <div>
      {alerts.map(alert => (
        <AlertCard key={alert.id} alert={alert} />
      ))}
    </div>
  );
}
```

---

### Week 3 交付物

- [x] P0/P1告警规则配置完整
- [x] 告警历史可查询
- [x] UI可展示实时告警

---

## Week 4: Web UI仪表盘（2026-03-14 ~ 03-20）

**目标**: 让用户看到价值

### 任务分解

#### Day 1: 收入/支出可视化

**任务**：

- [ ] 实现收入/支出饼图
- [ ] 实现历史趋势折线图
- [ ] 实现净收益展示

**输出**：

```typescript
// control-ui/src/components/EconomicsDashboard.tsx
export function EconomicsDashboard() {
  return (
    <div>
      <RevenueChart />       {/* 收入 */}
      <ExpenseChart />       {/* 支出 */}
      <NetIncomeCard />      {/* 净收益 */}
      <TrendChart />         {/* 趋势 */}
    </div>
  );
}
```

---

#### Day 2: 活跃资源展示

**任务**：

- [ ] 资源列表展示
- [ ] 资源状态指示（active/idle/leased）
- [ ] 资源使用统计

**输出**：

```typescript
export function ResourcesPanel() {
  return (
    <div>
      <ResourceList resources={resources} />
      <ResourceStats />
    </div>
  );
}
```

---

#### Day 3: 最近交易列表

**任务**：

- [ ] 时间线视图
- [ ] 交易详情展开
- [ ] 交易状态过滤

**输出**：

```typescript
export function TransactionsPanel() {
  return (
    <Timeline>
      {transactions.map(tx => (
        <TransactionCard key={tx.id} tx={tx} />
      ))}
    </Timeline>
  );
}
```

---

#### Day 4: 配额使用图表

**任务**：

- [ ] 配额进度条
- [ ] 剩余额度展示
- [ ] 使用趋势图

**输出**：

```typescript
export function QuotaPanel() {
  return (
    <div>
      <ProgressBar used={used} total={quota} />
      <RemainingCredits value={quota - used} />
      <UsageTrendChart />
    </div>
  );
}
```

---

#### Day 5: 整体状态总览

**任务**：

- [ ] 健康检查面板
- [ ] 系统指标展示
- [ ] 快速操作入口

**输出**：

```typescript
export function StatusOverview() {
  return (
    <div>
      <HealthCheckPanel />
      <SystemMetrics />
      <QuickActions />
    </div>
  );
}
```

---

### Week 4 交付物

- [x] 管家经济仪表盘可用
- [x] 资源管理界面完整
- [x] 配额使用可视化
- [x] 用户体验流畅

---

## Week 5: Demo + 文档 + Beta发布（2026-03-21 ~ 03-27）

**目标**: Beta发布准备

### 任务分解

#### Day 1: Demo脚本

**任务**：

- [ ] 编写端到端演示脚本
- [ ] 准备演示数据
- [ ] 测试演示流程

**输出**：

```bash
# demo/full-flow.sh
#!/bin/bash

echo "1. Provider发布模型资源..."
openclaw gateway call web3.market.resource.publish '{...}'

echo "2. Consumer查询可用资源..."
openclaw gateway call web3.resources.list '{}'

echo "3. Consumer租用资源..."
openclaw gateway call web3.market.lease.issue '{...}'

echo "4. 使用资源并结算..."
# ...

echo "5. 查看经济仪表盘..."
open http://localhost:3000/economics
```

---

#### Day 2: Demo视频

**任务**：

- [ ] 录制5分钟产品Demo
- [ ] 展示核心功能
- [ ] 添加字幕和注释

**内容大纲**：

1. **开场**（30秒）：问题与价值主张
2. **Provider发布资源**（1分钟）
3. **Consumer租用使用**（1分钟）
4. **结算与计费**（1分钟）
5. **争议解决**（1分钟）
6. **经济仪表盘**（30秒）
7. **总结**（30秒）

---

#### Day 3: 用户文档

**任务**：

- [ ] 编写`QUICKSTART_USER.md`
- [ ] 编写常见问题FAQ
- [ ] 编写故障排查指南

**输出**：

```markdown
# Web3 Market 快速开始

## 5分钟上手

### 1. 启用扩展

\`\`\`bash
pnpm openclaw plugins enable web3-core
pnpm openclaw plugins enable market-core
\`\`\`

### 2. 配置钱包

\`\`\`bash
/bind_wallet 0xYourAddress
\`\`\`

### 3. 发布资源（作为Provider）

\`\`\`bash
openclaw gateway call web3.resources.publish '{
"type": "model",
"name": "My Local GPT-4",
"pricing": { "pricePerCall": 10 }
}'
\`\`\`

### 4. 租用资源（作为Consumer）

\`\`\`bash
openclaw gateway call web3.resources.list '{}'
openclaw gateway call web3.market.lease.issue '{
"resourceId": "model-gpt4-alice"
}'
\`\`\`

## 常见问题

**Q: 如何查看我的收入？**
A: 访问 `http://localhost:3000/economics`

**Q: 配额用完了怎么办？**
A: 使用 `/credits` 命令查看，或在UI中充值

...
```

---

#### Day 4: API文档

**任务**：

- [ ] 生成API参考文档
- [ ] 补充使用示例
- [ ] 添加错误码说明

**输出**：

```markdown
# Web3 Market API Reference

## Resources

### `web3.resources.publish`

发布新资源到市场。

**参数**:
\`\`\`typescript
{
type: "model" | "search" | "storage";
name: string;
metadata: {
description: string;
version: string;
};
pricing: {
pricePerCall: number;
};
}
\`\`\`

**返回**:
\`\`\`typescript
{
ok: true;
resourceId: string;
cid?: string; // IPFS CID
}
\`\`\`

**错误码**:

- `E_AUTH_REQUIRED`: 缺少身份/会话
- `E_FORBIDDEN`: 权限不足
- `E_INVALID_ARGUMENT`: 参数缺失或无效
- `E_CONFLICT`: 资源ID已存在或状态冲突
- `E_INTERNAL`: 内部错误

**示例**:
\`\`\`bash
openclaw gateway call web3.resources.publish '{
"type": "model",
"name": "My GPT-4",
"metadata": { "description": "Local GPT-4 instance" },
"pricing": { "pricePerCall": 10 }
}'
\`\`\`

...
```

---

#### Day 5: Beta发布

**任务**：

- [ ] 版本打包（v0.1.0-beta）
- [ ] 发布到npm（@openclaw/web3-core, @openclaw/market-core）
- [ ] 更新CHANGELOG
- [ ] 发布公告

**输出**：

```bash
# 1. 版本打包
cd extensions/web3-core
npm version 0.1.0-beta
npm pack

cd ../market-core
npm version 0.1.0-beta
npm pack

# 2. 发布到npm
npm publish --tag beta

# 3. 更新CHANGELOG.md
# v0.1.0-beta (2026-03-27)
## Features
- 核心交易闭环
- 权威账本机制
- 争议解决MVP
- Web UI仪表盘

## Security
- 敏感信息零泄露
- 稳定错误码
- 索引签名验证

## Known Issues
- File存储模式原子性待改进
- Partial release未实现
```

---

### Week 5 交付物

- [x] Demo视频录制完成
- [x] 用户文档齐全
- [x] API文档完整
- [x] v0.1.0-beta发布

---

## 📊 进度跟踪

### 每周检查点

| Week  | 目标            | 验收标准       | 状态      |
| ----- | --------------- | -------------- | --------- |
| **1** | P0修复          | 所有P0测试通过 | ⏳ 待开始 |
| **2** | Dispute + 测试  | E2E测试通过    | ⏳ 待开始 |
| **3** | 监控告警        | 告警规则生效   | ⏳ 待开始 |
| **4** | UI仪表盘        | UI可用且流畅   | ⏳ 待开始 |
| **5** | Demo + Beta发布 | npm包发布成功  | ⏳ 待开始 |

---

### 每日站会议程

**时间**: 每日10:00（15分钟）

**议程**：

1. 昨天完成了什么？
2. 今天计划做什么？
3. 遇到了什么阻碍？

**记录格式**：

```markdown
## 2026-02-21 站会

### Alice

- ✅ 完成: P0-SEC-01 endpoint脱敏
- 📅 今日: P0-SEC-01 错误消息脱敏
- ⚠️ 阻碍: 无

### Bob

- ✅ 完成: 错误码枚举定义
- 📅 今日: 更新web3.\*方法
- ⚠️ 阻碍: 无
```

---

## 🎯 成功标准

### Phase 1完成标准

**必须完成**：

- [ ] P0-SEC-01: 敏感信息零泄露 ✅
- [ ] P0-ERR-01: 稳定错误码 ✅
- [ ] P0-CAP-01: 能力自描述可操作 ✅
- [ ] Dispute机制完整可用 ✅
- [ ] E2E测试通过 ✅

**应该完成**：

- [ ] Web UI仪表盘可用 ✅
- [ ] Demo视频录制完成 ✅
- [ ] 用户文档齐全 ✅
- [ ] Beta版本发布 ✅

**可以推迟**：

- [ ] File存储原子性改进（标注为known issue）
- [ ] Partial release（Phase 2实现）
- [ ] 高级监控告警（Phase 2实现）

---

## 📚 参考资料

### 每日参考文档

- [Web3 Core Dev Guide](/plugins/web3-core-dev)
- [Implementation Progress Report](/IMPLEMENTATION_PROGRESS_REPORT)
- [Web3 Core Plugin](/plugins/web3-core)

### 代码规范

- [OpenClaw Plugin Guide](/tools/plugin)
- [TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

### 测试策略

- [Testing Checklist](/skills/web3-market/references/web3-market-resource-testing.md)

---

## 🚨 风险管理

### 高风险项监控

| 风险             | 缓解措施                 | 负责人 | 状态 |
| ---------------- | ------------------------ | ------ | ---- |
| P0修复工时超预期 | 每日站会跟进，预留buffer | -      | -    |
| Dispute测试复杂  | 分阶段验收，单元测试先行 | -      | -    |
| UI开发资源不足   | 使用Ant Design加速开发   | -      | -    |
| 双存储一致性问题 | 优先SQLite模式           | -      | -    |

---

## 📞 联系方式

**项目负责人**: -  
**技术负责人**: -  
**每日站会**: 10:00（15分钟）  
**周报发送**: 每周五17:00

---

**计划生成时间**: 2026-02-21  
**下次更新**: 每周五（周报）
