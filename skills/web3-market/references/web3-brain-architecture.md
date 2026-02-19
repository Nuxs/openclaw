### OpenClaw Web3 主脑切换工业级开发文档（v2 — 基于代码评审修订）

---

### **文档目标**

- **目标**：实现"主脑切换 → Web3 去中心化模型作为主脑 → 结算与状态可追踪"的闭环链路；后续支撑"用户本地模型/搜索/存储通过 Web3 平台共享给其他用户"。
- **范围**：Core 层 hook 扩展 + `web3-core` 与 `market-core` 插件适配；主脑候选注册、推理路径接入、结算绑定、状态汇总与回退策略。
- **原则**：可降级、可回滚；`market-core` 为结算权威；失败不阻断对话链路。

---

### **一、技术选型与依据**

#### **1.1 选型结论：路径 B（核心扩展）— 新增 `resolve_stream_fn` hook**

| 路径            | 做法                                                         | 适用场景                                 | 局限                                          |
| --------------- | ------------------------------------------------------------ | ---------------------------------------- | --------------------------------------------- |
| **A. 配置式**   | `models.json` 预注册 provider + `before_model_resolve` 切换  | 固定 baseUrl + OpenAI API 兼容           | 不支持动态多节点、自定义协议、非 LLM 资源共享 |
| **B. 核心扩展** | 新增 `resolve_stream_fn` hook，允许插件提供自定义 `StreamFn` | 动态节点发现、自定义协议、多用户资源共享 | 需要修改 Core 层（约 30 行）                  |

**选 B 的原因**：

- 后续要支撑"用户自配本地模型/搜索/存储 → 通过 Web3 平台共享给其他用户"，端点地址不固定、协议可能不兼容 OpenAI API。
- 路径 A 只能处理固定 baseUrl + 兼容 API 的场景，无法满足动态多节点与自定义传输需求。
- 路径 B 侵入性可控：仅在 `attempt.ts` 的 `StreamFn` 分配前插入一个 hook 调用点。

#### **1.2 分步实施策略（本轮一起开发）**

| 阶段                | 做法                                                                                     | 价值                                 |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| **B-1（本轮）**     | 新增 `resolve_stream_fn` hook + `before_model_resolve` 接入                              | 打通"去中心化模型作主脑"最小闭环     |
| **B-2（本轮并行）** | 资源共享平台（模型 + 搜索 + 存储）：资源发布/发现/租用、ACL、结算绑定、消费侧工具/流接入 | 支撑"用户把自己的资源开放给别的用户" |

---

### **二、架构设计**

#### **2.1 组件与职责**

| 组件                                    | 职责                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **OpenClaw Core**                       | 主脑切换策略、会话管理、hook 调度、回退触发                                                                 |
| **Core 新增：`resolve_stream_fn` hook** | 允许插件提供自定义 `StreamFn`，替代默认的 `streamSimple`/`createOllamaStreamFn`                             |
| **`web3-core`**                         | 主脑候选注册（`before_model_resolve`）、自定义推理传输（`resolve_stream_fn`）、状态汇总、结算入口绑定、审计 |
| **`market-core`**                       | 结算权威状态与资金状态来源                                                                                  |
| **去中心化推理节点**                    | 用户提供的本地/远程模型端点（协议不限）                                                                     |

#### **2.2 数据流（闭环视角）**

```
用户请求 → before_model_resolve (web3-core 动态选择 provider/model)
         → resolve_stream_fn   (web3-core 提供自定义 StreamFn，连接去中心化节点)
         → LLM 推理（走自定义 StreamFn）
         → llm_output          (web3-core 审计 + 计费扣减)
         → session_end         (web3-core 结算绑定)
         → web3.status.summary / /pay_status (展示对齐)
```

- **入口态**：`before_model_resolve` 将 provider/model 切换到 Web3 去中心化节点。
- **传输态**：`resolve_stream_fn` 返回自定义 `StreamFn`，直接与去中心化节点通信。
- **运行态**：`before_tool_call` 预检结算/credits；`llm_output` 审计 + 扣费。
- **结算态**：`session_end` 汇总 usage → 触发结算绑定（fire-and-forget，需兜底）。
- **展示态**：`web3.status.summary` 与 `/pay_status` 统一输出主脑来源与结算状态。

#### **2.3 失败回退策略**

| 场景                       | 处理                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| 去中心化节点不可达         | `resolve_stream_fn` 返回 null → 走默认 `streamSimple`（回退中心化） |
| 未获得有效租约或无人接单   | `before_model_resolve` 不覆写 → 走默认中心化主脑                    |
| 结算/credits 不足          | `before_tool_call` 降级提示，不阻断对话                             |
| allowlist 未命中           | `before_model_resolve` 不覆写 → 走默认中心化主脑                    |
| `session_end` 结算写入失败 | fire-and-forget 限制；需异步重试队列兜底                            |

---

### **三、Core 层改动（B-1 阶段）**

#### **3.1 新增 hook 类型（`src/plugins/types.ts`）**

```typescript
// --- 新增 ---
export type PluginHookResolveStreamEvent = {
  provider: string; // 当前选中的 provider
  modelId: string; // 当前选中的 model
  modelApi: ModelApi; // 当前 API 类型（openai-completions 等）
  baseUrl?: string; // 当前 provider 的 baseUrl
};

export type PluginHookResolveStreamResult = {
  streamFn?: StreamFn; // 如果返回，则替代默认的 streamSimple/ollamaStreamFn
};
```

在 `PluginHookName` union 中新增 `"resolve_stream_fn"`。

#### **3.2 hook 调用点（`src/agents/pi-embedded-runner/run/attempt.ts`）**

在当前 `StreamFn` 分配逻辑**之前**插入：

```typescript
// --- 新增：允许插件提供自定义 StreamFn ---
const streamOverride = await hookRunner.runResolveStream(
  {
    provider: params.model.provider,
    modelId: params.model.id,
    modelApi: params.model.api,
    baseUrl: params.model.baseUrl,
  },
  hookCtx,
);

if (streamOverride?.streamFn) {
  activeSession.agent.streamFn = streamOverride.streamFn;
} else if (params.model.api === "ollama") {
  // 原有逻辑
  activeSession.agent.streamFn = createOllamaStreamFn(ollamaBaseUrl);
} else {
  activeSession.agent.streamFn = streamSimple;
}
```

#### **3.3 hook 执行器（`src/plugins/hooks.ts`）**

新增 `runResolveStream` 方法，使用 `runModifyingHook`（串行、按优先级、错误不阻断）。

#### **3.4 涉及 Core 文件清单**

| 文件                                           | 改动                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `src/plugins/types.ts`                         | 新增 `PluginHookResolveStreamEvent/Result` 类型，扩展 `PluginHookName` |
| `src/plugins/hooks.ts`                         | 新增 `runResolveStream` 方法                                           |
| `src/agents/pi-embedded-runner/run/attempt.ts` | 在 StreamFn 分配前插入 hook 调用                                       |
| `src/plugins/runtime/types.ts`                 | 新增 `on("resolve_stream_fn", ...)` 类型签名（如需类型安全）           |

---

### **四、`web3-core` 插件改动**

#### **4.1 新增 `before_model_resolve` hook（动态主脑切换）**

当前 `web3-core` 完全没有注册 `before_model_resolve`。需新增：

```typescript
// extensions/web3-core/src/index.ts
api.on(
  "before_model_resolve",
  (event, ctx) => {
    const brainConfig = resolveConfig(api.pluginConfig).brain;
    if (!brainConfig?.enabled) return {};

    // 检查 allowlist
    const allowed = brainConfig.allowlist?.includes(brainConfig.defaultModel);
    if (!allowed) return {};

    // 检查可用性（可选：探测节点）
    return {
      providerOverride: brainConfig.providerId,
      modelOverride: brainConfig.defaultModel,
    };
  },
  { priority: 10 },
);
```

#### **4.2 新增 `resolve_stream_fn` hook（自定义推理传输）**

```typescript
// extensions/web3-core/src/index.ts
api.on(
  "resolve_stream_fn",
  (event, ctx) => {
    const brainConfig = resolveConfig(api.pluginConfig).brain;
    if (!brainConfig?.enabled) return {};
    if (event.provider !== brainConfig.providerId) return {};

    // 返回自定义 StreamFn，连接去中心化节点
    return {
      streamFn: createWeb3StreamFn(brainConfig),
    };
  },
  { priority: 10 },
);
```

`createWeb3StreamFn` 实现自定义 HTTP/WebSocket/P2P 传输，连接去中心化模型节点。

#### **4.3 配置扩展（`extensions/web3-core/src/config.ts`）**

在现有 `Web3PluginConfig` 中新增 `brain` 配置节（与现有 `chain/storage/privacy/identity/billing` 并列）：

```typescript
brain: {
  enabled: boolean;           // 是否启用 Web3 去中心化主脑，默认 false
  providerId: string;         // 注册的 provider ID，如 "web3-decentralized"
  defaultModel: string;       // 默认模型 ID
  allowlist: string[];        // 允许的模型/节点列表
  endpoint: string;           // 去中心化网关/节点地址
  protocol: string;           // 传输协议（"openai-compat" | "custom-ws" | "p2p" 等）
  fallback: "centralized";    // 回退策略
  timeoutMs: number;          // 请求超时，默认 30000
}
```

#### **4.4 结算入口绑定（修正 hook 用法）**

**回退逻辑不在 `before_tool_call` 中实现**（它只能 block/修改工具参数）。回退逻辑在 `before_model_resolve` 中：

| Hook                   | 用途                                                                   | 修正       |
| ---------------------- | ---------------------------------------------------------------------- | ---------- |
| `before_model_resolve` | 动态选择 provider/model + **回退逻辑**（节点不可用时不覆写，走中心化） | 新增       |
| `resolve_stream_fn`    | 提供自定义 StreamFn（返回 null 则走默认）                              | 新增       |
| `before_tool_call`     | 结算/credits 预检 + **阻止/提示**（已有，增强）                        | 已有，增强 |
| `llm_output`           | 审计 + 计费扣减（已有）                                                | 已有       |
| `session_end`          | usage 汇总 → 结算绑定（已有，增强）                                    | 已有，增强 |

#### **4.5 `session_end` 结算可靠性兜底**

当前 `session_end` 是 `runVoidHook`（fire-and-forget），结算写入失败无重试。兜底方案：

- 在 `web3-core` 内部维护 `pendingSettlements` 队列（复用 `Web3StateStore` 的 JSONL 持久化）
- `session_end` 写入失败 → 追加到 `pendingSettlements`
- 复用现有 `web3-anchor-service` 的 60 秒重试机制，增加结算重试逻辑

##### **4.5.1 `PendingSettlement` 字段来源与填充规范（必须）**

