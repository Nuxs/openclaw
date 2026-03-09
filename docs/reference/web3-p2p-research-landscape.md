---
summary: "OpenClaw Web3 P2P 协同算力研究索引：论文、开源项目、成功案例、官方链接、摘要与采用价值。"
read_when:
  - You need the research landscape for layer-split and collaborative model compute
  - You want official links for papers, repos, and production-grade systems
  - You are mapping external systems to OpenClaw's Web3 P2P direction
title: "Web3 P2P 协同算力研究索引"
doc_family: "web3"
doc_layer: "reference"
normative: false
---

# Web3 P2P 协同算力研究索引

> **Status**: Research index  
> **Updated**: 2026-03-09  
> **Purpose**: 为 `OpenClaw` 的 P2P 协同算力方向提供一份可持续维护的研究底座，覆盖论文、项目、成功案例、官方链接、摘要与采用判断。

## 1. 如何阅读这份索引

本索引把外部世界的方案分成三类：

### A. 经典模型并行 / 自动切分

这些工作不是直接面向“家庭设备 + 熟人圈 P2P”，但它们奠定了“模型可以被切开并分布到多设备”的技术基础。

代表：`GPipe`、`Megatron-LM`、`Alpa`

### B. 真正接近“多台设备拼成一个完整模型节点”的协同推理

这是最接近用户问题核心的一类：

- 一台设备只承载部分层，或承担部分计算
- 多个节点一起组成完整服务能力
- 节点之间需要路由、调度、容错与传输优化

代表：`Petals`、`SplitLLM`、`exo`、`distributed-llama`

### C. 工业级多节点 Serving / 阶段解耦

这类方案并不总是逐层切分，但它们代表了工业界最现实、最成熟的多节点推理路线。

代表：`DistServe`、`vLLM`、`TensorRT-LLM`

> 对 `OpenClaw` 来说，三类都重要：
>
> - A 类提供理论与切分方法论
> - B 类提供“可信组圈 / 消费级设备协同”的直接灵感
> - C 类提供工业稳定性、SLA 与资源编排的方法

## 2. 核心论文索引

### 2.1 快速总表

