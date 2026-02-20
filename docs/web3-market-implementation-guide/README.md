# OpenClaw Web3 算力资源共享市场 - 技术实施指南

> **版本**: v2.0 (2026-02-20)  
> **状态**: 评审完成，待开发  
> **适用范围**: Phase 1-3 完整实施方案

---

## 📋 文档导航

### 1. [现有实现评审报告](./01-implementation-review.md)

- ✅ 已实现功能盘点
- ⚠️ 缺失功能清单
- 🐛 发现的问题和风险
- 📊 代码质量评估

### 2. [核心架构设计](./02-architecture-design.md)

- 系统整体架构
- 模块职责划分
- 数据流设计
- 接口规范

### 3. [P2P 网络发现机制](./03-p2p-discovery.md)

- libp2p 技术选型
- DHT 节点发现
- NAT 穿透方案
- 连接管理

### 4. [沙箱隔离技术方案](./04-sandbox-isolation.md)

- Docker 容器隔离
- gVisor 用户态内核
- Seccomp 系统调用过滤
- 资源限制与监控

### 5. [争议仲裁流程](./05-dispute-arbitration.md)

- 自动仲裁引擎
- DAO 投票机制
- 专家小组仲裁
- 证据管理

### 6. [本地模型接入方案](./06-local-model-integration.md)

- llama.cpp 集成
- vLLM 高性能推理
- 模型缓存优化
- GPU 资源调度

### 7. [详细开发计划](./07-development-roadmap.md)

- Phase 1: 基础设施对齐 (4周)
- Phase 2: 代币消费闭环 (5周)
- Phase 3: 算力市场网络 (12周)
- 开发时间线与里程碑

### 8. [安全与合规](./08-security-compliance.md)

- 安全威胁模型
- 防护措施清单
- 审计要求
- 合规性检查

### 9. [测试策略](./09-testing-strategy.md)

- 单元测试覆盖
- 集成测试场景
- E2E 测试用例
- 性能测试基准

### 10. [运维手册](./10-operations-manual.md)

- 部署流程
- 监控告警
- 故障排查
- 容量规划

---

## 🎯 核心目标

OpenClaw Web3 算力市场旨在实现：

1. **去中心化脑切换 (B-1)**
   - 用户可选择中心化或去中心化 LLM 服务
   - 智能回退机制确保服务可用性
   - 透明的使用记录与审计

2. **算力资源共享 (B-2)**
   - 用户出租闲置电脑/服务器赚取代币
   - 用户购买他人算力支付代币
   - 公平透明的市场撮合机制

3. **安全与可信**
   - 沙箱隔离防止恶意代码
   - 争议仲裁保障交易公平
   - 链上结算确保资金安全

---

## 📊 项目现状概览

### ✅ 已完成 (约 60%)

| 模块                       | 完成度 | 说明                             |
| -------------------------- | ------ | -------------------------------- |
| **market-core**            | 80%    | 基础 offer/order/settlement 完整 |
| **web3-core**              | 70%    | 钱包认证、审计、账单基础完成     |
| **resolve_stream_fn hook** | 100%   | B-1 核心 hook 已实现并测试       |
| **资源元数据模型**         | 90%    | MarketResource 类型定义完整      |
| **租约管理**               | 85%    | lease issue/revoke/expire 已实现 |
| **账本记录**               | 75%    | ledger append/list 已实现        |

### ⚠️ 待开发 (约 40%)

| 模块                   | 优先级 | 工作量  |
| ---------------------- | ------ | ------- |
| **Provider HTTP 路由** | P0     | 3-5天   |
| **Consumer Tools**     | P0     | 2-3天   |
| **结算闭环**           | P0     | 5-7天   |
| **P2P 网络**           | P1     | 10-14天 |
| **沙箱执行**           | P1     | 7-10天  |
| **争议仲裁**           | P2     | 7-10天  |
| **监控告警**           | P2     | 3-5天   |

---

## 🚦 风险与阻塞项

### 🔴 上线阻断项 (必须解决)

1. **Gate-SETTLE-01**: 结算闭环不完整
   - `queuePendingSettlement` 缺少 `orderId` 字段
   - `flushPendingSettlements` 未实现

2. **Gate-LEDGER-02**: 模型调用无 Provider 权威记账
   - `/web3/resources/model/chat` 未调用 `market.ledger.append`
   - 无法追溯资源消耗

3. **Gate-ATOMIC-01**: 多对象写入非原子性
   - SQLite 未使用事务
   - File 模式未加锁

4. **Gate-TEST-01**: 关键路径缺少测试
   - `web3.status.summary` 无测试
   - 结算刷新无测试
   - 原子性回滚无测试

### 🟡 高风险项 (需关注)

1. **NAT 穿透成功率**
   - 家庭网络节点可能无法被外网访问
   - 需要中继节点或 WebRTC 方案

2. **沙箱逃逸风险**
   - Docker 容器隔离可能被绕过
   - 建议使用 gVisor 加强隔离

3. **争议仲裁公平性**
   - 自动仲裁可能误判
   - DAO 投票可能被操纵

---

## 📅 建议实施顺序

### 阶段 0: 修复阻塞项 (1-2周) ⚠️ **必须先行**

1. 补齐结算闭环 (`queuePendingSettlement` + `flushPendingSettlements`)
2. 添加模型调用记账逻辑
3. 实现原子性事务/锁
4. 补充关键路径测试

**验收标准**: 所有 Gate-\* 阻塞项通过

---

### 阶段 1: Provider 路由与 Consumer 工具 (2-3周)

