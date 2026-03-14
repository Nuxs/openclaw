# OpenClaw `steward-topology` 第二阶段设计稿

## 1. 设计结论

第二阶段不应继续把“6 台机器怎么分配角色”硬编码在 `market-assistant` 或 `web3-core` 的分支里。

应当把系统升级为：

- **产品形态**：OpenClaw Private Steward Network OS
- **决策主体**：主脑 + `steward-topology` skill
- **扩展定位**：只固化机制层、事实层、原子动作和可验证状态
- **拓扑生成方式**：基于设备清单、目标、约束、当前健康度动态规划

一句话：

> **让 OpenClaw 用主脑思维理解“我有什么设备、我想达成什么目标、现在网络状态如何”，再生成和执行拓扑；而不是把拓扑写死成几句关键词和几个固定角色。**

---

## 2. 当前事实、第二阶段增量、目标态

### 2.1 当前仓库事实

当前 repo 已有这些真实能力：

- `web3.market.preset.preview`
- `web3.market.preset.verify`
- `config.get` / `config.apply`
- `market.status.summary`
- `web3.monitor.health`
- `web3.index.stats`
- `market-assistant` 的部署/回滚/验证入口

但当前实现仍然偏向：

- **单节点本地预设**
- **关键词驱动意图解析**
- **当前节点自我配置**
- **本地验证，不是全网编排**

### 2.2 第二阶段应新增什么

第二阶段的核心增量不是“更多硬编码模式”，而是：

1. **主脑可消费的结构化设备清单**
2. **跨节点事实采集**
3. **基于策略的角色分配与重分配**
4. **按节点分步 apply / verify / rollback**
5. **单机到多机的统一规划模型**

### 2.3 目标态

目标态不是“一个新的 Web3 控制台”，而是：

- 用户只和主脑说话
- 主脑通过 skill 盘点现有设备
- 主脑自动判断应该是单机、可信圈还是混合云边
- 主脑生成 per-node desired state
- 扩展只负责提供：读事实、改配置、验状态、执行业务权威逻辑

---

## 3. 核心原则

### 3.1 Extension = Mechanism, AI = Policy

这是第二阶段的总原则。

- **AI / 主脑 / skill 负责**：
  - 理解用户目标
  - 收集设备信息
  - 识别约束
  - 决定角色分配
  - 决定 apply 顺序
  - 决定何时回滚 / 降级 / 重分配

- **Extension 负责**：
  - 返回结构化事实
  - 提供原子动作
  - 维护 `market.*` 权威状态机
  - 应用最小配置补丁
  - 提供健康与验证结果

### 3.2 拓扑是输出，不是输入

当前 `single-node` / `trusted-circle` / `hybrid-cloud-edge` 仍然有价值，但在第二阶段里它们应当变成：

- planner 的**摘要标签**
- rollout 的**结果说明**
- UI 的**展示文案**

而不是系统决策唯一入口。

真正的决策输入应是：

- 设备数量与类型
- 是否 always-on
- GPU/CPU/内存
- 本地或远程网络可达性
- 用户的主要工作面
- 成本/时延/隐私/SLA 偏好
- 当前已有的 OpenClaw / runtime / provider 状态

### 3.3 单机是统一模型的 \(N=1\) 情况

如果用户只有一台设备，不应该让产品显得“功能残缺”。

第二阶段应直接把：

- control
- authority
- consumer
- optional provider

折叠到一个本地节点上。

这意味着：

- 单机模式不是“降级版”
- 单机模式是 Private Steward 的最小可用闭环
- 多机组网只是单机闭环的扩展，不是前提

---

## 4. 第二阶段系统架构

### 4.1 四层结构

#### A. 主脑层（Brain）

负责：

- 理解自然语言目标
- 调用 `steward-topology` skill
- 维护与用户的澄清对话
- 在必要时要求确认高风险动作

#### B. Skill 层（Policy Runtime）

`steward-topology` 负责：

- 构建设备清单
- 调用各节点原子能力采集事实
- 推导目标拓扑
- 输出 role matrix
- 组织 apply sequence
- 汇总 verify 结果
- 当事实变化时执行 rebalance

#### C. Control / Mechanism 层（`web3-core`）

负责：

- 节点配置读写
- runtime probe
- deployment preview/apply/verify
- discovery / index / monitor / resource façade
- 对外统一 `web3.*` 契约

#### D. Authority 层（`market-core`）