> 重试逻辑 `flushPendingSettlements` 中的 `isSettlementReady` 要求 `orderId`、`payer`、`amount` 三字段均非空才会触发 `market.settlement.lock`。因此 `queuePendingSettlement` **必须**在入队时填充这三个字段，否则条目将永远处于 not-ready 状态被无限跳过，结算闭环失效。

**字段来源映射**：

| 字段            | 来源                                                                                             | 说明                                          |
| --------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `sessionIdHash` | `sha256(sessionId)`                                                                              | 去标识化，关联审计                            |
| `createdAt`     | `new Date().toISOString()`                                                                       | 入队时间戳                                    |
| `orderId`       | `web3.resources.lease` 成功后写入 session metadata → `session_end` 读取                          | 以租约签发作为结算权威来源                    |
| `payer`         | `web3.resources.lease` 的 `consumerActorId`                                                      | 即 Consumer 的 actorId                        |
| `amount`        | `event.usage.totalCost`（由 `llm_output` hook 累计的会话总费用，格式为字符串化的 BigNumber-ish） | 取自会话 usage 汇总；若无法获取则回退为 `"0"` |
| `actorId`       | 同 `payer`                                                                                       | 冗余字段，便于查询                            |
| `attempts`      | 初始 `0`                                                                                         | 重试计数器                                    |
| `lastError`     | 初始 `undefined`                                                                                 | 最近一次重试失败原因                          |

**实现要点**：

- `onSessionEnd`（`audit/hooks.ts`）回调签名需接收 session 上下文（含 orderId/actorId/usage），而非仅 sessionId。
- 若 `orderId` 在当前 session 上下文中不可得（例如非 Web3 主脑会话），**不入队**——仅 Web3 去中心化模型会话需要结算兜底。
- `amount` 字段取 `event.usage.totalCost`；如果 usage 缺失或为零，仍入队但 `amount = "0"`，以便后续对账发现异常。

#### **4.6 涉及 `web3-core` 文件清单**

| 文件                                                 | 改动                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `extensions/web3-core/src/index.ts`                  | 注册 `before_model_resolve` + `resolve_stream_fn` hook     |
| `extensions/web3-core/src/config.ts`                 | 新增 `brain` 配置节                                        |
| `extensions/web3-core/src/state/store.ts`            | 新增 `pendingSettlements` 队列 + 主脑来源状态              |
| `extensions/web3-core/src/billing/guard.ts`          | 增强 `before_tool_call` 预检（主脑为 web3 时的额外校验）   |
| `extensions/web3-core/src/audit/hooks.ts`            | 增强 `session_end` 结算绑定 + 失败入队                     |
| `extensions/web3-core/src/billing/commands.ts`       | `/pay_status` 与 `/credits` 展示主脑来源字段               |
| **新增** `extensions/web3-core/src/brain/stream.ts`  | `createWeb3StreamFn` 实现（自定义推理传输）                |
| **新增** `extensions/web3-core/src/brain/resolve.ts` | `before_model_resolve` 决策逻辑（allowlist、可用性、回退） |

---

### **五、接口设计**

#### **5.1 `web3.status.summary`（扩展现有 gateway handler）**

在现有返回字段（`auditEventsRecent`, `archiveProvider`, `anchorNetwork` 等）基础上**新增**：

| 字段                 | 类型                                            | 说明                 | 状态       |
| -------------------- | ----------------------------------------------- | -------------------- | ---------- |
| `brain.source`       | `"web3/decentralized" \| "centralized" \| null` | 当前主脑来源         | **待新增** |
| `brain.provider`     | `string \| null`                                | 当前主脑 provider ID | **待新增** |
| `brain.model`        | `string \| null`                                | 当前主脑 model ID    | **待新增** |
| `brain.availability` | `"ok" \| "degraded" \| "unavailable"`           | 主脑可用性           | **待新增** |
| `billing.status`     | `"active" \| "exhausted" \| "unbound"`          | 结算状态             | **待新增** |
| `billing.credits`    | `number`                                        | 剩余 credits         | **待新增** |
| `settlement.pending` | `number`                                        | 待结算条目数         | **待新增** |

#### **5.2 `/pay_status`（扩展现有命令）**

现有 `/pay_status` 已对接 `market-core` SQLite/文件存储查结算状态。新增字段：

| 字段                      | 说明         | 状态       |
| ------------------------- | ------------ | ---------- |
| `brain.source`            | 当前主脑来源 | **待新增** |
| `settlement.pendingCount` | 待重试结算数 | **待新增** |

#### **5.3 Core 新增 hook 接口**

**`resolve_stream_fn`**（新增）：

| 参数                | 类型        | 说明                      |
| ------------------- | ----------- | ------------------------- |
| `event.provider`    | `string`    | 选中的 provider           |
| `event.modelId`     | `string`    | 选中的 model              |
| `event.modelApi`    | `ModelApi`  | API 类型                  |
| `event.baseUrl`     | `string?`   | provider 的 baseUrl       |
| **返回** `streamFn` | `StreamFn?` | 自定义流函数，null 走默认 |

---

### **六、开发计划（可执行，阶段顺序修正）**

> **Phase 顺序修正**：先接入模型（Phase 1），再对齐状态（Phase 2），最后绑定结算（Phase 3）。
> 原因：状态对齐和结算绑定依赖于模型已经接入。

#### **Phase 1：Core hook 扩展 + 去中心化主脑接入（P0）**

- **目标**：Web3 去中心化模型可被选为主脑，走真实推理路径，失败可回退。
- **Core 侧**：
  - 新增 `resolve_stream_fn` hook 类型 + 执行器 + 调用点
  - 涉及：`src/plugins/types.ts`, `src/plugins/hooks.ts`, `src/agents/pi-embedded-runner/run/attempt.ts`
- **插件侧**：
- 注册 `before_model_resolve` hook（动态切换 provider/model）
- 注册 `resolve_stream_fn` hook（提供自定义 StreamFn）
- **无租约不切换**：`before_model_resolve` 在资源共享开启时要求有有效租约，否则不覆写
- **失败回退兜底**：`resolve_stream_fn` 仅在租约有效时返回 StreamFn，确保共享不可用时仍走默认链路
- 新增 `brain` 配置节 + allowlist 校验
- 涉及：`extensions/web3-core/src/index.ts`, `config.ts`, 新增 `brain/stream.ts`, `brain/resolve.ts`

- **测试建议**：
  - **单元**：`brain/resolve.test.ts` 覆盖 allowlist 命中/未命中/节点不可用的回退
  - **集成**：mock 本地 HTTP server 模拟去中心化节点（OpenAI API 兼容 + 自定义协议），验证 StreamFn 全链路
  - **Core**：`hooks.test.ts` 新增 `resolve_stream_fn` hook 的串行执行与错误隔离测试

#### **Phase 2：状态对齐与展示一致性（P0）**

- **目标**：CLI/UI 上 Web3 状态与结算状态可审计、可追踪。
- **内容**：
  - 扩展 `web3.status.summary` 输出（新增 brain.source/availability/billing 字段）
  - `/pay_status` 与 `market-core` 结算对齐 + 新增 brain.source
  - 异常降级文案统一
- **涉及模块**：
  - `extensions/web3-core/src/billing/commands.ts`
  - `extensions/web3-core/src/index.ts`（gateway handler 扩展）
  - `extensions/market-core/src/market/handlers.ts`（如需补齐汇总字段）
  - `extensions/web3-core/src/state/store.ts`（主脑状态持久化）
- **测试建议**：
  - `commands.test.ts` 覆盖新增字段与降级文案

#### **Phase 3：结算入口绑定 + 可靠性兜底（P1）**

- **目标**：主脑为 Web3 时结算绑定与调用链路一致，失败可降级。
- **内容**：
  - `before_tool_call` 增强（web3 主脑模式下额外校验）
  - `session_end` 结算绑定 + `pendingSettlements` 失败重试队列
  - 复用 `web3-anchor-service` 的 60 秒重试机制
- **涉及模块**：
  - `extensions/web3-core/src/billing/guard.ts`
  - `extensions/web3-core/src/audit/hooks.ts`
  - `extensions/web3-core/src/state/store.ts`
- **测试建议**：
  - `guard.test.ts` 覆盖降级与回退行为
  - `hooks.test.ts` 覆盖 `session_end` 失败 → 入队 → 重试链路

---

### **七、配置与参数规范**

#### **7.1 主脑配置（新增，与现有配置体系对齐）**

在 `Web3PluginConfig` 中新增 `brain` 节（与 `chain/storage/privacy/identity/billing` 并列）：

```typescript
brain: {
  enabled: boolean;           // 默认 false
  providerId: string;         // 如 "web3-decentralized"
  defaultModel: string;       // 默认模型
  allowlist: string[];        // 允许的模型/节点
  endpoint: string;           // 去中心化网关地址
  protocol: string;           // 传输协议
  fallback: "centralized";    // 回退策略
  timeoutMs: number;          // 默认 30000
}
```

#### **7.2 结算配置（复用现有）**

```typescript
billing: {
  enabled: boolean;           // 默认 false
  quotaPerSession: number;    // 默认 100
  costPerLlmCall: number;     // 默认 1
  costPerToolCall: number;    // 默认 1
  paymentTokenAddress?: string;
  paymentReceiverAddress?: string;
}
```

---

### **八、测试与验收**

| 类别          | 覆盖范围                                     | mock 策略                         |
| ------------- | -------------------------------------------- | --------------------------------- |
| **单元**      | allowlist 校验、回退逻辑、配置解析、字段对齐 | 直接 mock 函数                    |
| **集成**      | 主脑切换 → Web3 StreamFn → 推理 → 回退       | 本地 HTTP server 模拟去中心化节点 |
| **集成**      | `session_end` → 结算写入 → 失败重试          | mock store 写入异常               |
| **Core hook** | `resolve_stream_fn` 串行执行、错误隔离       | mock 插件 handler                 |

---

### **九、风险与治理**

| 风险                               | 处理                                           |
| ---------------------------------- | ---------------------------------------------- |
| 去中心化节点不可达                 | `resolve_stream_fn` 返回 null → 回退中心化     |
| 结算失败                           | 降级提示 + pendingSettlements 队列重试         |
| `session_end` fire-and-forget 丢失 | 持久化 pending 队列 + 复用 anchor-service 重试 |
| 敏感信息泄露                       | 输出字段严格控制，不暴露私钥/配置细节          |
| 自定义 StreamFn 异常               | hook 错误隔离（捕获异常 → 走默认流）           |

---

### **十、完整文件清单**

#### **Core 层（新增/修改）**

