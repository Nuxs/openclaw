# Architecture Refactoring Report

## 📅 Date: 2026-02-21

## 🎯 Objective

Align market-core and web3-core with **OpenClaw-first** design philosophy:

- Single entry point (`web3.*` namespace)
- Internal complexity containment
- Stable user-facing contract
- Safe inter-plugin communication

## 🔨 Changes Made

### 1. Created Market Facade (`market-core/src/facade.ts`)

**Why**: Provide stable, type-safe API for inter-plugin communication

**What**:

- Defined `MarketFacade` interface with 18 core operations
- Grouped by domain: Resource, Lease, Ledger, Dispute, Status
- Promise-based async API
- Strong typing for all parameters and results

**Example**:

```typescript
export interface MarketFacade {
  publishResource(params: PublishResourceParams): Promise<PublishResourceResult>;
  issueLease(params: IssueLeaseParams): Promise<IssueLeaseResult>;
  openDispute(params: OpenDisputeParams): Promise<OpenDisputeResult>;
  // ... 15 more methods
}
```

### 2. Refactored `market-core/src/index.ts`

**Before**: Registered 50+ `market.*` gateway methods directly
**After**: Only exports facade, registers 0 gateway methods

**Key Changes**:

```typescript
// Before
api.registerGatewayMethod("market.resource.publish", handler);
api.registerGatewayMethod("market.lease.issue", handler);
// ... 48 more registrations

// After
const facade = createMarketFacade(store, config);
api.runtime.plugins._marketCoreFacade = facade;
api.logger.info("Market Core engine initialized (gateway methods exposed through web3-core only)");
```

**Impact**:

- ✅ Reduced plugin surface area from 50+ methods to 1 facade object
- ✅ All security gates now enforced at web3-core boundary
- ✅ Easier to test (mock facade instead of 50 handlers)

### 3. Architecture Documentation

**Created**: `market-core/ARCHITECTURE.md`

**Content**:

- Design philosophy (OpenClaw-first)
- Three-layer architecture diagram
- Security model explanation
- Inter-plugin communication pattern
- Development workflow guide

## 📊 Metrics

### Code Changes

| File                        | Before      | After     | Change |
| --------------------------- | ----------- | --------- | ------ |
| `market-core/src/index.ts`  | 175 lines   | ~30 lines | -83%   |
| `market-core/src/facade.ts` | 0 lines     | 478 lines | NEW    |
| Gateway registrations       | 50+ methods | 0 methods | -100%  |

### Complexity Reduction

- **User-facing API**: `market.*` + `web3.market.*` → **only** `web3.market.*`
- **Plugin coupling**: Tight (direct handler calls) → Loose (facade interface)
- **Security boundaries**: 2 (market-core + web3-core) → 1 (web3-core only)

## 🎨 Architecture Before/After

### Before (2026.2.16)

```
User → web3.market.* (web3-core) ─┐
User → market.* (market-core) ────┤→ market-core internals
                                   │
                                   └→ Confusion: which to use?
```

### After (2026.2.21)

```
User → web3.market.* (web3-core) → Facade → market-core internals
                                    ↑
                                    Single entry point
```

## ✅ Benefits

### 1. User Experience

- ❌ Before: "Should I call `market.resource.publish` or `web3.market.resource.publish`?"
- ✅ After: "I only know `web3.market.*`, that's the only option"

### 2. Security

- ❌ Before: Security gates duplicated in both plugins
- ✅ After: Single security boundary at web3-core

### 3. Maintainability

- ❌ Before: Breaking changes in market-core affect users directly
- ✅ After: Facade provides stability layer, internal changes are invisible

### 4. Testability

- ❌ Before: Mock 50+ gateway handlers for integration tests
- ✅ After: Mock 1 facade object with 18 methods

## 🔄 Next Steps

### Phase 2: Security Gates (Week 1)

1. Fix P0-SEC-01: Sensitive info leakage
2. Fix P0-ERR-01: Stable error codes
3. Fix P0-CAP-01: Capability self-description

### Phase 3: Dispute Resolution (Week 2)

1. Complete dispute handler implementation
2. Add dispute state machine tests
3. Document dispute resolution flow

### Phase 4: Documentation (Week 3-4)

1. User guide (only `web3.*` commands)
2. Demo video (end-to-end flow)
3. API reference (stable facade methods)

## 📝 Migration Guide

### For Web3-Core Developers

**Before**:

```typescript
// Direct import from market-core handlers
import { createResourcePublishHandler } from "market-core/handlers";
api.registerGatewayMethod(
  "web3.market.resource.publish",
  createResourcePublishHandler(store, config),
);
```

**After**:

```typescript
// Use facade
export function createMarketResourcePublishHandler(config) {
  return async ({ params, respond }) => {
    const facade = api.runtime.plugins._marketCoreFacade as MarketFacade;
    const result = await facade.publishResource(params);
    respond(result.success, result);
  };
}
```

### For Users

**No migration needed!** ✅

Users already use `web3.market.*` commands through web3-core. They never touched `market.*` directly.

## 🎯 Design Validation

### Checklist: OpenClaw-First Principles

- ✅ **Core stays lean**: market-core is optional plugin
- ✅ **Plugins can be complex**: 6900 lines is fine internally
- ✅ **Stable contracts**: Facade provides versioned interface
- ✅ **Security first**: Single boundary at web3-core
- ✅ **User-centric**: Only `web3.*` in user docs

### Checklist: "Simplify Not Minimize"

- ✅ **Interface simplified**: 50 methods → 18 operations
- ❌ **Code NOT minimized**: 6900 lines stays (correctness > brevity)
- ✅ **Complexity contained**: State machine, settlement, etc. hidden
- ✅ **Product boundary clear**: market-core = internal engine

## 🚀 Rollout Plan

### Step 1: Update Tests (This Week)

- Update web3-core tests to use facade mocks
- Ensure all E2E tests pass
- No user-facing changes

### Step 2: Update Documentation (Next Week)

- Remove all `market.*` references from user docs
- Emphasize `web3.*` as the only API
- Add architecture diagrams

### Step 3: Monitor (Ongoing)

- Check for any direct `market.*` gateway calls (should be none)
- Validate facade interface stability
- Gather feedback from users

## 📌 Conclusion

This refactoring successfully aligns market-core with OpenClaw's **plugin-first, user-centric** philosophy:

1. ✅ **Reduced API surface**: 50+ methods → 1 facade
2. ✅ **Single entry point**: Only `web3.*` for users
3. ✅ **Maintained capability**: No features removed
4. ✅ **Improved security**: Single security boundary
5. ✅ **Better testability**: Facade pattern easier to mock

**Status**: ✅ Phase 1 Complete (Interface Layer Refactoring)

**Next**: Phase 2 - Security Gates (P0 fixes)

---

**Commit**: `chore(market-core): refactor to facade pattern for OpenClaw-first architecture`

**Files Changed**:

- `extensions/market-core/src/facade.ts` (NEW)
- `extensions/market-core/src/index.ts` (MAJOR REFACTOR)
- `extensions/market-core/ARCHITECTURE.md` (NEW)
