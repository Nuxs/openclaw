---
summary: "Web3 Core plugin for audit anchoring, wallet identity, decentralized archive, and billing controls"
read_when:
  - You need Web3 audit anchoring and decentralized archive support
  - You are configuring or debugging the web3-core plugin
  - You want usage billing and quota enforcement tied to sessions
title: "Web3 Core Plugin"
---

# Web3 Core (plugin)

The Web3 Core plugin provides audit anchoring, decentralized storage, wallet identity, and
usage billing for OpenClaw. It runs inside the Gateway process and exposes commands,
hooks, and gateway methods for UI and integrations.

It also acts as the orchestration layer for Web3 Market mode:

- It helps the UI and the agent get **identity, audit, archive, and usage summaries**.
- It can integrate with `market-core` for **settlement status** (escrow lock/release/refund).
- When resource sharing is enabled, it can expose **provider routes** (model/search/storage) and
  **consumer tools**, while keeping sensitive data out of logs and docs.

Security note:

- Provider endpoints are sensitive assets. Do not treat them as public API surface.
- `web3.index.*` is an internal discovery surface and **must not expose provider endpoints by default**. If endpoint-like values exist for local debugging, they must be redacted in outputs and never appear in logs, errors, status output, or tool results.
- Dual-stack (TON + EVM) planning and reconciliation output formats are defined in `docs/web3/WEB3_DUAL_STACK_STRATEGY.md` and `docs/reference/web3-dual-stack-payments-and-settlement.md`.

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
            privateKey: "0xYOUR_SIGNER_PRIVATE_KEY",
          },
          storage: {
            provider: "ipfs", // ipfs | arweave | filecoin
            gateway: "https://w3s.link",
            pinataJwt: "PINATA_JWT",
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

## Commands

- **`/bind_wallet`**: Validate address input and direct users to SIWE verification.
- **`/unbind_wallet`**: Remove a bound wallet address.
- **`/whoami_web3`**: Show bound wallets and identity summary.
- **`/credits`**: Show usage credits and quota.
- **`/pay_status`**: Query settlement status from market state (orderId or settlementId).
- **`/audit_status`**: Show recent audit anchoring events.
- **`/web3-market`**: Web3 Market status and enable guidance.
  - `status [deep]`: probes market endpoints (default `fast`; use `deep` for lists)
  - `start`: prints the `/config set ...` steps to enable Web3 Market (does not write config)

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

- `web3.capabilities.list` (params: `includeUnavailable?`, `includeDetails?`, `group?`)
- `web3.capabilities.describe` (params: `name`, `includeUnavailable?`)
- `web3.siwe.challenge` (params: `address`)
- `web3.siwe.verify` (params: `message`, `signature`)
- `web3.audit.query` (params: `limit?`)
- `web3.billing.status` (params: `sessionIdHash`)
- `web3.billing.summary` (params: `sessionKey?`, `sessionId?`, `senderId?`, `sessionIdHash?`)
- `web3.status.summary` (no params)

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