| 文件                                           | 改动类型                                       |
| ---------------------------------------------- | ---------------------------------------------- |
| `src/plugins/types.ts`                         | MODIFY — 新增 hook 类型 + 扩展 PluginHookName  |
| `src/plugins/hooks.ts`                         | MODIFY — 新增 runResolveStream 方法            |
| `src/agents/pi-embedded-runner/run/attempt.ts` | MODIFY — 插入 resolve_stream_fn 调用点         |
| `src/plugins/runtime/types.ts`                 | MODIFY — 新增 on("resolve_stream_fn") 类型签名 |

#### **web3-core 层（新增/修改）**

| 文件                                           | 改动类型                                        |
| ---------------------------------------------- | ----------------------------------------------- |
| `extensions/web3-core/src/index.ts`            | MODIFY — 注册两个新 hook + 扩展 gateway handler |
| `extensions/web3-core/src/config.ts`           | MODIFY — 新增 brain 配置节                      |
| `extensions/web3-core/src/state/store.ts`      | MODIFY — 新增主脑状态 + pendingSettlements      |
| `extensions/web3-core/src/billing/guard.ts`    | MODIFY — 增强 web3 主脑模式预检                 |
| `extensions/web3-core/src/audit/hooks.ts`      | MODIFY — 增强 session_end + 失败入队            |
| `extensions/web3-core/src/billing/commands.ts` | MODIFY — /pay_status 新增 brain.source          |
| `extensions/web3-core/src/brain/stream.ts`     | **NEW** — createWeb3StreamFn 实现               |
| `extensions/web3-core/src/brain/resolve.ts`    | **NEW** — before_model_resolve 决策逻辑         |

#### **测试文件**

| 文件                                                | 改动类型                             |
| --------------------------------------------------- | ------------------------------------ |
| `extensions/web3-core/src/brain/resolve.test.ts`    | **NEW**                              |
| `extensions/web3-core/src/brain/stream.test.ts`     | **NEW**                              |
| `extensions/web3-core/src/billing/guard.test.ts`    | MODIFY                               |
| `extensions/web3-core/src/audit/hooks.test.ts`      | MODIFY                               |
| `extensions/web3-core/src/billing/commands.test.ts` | MODIFY                               |
| `src/plugins/hooks.test.ts`                         | MODIFY — resolve_stream_fn hook 测试 |

---

### **十一、评审修正对照表（对应 8 条评审意见）**

| #   | 原评审意见                           | 本版修正                                                                    |
| --- | ------------------------------------ | --------------------------------------------------------------------------- |
| 1   | 插件无法充当 LLM 推理后端            | **选路径 B**：新增 `resolve_stream_fn` hook，插件可提供自定义 StreamFn      |
| 2   | Phase 顺序不合理                     | **Phase 1 改为主脑接入**（先接模型，再对齐状态/结算）                       |
| 3   | `before_tool_call` 不能回退主脑      | **回退逻辑移到 `before_model_resolve`**（节点不可用时不覆写）               |
| 4   | `session_end` fire-and-forget 可靠性 | **新增 `pendingSettlements` 队列 + 复用 anchor-service 重试**               |
| 5   | 接口字段虚构                         | **所有新增字段标注"待新增"** + 给出与现有 gateway handler 的对接点          |
| 6   | 配置路径与现有体系不一致             | **`brain` 作为 `Web3PluginConfig` 的并列节**，与 chain/storage/billing 对齐 |
| 7   | 缺少关键文件                         | **补齐 Core 4 个文件 + web3-core 8 个文件 + 测试 6 个文件**                 |
| 8   | 测试策略过于笼统                     | **明确 mock 策略**：本地 HTTP server 模拟去中心化节点                       |

---

### **十二、B-2：Web3 资源共享平台（模型 / 搜索 / 存储）**

> 本章目标：在 B-1 已具备“去中心化模型可作主脑”的前提下，进一步让**用户把自己配置的本地资源**（本地模型、搜索能力、文件存储）通过 Web3 平台**安全地提供给其他用户使用**，并具备 ACL 与结算闭环。

#### **12.1 资源共享的最小定义（工业级边界）**

- **资源提供者（Provider）**：运行 OpenClaw 的用户，愿意对外开放其本地模型/搜索/存储能力。
- **资源消费者（Consumer）**：通过 Web3 平台租用/调用这些能力的其他用户。
- **资源登记（Registry）**：在 `market-core` 侧形成权威的资源目录（可审计、可结算）。
- **资源调用（Invoke）**：消费侧通过 `web3-core` 的工具（tools）或流（stream）调用提供者资源。

**非目标（本轮不做）**：

- 去中心化网络的共识/上链撮合协议（可先用 `market-core` 本地 store + 未来可替换）。
- 跨组织的复杂计费（先做 session 维度或 request 维度）。

#### **12.2 核心威胁模型与安全要求（必须落地）**

- **默认拒绝**：提供者默认不对外开放任何资源。
- **最小权限**：按资源粒度授权，不允许“开放整机”。
- **可撤销**：租用 token/会话凭证可撤销、可过期。
- **审计可追踪**：每次调用必须产生审计事件（谁、用什么、花了多少、结果状态）。
- **敏感信息零泄露**：不得在状态/日志/命令输出里暴露私钥、内网地址、真实路径。

#### **12.3 架构（角色 + 调用链路）**

- **Provider 侧**（提供者机器）：
  - `web3-core` 开启资源发布服务（HTTP handler / route）
  - 在本机对接：本地模型（Ollama/LM Studio/自定义）、本地搜索（例如 SearxNG/自建索引）、本地存储（目录/对象存储）
- **Market 层**（权威目录与结算）：
  - `market-core` 存储资源目录、租约（lease）、用量记录（usage ledger）、结算状态
- **Consumer 侧**（消费者机器）：
  - `web3-core` 通过 Web3 平台发现资源 → 获取租约 token → 以工具/流方式调用 Provider

调用路径（模型）：

- Consumer 触发主脑切换（B-1）→ `before_model_resolve` 选中某个已租用的 Web3 模型资源 → `resolve_stream_fn` 用租约信息创建 `StreamFn` → 调用 Provider 侧推理入口。

调用路径（搜索/存储）：

- Consumer 侧由 `web3-core` 注册工具（`web3.search.*` / `web3.storage.*`）→ 工具内部拿租约信息调用 Provider 侧 HTTP handler。

#### **12.4 接口（Gateway Methods）— 资源目录/租约/状态**

> 这些是 `web3-core` 暴露给 OpenClaw Gateway 的方法，用于 CLI/UI/调试与集成。方法名建议，具体以现有 `registerGatewayMethod` 风格实现。

- **`web3.resources.publish`（Provider 侧）**
  - **输入**：资源描述（见 12.6 配置）、可见性、价格策略
  - **输出**：`resourceId`、版本号、发布状态
- **`web3.resources.unpublish`（Provider 侧）**
  - **输入**：`resourceId`
  - **输出**：成功/失败
- **`web3.resources.list`（Consumer/Provider 侧）**
  - **输入**：`filter`（类型=模型/搜索/存储、标签、提供者、价格区间）
  - **输出**：资源列表（不含敏感 endpoint）
- **`web3.resources.lease`（Consumer 侧）**
  - **输入**：`resourceId`、`consumerActorId`、`ttlMs`、`maxCost`（可选）、`sessionKey`（可选，建议传入以绑定结算上下文）
  - **输出**：`leaseId`、`orderId`、`accessToken`（短期）、`expiresAt`
  - **行为**：成功租约后，`web3-core` 会将 `orderId/payer` 写入对应会话的 session metadata，供 `session_end` 结算使用
- **`web3.resources.revokeLease`（Provider/Consumer 侧）**
  - **输入**：`leaseId`
  - **输出**：成功/失败
- **`web3.resources.status`（Consumer/Provider 侧）**
  - **输入**：`resourceId` 或 `leaseId`
  - **输出**：可用性、最近错误、余额/扣费摘要（与 `market-core` 对齐）

#### **12.5 接口（Provider HTTP Routes）— 资源调用面**

> 使用 `api.registerHttpRoute({ path, handler })` 暴露；必须走认证（Bearer token），并可选要求 loopback/反代。

- **模型推理**（给 `resolve_stream_fn` 使用）：
  - `POST /web3/resources/model/chat`（OpenAI-compat 或自定义协议之一）
- **搜索**：
  - `POST /web3/resources/search/query`
- **存储**：
  - `POST /web3/resources/storage/put`
  - `GET  /web3/resources/storage/get`
  - `POST /web3/resources/storage/list`

**统一认证头**：`Authorization: Bearer <accessToken>`

#### **12.6 配置与参数（新增：`resources` 节，落在 `Web3PluginConfig`）**

在 `extensions/web3-core/src/config.ts` 增加并列配置节：

```typescript
resources: {
  enabled: boolean;            // 默认 false
  advertiseToMarket: boolean;  // 默认 false（开启后写入 market-core）

  provider: {
    listen: {
      enabled: boolean;        // 默认 false
      bind: "loopback" | "lan"; // 默认 loopback
      port: number;            // 默认 0（随机）或固定值
      publicBaseUrl?: string;  // 如通过反代暴露，则提供公开 URL
    };

    auth: {
      mode: "siwe" | "token";    // 默认 siwe（与 wallet 绑定）
      tokenTtlMs: number;          // 默认 10min
      allowedConsumers?: string[]; // 钱包/身份 allowlist（默认空=拒绝）
    };

    offers: {
      models: Array<{
        id: string;                // 资源 ID
        label: string;
        backend: "ollama" | "lmstudio" | "openai-compat" | "custom";
        backendConfig: Record<string, unknown>;  // 不出现在 summary 输出
        price: {
          unit: "token" | "call";
          amount: number;
        };
        policy: {
          maxConcurrent: number;
          maxTokens?: number;
          allowTools: boolean;
        };
      }>;

      search: Array<{
        id: string;
        label: string;
        backend: "searxng" | "custom";
        backendConfig: Record<string, unknown>;
        price: { unit: "query"; amount: number };
      }>;

      storage: Array<{
        id: string;
        label: string;
        backend: "filesystem" | "s3" | "ipfs" | "custom";
        backendConfig: Record<string, unknown>;
        price: { unit: "gb_day" | "put" | "get"; amount: number };
        policy: { maxBytes: number; allowMime?: string[] };
      }>;
    };
  };

  consumer: {
    enabled: boolean;          // 默认 true
    preferLocalFirst: boolean; // 默认 true（先找自己资源）
  };
}
```

#### **12.7 消费侧接入（Tools + Stream）**

- **模型（主脑）**：
  - 继续复用 B-1：`before_model_resolve` 选择某个 `leaseId` 对应的模型资源
  - `resolve_stream_fn` 用 `leaseId/accessToken/providerEndpoint` 创建 `StreamFn`

- **搜索（工具）**：
  - 新增工具：`web3.search.query`
  - 参数：`resourceId?`, `leaseId?`, `q`, `limit`, `site?`
  - 输出：统一搜索结果结构（标题/摘要/URL），并在 `tool_result_persist` 里做脱敏

