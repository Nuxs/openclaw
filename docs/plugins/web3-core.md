---
summary: "Web3 Core plugin for audit anchoring, wallet identity, decentralized archive, and billing controls"
read_when:
  - You need Web3 audit anchoring and decentralized archive support
  - You are configuring or debugging the web3-core plugin
  - You want usage billing and quota enforcement tied to sessions
title: "Web3 Core Plugin"
doc_family: "web3"
doc_layer: "guide"
normative: false
---

# Web3 Core (plugin)

The Web3 Core plugin provides audit anchoring, decentralized storage, wallet identity, and
usage billing for OpenClaw. It runs inside the Gateway process and exposes commands,
hooks, and gateway methods for UI and integrations.

It also acts as the orchestration layer for Web3 Market mode:

- It helps the UI and the agent get **identity, audit, archive, and usage summaries**.
- It powers the **Web3 dashboard** (UI Web3 tab + `/web3` command) for a one-page health view.
- It can integrate with `market-core` for **settlement status** (escrow lock/release/refund).
- For agent-owned signing/sending, pair it with the [`agent-wallet` plugin](/plugins/agent-wallet).
- When resource sharing is enabled, it can expose **provider routes** (model/search/storage) and
  **consumer tools**, while keeping sensitive data out of logs and docs.

Security note:

- Provider endpoints are sensitive assets. Do not treat them as public API surface.
- `web3.index.*` is an internal discovery surface and **must not expose provider endpoints by default**. If endpoint-like values exist for local debugging, they must be redacted in outputs and never appear in logs, errors, status output, or tool results.
- Dual-stack (TON + EVM) planning and reconciliation output formats are defined in [/web3/WEB3_DUAL_STACK_STRATEGY](/web3/WEB3_DUAL_STACK_STRATEGY) and [/reference/web3-dual-stack-payments-and-settlement](/reference/web3-dual-stack-payments-and-settlement).

Quick mental model:

- Install plugin
- Restart Gateway
- Configure under `plugins.entries.web3-core.config`
- Use commands or gateway methods

## Where it runs

The Web3 Core plugin runs inside the Gateway process. If you use a remote Gateway,
install and configure the plugin on the machine running the Gateway, then restart it.

## Install

### Option A: local folder (repo dev)

```bash
openclaw plugins install ./extensions/web3-core
cd ./extensions/web3-core && pnpm install
```

Restart the Gateway afterwards.

## Config

Set config under `plugins.entries.web3-core.config`.

```json5
{
  plugins: {
    entries: {
      "web3-core": {
        enabled: true,
        config: {
          chain: {
            network: "base", // base | optimism | arbitrum | ethereum | sepolia
            rpcUrl: "https://mainnet.base.org",
            privateKey: "${WEB3_CHAIN_PRIVATE_KEY}",
          },
          storage: {
            provider: "ipfs", // ipfs | arweave | filecoin
            gateway: "https://w3s.link",
            pinataJwt: "${PINATA_JWT}",
          },
          privacy: {
            onChainData: "hash_only", // hash_only | hash_and_meta | encrypted_content
            archiveEncryption: true,
            redactFields: ["apiKey", "token", "password", "secret", "privateKey"],
          },
          identity: {
            allowSiwe: true,
            requiredChainId: 8453,
          },
          billing: {
            enabled: true,
            quotaPerSession: 1000,
            costPerLlmCall: 1,
            costPerToolCall: 0.5,

            // Usage billing is a credits/quota guard. Settlement escrow is owned by market-core.
            // These fields are optional metadata for downstream settlement UI/integrations.
            paymentTokenAddress: "0xPAYMENT_TOKEN",
            paymentReceiverAddress: "0xRECEIVER_ADDRESS",

            // FXQuote configuration (optional)
            fxQuote: {
              defaultTtlMs: 300000, // 5 minutes
              cacheMaxSize: 100, // max cached quotes
            },
          },
        },
      },
    },
  },
}
```

Notes:

