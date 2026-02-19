### OpenClaw Web3 Market：Phase 1 执行型迭代清单（按周/按模块）

- **版本**: v1.0
- **定位**: 结算链路 + 资源发现冷启动落地
- **前置要求**: 已确认采用外部 ERC-20 作为结算媒介（自有代币后置）

---

## 先行调研：开源方案参考（可复用或对标）

> 仅列可核验的开源仓库/项目入口，作为设计参考。

### A. 结算链路 / Escrow / 租约

- **OpenZeppelin Contracts**（成熟合约库，含支付与资金托管常用范式）: `https://github.com/OpenZeppelin/openzeppelin-contracts`
- **Filecoin Market Actor**（存储租约/结算机制参考）: `https://github.com/filecoin-project/builtin-actors`
- **Akash Network Node**（租约与市场机制参考）: `https://github.com/akash-network/node`

### B. 争议仲裁（链下/链上升级路径）

- **Kleros**（去中心化仲裁协议）: `https://github.com/kleros/kleros`
- **Kleros Cross-chain Arbitration Proxy**: `https://github.com/kleros/cross-chain-arbitration-proxy`
- **Aragon Court（历史实现）**: `https://github.com/sc-forks/aragon-court`

### C. 资源发现 / 索引

- **libp2p Kademlia DHT**（去中心化发现基础设施）: `https://github.com/libp2p/go-libp2p-kad-dht`
- **Open Registry（目录型中心化 Registry 参考）**: `https://github.com/open-services/open-registry`
- **apis.io（API 目录服务参考）**: `https://github.com/apisio/legacy.apis.io`

### D. 数据索引与查询层（可选方案）

- **The Graph（链上数据索引）**: `https://github.com/graphprotocol/docs`
- **SubQuery（索引框架）**: `https://github.com/subquery/subql`

---

## 执行型迭代清单（按周）

### Week 1：结算链路“可闭环”

**模块**: `market-core` / `web3-core`

- **结算协议整理**: 账本写入 → 结算队列 → escrow 操作闭环核对
- **结算一致性校验**: File/SQLite 双存储行为一致性补齐
- **Escrow 适配层**: 与外部 ERC-20 对接参数与失败路径完善

**交付物**:

- 结算链路时序图（链下账本 + 链上 escrow）
- 结算失败/回滚策略说明
- 关键路径测试通过（双存储模式）

### Week 2：资源发现（冷启动最小可用）

**模块**: `web3-core` / 新增 `index-service`（可选轻量服务）

- **资源目录服务 MVP**: Provider 上报 → Consumer 查询
- **资源元数据结构**: 统一字段（资源类型、价格、容量、SLA）
- **索引 API**: `list/search` + `provider heartbeat`

**交付物**:

- 资源发现 API 文档与样例
- Provider 上报与 Consumer 查询跑通

### Week 3：争议仲裁 + 审计锚定

**模块**: `market-core` / `web3-core`

- **争议入口**: `market.dispute.open/resolve`
- **证据锚定**: 争议证据摘要写入审计/锚定管线
- **仲裁策略**: 先链下流程与 SLA，后续可迁移链上仲裁协议

**交付物**:

- 争议流程文档 + 仲裁 SLA
- 争议流程最小闭环测试

### Week 4：监控告警 + Web UI 最小可用

**模块**: `web3-core` / `ui`

- **Metrics 指标**: 结算队列长度、ledger 写入失败、租约失效率、audit/anchor 失败率
- **基础告警**: P0/P1 阈值
- **Web UI**: 状态概览 + 资源管理 + 租约列表 + 账本查询

**交付物**:

- 可观测指标与告警示例
- 最小可用管理台

---

## 执行型迭代清单（按模块）

### 1) `market-core`

- 结算闭环可靠性（双存储模式一致）
- 争议与证据接口扩展
- Escrow 适配层与支付失败处理

### 2) `web3-core`

- Provider 上报资源元数据
- Consumer 查询与租约触发
- 指标与审计对接

### 3) `index-service`（可选新模块）

- 资源目录 API
- Provider 心跳与健康
- 可扩展到 DHT 的存储模型

### 4) `ui`

- 状态概览
- 资源与租约查询
- 账本审计可视化

---

## 下一步建议

- **先行落地 Week 1 + Week 2**，确保结算链路和冷启动入口可跑通。
- 在上线前完成 **争议仲裁 + 监控告警**，以保障可信与可运维。
- 自有代币设计放在 Phase 2，确保有真实需求支撑。