- **存储（工具）**：
  - 新增工具：`web3.storage.put/get/list`
  - 参数：`resourceId/leaseId`, `path`（虚拟路径，不暴露真实路径）, `bytes/base64`, `mime`
  - 输出：`cid`/`etag`/`size`/`createdAt`

#### **12.8 结算与审计对齐（复用现有能力，补齐两处缺口）**

- **审计**：所有资源调用必须写入 `web3.audit`（Provider 侧与 Consumer 侧都记录，便于对账）。
- **用量账本（Ledger）**：
  - Consumer 侧：每次调用记录 `usage`（token/call/bytes） → `session_end` 汇总
  - Provider 侧：每次请求也记录 `usage`（防止 Consumer 侧伪造）
  - `market-core` 作为权威对齐：最终结算以 Provider 侧账本为准，Consumer 侧账本用于体验与预估

**缺口**（本轮一起补齐）：

- `market-core` 增加资源目录/租约/账本结构（不必上链，先本地权威）
- `web3-core` 增加 `pendingSettlements` 的资源调用场景（不仅 LLM output）

##### **12.8.1 模型调用 Provider 权威记账规范（必须）**

> search 与 storage 路由已在请求完成后调用 `appendSearchLedger` / `appendStorageLedger` 写入 Provider 权威账本，但 **model/chat 路由缺失此记账调用**，导致模型调用——作为 B-2 最核心的共享资源——无法审计与结算。

**`appendModelLedger` 规范**：

- **调用时机**：`/web3/resources/model/chat` 的 pipeline 完成后（流式响应已全部发送），fire-and-forget（`.catch(noop)`），不阻塞响应。
- **调用目标**：`market.ledger.append`（与 search/storage 完全一致的 gateway method）。
- **记账字段**：

| 字段              | 值                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| `leaseId`         | 从鉴权阶段已解析的 lease                                                                                          |
| `resourceId`      | lease 关联的 resourceId                                                                                           |
| `providerActorId` | 当前 Provider 的 actorId                                                                                          |
| `consumerActorId` | lease 的 consumerActorId                                                                                          |
| `kind`            | `"model"`                                                                                                         |
| `unit`            | `"token"`（对齐 `price.unit`）                                                                                    |
| `quantity`        | 优先从上游响应 header `x-usage-tokens` 或响应体 `usage.total_tokens` 提取；无法获取时回退为 `1`（按调用次数计量） |
| `cost`            | `quantity * offer.price.perUnit`（字符串化 BigNumber-ish）                                                        |
| `requestId`       | 请求的 `X-OpenClaw-Request-Id`（可选，用于对账）                                                                  |

- **实现位置**：`extensions/web3-core/src/resources/http.ts`，紧跟 `createResourceModelChatHandler` 的 pipeline 完成回调。
- **与 search/storage 对齐**：三种资源类型的 ledger append 遵循相同的 `callGateway("market.ledger.append", params)` 模式，仅 `kind`/`unit`/`quantity` 不同。

#### **12.9 阶段计划（B-2 与 B-1 并行，但有依赖顺序）**

> 依赖：B-1 的 `resolve_stream_fn` hook 是 B-2 模型共享的必要前提。

- **Phase 4：资源目录 + 租约（P0）**
  - `market-core`：资源目录（resources）、租约（leases）、账本（ledger）最小结构
  - `market-core`：`market.lease.expireSweep`（过期清扫）最小实现（P0 运维闭环）
  - `web3-core`：发布/撤销/发现/租约 gateway methods
  - 测试：资源发布-发现-租约生命周期 + 权限拒绝

- **Phase 5：模型共享（P0）**
  - Provider 侧：`/web3/resources/model/chat` HTTP route
  - Consumer 侧：`resolve_stream_fn` 支持 `leaseId` 路由到远端 Provider
  - 测试：本地起一个 Provider mock server，覆盖并发/超时/回退

- **Phase 6：搜索共享（P1）**
  - Provider 侧：`/web3/resources/search/query`
  - Consumer 侧：`web3.search.query` 工具
  - 测试：tool schema、脱敏、计费扣减、失败降级

- **Phase 7：存储共享（P1）**
  - Provider 侧：`/web3/resources/storage/*`
  - Consumer 侧：`web3.storage.put/get/list` 工具
  - 测试：ACL、大小限制、mime allowlist、对账

#### **12.10 涉及文件清单（B-2 增量）**

- **`web3-core`**：
  - MODIFY `extensions/web3-core/src/config.ts`（新增 `resources` 配置节）
  - MODIFY `extensions/web3-core/src/index.ts`（新增 gateway methods + tools + http routes）
  - MODIFY `extensions/web3-core/src/state/store.ts`（新增资源目录缓存/租约缓存/资源账本）
  - **NEW** `extensions/web3-core/src/resources/registry.ts`（资源发布/发现逻辑）
  - **NEW** `extensions/web3-core/src/resources/leases.ts`（租约 token 生成/校验/撤销）
  - **NEW** `extensions/web3-core/src/resources/http.ts`（Provider HTTP routes：model/search/storage）
  - **NEW** `extensions/web3-core/src/resources/tools.ts`（Consumer tools：search/storage）

- **`market-core`**（权威目录与结算）：
  - MODIFY `extensions/market-core/src/market/handlers.ts`（增加资源目录/租约/账本查询能力）
  - **NEW** `extensions/market-core/src/market/resources.ts`（resources/leasses/ledger 的 store + 读写）

- **测试**：
  - NEW `extensions/web3-core/src/resources/*.test.ts`（发布/租约/ACL/调用）
  - MODIFY `src/gateway/tools-invoke-http.test.ts`（覆盖 web3 工具通过 HTTP 调用 Provider）

---

#### **12.11 `market-core` 数据模型（resources / leases / ledger）— 字段级 schema + 读写 API 契约**

> 设计目标：在不破坏 `market-core` 现有 `Offer/Order/Delivery/Settlement` 流程的前提下，引入三类新实体：
>
> - `resources`：可发现的资源目录（模型/搜索/存储），并与现有 `Offer` 绑定
> - `leases`：可撤销的租约（对应一次资源使用权），并与现有 `Order/Consent/Delivery` 绑定
> - `ledger`：不可篡改的用量账本（append-only），用于对账与结算
>
> 关键约束（必须遵循现有实现）：
>
> - **sqlite 模式**：表结构保持 `id TEXT PRIMARY KEY, data TEXT NOT NULL` 的 JSON 存储风格；仅允许额外的 `timestamp` 索引列用于倒序查询（参考 `audit` 表）。
> - **file 模式**：实体用 `Record<id, Entity>` 的 JSON；账本用 JSONL 追加写。
> - **兼容性**：不得改动现有 `offers/orders/settlements` 的文件名、表名与 JSON shape（因为 `web3-core` 的 `/pay_status` 直接读取它们）。

##### **12.11.1 TypeScript 字段级 Schema（建议放在 `extensions/market-core/src/market/resources.ts`）**

```typescript
export type MarketResourceKind = "model" | "search" | "storage";

export type MarketResourceStatus = "resource_draft" | "resource_published" | "resource_unpublished";

export type MarketPrice = {
  unit: "token" | "call" | "query" | "gb_day" | "put" | "get";
  amount: string; // 使用字符串存 BigInt/decimal（与 settlement amount 一致）
  currency: string; // e.g. "USDC" 或 chain token symbol
  tokenAddress?: string; // 0x...（可选，EVM）
};

export type MarketResourcePolicy = {
  maxConcurrent?: number;
  maxTokens?: number;
  maxBytes?: number;
  allowTools?: boolean;
  allowMime?: string[];
};

// 资源目录：用于发现，不存敏感 endpoint
export type MarketResource = {
  resourceId: string;
  kind: MarketResourceKind;
  status: MarketResourceStatus;

  // 归属
  providerActorId: string; // 通常是 sellerId（0x...）

  // 与现有 market 对象绑定（复用既有链路）
  offerId: string;
  offerHash?: string;

  // 展示与筛选
  label: string;
  description?: string;
  tags?: string[];

  // 定价与策略（与 offer.price/currency 对齐，但允许更细粒度）
  price: MarketPrice;
  policy?: MarketResourcePolicy;

  // 版本与时间
  version: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type MarketLeaseStatus = "lease_active" | "lease_revoked" | "lease_expired";

// 租约：对应一次授权使用权（对外只暴露 leaseId，不暴露 token 明文）
export type MarketLease = {
  leaseId: string;
  resourceId: string;
  kind: MarketResourceKind;

  providerActorId: string;
  consumerActorId: string; // buyerId

  // 绑定既有链路
  orderId: string;
  consentId?: string;
  deliveryId?: string;

  // accessToken 必须可被 Consumer 用于调用 Provider，但不得在 state store 中持久化明文。
  // 推荐做法：
  // - state store 仅保存 accessTokenHash（用于审计/撤销/对账）
  // - 明文 token 仅在 `market.lease.issue` 响应中返回一次（或写入 external credentials store）
  accessTokenHash?: string; // hex/base64 of sha256(token)

  // 可选：将明文 token 写入 market-core 的 external credentials store（加密落盘），用于 Provider 侧恢复/轮换。
  accessRef?: {
    store: "credentials";
    ref: string; // e.g. deliveries/<deliveryId>.json
  };

  status: MarketLeaseStatus;
  issuedAt: string; // ISO
  expiresAt: string; // ISO
  revokedAt?: string; // ISO

  // 防止滥用
  maxCost?: string; // 可选：本租约最大可扣费
};

export type MarketLedgerUnit = "token" | "call" | "query" | "byte";

// 账本：append-only，不做就地更新
export type MarketLedgerEntry = {
  ledgerId: string;
  timestamp: string; // ISO

  leaseId: string;
  resourceId: string;
  kind: MarketResourceKind;

  providerActorId: string;
  consumerActorId: string;

  unit: MarketLedgerUnit;
  quantity: string; // string 存大数
  cost: string; // string
  currency: string;
  tokenAddress?: string;

  // 关联运行上下文（可选）
  sessionId?: string;
  runId?: string;

  // 防抵赖：对 canonical 结构做 hash（复用 market-core hashCanonical）
  entryHash: string;
};
```

##### **12.11.2 落盘 Schema（file 模式）**

目录固定：`<stateDir>/market/`

- `resources.json`：`Record<resourceId, MarketResource>`
- `leases.json`：`Record<leaseId, MarketLease>`
- `ledger.jsonl`：每行一个 `MarketLedgerEntry`（append-only）

规则：

- `resources.json` / `leases.json` **必须是 map by id**（与 `offers.json` 一致），并保持 pretty JSON。
- `ledger.jsonl` 只追加写；不做全量 rewrite，避免 I/O 抖动。