负责：

- 资源、订单、租约、账本、结算、争议
- 权威状态机
- 可审计、可验证的写路径

---

## 5. 设备模型与规划输入

第二阶段应围绕一个统一的 **Machine Inventory** 抽象。

每个节点至少要能表达这些信息：

- `label`
- `os`
- `hardware.cpu`
- `hardware.gpu`
- `hardware.memoryGb`
- `availability`（always-on / daily / burst）
- `reachability`（local / tailscale / public / restricted）
- `trustTier`（personal / trusted / hosted / untrusted）
- `installed`（是否已装 OpenClaw）
- `plugins`（是否启用 `web3-core` / `market-core`）
- `runtimes`（Ollama / provider HTTP / none）
- `currentRoleHints`
- `health`

Planner 的输入不应该只是一句“给我混合云边”，而应是：

- **用户目标**：日常聊天、模型推理、部署控制、节省成本、提高 SLA
- **设备清单**
- **约束**：不暴露公网、只在可信圈、预算有限、尽量本地优先
- **当前状态**：哪些节点已经运行、哪些节点可用但未配置

---

## 6. 角色模型

第二阶段建议的角色是组合式的，而不是单一硬编码枚举。

### 6.1 基础角色

- `control`
- `authority`
- `consumer-primary`
- `provider-primary`
- `provider-secondary`
- `relay-index-monitor`
- `hybrid-edge`

### 6.2 角色分配启发式

- **控制面**优先放在用户日常使用最频繁的机器
- **权威面**优先放在 always-on、稳定、网络较好的机器
- **主 Provider**优先放在 GPU/算力最强的机器
- **辅助节点**优先承担 relay / index / monitoring / fallback
- **第二台个人设备**优先从 consumer-first 开始，而不是立刻承担 authority

### 6.3 重要约束

- 同一节点可以同时承载多个角色
- 角色应该由 planner 组合生成，而不是静态写死
- 如果设备减少到 1 台，角色自动折叠
- 如果新增设备，角色自动重算

---

## 7. 六台机器场景：目标态规划口径

对于你当前这类拓扑，第二阶段 planner 最可能产出的建议是：

- **Mac mini**：`control + consumer-primary`
- **Windows 7950X3D + 3080Ti**：`provider-primary`
- **云服务器 A**：`authority + bootstrap/fallback discovery`
- **云服务器 B/C**：`provider-secondary + relay-index-monitor`
- **第二台 Windows**：先 `consumer-first`，后续根据稳定性提升为 `hybrid-edge`

但关键点是：

> 这不应写死在代码里，而应写成 planner 的 **当前最优输出**。

只要下面任一条件变了，planner 就应重算：

- Mac mini 不是主控机了
- GPU Windows 不再在线
- 云 A 不稳定
- 第二台 Windows 新装了可用 runtime
- 用户从“性能优先”改成“隐私优先”

---

## 8. 单设备场景：目标态规划口径

如果用户只有一台设备，第二阶段应该给出：

- **默认拓扑**：local-first single steward
- **默认角色**：`control + authority + consumer-primary + optional provider`
- **默认原则**：先本地可用，再谈共享与市场

推荐行为：

- 默认关闭多机 discovery
- 默认不强推 market publication
- 默认不要求 authority 外置
- 优先确保聊天、配置、诊断、本机调用闭环可用

这才符合 OpenClaw 的思维：

> **先让用户拥有一个可靠的私人管家，再逐步把它扩展成一张网络。**

---

## 9. 主脑 + skill 工作流

第二阶段建议的标准工作流如下：

### Step 1. Inventory

主脑先盘点：

- 有几台设备
- 每台设备是什么类型
- 哪些常在线
- 哪些能跑模型
- 哪些已经装 OpenClaw
- 哪些是用户最常交互的入口

### Step 2. Goal capture

主脑明确用户目标：

- 日常聊天入口放哪
- 主推理放哪
- 权威账本放哪
- 是否要公网或只走可信圈
- 是性能优先还是隐私优先

### Step 3. Planning

skill 输出：

- topology family
- per-node role matrix
- config delta per node
- apply order
- verify checklist
- rollback points

### Step 4. Approval gate

对于高风险动作，主脑要求明确确认：

- 改配置
- 开启市场共享
- 暴露 provider listen
- 启用 discovery / bootstrap
- 远程对其它节点下发配置

### Step 5. Apply

优先顺序：

