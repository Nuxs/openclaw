### OpenClaw Web3 资源共享配置示例（B-2 附录）

> 本文档是 `web3-brain-architecture.md` 的子文档，提供可直接拷贝的配置片段，覆盖三种部署形态：provider-only / consumer-only / hybrid。
>
> 说明：配置键以 `resources.*` 为准；`maintenance.*` 当前未实现，后续如引入再补示例。实际落地以 `extensions/web3-core/src/config.ts` 与 `extensions/market-core/src/config.ts` 的 schema 为最终权威。

---

## 1) Provider-only（只发布资源，不消费）

适用：你希望把本地模型/搜索/存储开放给其他用户，但本机不租用别人的资源。

### 1.1 `web3-core`（Provider）示例

```yaml
# openclaw.config.yaml（示例片段）
plugins:
  enabled: true
  workspace:
    - id: web3-core
      enabled: true
      config:
        # 仅展示与 resources 相关部分
        resources:
          enabled: true
          advertiseToMarket: true
          provider:
            listen:
              enabled: true
              bind: loopback
              port: 18790
              # 如通过反代暴露给公网/局域网，这里填写公开 URL（不要写内网地址到 summary）
              publicBaseUrl: "https://provider.example.com"
            auth:
              mode: siwe
              tokenTtlMs: 600000
              # 默认空=拒绝；这里显式允许某些 consumer 钱包
              allowedConsumers:
                - "0xcccccccccccccccccccccccccccccccccccccccc"
            offers:
              models:
                - id: "res_model_llama3_70b"
                  label: "Llama 3.3 70B (GPU)"
                  backend: "ollama"
                  backendConfig:
                    baseUrl: "http://127.0.0.1:11434"
                    model: "llama3.3:70b"
                  price:
                    unit: "token"
                    amount: 1
                    currency: "USDC"
                  policy:
                    maxConcurrent: 2
                    maxTokens: 8192
                    allowTools: false
              search:
                - id: "res_search_default"
                  label: "Search (SearxNG)"
                  backend: "searxng"
                  backendConfig:
                    baseUrl: "http://127.0.0.1:8080"
                  price:
                    unit: "query"
                    amount: 10
                    currency: "USDC"
              storage:
                - id: "res_storage_vault"
                  label: "Storage Vault"
                  backend: "filesystem"
                  backendConfig:
                    rootDir: "/Users/USER/storage-root" # 实现时必须做虚拟根映射，禁止路径穿越
                  price:
                    unit: "put"
                    amount: 5
                    currency: "USDC"
                  policy:
                    maxBytes: 10485760
                    allowMime:
                      - "text/plain"
                      - "application/pdf"
          consumer:
            enabled: false

        # 建议保留：审计与计费
        billing:
          enabled: true
          quotaPerSession: 100
          costPerLlmCall: 1
          costPerToolCall: 1
```

### 1.2 `market-core`（目录与结算权威）示例

```yaml
plugins:
  workspace:
    - id: market-core
      enabled: true
      config:
        store:
          mode: sqlite
          migrateFromFile: true
        access:
          mode: allowlist
          requireActor: true
          actorSource: param
          requireActorMatch: true
          allowClientIds:
            - "provider-node-1" # 示例 clientId
        settlement:
          mode: contract
```

---

## 2) Consumer-only（只租用资源，不提供）

适用：你只希望使用 Web3 平台上别人开放的模型/搜索/存储。

### 2.1 `web3-core`（Consumer）示例

```yaml
plugins:
  workspace:
    - id: web3-core
      enabled: true
      config:
        resources:
          enabled: true
          advertiseToMarket: false
          provider:
            listen:
              enabled: false
            auth:
              mode: siwe
              tokenTtlMs: 600000
            offers:
              models: []
              search: []
              storage: []
          consumer:
            enabled: true
            preferLocalFirst: true

        # 主脑切换（B-1）：使用 web3 去中心化主脑
        brain:
          enabled: true
          providerId: "web3-decentralized"
          defaultModel: "res_model_llama3_70b" # 将在租约后被 before_model_resolve 绑定
          allowlist:
            - "res_model_llama3_70b"
          endpoint: "https://provider.example.com" # 由租约/资源发现流程提供（实现时不落 summary）
          protocol: "openai-compat"
          fallback: centralized
          timeoutMs: 30000
```

---

## 3) Hybrid（同机既提供也消费，推荐开发期）

适用：本机既发布部分资源，也可租用别人的资源；开发/联调最方便。

```yaml
plugins:
  workspace:
    - id: web3-core
      enabled: true
      config:
        resources:
          enabled: true
          advertiseToMarket: true
          provider:
            listen:
              enabled: true
              bind: loopback
              port: 18790
            auth:
              mode: siwe
              tokenTtlMs: 600000
              allowedConsumers:
                - "0xcccccccccccccccccccccccccccccccccccccccc"
            offers:
              models:
                - id: "res_model_local_small"
                  label: "Local Small Model"
                  backend: "ollama"
                  backendConfig:
                    baseUrl: "http://127.0.0.1:11434"
                    model: "llama3.2:3b"
                  price: { unit: "token", amount: 1, currency: "USDC" }
                  policy: { maxConcurrent: 1, maxTokens: 4096, allowTools: false }
              search: []
              storage: []
          consumer:
            enabled: true
            preferLocalFirst: true

    - id: market-core
      enabled: true
      config:
        store:
          mode: sqlite
          migrateFromFile: true
        access:
          mode: allowlist
          requireActor: true
          actorSource: param
          requireActorMatch: true
          allowClientIds:
            - "provider-node-1"
            - "consumer-node-1"
```

---

## 4) 配置安全检查清单（上线前必过）

- `resources.provider.listen.bind` 默认应为 `loopback`
- `allowedConsumers` 不应为空（除非你确实要拒绝所有外部）
- 不要把 endpoint、backendConfig、真实路径写入任何 status/summary 输出
- 若未来引入 `maintenance.*`，需确保 batch size 与 interval 不会压垮 I/O
