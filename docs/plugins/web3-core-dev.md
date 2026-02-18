---
summary: "Web3 Core development guide with integration points, data flows, and APIs"
read_when:
  - You are extending web3-core or integrating it into the OpenClaw UI
  - You need a reference for audit anchoring, SIWE, and billing flows
  - You want concrete interface docs for gateway methods and commands
title: "Web3 Core Dev Guide"
---

# Web3 Core Dev Guide

This document is the development reference for the `web3-core` plugin. It covers
OpenClaw integration points, architecture, data flows, and concrete interfaces so
you can execute extension plans with minimal backtracking.

## Scope

- Plugin entry points and OpenClaw integration
- Architecture and data flow diagrams
- Config schema and local persistence
- Commands, hooks, and gateway RPC interfaces
- UI integration touchpoints

## Integration points in OpenClaw

The plugin integrates through the core plugin API and lifecycle hooks:

- **Plugin registration**: `register(api)` in `extensions/web3-core/src/index.ts`
- **Hooks**: `api.on("llm_input")`, `api.on("llm_output")`, `api.on("after_tool_call")`, `api.on("session_end")`
- **Billing guard hooks**: `api.on("before_tool_call")`, `api.on("llm_output")`
- **Gateway methods**: `api.registerGatewayMethod("web3.*", handler)`
- **Background service**: `api.registerService({ id: "web3-anchor-service" })`

OpenClaw hook event shapes and contexts are defined in `src/plugins/types.ts`.

## Architecture

```mermaid
flowchart LR
  subgraph OpenClaw Gateway
    Hooks[Hook events]
    API[Plugin API]
    UI[Control UI]
  end

  Hooks -->|llm_input/llm_output| Audit[Audit Hooks]
  Hooks -->|after_tool_call| Audit
  Hooks -->|session_end| Audit
  Hooks -->|before_tool_call| BillingGuard[Billing Guard]

  API -->|registerGatewayMethod| GatewayRPC[web3.* RPC]
  API -->|registerService| AnchorSvc[Anchor Service]

  Audit --> Store[Web3StateStore]
  BillingGuard --> Store
  GatewayRPC --> Store
  AnchorSvc --> Chain[EVM Chain Adapter]

  Store -->|audit-log.jsonl| LocalAudit
  Store -->|usage.json| LocalUsage
  Store -->|pending-tx.json| LocalPending

  Audit --> Archive[Archive Pipeline]
  Archive --> IPFS[Pinata or gateway]
  Audit --> Chain

  UI -->|web3.billing.summary| GatewayRPC
  UI -->|web3.status.summary| GatewayRPC
```

## Data flow

### Audit and anchoring

```mermaid
sequenceDiagram
  participant LLM as LLM/Tool Hooks
  participant Audit as Audit Hooks
  participant Store as Web3StateStore
  participant Archive as Archive Pipeline
  participant Chain as EVM Adapter

  LLM->>Audit: llm_input / llm_output / after_tool_call / session_end
  Audit->>Store: appendAuditEvent
  Audit->>Archive: encrypt + upload (optional)
  Archive-->>Audit: cid/uri
  Audit->>Chain: anchor hash (optional)
  Chain-->>Audit: tx / block
  Audit->>Store: save pending if no signer or failure
```

### Billing

```mermaid
sequenceDiagram
  participant Guard as Billing Guard
  participant Store as Web3StateStore

  Guard->>Store: getUsage(sessionIdHash)
  alt quota exhausted
    Guard-->>Guard: block tool call
  else allowed
    Guard->>Store: increment creditsUsed
    Guard->>Store: increment toolCalls or llmCalls
  end
```

### SIWE identity

```mermaid
sequenceDiagram
  participant UI as Client or UI
  participant Gateway as web3.siwe.*
  participant Store as Web3StateStore

  UI->>Gateway: web3.siwe.challenge(address)
  Gateway-->>UI: { message, nonce, expiresAt }
  UI->>Gateway: web3.siwe.verify(message, signature)
  Gateway->>Store: addBinding(address, chainId)
  Gateway-->>UI: { ok: true, address, chainId }
```

## Config model

The plugin reads configuration from `plugins.entries.web3-core.config` and merges
with defaults in `extensions/web3-core/src/config.ts`.

