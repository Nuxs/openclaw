# Market Core Architecture

## 🎯 Design Philosophy (OpenClaw-First)

Market Core follows the **OpenClaw-first** product strategy:

1. **Internal Engine**: This plugin is an internal capability engine, NOT a standalone service
2. **Single Entry Point**: All external access goes through `web3-core`'s `web3.*` / `web3.market.*` gateways
3. **User Experience**: Users only interact with unified commands like `/pay_status`, `/credits`
4. **Complexity Containment**: Internal complexity is hidden behind stable facades

## 📊 Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    User / AI Agent                           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ├─ Commands: /pay_status, /credits, etc.
                  ├─ Gateway: web3.* / web3.market.* (single entry)
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                     web3-core                                │
│  - Identity (SIWE, wallet binding)                           │
│  - Audit Trail (hooks, anchoring)                            │
│  - Billing Guard (pre-call checks)                           │
│  - Market Facade (calls market-core internally)              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Inter-plugin API (Facade)
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                   market-core                                │
│  - Resource Registry (publish/unpublish)                     │
│  - Lease Manager (issue/revoke/expire)                       │
│  - Settlement Engine (lock/release/refund)                   │
│  - Dispute Resolution (open/evidence/resolve)                │
│  - Ledger (authoritative accounting)                         │
│  - State Machine (consistency guarantees)                    │
└──────────────────────────────────────────────────────────────┘
```

## 🔒 Security Model

### Gateway Registration

- ✅ **market-core registers internal `market.*` gateways** (access-controlled)
- ✅ **web3-core registers `web3.*` / `web3.market.*` gateways**
- ✅ **market-core exports Facade API for web3-core** (optional in-process access)

### Why This Design?

1. **Single Security Boundary**: All security gates (billing, auth, rate-limiting) enforced at web3-core
2. **Stable Contract**: `web3.*` namespace is the only public API surface
3. **Safe Upgrades**: Internal market-core changes don't break user contracts
4. **Controllable**: Plugin can be disabled/replaced without touching user commands

## 📦 Module Structure

```
market-core/
├── src/
│   ├── facade.ts              # Optional in-process interface
│   ├── index.ts               # Plugin definition + market.* gateway registration
│   ├── config.ts              # Configuration schema
│   ├── market/
│   │   ├── handlers.ts        # Internal request handlers
│   │   ├── resources.ts       # Resource registry
│   │   ├── state-machine.ts   # State transitions
│   │   └── ...                # Other internal modules
│   └── state/
│       └── store.ts           # State persistence
└── demo.ts                    # 功能演示脚本
```

## 🔄 Inter-Plugin Communication

### How web3-core accesses market-core:

```typescript
// In market-core/src/index.ts
register(api) {
  api.registerGatewayMethod("market.resource.publish", handler);
  // ... other market.* methods
}

// In web3-core/src/market/handlers.ts
export function createMarketResourcePublishHandler(config) {
  return async ({ params, respond }) => {
    const result = await callGateway({ method: "market.resource.publish", params });
    respond(result.ok, result.result ?? {});
  };
}
```

### Benefits:

- ✅ Type-safe interface
- ✅ No HTTP overhead
- ✅ Shared state (both run in same process)
- ✅ Easy to test

## 🎨 Design Principles

### 1) Single entry for user-facing contracts

- **Public contract**: user/agent/UI should integrate via `web3.*` (registered by `web3-core`).
- **Internal authority**: `market-core` currently registers access-controlled `market.*` gateway methods as the authoritative execution layer.

> If any extension-level doc conflicts with the repo’s Web3 contract, treat the contract as authoritative:
>
> - `docs/reference/web3-resource-market-api.md`
> - `docs/reference/web3-market-output-redaction.md`
> - `skills/web3-market/**` (design constraints / non-negotiables)

### 2) Safety by default (non-negotiables)

- **Never leak**: `accessToken`, provider endpoints, real file paths (in errors/logs/status/tool results).
- **One-time token**: plaintext token may only appear in the successful lease issuance response (`market.lease.issue` and its `web3.*` proxy), and only once.
- **Provider-only ledger**: `market.ledger.append` must reject consumer-forged entries.

### 3) State & storage

- `market-core` persists under `STATE_DIR/market/` (file or SQLite; behaviors must match).

## ✅ Current integration snapshot (2026.2.21)

- `market-core` registers internal `market.*` gateway methods (access-controlled) and is the authoritative state machine.
- `web3-core` exposes the user-facing `web3.*` / `web3.market.*` methods, and may proxy into `market.*`.
- `market-core` also exports an **optional** in-process facade (for internal callers/tests), but the primary integration surface remains the gateway methods.

## 🔧 Development workflow

### Adding new market behavior

1. Implement/extend handler in `market-core/src/market/handlers/*`.
2. Register/extend the corresponding internal `market.*` gateway method in `market-core/src/index.ts`.
3. If the capability is user/agent-facing, add/update the `web3.*` proxy/handler in `web3-core` (and keep output redaction + stable errors).
4. Update the contract docs first when changing behavior:
   - `docs/reference/web3-resource-market-api.md`
   - `docs/reference/web3-market-output-redaction.md`

### Testing (minimum)

```bash
pnpm test extensions/market-core
pnpm test extensions/web3-core
pnpm test:e2e
```

## 📖 References

- `docs/reference/web3-resource-market-api.md`
- `docs/reference/web3-market-output-redaction.md`
- `skills/web3-market/references/web3-market-resource-security.md`
- `skills/web3-market/references/web3-market-resource-ops.md`
- `../web3-core/src/index.ts`
- `./src/index.ts`
