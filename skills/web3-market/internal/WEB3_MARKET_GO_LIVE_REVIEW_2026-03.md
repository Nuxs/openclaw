# Web3 自由市场严格上线评审（2026-03）

> **评审状态**：已更新（Post-P0 修复复核）  
> **评审日期**：2026-03-04  
> **评审结论**：🟡 **Conditional Go（仅受控内测）**  
> **版本快照（以代码为准）**：`market-core@2026.2.21` / `web3-core@2026.2.16`

---

## 0. 结论（先给判定）

当前实现具备较完整的 **市场内核能力**（租约/账本/争议/结算等原语），P0 阻断项（查询链路缺失、命令层原始错误透传）已完成修复；但 AI 管家仍为规则型意图解析，尚未达到 GA 级“可畅游”体验。

- **对外 GA**：🟡 Conditional Go（需继续完成 GA 门禁）
- **受控内测**：🟢 可继续工程内测/灰度验证（禁止对外超范围承诺）

---

## 1. 证据口径（信）

- **A（强证据）**：仓库代码（注册表/handler/工具实现）、同仓测试。
- **B（中证据）**：仓库内方案文档（`skills/web3-market/references/*`、`skills/web3-market/internal/*`）。
- **C（弱证据）**：外部竞品材料（仅作方向建议，不影响 Go/No-Go）。

本报告中：

- “是否存在/是否注册/是否会运行”只使用 A 级证据下结论。
- “应该怎么做/对标什么”明确标为 **建议**，不与事实混写。

---

## 2. 已验证事实（信）

### 2.1 Market Core（内核）已具备关键闭环原语

- **资源发布**：已注册 `market.resource.publish` 及相关资源读写/上下架  
  证据：`extensions/market-core/src/index.ts:110-123`
- **订单**：已注册 `market.order.create/cancel/list`，订单查询链路已补齐  
  证据：`extensions/market-core/src/index.ts:111-113`
- **结算**：已注册 `market.settlement.lock/release/refund/status/query`，结算聚合查询已补齐  
  证据：`extensions/market-core/src/index.ts:180-197`
- **争议链路**：已注册 `market.dispute.open/submitEvidence/resolve/reject/get/list`  
  证据：`extensions/market-core/src/index.ts:215-223`

结论：**内核并非“空壳”，但部分“查询/汇总”能力缺口会直接影响上层交互体验与自动化编排。**

### 2.2 Web3 Core（对外编排）具备较完整的 `web3.market.*` 代理层

- `web3-market` 命令已注册（用于 status/start/enable）  
  证据：`extensions/web3-core/src/index.ts:228-233`
- `web3.market.dispute.*`、`web3.market.resource.*`、`web3.index.*` 等 gateway 方法注册完整度高  
  证据：`extensions/web3-core/src/index.ts:302-408`

结论：**对外编排面是存在的**，但仍受命令输出错误治理与“AI 编排入口”缺失影响。

### 2.3 AI 管家（MarketAssistant）已接入运行面，但仍为规则型交互

- **事实 1：已接入运行面**  
  `market-core` 已注册 `market-assistant` 命令入口，并通过 `createMarketAssistantCommand()` 调用 `MarketAssistant`。  
  证据：`extensions/market-core/src/index.ts`、`extensions/market-core/src/market/assistant-command.ts`

- **事实 2：关键无效调用已收口**  
  助手已改为调用存在的网关契约（如 `market.offer.update`、`market.order.list`、`market.settlement.query`）；`market.automation.setRule` 改为显式降级提示。  
  证据：`extensions/market-core/src/market-assistant.ts`

- **事实 3：意图解析仍是“简化版”，并非 LLM**  
  代码仍采用关键词解析，尚未达到 GA 级自然语言理解能力。  
  证据：`extensions/market-core/src/market-assistant.ts`

结论：**助手链路已可运行并可用于受控内测，但“可畅游”体验仍需后续升级（LLM intent/slot filling）。**

### 2.4 错误治理：命令层已切换到稳定错误码输出

- `web3-market` 命令 catch 分支已统一为 `formatWeb3GatewayErrorResponse(...)` 输出：  
  证据：`extensions/web3-core/src/market/web3-market-command.ts`

- `/pay_status` 读取失败分支已统一为稳定错误码 + 通用描述，不再拼接原始异常：  
  证据：`extensions/web3-core/src/billing/commands.ts`

- 对应回归测试已补齐：  
  证据：`extensions/web3-core/src/market/web3-market-command.test.ts`、`extensions/web3-core/src/billing/commands.test.ts`

结论：**命令层 Gate-ERR-01 阻断项已解除。**

---

## 3. 能力契约（达）：Capability schema 现状与差距

当前 `CapabilityDescriptor.paramsSchema` 类型为 `Record<string, unknown>`（允许多种表达），实际代码出现两种风格：

- **A：字符串映射占位（信息量较低）**：
  - 例：`paramsSchema: { resourceId: "string", q: "string" ... }`  
    证据：`extensions/web3-core/src/capabilities/catalog/tools.ts:13-33`

- **B：JSON Schema object（字段级约束更强）**：
  - 例：`type: "object" + required + properties + pattern/min/max`  
    证据：`extensions/web3-core/src/capabilities/catalog/core.ts:20-85`

结论：**对 Agent/工具编排而言，B 风格更可操作；A 风格更像“占位描述”。**

---

## 4. 复评前整改建议（建议，不等同事实）（雅）

### 4.1 P1：把规则型 AI 管家升级为 LLM 驱动编排

- **建议 A**：在保留当前稳定契约的前提下，引入 LLM intent/slot filling，提高复杂指令可理解性。
- **建议 B**：继续保持“仅调用已注册方法”的约束，新增能力必须先注册再编排。

### 4.2 P1：统一 capability schema 口径

- **建议**：高风险/高频能力（租约、发布、争议、结算查询等）优先升级到 **JSON Schema object** 口径（与 `core.ts` 一致），减少字符串映射占位。

---

## 5. 最终建议

当前项目“内核能力 + P0 关键链路”已可验证：AI 管家已接入运行面并与已注册契约对齐，命令层错误出口已统一稳定错误码。

因此本轮结论更新为：**受控内测 Conditional Go**；GA 仍需在 P1（LLM 编排质量、schema 统一与文档门禁）完成后复评。
