### OpenClaw Web3 资源共享测试计划（B-2 附录）

> 本文档是 `web3-brain-architecture.md` 的子文档，聚焦 **单元/集成/e2e/负载/安全测试**，让 AI 能直接写测试文件与 mock。

---

## 1. 测试分层

- **Unit**：validators、状态机断言、hashCanonical、store 读写（file/sqlite）
- **Integration**：handlers（market-core）+ store、web3-core tools + http routes
- **E2E**：发布→租约→调用→记账→撤销→过期 sweep
- **Security**：token 脱敏、路径穿越、ledger 伪造

---

## 2. 必测矩阵（补充主文档 12.11.10）

- 双模式必跑：`store.mode=file` 与 `store.mode=sqlite`
- 并发：maxConcurrent 生效
- 大包：413
- 过期：expireSweep 后立即拒绝

---

## 3. Mock 策略

- Provider HTTP：本地起一个 server（可用 node http）
- 模型流：提供最小 SSE/NDJSON 模拟
- storage：临时目录 + 虚拟根

---

## 4. 负载与 SLO（建议）

- `p95` 延迟阈值（模型/搜索/存储分别设定）
- 单 Provider 最大并发与降级策略

---

## 5. 回归清单

- `/pay_status` 不受影响
- market 既有 offer/order/settlement/consent/delivery 流程不回归