| 类型     | 论文                                                                                                | 官方链接                                             | 一句话摘要                                      | 与 OpenClaw 的关系                              |
| -------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| 经典基础 | `GPipe: Efficient Training of Giant Neural Networks using Pipeline Parallelism`                     | [arXiv:1811.06965](https://arxiv.org/abs/1811.06965) | 提出按层切分与 micro-batch 流水线并行           | 是“多机分层”路线的基础范式                      |
| 经典基础 | `Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism`             | [arXiv:1909.08053](https://arxiv.org/abs/1909.08053) | 把超大模型的层内矩阵进一步拆到多 GPU            | 为张量并行与大模型切分提供工业基础              |
| 自动切分 | `Alpa: Automating Inter- and Intra-Operator Parallelism for Distributed Deep Learning`              | [arXiv:2201.12023](https://arxiv.org/abs/2201.12023) | 自动决定切分方式与设备放置                      | 对异构节点自动放置与编排最有启发                |
| 协同推理 | `Petals: Collaborative Inference and Fine-tuning of Large Models`                                   | [arXiv:2209.01188](https://arxiv.org/abs/2209.01188) | 志愿者节点托管不同层，通过 P2P 接力运行超大模型 | 最像“多台电脑拼成一个完整模型节点”              |
| 工业前沿 | `DistServe: Disaggregating Prefill and Decoding for Goodput-optimized Large Language Model Serving` | [arXiv:2401.09670](https://arxiv.org/abs/2401.09670) | 把 `prefill` 与 `decode` 解耦到不同 GPU/节点池  | 对 OpenClaw 的任务分层和阶段路由很有价值        |
| 协同推理 | `SplitLLM: Collaborative Inference of LLMs for Model Placement and Throughput Optimization`         | [arXiv:2410.10759](https://arxiv.org/abs/2410.10759) | 服务器-客户端协同推理，用动态规划做最优放置     | 对“个人电脑子节点 + 上层算力池”的协同分配最贴切 |

## 3. 论文精要与采用判断

### 3.1 `GPipe`

- **官方链接**: [arXiv:1811.06965](https://arxiv.org/abs/1811.06965)
- **定位**: 按层切分 + 流水线并行的基础工作
- **核心摘要**:
  - 把神经网络切成多个连续 `stage`
  - 用 `micro-batch` 让多个设备像流水线一样并行工作
  - 核心价值是：证明“顺序网络可以被系统性拆解到多设备上”
- **对 OpenClaw 的启发**:
  - 这是“分层部署模型”的理论根基
  - 说明“逐层串行接力”本身不是问题，真正的难点在切分边界与通信调度
- **边界**:
  - 主要面向训练
  - 假设网络环境更接近数据中心，而不是强异构 P2P 网络

### 3.2 `Megatron-LM`

- **官方链接**: [arXiv:1909.08053](https://arxiv.org/abs/1909.08053)
- **定位**: 超大 Transformer 的层内/张量并行基石
- **核心摘要**:
  - 不只按层切，还把单层内部的大矩阵乘法切给多个 GPU
  - 是大模型工业训练与高性能推理的重要基础之一
- **对 OpenClaw 的启发**:
  - 说明未来 `OpenClaw` 若承接更强算力池节点，不能只考虑层切分，也要考虑更细粒度切分
- **边界**:
  - 更适合高性能、相对同构的 GPU 集群
  - 不直接解决消费级设备协同的问题

### 3.3 `Alpa`

- **官方链接**: [arXiv:2201.12023](https://arxiv.org/abs/2201.12023)
- **定位**: 自动联合算子间与算子内并行、自动设备放置
- **核心摘要**:
  - 不再只讨论“能不能切”，而是讨论“切哪里、放哪里最划算”
  - 强调自动搜索切分与放置策略
- **对 OpenClaw 的启发**:
  - 对 `OpenClaw` 未来的多节点任务编排、异构调度与自动放置很关键
  - 特别适合启发“算力池 + 个人节点”混合场景的策略引擎
- **边界**:
  - 偏重编译器与自动并行系统
  - 离开放网络、可信圈与经济结算还有距离

### 3.4 `Petals`

- **官方链接**: [arXiv:2209.01188](https://arxiv.org/abs/2209.01188)
- **官方仓库**: [bigscience-workshop/petals](https://github.com/bigscience-workshop/petals)
- **定位**: 互联网/志愿者节点共同托管超大模型不同层，并通过 P2P 网络协同推理与微调
- **核心摘要**:
  - 最接近“每台电脑只放部分层，N 台电脑一起构成完整模型”的现实系统
  - 把超大模型切成多个块，由不同节点托管并接力执行
  - 证明消费级 GPU 与志愿者网络也能承载超大模型交互式使用
- **为什么重要**:
  - 它不是纯论文，而是把这条路线跑通的标志性系统
  - 是 `OpenClaw` 理解“组圈协同托管模型”的第一参考对象
- **对 OpenClaw 的采用价值**:
  - 可借鉴其“节点托管部分层 + 路由执行”的思路
  - 更重要的启发是：`OpenClaw` 不必一开始就自己发明一整套协同推理协议，而可以先聚焦在 **发现、信任、租约、计费、审计** 这些上层协调问题
- **边界**:
  - 对网络延迟非常敏感
  - 开放互联网节点的稳定性、隐私与可信执行问题很重

### 3.5 `DistServe`

- **官方链接**: [arXiv:2401.09670](https://arxiv.org/abs/2401.09670)
- **定位**: 把 `prefill` 与 `decode` 拆到不同 GPU/节点池的工业级 Serving 方案
- **核心摘要**:
  - 不是逐层切分，而是按服务阶段拆分
  - `prefill` 偏吞吐、`decode` 偏低延迟，两者最好不要混在一组资源上
  - 代表了 2024 年后工业界 Serving 的前沿演化方向
- **对 OpenClaw 的采用价值**:
  - 强烈提示 `OpenClaw`：不要把所有 P2P 协同都理解成“逐层推理”
  - 在产品上，可以优先把工作负载分成：
    - 强实时主脑路径
    - 可排队后台路径
    - 可离线批处理路径
- **边界**:
  - 更偏数据中心与 GPU 集群
  - 不直接解决可信组圈或个人设备协同

### 3.6 `SplitLLM`

- **官方链接**: [arXiv:2410.10759](https://arxiv.org/abs/2410.10759)
- **定位**: 服务器-客户端协同推理、最优放置与吞吐优化
- **核心摘要**:
  - 重点在“哪些层应该放在本地，哪些应该放在远端”
  - 用动态规划做放置优化，目标是降低服务器负载并提升总体吞吐
- **为什么重要**:
  - 它不是简单地说“本地 + 云一起算”，而是把“如何分工”作为核心问题来求解
- **对 OpenClaw 的采用价值**:
  - 非常适合启发 `OpenClaw` 的双供给结构：
    - 上层算力池作为远端稳定承载
    - 个人电脑子节点承担本地/边缘计算
  - 对“私人主脑 + 可信圈 + 补峰”路线尤为重要
- **边界**:
  - 仍偏研究前沿
  - 工业成熟度不如 `vLLM` / `TensorRT-LLM`

## 4. 开源项目与成功路径

### 4.1 快速总表

| 项目                | 官方链接                                                                                         | 类型                 | 一句话摘要                                             | 成熟度判断       | 对 OpenClaw 的价值         |
| ------------------- | ------------------------------------------------------------------------------------------------ | -------------------- | ------------------------------------------------------ | ---------------- | -------------------------- |
| `Petals`            | [GitHub](https://github.com/bigscience-workshop/petals)                                          | 公网协同推理         | BitTorrent 式协同托管大模型层                          | 高影响力开源     | 最像“拼完整模型节点”       |
| `exo`               | [GitHub](https://github.com/exo-explore/exo)                                                     | 家庭/局域网 AI 集群  | 把多台日常设备自动组织为本地 AI cluster                | 很前沿，工程感强 | 最适合启发“个人电脑子节点” |
| `distributed-llama` | [GitHub](https://github.com/b4rtaz/distributed-llama)                                            | 家用设备协同推理     | 把家庭设备组成分布式推理集群                           | 强验证、强实验   | 很适合做概念验证样板       |
| `llama.cpp` RPC     | [GitHub](https://github.com/ggml-org/llama.cpp)                                                  | 轻量推理基础设施     | 轻量本地模型生态，具备 RPC backend 能力                | 高成熟基础设施   | 适合作为子节点执行面候选   |
| `vLLM`              | [GitHub](https://github.com/vllm-project/vllm), [Docs](https://docs.vllm.ai/)                    | 工业多节点 Serving   | 支持 tensor/pipeline/data/expert parallel 的分布式推理 | 生产成熟         | 适合算力池节点基座         |
| `TensorRT-LLM`      | [Docs](https://nvidia.github.io/TensorRT-LLM/), [GitHub](https://github.com/NVIDIA/TensorRT-LLM) | 企业级高性能 Serving | 多节点推理、解耦 serving、极致性能优化                 | 工业成熟度高     | 适合高端算力池与基线容量   |

## 5. 项目逐项解读

### 5.1 `Petals`

- **官方仓库**: [bigscience-workshop/petals](https://github.com/bigscience-workshop/petals)
- **官方论文**: [arXiv:2209.01188](https://arxiv.org/abs/2209.01188)
- **项目定位**:
  - `Run LLMs at home, BitTorrent-style`
  - 通过志愿者节点共同承载超大模型
- **成功点**:
  - 证明了分散节点协同托管部分层是可行的
  - 已形成真实开源生态，而非单次演示
- **适合 OpenClaw 学什么**:
  - 节点如何托管部分能力
  - 如何做接力式执行
  - 如何让“不是所有资源都在一台机器上”也能形成统一服务面
- **不应该直接复制什么**:
  - 不建议 `OpenClaw` 一上来就照搬开放公网志愿者网络模型
  - 应优先做可信圈与更强的经济/审计闭环

### 5.2 `exo`

- **官方仓库**: [exo-explore/exo](https://github.com/exo-explore/exo)
- **项目定位**:
  - 把多台日常设备自动组成 AI cluster
  - 重点是局域网 / 家庭 / 实验室多设备协同
- **成功点**:
  - 非常符合“个人电脑作为子节点”的现实场景
  - 说明 Mac、PC 等非专业设备也能形成有价值的协同集群
- **适合 OpenClaw 学什么**:
  - 自动发现与自动并行
  - 消费级设备之间的协同编排
  - “本地优先、靠近用户”的产品体验
- **最适合借鉴的地方**:
  - 作为 `个人电脑子节点` 的执行平面参考，而 `OpenClaw` 自己可以更专注于上层信任、租约和调度

### 5.3 `distributed-llama`

- **官方仓库**: [b4rtaz/distributed-llama](https://github.com/b4rtaz/distributed-llama)
- **项目定位**:
  - 用家庭设备、Mac、迷你机等组成分布式 LLM 推理集群
- **成功点**:
  - 工程验证味很浓，适合快速理解“家用拼模型”到底怎么落地
- **适合 OpenClaw 学什么**:
  - 子节点角色划分
  - 根节点 / worker 协作思路
  - 如何在消费级设备上优先验证系统性可行性

### 5.4 `llama.cpp` RPC 生态

- **官方仓库**: [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp)
- **项目定位**:
  - 轻量、本地优先、跨平台模型推理基础设施
- **重要性**:
  - 主仓库可确认存在 RPC backend 能力
  - 说明其生态具备一定的多机/远程执行扩展基础
- **适合 OpenClaw 学什么**:
  - 把个人设备作为低门槛执行节点
  - 用轻量 runtime 承接本地模型和边缘推理
- **边界**:
  - 它不是一套完整的 P2P 经济网络
  - 更像执行面与生态入口，而不是完整市场/调度/争议系统

### 5.5 `vLLM`

- **官方仓库**: [vllm-project/vllm](https://github.com/vllm-project/vllm)
- **官方文档**: [docs.vllm.ai](https://docs.vllm.ai/)
- **项目定位**:
  - 面向生产的高吞吐 LLM Serving 引擎
  - 明确支持 distributed inference、tensor/pipeline/data/expert parallelism
- **成功点**:
  - 工业成熟度高、生态强、部署与运维实践丰富
- **适合 OpenClaw 学什么**:
  - 作为 `算力池节点` 的执行基座
  - 作为高稳定性主承载层，而不是子节点的唯一形态
- **边界**:
  - 更适合受控集群，不直接提供 P2P 信任与市场闭环

### 5.6 `TensorRT-LLM`

- **官方文档**: [TensorRT-LLM docs](https://nvidia.github.io/TensorRT-LLM/)
- **官方仓库**: [NVIDIA/TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM)
- **项目定位**:
  - 企业级高性能推理框架
  - 支持多节点并行与 `disaggregated serving`
- **成功点**:
  - 代表工业界最极致的性能与工程成熟度之一
- **适合 OpenClaw 学什么**:
  - 阶段解耦思想
  - 把高价值工作负载放在高稳定算力池中
- **边界**:
  - 成本高、硬件前提高
  - 不适合作为“个人电脑子节点”的默认执行面

## 6. 对 OpenClaw 的直接结论

### 6.1 如果目标是“最像用户问题”

优先看：

1. `Petals`
2. `SplitLLM`
3. `exo`
4. `distributed-llama`

### 6.2 如果目标是“最像工业现实”

优先看：

1. `vLLM`
2. `TensorRT-LLM`
3. `DistServe`

### 6.3 如果目标是“最适合 OpenClaw 作为产品切口”

优先顺序建议：

1. **产品判断**：`Petals` + `SplitLLM`
2. **个人节点执行面参考**：`exo` + `distributed-llama` + `llama.cpp`
3. **算力池执行面参考**：`vLLM` + `TensorRT-LLM`
4. **服务分层与工作负载分类**：`DistServe`

## 7. OpenClaw 采用建议

### 7.1 不建议直接复制任何单一项目

原因很简单：

- `Petals` 强在开放网络协同
- `exo` 强在家庭设备组网
- `vLLM` 强在工业 Serving
- `TensorRT-LLM` 强在极致性能

而 `OpenClaw` 的价值不在单点执行，而在：

- 可信组圈
- 租约与计费
- 审计与结算
- 市场与协同层分离
- AI 管家对任务与资源的自动编排

### 7.2 更合理的组合式路线

建议把这些系统当作不同层的参考：

- **理念与形态**：`Petals` / `SplitLLM`
- **个人设备子节点执行参考**：`exo` / `distributed-llama` / `llama.cpp`
- **算力池主承载层**：`vLLM` / `TensorRT-LLM`
- **阶段解耦与工作负载路由**：`DistServe`

## 8. 参考链接清单

### 论文

- [GPipe: Efficient Training of Giant Neural Networks using Pipeline Parallelism](https://arxiv.org/abs/1811.06965)
- [Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism](https://arxiv.org/abs/1909.08053)
- [Alpa: Automating Inter- and Intra-Operator Parallelism for Distributed Deep Learning](https://arxiv.org/abs/2201.12023)
- [Petals: Collaborative Inference and Fine-tuning of Large Models](https://arxiv.org/abs/2209.01188)
- [DistServe: Disaggregating Prefill and Decoding for Goodput-optimized Large Language Model Serving](https://arxiv.org/abs/2401.09670)
- [SplitLLM: Collaborative Inference of LLMs for Model Placement and Throughput Optimization](https://arxiv.org/abs/2410.10759)

### 开源项目 / 官方文档

- [Petals GitHub](https://github.com/bigscience-workshop/petals)
- [exo GitHub](https://github.com/exo-explore/exo)
- [distributed-llama GitHub](https://github.com/b4rtaz/distributed-llama)
- [llama.cpp GitHub](https://github.com/ggml-org/llama.cpp)
- [vLLM GitHub](https://github.com/vllm-project/vllm)
- [vLLM Docs](https://docs.vllm.ai/)
- [TensorRT-LLM GitHub](https://github.com/NVIDIA/TensorRT-LLM)
- [TensorRT-LLM Docs](https://nvidia.github.io/TensorRT-LLM/)

## 相关文档

- [专题总览](/web3/p2p-openclaw-index)
- [战略判断](/web3/p2p-openclaw-thesis)
- [架构落地图](/reference/web3-p2p-openclaw-architecture)
- [验证手册](/reference/web3-p2p-validation-playbook)
- [Web3 Market（概览）](/concepts/web3-market)
- [Web3 Market Dev](/reference/web3-market-dev)