##### **12.11.3 SQLite Schema（sqlite 模式）**

在 `extensions/market-core/src/state/store.ts` 的 `ensureSchema()` 中新增三张表：

- `resources (id TEXT PRIMARY KEY, data TEXT NOT NULL)`
- `leases (id TEXT PRIMARY KEY, data TEXT NOT NULL)`
- `ledger (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, data TEXT NOT NULL)`
  - `CREATE INDEX ledger_ts ON ledger(timestamp)`

说明：

- `ledger` 对齐现有 `audit` 表风格，允许按时间倒序查询；其余实体保持 `id+data`。

##### **12.11.4 `MarketStateStore` 读写 API 契约（建议放在 `extensions/market-core/src/state/store.ts`）**

> 约定：所有方法都必须在 file/sqlite 两种模式下表现一致，并且所有写入都通过参数绑定（sqlite）。

- **Resources**
  - `putResource(resource: MarketResource): Promise<void>`
  - `getResource(resourceId: string): Promise<MarketResource | null>`
  - `listResources(filter?: { kind?: MarketResourceKind; providerActorId?: string; status?: MarketResourceStatus; tag?: string; limit?: number }): Promise<MarketResource[]>`
  - `deleteResource(resourceId: string): Promise<void>`（仅用于 hard-delete；正常下线走 status 迁移）

- **Leases**
  - `putLease(lease: MarketLease): Promise<void>`
  - `getLease(leaseId: string): Promise<MarketLease | null>`
  - `listLeases(filter?: { resourceId?: string; providerActorId?: string; consumerActorId?: string; status?: MarketLeaseStatus; limit?: number }): Promise<MarketLease[]>`

- **Ledger (append-only)**
  - `appendLedger(entry: MarketLedgerEntry): Promise<void>`
  - `listLedger(filter?: { leaseId?: string; resourceId?: string; providerActorId?: string; consumerActorId?: string; since?: string; until?: string; limit?: number }): Promise<MarketLedgerEntry[]>`
  - `summarizeLedger(filter?: { leaseId?: string; resourceId?: string; providerActorId?: string; consumerActorId?: string; since?: string; until?: string }): Promise<{ byUnit: Record<string, { quantity: string; cost: string }>; totalCost: string; currency: string }>`

##### **12.11.5 `market-core` Gateway Methods（handlers.ts）读写契约**

> 原则：尽量复用既有对象：
>
> - `resource.publish` 的底层应创建/更新 `Offer`（assetType/service/api），并同步写 `MarketResource`
> - `lease` 的底层应创建 `Order` + `Consent` + `Delivery`（payload = accessToken），并同步写 `MarketLease`
> - `ledger.append` 在 Provider 侧调用时可写入 Provider 权威账本；Consumer 侧可写入“预估账本”但需标记来源（可选）

**Resources**

- `market.resource.publish`
  - **输入**：`{ actorId?; resource: { kind; label; description?; tags?; price; policy?; offer: { assetId; assetType; currency; usageScope; deliveryType; assetMeta? } } }`
  - **行为**：
    - 创建或更新 Offer（并 publish）
    - 写 `MarketResource`（offerId 绑定、status=published、version+1）
  - **输出**：`{ ok: true; resourceId; offerId; offerHash; status: "resource_published" }`

- `market.resource.unpublish`
  - **输入**：`{ actorId?; resourceId }`
  - **行为**：资源 status->unpublished（必要时 offer.close）
  - **输出**：`{ ok: true; resourceId; status: "resource_unpublished" }`

- `market.resource.list`
  - **输入**：`{ kind?; providerActorId?; status?; tag?; limit? }`
  - **输出**：`{ ok: true; resources: MarketResource[] }`

- `market.resource.get`
  - **输入**：`{ resourceId }`
  - **输出**：`{ ok: true; resource: MarketResource | null }`

**Leases**

- `market.lease.issue`
  - **输入**：`{ actorId?; resourceId; consumerActorId; ttlMs; maxCost? }`
  - **行为**：
    - 创建 Order（buyerId=consumerActorId）
    - 生成/验证 Consent（可选：要求 SIWE/签名，复用 `market.consent.grant`）
    - Issue Delivery（deliveryType=api，payload=accessToken），按需写入 external credentials store
    - 写 `MarketLease`（accessRef 指向 payloadRef）
  - **输出**：`{ ok: true; leaseId; orderId; consentId?; deliveryId; expiresAt }`

- `market.lease.revoke`
  - **输入**：`{ actorId?; leaseId; reason? }`
  - **行为**：lease status->revoked；并触发 delivery revoke（复用现有 revoke webhook 体系）
  - **输出**：`{ ok: true; leaseId; status: "lease_revoked"; revokedAt }`

- `market.lease.get`
  - **输入**：`{ actorId?; leaseId }`
  - **输出**：`{ ok: true; lease: MarketLease | null }`

- `market.lease.list`
  - **输入**：`{ providerActorId?; consumerActorId?; resourceId?; status?; limit? }`
  - **输出**：`{ ok: true; leases: MarketLease[] }`

**Ledger**

- `market.ledger.append`
  - **输入**：`{ actorId?; entry: Omit<MarketLedgerEntry, "ledgerId"|"timestamp"|"entryHash"> }`
  - **行为**：
    - 服务器端补齐 `ledgerId/timestamp/entryHash`
    - 校验 lease 有效（active + 未过期）
    - 追加写入 ledger（append-only）
  - **输出**：`{ ok: true; ledgerId; entryHash }`

- `market.ledger.list`
  - **输入**：`{ leaseId?; resourceId?; providerActorId?; consumerActorId?; since?; until?; limit? }`
  - **输出**：`{ ok: true; entries: MarketLedgerEntry[] }`

- `market.ledger.summary`
  - **输入**：同 list
  - **输出**：`{ ok: true; summary: { byUnit; totalCost; currency } }`

##### **12.11.6 状态迁移与一致性约束（落地细则）**

- `MarketResource.status`：
  - `draft -> published -> unpublished`（不得从 unpublished 回到 published，除非 version+1 且重新 publish）
- `MarketLease.status`：
  - `active -> revoked|expired`（revoked 与 expired 互斥）
- 一致性：
  - `MarketResource.offerId` 必须指向存在且非 closed 的 Offer（published 时）
  - `MarketLease.deliveryId` 存在时，必须能在 `deliveries` 中找到并满足 `deliveryType=api`
  - `MarketLedgerEntry.leaseId` 必须指向 active lease，且 `timestamp` 必须在 lease 有效期内

##### **12.11.7 输入校验（`validators.ts`）补充清单 + 逐字段规则**

> `market-core` 现有风格是 `requireString/requireAddress/requirePositiveNumber/...` 这类同步校验函数。本节给出**需要新增的校验器**与**每个新 gateway method**的逐字段规则，AI 可直接据此实现。

**建议新增校验器（放 `extensions/market-core/src/market/validators.ts`）**

- **`requireEnum<T extends string>(params, key, allowed: readonly T[]): T`**：
  - 必填字符串；必须命中 `allowed`；否则抛错。
- **`requireOptionalEnum<T extends string>(params, key, allowed: readonly T[]): T | undefined`**：
  - 可选字符串；若存在必须命中 `allowed`。
- **`requireStringArray(params, key, opts?: { maxItems?: number; maxLen?: number; unique?: boolean }): string[]`**：
  - 必填数组；每项为非空 string；支持最大数量/最大长度/去重。
- **`requireOptionalStringArray(...)`**：可选版。
- **`requirePositiveInt(params, key, opts?: { min?: number; max?: number }): number`**：
  - 必填整数；用于 `ttlMs/limit/version/maxConcurrent` 等。
- **`requireOptionalPositiveInt(...)`**：可选版。
- **`requireBigNumberishString(params, key, opts?: { allowZero?: boolean }): string`**：
  - 必填 string；必须是十进制整数字符串（`/^[0-9]+$/`）；用于 `amount/cost/quantity/maxCost`。
- **`requireOptionalIsoTimestamp(params, key): string | undefined`**：
  - 可选 ISO 字符串；必须能被 `Date.parse` 解析且 `new Date(x).toISOString()` 不为 `Invalid`。
- **`requireLimit(params, key="limit", defaultValue: number, max: number): number`**：
  - `limit` 默认值 + 上限钳制（避免全表扫描）。

**逐字段校验规则（handlers.ts 新增 methods 必须遵循）**

- **`market.resource.publish`**
  - `actorId?`：若 `config.access.requireActorId=true` 则必填（复用 `requireActorId`）
  - `resource.kind`：`requireEnum(["model","search","storage"])`
  - `resource.label`：`requireString`（1..80）
  - `resource.description?`：可选（0..400）
  - `resource.tags?`：`requireOptionalStringArray`（maxItems=12，maxLen=32，unique=true）
  - `resource.price.unit`：按 kind 限制：
    - model: `"token"|"call"`
    - search: `"query"`
    - storage: `"gb_day"|"put"|"get"`
  - `resource.price.amount`：`requireBigNumberishString(allowZero=false)`
  - `resource.price.currency`：`requireString`（1..16）
  - `resource.price.tokenAddress?`：可选地址（复用 `requireAddress`）
  - `resource.policy?`：对象；其中 `maxConcurrent/maxTokens/maxBytes` 用 `requireOptionalPositiveInt` 且设置合理 max
  - `resource.offer.assetId/assetType/currency/usageScope/deliveryType`：复用现有 `offer.create` 的校验器（保持一致）

- **`market.resource.unpublish` / `market.resource.get`**
  - `resourceId`：`requireString`（建议格式：`res_` 前缀，但先不强制）

- **`market.resource.list`**
  - `kind?`/`status?`：`requireOptionalEnum`
  - `providerActorId?`：可选地址
  - `tag?`：可选 string（maxLen=32）
  - `limit?`：`requireLimit(default=50,max=200)`

- **`market.lease.issue`**
  - `resourceId`：必填
  - `consumerActorId`：必填地址（buyerId）
  - `ttlMs`：`requirePositiveInt(min=10_000,max=7*24*3600*1000)`
  - `maxCost?`：`requireBigNumberishString(allowZero=true)`

- **`market.lease.revoke` / `market.lease.get`**
  - `leaseId`：必填
  - `reason?`：可选 string（maxLen=200）

- **`market.lease.list`**
  - `providerActorId?`/`consumerActorId?`：可选地址
  - `status?`：`requireOptionalEnum(["lease_active","lease_revoked","lease_expired"])`
  - `limit?`：`requireLimit(default=50,max=200)`

