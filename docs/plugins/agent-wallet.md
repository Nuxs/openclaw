---
summary: "Agent Wallet plugin: agent-owned wallet for signing and sending EVM transactions"
read_when:
  - You want an agent-owned EVM wallet for signing or sending transactions
  - You are configuring the agent-wallet plugin
  - You need the gateway methods for agent-wallet.*
title: "Agent Wallet Plugin"
---

## What it is

`agent-wallet` is a plugin that creates (or loads) an **agent-owned EVM wallet**, stores the private key **encrypted at rest**, and exposes gateway methods for:

- Creating/loading the wallet
- Getting balance
- Signing messages
- Sending transactions

It runs inside the Gateway process.

## Important scope notes

- This plugin currently exposes **only** `agent-wallet.*` gateway methods.
- It does **not** (yet) provide `web3.wallet.*` aliases, and it is not (yet) listed in `web3.capabilities.*`.

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
            network: "base", // ethereum | base | optimism | arbitrum | sepolia
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
- `agent-wallet.sign` → `{ signature }`
- `agent-wallet.send` → `{ txHash }`

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
