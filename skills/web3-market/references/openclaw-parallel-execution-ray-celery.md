### OpenClaw 并联多设备执行方案（Ray 主线 + Celery 补充）

- **版本**: v1.0
- **目标**: 多台设备并行执行（Mac mini / 个人设备 / NPU / TPU）
- **范围**: LLM 推理 + 搜索 + 存储（混合负载）

---

## 1) 总体架构（Ray 主线 + Celery 补充）

**Ray** 负责“在线、强并行、资源感知”的任务：

- LLM 推理（低延迟、高并行）
- 搜索任务（并行检索、向量查询）
- 需要资源标签的任务（GPU/NPU/TPU/Metal）

**Celery** 负责“离线、异步、低时效”任务：

- 资源索引同步
- 日志/审计归档
- 冷数据迁移
- 定时巡检

> 原则：实时路径走 Ray，后台路径走 Celery。

---

## 2) 设备标签与能力描述标准（建议）

**统一标签字段**（用于任务路由与资源匹配）：

- `device.type`: `macmini` | `pc` | `server` | `npu` | `tpu` | `gpu` | `cpu`
- `capability`: `llm` | `search` | `storage` | `index` | `audit`
- `accel`: `metal` | `cuda` | `tpu` | `npu` | `none`
- `latency`: `low` | `medium` | `high`
- `availability`: `always` | `burstable` | `spot`

**示例标签**:

- Mac mini 推理节点
  - `device.type=macmini`
  - `capability=llm,search`
  - `accel=metal`
  - `latency=low`

- 个人设备存储节点
  - `device.type=pc`
  - `capability=storage`
  - `accel=none`
  - `latency=medium`

---

## 3) 任务路由规则（Ray / Celery）

### Ray 任务路由

- **规则 1**：`capability=llm` → Ray
- **规则 2**：`capability=search` → Ray
- **规则 3**：`latency=low` → Ray

### Celery 任务路由

- **规则 1**：`capability=index` → Celery
- **规则 2**：`capability=audit` → Celery
- **规则 3**：`latency=high` → Celery

---

## 4) 与 OpenClaw 模块对接清单

### `web3-core`

- 任务执行入口改为：调度器路由（Ray / Celery）。
- 任务元数据：附带设备标签、资源需求。

### `market-core`

- 租约中新增资源能力标签，绑定任务调度策略。
- 账本记录增加 `device.type` 与 `capability`。

### `provider-web`

- Provider 上报自身能力（设备标签 + SLA + 资源容量）。

### `ui`

- 资源节点显示：按能力聚合展示。
- 任务追踪：区分 Ray / Celery 执行路径。

---

## 5) 扩展到 C/D 路径的兼容设计

- **兼容 Nomad / K3s**：
  - 设备标签映射为资源配额与节点标签。
  - 调度层替换不影响上层 `capability` 描述。

---

## 6) 冷启动落地建议

- **第一步**：优先在 Mac mini + 个人设备中跑通 Ray 任务。
- **第二步**：Celery 承接后台异步任务。
- **第三步**：逐步引入 Nomad/K3s 作为扩展层。

---

### ✅ 小结

本方案以 **Ray 作为实时并行主线**，Celery 承担异步补充，确保冷启动阶段即可跨设备并行执行，并保留向 Nomad/K3s 扩展的空间。