1. authority / bootstrap
2. primary provider
3. secondary nodes
4. consumer routing
5. monitoring and verification

### Step 6. Verify

至少验证：

- authority 可用
- provider 已发布资源
- consumer 能发现 provider
- 能完成一次租约 / 调用 / 计量 / 结算
- 告警与降级路径存在

### Step 7. Rebalance

以下情况触发重分配：

- 节点新增 / 下线
- health 退化
- 用户目标变化
- 网络 reachability 变化
- 成本策略变化

---

## 10. 扩展层应补的最小机制面

第二阶段不建议把 planner 塞回 extension；但 extension 需要补足主脑所需的事实与动作接口。

建议新增或重构成这些 **原子机制**：

### 10.1 `web3.node.snapshot`

返回单节点事实快照，例如：

- OS / 硬件 / 运行时
- OpenClaw 插件状态
- 当前配置摘要
- 健康状态
- 当前已发布资源 / discovery / provider listen / consumer posture

### 10.2 `web3.node.runtime.probe`

以结构化方式探测：

- Ollama
- OpenAI-compatible provider HTTP
- 其他本地推理后端

### 10.3 `web3.node.desired-state.preview`

根据某个角色意图返回最小 config patch，但**不包含策略决策**。

### 10.4 `web3.node.desired-state.apply`

按 preview 结果落地配置，并返回：

- 已写入项
- 待重启项
- 本地校验结果
- 回滚点

### 10.5 `web3.topology.verify`

汇总多节点验证结果，回答的不是“本机健康”，而是：

- 这张拓扑现在是否满足目标
- 哪个节点是瓶颈
- 哪个角色缺位
- 如何降级仍能工作

### 10.6 `web3.topology.state.get`

返回当前 desired vs actual 的差异，供主脑做 drift detection。

---

## 11. 为什么不继续扩展 `market-assistant`

因为 `market-assistant` 当前最适合做的是：

- 兼容入口
- 临时桥接
- 简单单节点操作

而不适合做：

- 跨 6 台机器的全局规划器
- 基于实时 inventory 的重分配器
- 长期演进的 fleet policy runtime

继续往里堆会带来这些问题：

- 关键词规则膨胀
- role mapping 越写越死
- extension 既做事实又做策略
- 后续更难演进成真正的主脑编排

因此第二阶段正确做法是：

- 保留 `market-assistant` 作为兼容入口
- 把复杂规划逻辑迁到 skill
- 把 extension 收敛到事实/动作/验证接口

---

## 12. 第二阶段实施建议

### P0：先把方向掰正

- 新建 `steward-topology` skill
- 在 skill 中明确：拓扑规划属于主脑 policy
- 明确单机到多机统一模型

### P1：补最小机制接口

- 节点快照
- runtime probe
- desired-state preview/apply
- topology verify

### P2：让主脑能盘点多节点

- 先支持手工 inventory + 主脑规划
- 再支持半自动 facts collection
- 最后支持跨节点 apply/verify

### P3：闭环六台机器场景

验收以真实链路为准：

- Mac 发起
- Windows GPU 承接
- 云 A 作为 authority / bootstrap
- B/C 提供 fallback / monitor
- 第二台 Windows 加入后可自动重分配

### P4：把单机体验做到极致

- 单机安装后即可成为“可用私人管家”
- 多机扩展只是增强，不是前置依赖

---

## 13. 第二阶段的验收标准

只有同时满足以下条件，才算接近“成熟 AI 私人管家网络操作系统”：

1. **一台设备可用**：无需组网即可形成最小闭环
2. **六台设备可重分配**：新增/下线节点后可重算拓扑
3. **主脑驱动**：用户通过聊天表达目标，不需要记硬编码术语
4. **扩展不过度膨胀**：策略不塞进 extension
5. **全网验证**：能验证拓扑目标是否达成，而非只看单机健康
6. **可回滚**：任一步失败都能退回稳定态

---

## 14. 结语

第二阶段真正要做的，不是把 `trusted-circle` / `hybrid-cloud-edge` 再扩成更多枚举，而是把 OpenClaw 从“会切预设的本地助手”推进成：

> **能理解你的设备世界、能根据目标自动编排、能持续验证和重分配的 Private Steward Network OS。**

这条路最符合 OpenClaw 自身的架构哲学：

- 主脑负责理解与决策
- skill 负责流程化策略
- extension 负责机制、事实与权威执行