- Anchoring requires `chain.privateKey`. Without it, anchors are queued as pending.
- For IPFS uploads, set `storage.pinataJwt`.
- Defaults are defined in the plugin config and manifest.

## Payment modules

The Web3 Core plugin provides payment orchestration modules for dual-stack (TON + EVM) support:

### FXQuote Module (`billing/fx-quote.ts`)

Manages foreign exchange quotes for dual-stack payments:

- **Cache management**: TTL-based cache with composite keys (`fromAsset:toAsset:rate:source`)
- **Snapshot persistence**: Quotes are persisted with `PaymentRequiredRecord` for reconciliation
- **Source tracing**: Tracks quote origin (`binance-spot`, `pyth-oracle`, `manual`, etc.)

Key functions:

- `resolveOrBuildFXQuote()`: Resolve from cache or build new quote
- `materializeQuote()`: Apply invoice-specific context to base quote
- `getCachedQuote()`: Retrieve with TTL validation

### Payment Orchestrator (`billing/payment-orchestrator.ts`)

Coordinates the complete payment flow:

- **Invoice parsing**: Extract payment details from HTTP 402 responses
- **Intent building**: Create `PaymentIntent` with idempotency keys
- **Circuit breaker**: Track autopay failures and enforce cooldown periods
- **Record persistence**: Store `PaymentRequiredRecord` for retry and reconciliation

Key functions:

- `buildPaymentIntent()`: Construct payment intent with order/quote association
- `buildPaymentRequiredRecord()`: Create persistent payment record
- `isAutopayCircuitOpen()`: Check if autopay is in cooldown

### Treasury Router Runtime (`billing/treasury-router.runtime.ts`)

Cross-extension boundary for treasury route resolution:

- Delegates to `@openclaw/market-core` for authoritative routing logic
- Returns `TreasuryRoute` with `direct` or `bridge` strategy
- Supports stablecoin routing (TON payments → EVM settlement)

### Reconciliation Module (`market/reconciliation.ts`)

Generates shareable, redacted reconciliation summaries:

- **Multi-source aggregation**: Combines payment, ledger, dispute, service proof data
- **Payment trace**: Resolves `PaymentIntent` and `FXQuote` from stored records
- **Safe output**: All fields redacted for safe sharing (no endpoints/tokens/paths)

Gateway method: `web3.market.reconciliation.summary`

## Commands

- **`/bind_wallet`**: Validate address input and direct users to SIWE verification.
- **`/unbind_wallet`**: Remove a bound wallet address.
- **`/whoami_web3`**: Show bound wallets and identity summary.
- **`/credits`**: Show usage credits and quota.
- **`/pay_status`**: Query settlement status from market state (orderId or settlementId).
- **`/audit_status`**: Show recent audit anchoring events.
- **`/web3`**: One-page Web3 dashboard (identity, billing, audit, market health).
- **`/web3-market`**: Web3 Market status and enable guidance.
  - `status [deep]`: probes market endpoints (default `fast`; use `deep` for lists)
  - `start`: prints the `/config set ...` steps to enable Web3 Market (does not write config)
  - `enable ok`: applies the guided enablement baseline; treat as a write operation and require explicit operator confirmation

## Hooks

Audit trail hooks:

- `llm_input`
- `llm_output`
- `after_tool_call`
- `session_end`

Billing hooks:

- `before_tool_call`
- `llm_output`

## Gateway RPC

> Public-contract governance:
>
> - Runtime inventory: `extensions/web3-core/src/index.ts`
> - Exact public contract, availability, and `stability`: `web3.capabilities.*`
> - This section is a grouped summary; field-level params/returns should follow the capability catalog, not this page