### Config keys

- **`chain.network`**: `base | optimism | arbitrum | ethereum | sepolia`
- **`chain.rpcUrl`**: RPC endpoint
- **`chain.privateKey`**: signer key for anchoring
- **`storage.provider`**: `ipfs | arweave | filecoin`
- **`storage.gateway`**: HTTP gateway for archived content
- **`storage.pinataJwt`**: Pinata JWT for IPFS uploads
- **`privacy.onChainData`**: `hash_only | hash_and_meta | encrypted_content`
- **`privacy.archiveEncryption`**: encrypt archive payloads
- **`privacy.redactFields`**: fields redacted before hashing and storage
- **`identity.allowSiwe`**: enable SIWE
- **`identity.requiredChainId`**: enforce chain id
- **`billing.enabled`**: enable quota and usage
- **`billing.quotaPerSession`**: credits per session
- **`billing.costPerLlmCall`**: cost per LLM call
- **`billing.costPerToolCall`**: cost per tool call

## Local persistence

State lives under the Gateway state directory in `web3/`:

- `web3/bindings.json` wallet bindings
- `web3/audit-log.jsonl` append only audit log
- `web3/usage.json` billing state
- `web3/pending-tx.json` pending anchor queue
- `web3/archive-key.json` archive encryption key

## Interfaces

### Commands

- **`/bind_wallet <0x...>`**: add wallet binding
- **`/unbind_wallet <0x...>`**: remove wallet binding
- **`/whoami_web3`**: list bindings
- **`/credits`**: session credits and usage
- **`/pay_status`**: payment status placeholder
- **`/audit_status`**: recent audit events

### Hooks

- **Audit**: `llm_input`, `llm_output`, `after_tool_call`, `session_end`
- **Billing**: `before_tool_call`, `llm_output`

### Gateway RPC

#### `web3.siwe.challenge`

**Params**

```json
{ "address": "0xabc..." }
```

**Response**

```json
{ "message": "...", "nonce": "...", "expiresAt": "..." }
```

#### `web3.siwe.verify`

**Params**

```json
{ "message": "...", "signature": "0x..." }
```

**Response**

```json
{ "ok": true, "address": "0x...", "chainId": 8453 }
```

#### `web3.audit.query`

**Params**

```json
{ "limit": 50 }
```

**Response**

```json
{ "events": ["..."], "count": 50 }
```

Each event follows `AuditEvent` with fields such as `id`, `kind`, `timestamp`,
`sessionIdHash`, `payloadHash`, `archivePointer`, and `chainRef`.

#### `web3.billing.status`

**Params**

```json
{ "sessionIdHash": "..." }
```

**Response**

```json
{ "enabled": true, "sessionIdHash": "...", "usage": { "creditsUsed": 10 } }
```

#### `web3.billing.summary`

**Params**

```json
{ "sessionKey": "..." }
```

**Response**

```json
{
  "enabled": true,
  "sessionIdHash": "...",
  "usage": {
    "creditsUsed": 10,
    "creditsQuota": 1000,
    "llmCalls": 3,
    "toolCalls": 2,
    "lastActivity": "2026-02-18T12:34:56.000Z"
  }
}
```

#### `web3.status.summary`

**Params**

```json
{}
```

**Response**

```json
{
  "auditEventsRecent": 5,
  "auditLastAt": "2026-02-18T12:34:56.000Z",
  "archiveProvider": "ipfs",
  "archiveLastCid": "bafy...",
  "anchorNetwork": "base",
  "anchorLastTx": "0x...",
  "pendingAnchors": 0,
  "anchoringEnabled": true
}
```

## UI integration

The Control UI consumes gateway summaries:

- **Usage page**: `web3.billing.summary`
- **Overview page**: `web3.status.summary`

Suggested client behavior:

- Load on view entry
- Allow manual refresh
- Avoid polling faster than 30 seconds

## Debug and operational notes

- **No signer key**: anchoring is queued into `pending-tx.json`.
- **IPFS uploads**: require `storage.pinataJwt`.
- **SIWE nonce store**: in memory and resets on Gateway restart.

## Related docs

- [Plugins](/tools/plugin)
- [Plugin manifest](/plugins/manifest)
