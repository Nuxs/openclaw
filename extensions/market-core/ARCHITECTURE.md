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
└── docs/                      # Implementation docs (internal)
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

### 1. Facade Pattern

- `facade.ts` provides simplified, stable API
- Hides internal complexity (state machine, storage, etc.)
- Semantic versioning for breaking changes

### 2. OpenClaw Plugin Philosophy

> "Core stays lean; optional capability should usually ship as plugins"
> — VISION.md

Market-core IS a plugin, but it's an **internal capability plugin**, not a **user-facing plugin**.

### 3. Complexity Containment

- ✅ Complex state machines are FINE internally
- ✅ 6900 lines of code is ACCEPTABLE
- ❌ Exposing 50+ gateway methods is NOT ACCEPTABLE
- ✅ Exposing 10 high-level operations IS ACCEPTABLE

## 📝 User-Facing Documentation

Users should ONLY see:

```markdown
# Web3 Market Commands

## Check Payment Status

/pay_status

## Publish Resource

Gateway: web3.market.resource.publish
Params: { resourceId, metadata }

## Lease Resource

Gateway: web3.market.lease.issue
Params: { resourceId, consumer, durationSec }
```

NO mention of:

- `market.*` namespace
- Internal state machine
- Settlement/consent/delivery details
- market-core plugin

## 🚀 Migration Notes

### Before (2026.2.16)

- market-core registered 50+ `market.*` gateway methods
- web3-core registered 20+ `web3.market.*` gateway methods
- Duplication and confusion

### After (2026.2.21)

- market-core registers 0 gateway methods
- market-core exports Facade API
- web3-core is the ONLY gateway registrar
- Users see unified `web3.*` namespace

## 🔧 Development Workflow

### Adding New Market Features

1. Implement handler in `market-core/src/market/handlers.ts`
2. Add method to `facade.ts` interface
3. Update `web3-core/src/market/handlers.ts` to call facade
4. Register gateway in `web3-core/src/index.ts`
5. Update USER documentation (only `web3.*`)

### Testing

```bash
# Unit tests (internal)
pnpm test extensions/market-core

# Integration tests (through web3-core)
pnpm test extensions/web3-core

# E2E tests (user-facing)
pnpm test:e2e
```

## 📖 References

- [OpenClaw VISION.md](../../VISION.md) - Plugin philosophy
- [Web3 Market Assessment](../../skills/web3-market/references/web3-market-assessment-2026-02-19.md) - Architecture decisions
- [Market Facade API](./src/facade.ts) - External interface
- [Web3 Core Gateway](../web3-core/src/index.ts) - Public API
