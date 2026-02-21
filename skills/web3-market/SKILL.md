---
name: web3-market
description: Implement OpenClaw Web3 decentralized brain switch (B-1) and resource-sharing market-core (B-2: resources/leases/ledger).
metadata: { "openclaw": { "emoji": "🕸️" } }
---

# web3-market

Implement the Web3 “decentralized brain” switch and the B-2 resource-sharing platform (model/search/storage) using the design docs in this repo.

## Trigger

Use this skill when working on:

- Core hook: `resolve_stream_fn` (custom `StreamFn` override)
- `market-core` extensions: `resources` / `leases` / `ledger`
- `web3-core` orchestration: publish/list/lease/revoke, Provider HTTP routes, consumer tools
- Token handling, auditing, and settlement/ledger alignment

## References (source of truth)

Read these files as needed:

- `skills/web3-market/references/web3-brain-architecture.md`
- `skills/web3-market/references/web3-market-plan-overview.md`
- `skills/web3-market/references/web3-market-plan-phase1-execution.md`
- `skills/web3-market/references/web3-market-plan-roadmap-open-source-coldstart.md`
- `skills/web3-market/references/web3-market-plan-parallel-execution-ray-celery.md`
- `skills/web3-market/references/web3-market-resource-api.md`
- `skills/web3-market/references/web3-market-resource-security.md`
- `skills/web3-market/references/web3-market-resource-ops.md`
- `skills/web3-market/references/web3-market-resource-testing.md`
- `skills/web3-market/references/web3-market-resource-config-examples.md`
- `skills/web3-market/references/web3-market-resource-implementation-checklist.md`
- `skills/web3-market/references/web3-market-tools-commands-evolution.md`
- `skills/web3-market/references/web3-market-assessment-2026-02-19.md`

## Non-negotiables

- Never leak `accessToken`, provider endpoints, or real file paths (errors/logs/status/tool results)
- `market.lease.issue` is the only place a token may be returned (one-time)
- `market.ledger.append` must reject consumer-forged entries (provider-only)
- File + SQLite store modes must behave the same
- Don’t break existing `/pay_status` behavior

## Workflow

1. Read `skills/web3-market/references/web3-brain-architecture.md` as the main source of truth.
2. Use `skills/web3-market/references/web3-market-plan-overview.md` + `web3-market-plan-phase1-execution.md` for execution sequencing.
3. Start from the checklist in `skills/web3-market/references/web3-market-resource-implementation-checklist.md`.
4. Implement the minimal Phase order: Core hook → market-core primitives → web3-core orchestration → Provider routes/tools.
5. Add tests per the matrix (run both store modes).
6. Confirm operational hooks exist (e.g. `market.lease.expireSweep`) and are observable.
7. Treat `skills/web3-market/references/web3-market-assessment-2026-02-19.md` as review-only (non-normative).