- **`market.ledger.append`**
  - `entry.leaseId/resourceId/kind/providerActorId/consumerActorId`：必填（actorId 规则见下）
  - `entry.unit`：`requireEnum(["token","call","query","byte"])`
  - `entry.quantity` / `entry.cost`：`requireBigNumberishString`（quantity 允许 0，cost 允许 0 由策略决定）
  - `entry.currency`：必填 string（1..16）
  - `entry.tokenAddress?`：可选地址
  - `entry.sessionId?`/`runId?`：可选 string（maxLen=128）

- **`market.ledger.list` / `market.ledger.summary`**
  - `since?`/`until?`：`requireOptionalIsoTimestamp`
  - `limit?`：`requireLimit(default=200,max=1000)`（ledger 更偏审计场景）

**权限与 actorId 约束（落地必须明确）**

- 写操作（publish/unpublish/lease.issue/lease.revoke/ledger.append）必须 `assertAccess(...,"write")`。
- `ledger.append` 额外约束：
  - `actorId` 为空时：拒绝（为了可审计；建议强制 actorId）
  - `actorId` 必须等于 `entry.providerActorId` 或具备管理员权限（避免消费者伪造 provider 账本）

##### **12.11.8 Gateway Methods 请求/响应 JSON 示例（含失败示例）**

> 示例按 `handlers.ts` 的 `opts.params` 约定给出；`actorId` 用占位地址 `0xaaaaaaaa...`。

**`market.resource.publish`（成功）**

```json
{
  "actorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "resource": {
    "kind": "model",
    "label": "Provider Llama 3.3 70B",
    "description": "Shared local model via provider node",
    "tags": ["llm", "provider", "gpu"],
    "price": {
      "unit": "token",
      "amount": "1",
      "currency": "USDC",
      "tokenAddress": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    "policy": { "maxConcurrent": 2, "maxTokens": 8192, "allowTools": false },
    "offer": {
      "assetId": "web3:model:provider-llama-70b",
      "assetType": "api",
      "currency": "USDC",
      "usageScope": { "purpose": "ai_inference", "durationDays": 7, "transferable": false },
      "deliveryType": "api",
      "assetMeta": { "model": "llama3.3-70b", "context": 8192 }
    }
  }
}
```

```json
{
  "ok": true,
  "resourceId": "res_01J...",
  "offerId": "offer_01J...",
  "offerHash": "0x...",
  "status": "resource_published"
}
```

**`market.resource.list`（成功）**

```json
{ "kind": "model", "status": "resource_published", "limit": 20 }
```

```json
{
  "ok": true,
  "resources": [
    {
      "resourceId": "res_01J...",
      "kind": "model",
      "status": "resource_published",
      "providerActorId": "0xaaaa...",
      "offerId": "offer_01J...",
      "label": "Provider Llama 3.3 70B",
      "price": { "unit": "token", "amount": "1", "currency": "USDC" },
      "version": 1,
      "createdAt": "2026-02-19T12:00:00.000Z",
      "updatedAt": "2026-02-19T12:00:00.000Z"
    }
  ]
}
```

**`market.lease.issue`（成功：返回一次性 `accessToken`）**

```json
{
  "actorId": "0xcccccccccccccccccccccccccccccccccccccccc",
  "resourceId": "res_01J...",
  "consumerActorId": "0xcccccccccccccccccccccccccccccccccccccccc",
  "ttlMs": 600000,
  "maxCost": "1000"
}
```

```json
{
  "ok": true,
  "leaseId": "lease_01J...",
  "orderId": "order_01J...",
  "consentId": "consent_01J...",
  "deliveryId": "delivery_01J...",
  "expiresAt": "2026-02-19T12:10:00.000Z",
  "accessToken": "tok_live_REDACTED_EXAMPLE"
}
```

**`market.lease.revoke`（成功）**

```json
{
  "actorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "leaseId": "lease_01J...",
  "reason": "abuse"
}
```

```json
{
  "ok": true,
  "leaseId": "lease_01J...",
  "status": "lease_revoked",
  "revokedAt": "2026-02-19T12:05:00.000Z"
}
```

**`market.ledger.append`（成功：服务器补齐 hash/id/time）**

```json
{
  "actorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "entry": {
    "leaseId": "lease_01J...",
    "resourceId": "res_01J...",
    "kind": "model",
    "providerActorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "consumerActorId": "0xcccccccccccccccccccccccccccccccccccccccc",
    "unit": "token",
    "quantity": "2048",
    "cost": "2048",
    "currency": "USDC",
    "tokenAddress": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "sessionId": "sess_01J...",
    "runId": "run_01J..."
  }
}
```

```json
{ "ok": true, "ledgerId": "ledger_01J...", "entryHash": "0x..." }
```

**`market.ledger.summary`（成功）**

```json
{
  "leaseId": "lease_01J...",
  "since": "2026-02-19T00:00:00.000Z",
  "until": "2026-02-19T23:59:59.999Z"
}
```

```json
{
  "ok": true,
  "summary": {
    "byUnit": { "token": { "quantity": "2048", "cost": "2048" } },
    "totalCost": "2048",
    "currency": "USDC"
  }
}
```

**`market.resource.get`（成功）**

```json
{ "resourceId": "res_01J..." }
```

```json
{
  "ok": true,
  "resource": {
    "resourceId": "res_01J...",
    "kind": "model",
    "status": "resource_published",
    "providerActorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "offerId": "offer_01J...",
    "label": "Provider Llama 3.3 70B",
    "price": { "unit": "token", "amount": "1", "currency": "USDC" },
    "version": 1,
    "createdAt": "2026-02-19T12:00:00.000Z",
    "updatedAt": "2026-02-19T12:00:00.000Z"
  }
}
```

**`market.resource.unpublish`（成功）**

```json
{ "actorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "resourceId": "res_01J..." }
```

```json
{ "ok": true, "resourceId": "res_01J...", "status": "resource_unpublished" }
```

**`market.lease.get`（成功）**

```json
{ "actorId": "0xcccccccccccccccccccccccccccccccccccccccc", "leaseId": "lease_01J..." }
```

```json
{
  "ok": true,
  "lease": {
    "leaseId": "lease_01J...",
    "resourceId": "res_01J...",
    "kind": "model",
    "providerActorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "consumerActorId": "0xcccccccccccccccccccccccccccccccccccccccc",
    "orderId": "order_01J...",
    "consentId": "consent_01J...",
    "deliveryId": "delivery_01J...",
    "accessTokenHash": "sha256:...",
    "status": "lease_active",
    "issuedAt": "2026-02-19T12:00:00.000Z",
    "expiresAt": "2026-02-19T12:10:00.000Z"
  }
}
```

**`market.lease.list`（成功）**

```json
{
  "providerActorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "status": "lease_active",
  "limit": 20
}
```

```json
{
  "ok": true,
  "leases": [
    {
      "leaseId": "lease_01J...",
      "resourceId": "res_01J...",
      "kind": "model",
      "providerActorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "consumerActorId": "0xcccccccccccccccccccccccccccccccccccccccc",
      "orderId": "order_01J...",
      "deliveryId": "delivery_01J...",
      "accessTokenHash": "sha256:...",
      "status": "lease_active",
      "issuedAt": "2026-02-19T12:00:00.000Z",
      "expiresAt": "2026-02-19T12:10:00.000Z"
    }
  ]
}
```

**`market.ledger.list`（成功）**

```json
{ "leaseId": "lease_01J...", "limit": 200 }
```

```json
{
  "ok": true,
  "entries": [
    {
      "ledgerId": "ledger_01J...",
      "timestamp": "2026-02-19T12:01:00.000Z",
      "leaseId": "lease_01J...",
      "resourceId": "res_01J...",
      "kind": "model",
      "providerActorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "consumerActorId": "0xcccccccccccccccccccccccccccccccccccccccc",
      "unit": "token",
      "quantity": "2048",
      "cost": "2048",
      "currency": "USDC",
      "entryHash": "0x..."
    }
  ]
}
```

##### **12.11.9 失败场景示例（按 method 最小覆盖）**

> 这些失败示例用于驱动 handlers 的错误路径与 e2e：必须确保 **不会写入任何部分状态**（或写入可解释的审计事件），并且错误信息不包含敏感信息。

- **`market.resource.publish`（失败：price.unit 与 kind 不匹配）**

```json
{
  "actorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "resource": {
    "kind": "search",
    "label": "Shared Search",
    "price": { "unit": "token", "amount": "1", "currency": "USDC" },
    "offer": {
      "assetId": "web3:search:x",
      "assetType": "api",
      "currency": "USDC",
      "usageScope": { "purpose": "search" },
      "deliveryType": "api"
    }
  }
}
```

```json
{ "ok": false, "error": "invalid enum: price.unit" }
```

- **`market.resource.unpublish`（失败：actorId 非资源 owner）**

```json
{ "actorId": "0xdddddddddddddddddddddddddddddddddddddddd", "resourceId": "res_01J..." }
```

```json
{ "ok": false, "error": "actor mismatch: not resource owner" }
```

- **`market.lease.issue`（失败：resource 未发布）**

```json
{
  "actorId": "0xcccccccccccccccccccccccccccccccccccccccc",
  "resourceId": "res_01J_DRAFT",
  "consumerActorId": "0xcccccccccccccccccccccccccccccccccccccccc",
  "ttlMs": 600000
}
```

```json
{ "ok": false, "error": "resource not published" }
```

- **`market.lease.issue`（失败：ttlMs 超出上限）**

```json
{
  "actorId": "0xcccccccccccccccccccccccccccccccccccccccc",
  "resourceId": "res_01J...",
  "consumerActorId": "0xcccccccccccccccccccccccccccccccccccccccc",
  "ttlMs": 999999999999
}
```

```json
{ "ok": false, "error": "invalid ttlMs: out of range" }
```

- **`market.lease.revoke`（失败：租约已过期，不能 revoke，只能标记 expired）**

```json
{ "actorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "leaseId": "lease_01J_EXPIRED" }
```

```json
{ "ok": false, "error": "lease already expired" }
```

- **`market.ledger.append`（失败：actorId 非 provider，拒绝写入权威账本）**

```json
{
  "actorId": "0xcccccccccccccccccccccccccccccccccccccccc",
  "entry": {
    "leaseId": "lease_01J...",
    "resourceId": "res_01J...",
    "kind": "model",
    "providerActorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "consumerActorId": "0xcccccccccccccccccccccccccccccccccccccccc",
    "unit": "token",
    "quantity": "1",
    "cost": "1",
    "currency": "USDC"
  }
}
```

```json
{ "ok": false, "error": "actor mismatch: ledger append must be provider" }
```

- **`market.ledger.append`（失败：lease 过期或被撤销）**

```json
{
  "actorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "entry": {
    "leaseId": "lease_01J_REVOKED",
    "resourceId": "res_01J...",
    "kind": "model",
    "providerActorId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "consumerActorId": "0xcccccccccccccccccccccccccccccccccccccccc",
    "unit": "token",
    "quantity": "1",
    "cost": "1",
    "currency": "USDC"
  }
}
```