**目标**: 让用户可以发布资源并调用他人资源

#### Week 1: Provider HTTP 路由

- `/web3/resources/list` - 资源列表
- `/web3/resources/model/chat` - 模型推理 (流式)
- `/web3/resources/search/query` - 搜索服务
- `/web3/resources/storage/put|get|list` - 存储服务

#### Week 2: Consumer Tools

- `web3.search.query` - 调用搜索资源
- `web3.storage.put/get/list` - 调用存储资源
- `web3.model.chat` - 调用模型资源 (可选，通过 brain 切换)

#### Week 3: 集成测试

- 本地双实例测试 (Provider + Consumer)
- Token 认证与租约验证
- 账本记录完整性

**交付物**:

- ✅ Provider 可启动 HTTP 服务暴露资源
- ✅ Consumer 可通过 Tools 调用远程资源
- ✅ 每次调用有 ledger 记录

---

### 阶段 2: P2P 网络与节点发现 (3-4周)

**目标**: 实现去中心化的资源发现

#### Week 1: libp2p 基础设施

- 集成 libp2p (tcp + noise + mplex)
- 实现引导节点连接
- 搭建 3 个公网引导节点

#### Week 2: DHT 节点发现

- 实现 Kademlia DHT
- 节点能力发布到 DHT
- 根据能力查询节点

#### Week 3: NAT 穿透

- UPnP 自动端口映射
- Circuit Relay 中继节点
- WebRTC 直连 (可选)

#### Week 4: 测试与优化

- 测试 NAT 穿透成功率
- 优化 DHT 查询延迟
- 节点连接稳定性测试

**交付物**:

- ✅ 节点自动加入 P2P 网络
- ✅ 支持 llama3-70b 的节点可被发现
- ✅ NAT 穿透成功率 > 80%

---

### 阶段 3: 沙箱隔离与安全加固 (2-3周)

**目标**: 确保任务执行安全可靠

#### Week 1: Docker 沙箱

- 构建最小化执行镜像
- 实现资源限制 (CPU/Memory/GPU)
- 网络完全隔离

#### Week 2: Seccomp + gVisor

- 编写 Seccomp 规则文件
- 集成 gVisor 运行时
- 测试沙箱逃逸防护

#### Week 3: 监控与告警

- 容器资源使用监控
- 异常行为检测 (网络流量、文件访问)
- P0/P1 告警规则

**交付物**:

- ✅ 任务在完全隔离的容器中执行
- ✅ 恶意代码无法访问宿主机
- ✅ 异常行为触发告警

---

### 阶段 4: 争议仲裁 (2-3周)

**目标**: 建立公平的纠纷解决机制

#### Week 1: 自动仲裁引擎

- 可验证证明检查
- 任务重现执行
- 规则引擎判断

#### Week 2: DAO 投票机制

- 创建争议提案
- Token 持有者投票
- 执行投票结果

#### Week 3: 测试与文档

- 模拟各类争议场景
- 编写仲裁操作手册
- 用户争议指南

**交付物**:

- ✅ 70%+ 争议可自动解决
- ✅ 复杂争议可提交 DAO 投票
- ✅ 完整的争议处理文档

---

### 阶段 5: 本地模型接入 (2-3周)

**目标**: 支持用户出租本地 LLM 算力

#### Week 1: llama.cpp 集成

- 编译 llama.cpp (CPU + CUDA)
- 实现 Node Agent 调用
- 模型预加载优化

#### Week 2: vLLM 集成 (可选)

- 安装 vLLM 推理引擎
- 实现批处理推理
- GPU 资源调度

#### Week 3: 性能优化

- 模型缓存策略
- 并发请求管理
- 延迟与吞吐优化

**交付物**:

- ✅ 支持 llama.cpp 模型
- ✅ 支持 vLLM 高性能推理 (可选)
- ✅ 推理延迟 < 5s (小模型)

---

### 阶段 6: 监控与 Web UI (1-2周)

**目标**: 提供可观测性和管理界面

#### Week 1: 指标与告警

- Metrics: 结算队列、ledger 写入、租约失效率
- 日志聚合与查询
- Prometheus + Grafana 仪表盘

#### Week 2: Web UI

- 状态概览 (`/web3/status`)
- 资源管理 (发布/下线)
- 租约列表与账本查询

**交付物**:

- ✅ 关键指标可视化
- ✅ 最小可用管理台
- ✅ 告警及时触发

---

## 📐 架构设计原则

1. **模块化**: 每个功能独立模块，易于测试和替换
2. **渐进式**: 优先实现 MVP，后续迭代增强
3. **兼容性**: 不破坏现有 `/pay_status` 等功能
4. **安全性**: Token/Endpoint 零泄露，链上结算可审计
5. **可运维**: 提供充分的监控、日志和告警

---

## 🔗 相关资源

- [WEB3-ROADMAP.md](../WEB3-ROADMAP.md) - 原始路线图
- [plan.md](../plan.md) - 项目总体计划
- [web3-market-resource-implementation-checklist.md](../../skills/web3-market/references/web3-market-resource-implementation-checklist.md) - 实施检查清单
- [web3-brain-architecture.md](../../skills/web3-market/references/web3-brain-architecture.md) - 详细架构设计 (84KB)

---

## 📧 联系与反馈

如有问题或建议，请通过以下方式联系：

- 提交 Issue 到项目仓库
- 发送邮件至项目负责人
- 在技术讨论群中提问

---

**最后更新**: 2026-02-20  
**文档维护**: OpenClaw 开发团队
