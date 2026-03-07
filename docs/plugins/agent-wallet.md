---
summary: "Agent Wallet plugin: agent-owned wallet primitives for EVM/TON, including policy-guarded autopay"
read_when:
  - You want an agent-owned wallet for signing or sending transactions
  - You are configuring the agent-wallet plugin
  - You need the low-level `agent-wallet.*` methods behind `web3.wallet.*`
title: "Agent Wallet Plugin"
doc_family: "web3"
doc_layer: "guide"
normative: false
---

## What it is

`agent-wallet` is the low-level wallet plugin for OpenClaw. It creates (or loads) an **agent-owned wallet**, stores the secret **encrypted at rest**, and exposes signing/payment primitives.

Current chain behavior:

- **EVM mode**: `create`, `balance`, `sign`, `send`, `autopay`
- **TON mode**: `create`, `balance`, `send`, `autopay`
- **Current boundary**: TON signing is not supported yet; `agent-wallet.sign` / `web3.wallet.sign` require EVM mode underneath

It runs inside the Gateway process.

## Important scope notes

- `agent-wallet.*` is the low-level plugin namespace owned by this plugin.
- When `web3-core` is installed, it also exposes `web3.wallet.*` proxy methods and capability catalog entries as the public Web3 wallet entrypoint.
- UI, agents, and external docs should prefer `web3.wallet.*`; direct `agent-wallet.*` calls are mainly for plugin-level/debug use.
- Policy-guarded `autopay` is supported and routes by configured chain (`evm` or `ton`).

## Install

### Option A: local folder (repo dev)

```bash
openclaw plugins install ./extensions/agent-wallet
cd ./extensions/agent-wallet && pnpm install
```

Restart the Gateway afterwards.

## Config

Set config under `plugins.entries.agent-wallet.config`.

```json5
{
  plugins: {
    entries: {
      "agent-wallet": {
        enabled: true,
        config: {
          enabled: true,

          // Required. Treat as a secret. Do not commit it to your repo.
          // Use a high-entropy random value.
          encryptionKey: "${AGENT_WALLET_ENCRYPTION_KEY}",

          // Optional. Defaults to: ~/.openclaw/credentials/agent-wallet/wallet.json
          storePath: "${AGENT_WALLET_STORE_PATH}",

          chain: {
            network: "base", // ethereum | base | optimism | arbitrum | sepolia | ton-mainnet | ton-testnet
          },
        },
      },
    },
  },
}
```

Notes:

- The wallet file is stored encrypted (AES-256-GCM). The encryption key is derived from `encryptionKey` (current implementation uses SHA-256).
- **Never** log or copy/paste real secrets (encryption keys, private keys, RPC URLs with embedded tokens).

## Gateway methods

- `agent-wallet.create` → `{ address, publicKey }`
- `agent-wallet.balance` → `{ address, balance, symbol }`
- `agent-wallet.sign` → `{ signature }` (**EVM mode only**)
- `agent-wallet.send` → `{ txHash }`
- `agent-wallet.autopay` → policy-guarded payment execution (`evm` / `ton` routed by config)

When `web3-core` is present, the public entrypoint is mirrored as:

- `web3.wallet.create`
- `web3.wallet.balance`
- `web3.wallet.sign`
- `web3.wallet.send`
- `web3.wallet.autopay`

`agent-wallet.send` params (hint):

```json
{ "to": "0x...", "value": "123", "data": "0x..." }
```

## Errors (stable)

This plugin returns stable `E_*` error codes and safe, shareable messages (no endpoint/token/real path leakage). Common codes:

- `E_INVALID_ARGUMENT`
- `E_NOT_CONFIGURED`
- `E_FORBIDDEN`
- `E_UNAVAILABLE`
- `E_INTERNAL`

## Related docs

- Web3 Core plugin: [/plugins/web3-core](/plugins/web3-core)
- Market Core plugin: [/plugins/market-core](/plugins/market-core)
- Web3 Market overview: [/concepts/web3-market](/concepts/web3-market)