```json
{ "ok": false, "error": "lease not active" }
```

- **`market.ledger.summary`（失败：since > until）**

```json
{
  "leaseId": "lease_01J...",
  "since": "2026-02-20T00:00:00.000Z",
  "until": "2026-02-19T00:00:00.000Z"
}
```

```json
{ "ok": false, "error": "invalid time range: since after until" }
```

##### **12.11.10 E2E 测试矩阵（最小必测，覆盖状态机 + 兼容两种 store）**

> 每条用例必须在两种模式跑一遍：`store.mode=file` 与 `store.mode=sqlite`。

| 用例          | 场景              | 触发方法/命令               | 关键断言（落盘/状态/安全）                                                                |
| ------------- | ----------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| E2E-RES-01    | 发布模型资源      | `market.resource.publish`   | `resources` 新增/版本+1；`offers` 已 publish；summary 不含敏感 endpoint                   |
| E2E-RES-02    | 下线资源          | `market.resource.unpublish` | resource status=unpublished；后续 `lease.issue` 拒绝                                      |
| E2E-LEASE-01  | 获取租约（成功）  | `market.lease.issue`        | `orders/consents/deliveries/leases` 全链路存在；响应含一次性 token；state 不落 token 明文 |
| E2E-LEASE-02  | 租约查询          | `market.lease.get`/`list`   | 仅授权主体可见（按 access 策略）；字段脱敏                                                |
| E2E-LEDGER-01 | Provider 写入账本 | `market.ledger.append`      | 追加 `ledger` 一条；`entryHash` 可复算；拒绝非 provider actorId                           |
| E2E-LEDGER-02 | 账本汇总          | `market.ledger.summary`     | totals 与 list 相符；时间过滤正确                                                         |
| E2E-LEASE-03  | 撤销租约          | `market.lease.revoke`       | lease=revoked；触发 delivery revoke；后续 ledger.append 拒绝                              |
| E2E-FAIL-01   | 失败不污染状态    | 各类失败示例                | 失败时 `resources/leases/ledger` 不新增（或只写审计）；错误不含敏感信息                   |

**补充断言（强制）**

- 所有错误响应 `error` 字段不得包含 `accessToken`、内网地址、文件真实路径。
- `ledger.jsonl` 必须 append-only；sqlite `ledger` 必须能按 `timestamp` 倒序取 `limit`。

##### **12.11.11 状态机与回滚规则（工业级：原子性边界 + 失败补偿）**

> 目标：让 AI 在实现 handlers 时清楚“哪些写入必须原子化”“失败时允许留下哪些副作用”“如何补偿”，并确保 file/sqlite 两种 store 行为一致。

**全局约束**

- **任何 write method** 必须遵循：
  - **先校验**（参数 + 权限 + actor 绑定 + 目标对象状态）
  - **后写入**（尽量在一次临界区完成）
  - **最后审计**（成功/失败都可写审计，但不得泄露敏感信息）
- **sqlite 模式**：
  - 虽然当前 store 以 `INSERT OR REPLACE` 写 JSON，不显式使用事务，但本轮新增方法需要**显式事务边界**：涉及多对象写入（Offer+Resource / Order+Consent+Delivery+Lease）必须用 `db.exec("BEGIN")...COMMIT/ROLLBACK`（或等效 API）包裹，避免部分写入。
- **file 模式**：
  - 通过 `withFileLock`（已有使用场景）在 `stateDir/market` 维度加锁。
  - 多文件写入必须采用“写临时文件 → rename 原子替换”的方式（沿用现有写法/工具）；并且在一个锁内完成，避免部分更新。

**每个 method 的原子性边界与补偿动作**

- **`market.resource.publish`（原子：Offer + Resource）**
  - **必须原子化写入**：
    - 新建/更新 `Offer` 并 publish
    - 写 `MarketResource`（offerId 绑定、version+1）
  - **失败补偿**：
    - 若 Offer 已创建但 Resource 写失败：必须回滚 Offer 写入（sqlite rollback / file 不落盘）
    - 若 publish 过程中触发状态机错误：不应写入任何资源侧结构

- **`market.resource.unpublish`（原子：Resource 状态 + 可选 Offer close）**
  - **必须原子化写入**：
    - Resource status -> `resource_unpublished`
    - 可选：Offer close（若策略要求）
  - **失败补偿**：无（应做到全量回滚，不能出现 Resource 已下线但 Offer 仍 published，或反之）

- **`market.lease.issue`（原子：Order + Consent + Delivery + Lease + accessTokenHash/ref）**
  - **必须原子化写入**：
    - 创建 `Order`
    - 创建 `Consent`（可选：复用 consent.grant 的签名校验流程）
    - `Delivery.issue`（deliveryType=api）
    - 写 `MarketLease`（含 `accessTokenHash`，以及可选 `accessRef`）
  - **失败补偿**：
    - 任何一步失败都必须回滚所有实体（避免“有 order 但无 lease”）。
  - **token 生命周期**：
    - `accessToken` 明文 **只允许在响应中返回一次**（不写 state store）。
    - 需要持久化明文时，只能写入 external credentials store（加密落盘）并在 lease 保存 `accessRef`。

- **`market.lease.revoke`（原子：Lease 状态 + Delivery revoke）**
  - **必须原子化写入**：
    - Lease status -> `lease_revoked`
    - 触发 `Delivery.revoke`（沿用现有 revoke webhook + retry job）
  - **失败补偿与降级**：
    - 如果 webhook 调用失败：应按现有模式写入 `RevocationJob`，并且 lease 仍可标记 revoked（因为撤销意图已成立）。

- **`market.ledger.append`（原子：追加一条）**
  - **必须原子化写入**：只允许追加一条 ledger；不得伴随修改 lease/resource。
  - **失败补偿**：无（失败即不追加）。
  - **并发幂等**：
    - 由服务端生成 `ledgerId`，并将 `entryHash` 作为对账凭证；如需幂等，可在输入支持 `clientRequestId`（可选增强，不是本轮硬要求）。

- **`market.ledger.summary/list`（只读）**
  - 不得产生副作用；任何解析失败必须返回 `ok:false` 且不泄露敏感信息。

**状态机最小新增断言（建议补进 `state-machine.ts` 或资源模块内）**

- `assertResourceTransition(from,to)`：`draft->published->unpublished`
- `assertLeaseTransition(from,to)`：`active->revoked|expired`

##### **12.11.12 external credentials（token 明文）落盘与脱敏规范（工业级）**

> 目标：做到“可用、可撤销、可审计”，同时确保 token 永不在日志/summary/state store 中泄露。

**1) 何时生成 token**

- 仅在 `market.lease.issue` 成功路径生成 `accessToken`（推荐 32 bytes 随机），并立刻计算 `accessTokenHash = sha256(accessToken)`。

**2) token 如何返回/存储**

- **返回**：`market.lease.issue` 响应体允许包含 `accessToken`（一次性），用于 Consumer 侧立刻配置调用。
- **不落盘**：`MarketLease` 中只允许保存 `accessTokenHash`，禁止保存明文。
- **可选落盘（加密）**：如 Provider 侧需要恢复/轮换 token，可将 token 明文写入 `market-core` external credentials store（已存在 `credentials.ts`）：
  - 路径示例：`~/.openclaw/credentials/market-core/leases/<leaseId>.json`
  - 加密：AES-256-GCM（沿用 `EncryptedPayload`）
  - lease 内保存 `accessRef = { store:"credentials", ref:"leases/<leaseId>.json" }`

**3) 脱敏与日志规则（强制）**

- `handlers.ts` 的任何错误/日志都不得输出：
  - `accessToken` 明文
  - Provider 的内网 `endpoint`
  - Provider 的真实文件路径
- 对外展示（`market.resource.list/get`, `market.status.summary`, `web3.status.summary`）不得包含 token 或 endpoint。

**4) tool_result_persist（跨端传播）**

- 若 Consumer 侧把 `accessToken` 写入工具结果或消息（例如“我拿到了 token”）：必须在 `tool_result_persist` hook 或消息输出层做脱敏（例如替换为 `tok_***`），避免进入 session transcript。

**5) 撤销与过期的即时生效**

- Provider HTTP routes 必须在每次调用时校验：
  - token 有效（hash 命中 + 未过期 + 未 revoked）
  - 资源仍 published
  - 超过 policy 限额则拒绝

##### **12.11.13 状态机断言清单（可直接落地到 `state-machine.ts`）**

> 本节给出允许/拒绝的迁移表与断言伪代码，避免实现时出现“静默跳状态”。

**`MarketResourceStatus` 迁移表**

| from \ to              | `resource_draft` | `resource_published` | `resource_unpublished` |
| ---------------------- | ---------------: | -------------------: | ---------------------: |
| `resource_draft`       |       ✅（幂等） |                   ✅ |                     ❌ |
| `resource_published`   |               ❌ |           ✅（幂等） |                     ✅ |
| `resource_unpublished` |               ❌ |                   ❌ |             ✅（幂等） |

**断言伪代码**（可直接翻译成 TS）：

```text
assertResourceTransition(from, to):
  if from === to: return
  if from === "resource_draft" and to === "resource_published": return
  if from === "resource_published" and to === "resource_unpublished": return
  throw new Error(`invalid resource transition: ${from} -> ${to}`)
```

**`MarketLeaseStatus` 迁移表**

| from \ to       | `lease_active` | `lease_revoked` | `lease_expired` |
| --------------- | -------------: | --------------: | --------------: |
| `lease_active`  |     ✅（幂等） |              ✅ |              ✅ |
| `lease_revoked` |             ❌ |      ✅（幂等） |              ❌ |
| `lease_expired` |             ❌ |              ❌ |      ✅（幂等） |

**断言伪代码**：

```text
assertLeaseTransition(from, to):
  if from === to: return
  if from === "lease_active" and (to === "lease_revoked" or to === "lease_expired"): return
  throw new Error(`invalid lease transition: ${from} -> ${to}`)
```

**额外一致性断言（建议实现为 `assertResourceInvariant` / `assertLeaseInvariant`）**

- resource published 必须存在 `offerId` 且 offer 不为 closed
- lease active 必须 `expiresAt > now`，并且 `accessTokenHash` 存在

##### **12.11.14 sqlite schema 变更与 `migrateFromFile` 扩展（resources/leasses/ledger）**

> `market-core` 现有模式：sqlite 为空时可从 file store 导入。新增资源体系也必须跟随该模式，且导入必须幂等。

**A. Schema 变更（sqlite）**

- 在 `ensureSchema()` 增加：
  - `resources (id TEXT PRIMARY KEY, data TEXT NOT NULL)`
  - `leases (id TEXT PRIMARY KEY, data TEXT NOT NULL)`
  - `ledger (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, data TEXT NOT NULL)` + `ledger_ts` index