- **Capability / identity**: `web3.capabilities.*`, `web3.siwe.*`, `web3.identity.resolveEns`, `web3.identity.reverseEns`
- **Wallet**: `web3.wallet.create`, `web3.wallet.balance`, `web3.wallet.sign`, `web3.wallet.send`, `web3.wallet.autopay`
- **Audit / billing / status**: `web3.audit.query`, `web3.billing.status`, `web3.billing.summary`, `web3.billing.paymentTrace.query`, `web3.billing.handlePaymentRequired`, `web3.billing.consumePaymentRequired`, `web3.status.summary`
- **Reward**: `web3.reward.get`, `web3.reward.list`, `web3.reward.claim`, `web3.reward.updateStatus`
- **Market public surface** (when enabled): `web3.market.resource.*`, `web3.market.order.list`, `web3.market.settlement.query`, `web3.market.lease.*`, `web3.market.service.proof.*`, `web3.market.ledger.*`, `web3.market.reputation.summary`, `web3.market.tokenEconomy.*`, `web3.market.bridge.*`, `web3.market.metrics.snapshot`, `web3.market.reconciliation.summary`, `web3.market.status.summary`, `web3.market.dispute.*`
- **Compatibility resource aliases**: `web3.resources.*`
- **Discovery / monitoring**: `web3.index.*`, `web3.metrics.*`, `web3.monitor.*`

Notes:

- `web3.capabilities.*` descriptors include `stability: stable | experimental | internal` for UI/agent gating.
- `web3.status.summary` includes an optional `identity` summary (bindings + SIWE flag) for dashboard rendering.
- `web3.wallet.sign` is currently only available when the underlying `agent-wallet` runs in EVM mode; TON signing remains unsupported.

## Agent tools (LLM)

Consumer tools (require an active lease; output must be redacted):

- `web3.search.query`
- `web3.storage.put`
- `web3.storage.get`
- `web3.storage.list`

Web3 Market orchestration tools (help the agent complete buyer/seller flows; output is redacted):

Status tool (redacted, safe to paste/share):

- `web3_market_status` (params: `profile=fast|deep`)

- `web3.market.index.list`
- `web3.market.lease`
- `web3.market.lease.revoke`
- `web3.market.resource.publish`
- `web3.market.resource.unpublish`
- `web3.market.ledger.summary`
- `web3.market.ledger.list`

补充说明：以下能力当前属于 **Gateway RPC** 读写面，而不是 agent tool：

- `web3.market.reputation.summary`
- `web3.market.tokenEconomy.*`
- `web3.market.bridge.*`
- `web3.market.metrics.snapshot`
- `web3.market.reconciliation.summary`
- `web3.market.dispute.*`

## Example debug flow

1. Enable the plugin and restart the Gateway.
2. Trigger activity by sending a message that calls tools or the LLM.
3. Query audit status and billing summaries.

Example (RPC payloads are illustrative):

```json5
{
  method: "web3.audit.query",
  params: { limit: 10 },
}
```

```json5
{
  method: "web3.billing.summary",
  params: { sessionKey: "session-abc" },
}
```

```json5
{
  method: "web3.status.summary",
  params: {},
}
```

Expected signals:

- **Audit**: `auditEventsRecent` increases and `auditLastAt` advances as hooks fire.
- **Billing**: `usage` reflects LLM/tool cost increments.
- **Anchoring**: `pendingAnchors` decreases after the background service retries.
- **Archive**: `archiveLastCid` updates after successful archival.

## UI integration notes

The UI reads Web3 summary data via gateway methods and presents it on overview
and usage screens.

- **Usage detail**: `web3.billing.summary` surfaces credits, call counts, and last activity.
- **Overview**: `web3.status.summary` shows audit/archive/anchoring health at a glance.

Suggested UI refresh cadence:

- Refresh on view load.
- Provide a manual refresh button.
- Avoid polling faster than once every 30 seconds.

## Related docs

- Web3 Market overview: [Web3 Market](/concepts/web3-market)
- Web3 Market dev guide: [Web3 Market Dev](/reference/web3-market-dev)
- Web3 resource sharing API: [Web3 Resource Market API](/reference/web3-resource-market-api)
- [Plugins](/tools/plugin)
- [Plugin manifest](/plugins/manifest)
