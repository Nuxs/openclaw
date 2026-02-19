### OpenClaw Web3 资源共享安全模型（B-2 附录）

> 本文档是 `web3-brain-architecture.md` 的子文档，聚焦 **威胁模型、鉴权/授权、滥用防护与敏感信息治理**，用于 AI 直接落地 Provider HTTP routes 与 market/web3 handlers。

---

## 1. 资产与信任边界

- **资产**：
  - `accessToken` 明文（最高敏感）
  - Provider 的 endpoint（内网地址/公网反代）
  - Provider 本地文件系统路径
  - `ledger` 权威账本（影响结算）
  - Wallet identity（SIWE）

- **边界**：
  - Consumer ↔ Market（gateway methods）
  - Consumer ↔ Provider（HTTP routes）
  - Provider ↔ Market（写入权威 ledger / 撤销）

---

## 2. 威胁模型（必测项）

- **T1：token 泄露**（日志、session transcript、错误消息、summary 输出）
- **T2：token 重放**（租约撤销后仍可调用）
- **T3：消费者伪造账本**（写 `market.ledger.append`）
- **T4：SSRF / 内网探测**（Consumer 通过资源调用让 Provider 访问内网）
- **T5：路径穿越**（storage put/get 的 path 注入）
- **T6：资源滥用**（高并发、超大 payload、无限搜索）

---

## 3. 鉴权与授权（强制规则）

### 3.1 Gateway Methods（market-core）

- 写操作：必须 `assertAccess(...,"write")`
- `actorId` 强制建议：
  - `market.ledger.append`：必须 `actorId === entry.providerActorId`（权威账本）

### 3.2 Provider HTTP Routes（web3-core）

- `Authorization: Bearer <accessToken>` 必须验证：
  - token hash 命中 lease
  - lease `status=lease_active`
  - `expiresAt > now`
  - resource `status=resource_published`
  - policy 约束（并发/大小/速率）

---

## 4. 速率限制与资源隔离

- **按 leaseId 限流**：每分钟请求数、并发上限（`policy.maxConcurrent`）
- **按 consumerActorId 限流**：防止一个 consumer 扫整个资源池
- **payload 上限**：
  - model: max tokens / max input bytes
  - search: max query length
  - storage: maxBytes + mime allowlist

---

## 5. 敏感信息治理（输出/日志/审计）

- **禁止输出**：`accessToken`、endpoint、真实路径、provider backendConfig
- **允许输出**：`accessTokenHash`（hash）、虚拟路径（storage）、resourceId/leaseId
- **脱敏机制**：
  - tool*result_persist：若任何工具结果包含 `tok*`前缀字符串，必须替换为`tok\_\*\*\*`

---

## 6. 存储安全

- token 明文如需落盘：必须 external credentials store（AES-256-GCM）
- storage backend（filesystem）：
  - 必须映射到虚拟根目录（chroot 风格）
  - 拒绝 `..`、绝对路径、以及控制字符

---

## 7. 安全测试清单（e2e）

- token 不出现在：错误、summary、audit-log、session transcript
- revoke 后立即拒绝调用（401/403）
- 非 provider actor 写 ledger 被拒绝
- storage path traversal 被拒绝
- 大 payload 被拒绝（413）