**B. file store 文件新增**

- `resources.json` / `leases.json` / `ledger.jsonl`（目录仍为 `<stateDir>/market/`）

**C. 导入触发条件（保持与现有一致）**

- `store.mode=sqlite` 且 DB 中实体表均为空（或至少新增表为空）
- `migrateFromFile=true`
- file store 中存在对应文件且包含数据

**D. 导入顺序（重要：保证引用能解析）**

1. `offers`（已存在）
2. `resources`（依赖 offerId）
3. `orders` / `consents` / `deliveries` / `settlements`（已存在）
4. `leases`（依赖 orderId/consentId/deliveryId）
5. `ledger`（依赖 leaseId/resourceId）
6. `audit`（已存在；如 ledger 导入期间记录审计，注意去重策略）

**E. 幂等策略（必须）**

- 对 `resources/leases`：导入使用 `INSERT OR REPLACE`（与现有一致）
- 对 `ledger`：
  - `ledgerId` 作为主键，导入同样用 `INSERT OR REPLACE`
  - 从 `ledger.jsonl` 逐行读取，遇到解析失败：
    - 记录一条 audit（不含敏感信息）并跳过该行

**F. 兼容性注意事项（硬约束）**

- 导入过程中不得修改任何已存在实体的 shape（尤其 `orders/settlements`），避免破坏 `/pay_status`。
- 如果 file store 中不存在 `resources.json`（老版本）：导入应视为“无资源数据”，不报错。

##### **12.11.15 数据校验与自愈策略（导入期 + 运行期，抗脏数据）**

> 目标：面对老版本落盘、手工编辑、部分写入、跨版本字段差异等情况，系统应尽量：
>
> 1. **不中断主流程**（读/写尽量降级），2) **不污染权威结算**（Provider ledger 为准），3) **可审计可修复**。

**A. 脏数据分级（必须定义）**

- **P0（阻断级）**：会导致安全问题或资金错误
  - 例：`accessToken` 明文出现在 state store；`ledger` entry 的 provider/consumer 身份错配；`cost/quantity` 非法（负数/非数字）
  - 处理：拒绝加载该记录（skip）+ 写 audit（不含敏感信息）+ 进入修复队列

- **P1（严重）**：会导致引用断裂或状态机错误
  - 例：lease 指向不存在的 `resourceId` / `orderId`；resource 指向不存在的 offer；状态值未知
  - 处理：记录标记为 `invalid`（见下）或跳过；写 audit；对外查询时隐藏该记录或标注 degraded

- **P2（可降级）**：字段缺失/旧字段兼容
  - 例：老版本缺 `tags`/`policy`/`offerHash`/`accessTokenHash`
  - 处理：填默认值或计算派生值；写 audit（可选，避免噪声）

**B. 导入期（migrateFromFile）自愈策略**

> 导入必须“尽量导入可用数据”，但不得为了导入而伪造结算/身份。

- **Resource 导入**
  - 若 `offerId` 缺失或 offer 不存在：
    - 标记该 resource 为 **invalid**（不写入 sqlite 的 `resources` 表；或写入但 `status=resource_unpublished` 且 `tags=["invalid:missing_offer"]`）
    - 推荐：**不写入**（避免被发现/租用）

- **Lease 导入**
  - 若 `expiresAt` 无法解析：跳过并写 audit（P1）
  - 若 `accessTokenHash` 缺失：
    - 允许导入 lease，但强制 `status=lease_revoked` 或 `lease_expired`（二选一：建议 `lease_revoked`，因为无法验证 token）
    - 写 audit（P1）
  - 若 `deliveryId` 不存在：
    - 允许导入 lease（用于对账），但禁止其用于 Provider 调用（运行期校验会拒绝）

- **Ledger 导入**
  - 若 entry JSON 解析失败：跳过 + audit（已定义）
  - 若 `leaseId` 找不到：
    - 允许导入到 sqlite，但必须打上 `tags=["orphan:missing_lease"]`（如果不想扩字段，则写 audit 并跳过）
    - 推荐：**跳过**（避免污染结算汇总）
  - 若 `entryHash` 缺失：
    - 允许导入，但必须在导入时补算 `entryHash`（基于 canonical entry，不含 `ledgerId/timestamp` 或按规范定义）

**C. 运行期校验（读路径）**

- `market.resource.list/get`：
  - 永不返回 invalid resource（或返回时显式 `status=resource_unpublished` + `degradedReason`）
- `market.lease.get/list`：
  - 若 lease 已过期：读路径可以懒标记为 `lease_expired`（写入需谨慎：只在 write 操作或后台任务中落盘）
- `market.ledger.summary`：
  - 汇总时只统计“引用完整且 lease active/revoked/expired 之一”的 entry；孤儿 entry 必须排除或单列

**D. 运行期校验（写路径）**

- `market.lease.issue`：
  - 必须写入 `accessTokenHash`；若无法生成 hash（理论不可能）则整体回滚
- `market.ledger.append`：
  - 必须校验 lease 存在且 active 且未过期；actorId 必须是 provider（权威账本）

**E. 修复队列（可选增强，但建议预留）**

- 新增 `repairJobs.json` / `repairs` 表（同 `revocations` 模式）：
  - `RepairJob { id, kind, refId, reason, firstSeenAt, attempts, status }`
- 用途：对 invalid/orphan 记录给出可追踪的修复入口（例如运营/管理员手动处理）。

##### **12.11.16 后台任务规范（工业级闭环：幂等、批处理、锁、降噪、可观测）**

> 目标：把“租约过期清扫、撤销重试、修复队列重试、账本汇总”的维护任务规范化，保证长期运行稳定且可审计。

**总原则（所有后台任务通用）**

- **幂等**：重复执行不应导致状态震荡或重复扣费。
- **批处理**：支持 `limit`/`maxMs`/`maxAttempts`，避免一次任务阻塞 gateway。
- **锁**：
  - sqlite：任务执行期间使用同一个 DB 连接 + 事务（必要时）。
  - file：使用与现有一致的 `withFileLock`（目录级锁），避免并发写。
- **审计降噪**：
  - 成功批处理只写一条汇总 audit（含 processed/succeeded/failed），不要对每条记录都刷 audit。
  - 失败条目写 audit 时不得包含 token/endpoint/真实路径。
- **可观测**：每个任务返回结构化统计，便于 CLI/UI 展示与告警。

**任务 1：租约过期清扫（Lease Expire Sweep）**

- **gateway method**：`market.lease.expireSweep`
- **触发**：
  - 手动：CLI/UI 触发（便于调试）
  - 自动：插件 service（可选）每 N 秒运行一次
- **输入**：
  - `{ actorId?; now?: string; limit?: number; dryRun?: boolean }`
- **行为**：
  - 扫描 `leases` 中 `status=lease_active && expiresAt <= now`
  - 对每条：执行 `assertLeaseTransition(active -> expired)`，写回 lease（并可写入轻量审计）
  - **不得**触发结算或写 ledger（过期只影响调用权限）
- **输出**：
  - `{ ok: true; processed; expired; skipped; errors: number }`

**任务 2：撤销 webhook 重试（已存在，需纳入统一规范）**

- **gateway method**：`market.revocation.retry`（已存在）
- **规范补充**：
  - 统一返回字段：`{ processed, succeeded, failed, pending }`
  - 失败原因 audit 需脱敏

**任务 3：修复队列重试（Repair Retry）**

- **gateway method**：`market.repair.retry`
- **输入**：
  - `{ actorId?; limit?: number; maxAttempts?: number; dryRun?: boolean }`
- **行为**（最小闭环）
  - 扫描 `repairs` 中 `status=pending` 且 `attempts < maxAttempts`
  - 目前只做两类自动修复：
    - `orphan_ledger_entry`：若现在能找到 lease/resource，则允许重新纳入 summary（更新策略：把 entry 重新 append 不可行，因此推荐在 summary 时动态过滤；repair 只负责标记 job done）
    - `invalid_resource_missing_offer`：若 offer 已补齐，则允许把 resource 从 invalid 恢复到 unpublished（需重新 publish 才能被发现）
  - 修复失败：`attempts++`，超过上限标记 `failed`
- **输出**：
  - `{ ok: true; processed; succeeded; failed; pending }`

**任务 4：账本汇总快照（可选，但建议预留）**

> ledger 是 append-only；为了避免每次 `market.ledger.summary` 扫描过多历史，建议预留“快照”机制。

- **gateway method**：`market.ledger.snapshot`（可选增强）
- **输入**：`{ actorId?; since?: string; until?: string; limit?: number; dryRun?: boolean }`
- **行为**：
  - 生成 `LedgerSnapshot`（按 providerActorId/resourceId 分桶汇总）
  - 存储：
    - file：`ledger-snapshots.json`（map by snapshotId）
    - sqlite：`ledger_snapshots (id TEXT PRIMARY KEY, data TEXT NOT NULL)`
  - `market.ledger.summary` 优先使用最新快照 + 增量区间
- **输出**：`{ ok: true; snapshotId; buckets; totalCost }`

**建议新增配置（可选，放 `extensions/market-core/src/config.ts`）**

- `maintenance.enabled`（默认 false）
- `maintenance.leaseExpireSweepIntervalMs`（默认 60000）
- `maintenance.repairRetryIntervalMs`（默认 60000）
- `maintenance.maxBatchSize`（默认 200）

---

### **十三、B-2 子文档索引（可拆分实施与评审）**

> 以下子文档与 `web3-brain-architecture.md` 同级，内容更细，用于 AI 按模块直接落地。

- **`web3-market-resource-api.md`**：接口与错误契约（gateway methods + provider http routes），用于实现与 e2e 调试。
- **`web3-market-resource-security.md`**：威胁模型、鉴权/授权、滥用防护、敏感信息治理。
- **`web3-market-resource-ops.md`**：部署/配置/后台任务 runbook/可观测性/回滚。
- **`web3-market-resource-testing.md`**：测试计划（unit/integration/e2e/security/load）与 mock 策略。
- **`web3-market-resource-config-examples.md`**：可直接拷贝的配置示例（provider-only/consumer-only/hybrid）。
- **`web3-market-resource-implementation-checklist.md`**：按文件可勾验的实施清单（DoD + AC + 测试 Gate）。

---

### **十四、B-2 的评审要点（再次对齐“可执行、可审计、可结算”）**

- **必须可禁用**：`resources.enabled=false` 时整个共享面不可被发现、不可被调用。
- **必须可审计**：Provider 侧账本为权威，Consumer 侧仅预估。
- **必须可撤销**：租约 token 过期与撤销必须立即生效。
- **必须可降级**：共享资源不可用时，不影响主脑对话主链路（回退中心化）。
