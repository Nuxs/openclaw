---
name: web3-market
description: Design and implement OpenClaw Private Steward architecture, Web3 Market runtime, EaaS evolution, and A2A/MCP integration with accountable settlement.
metadata: { "openclaw": { "emoji": "🕸️" } }
---

# web3-market

Design and extend OpenClaw as a `Private Steward OS` with a `Market-backed A2A` stack. Treat Web3 as the trust and settlement substrate, not the product façade. Evolve the current resource-sharing runtime into a broader EaaS stack without breaking the existing `web3.*` public contract.

## Trigger

Use this skill when working on:

- `market-core` / `web3-core` market runtime, catalog, lease, ledger, settlement, dispute, reconciliation
- `serviceSchema`, planned `Service Wrapper`, proof, acceptance, arbitration, and execution-state design
- `MCP` façade design or `A2A` / `ACP` coordination that touches market, trust, or settlement boundaries
- Private Steward architecture, product positioning, 2026-2028 roadmap, or executive/RFC planning
- Discovery / offer / capability modeling for agent commerce
- Budget, trust, governance, audit, and redaction rules for agent-to-agent service execution

## Runtime anchor (state the truth first)

Anchor every proposal to the current repo truth:

- Current runtime still centers on `resource` / `lease` / `ledger` / `service proof`
- Public contract is `web3.*`; internal authority is `market.*`
- Sensitive assets (`accessToken`, provider endpoint, real file path) never leak in normal outputs
- `serviceSchema` is the current concrete service descriptor; `Service Wrapper` is target-state abstraction
- A2A/subagent coordination already exists in `src/agents/tools/*`; market settlement remains a separate authority plane

Do not describe planned EaaS layers as already implemented. Distinguish clearly between:

1. current runtime fact
2. additive next step
3. long-range target state

## Source of truth and precedence

When references disagree, use this order:

1. Runtime registration in `extensions/web3-core/src/index.ts` and `extensions/market-core/src/index.ts`
2. Capability/config schemas in `extensions/web3-core/src/capabilities/**` and each plugin `openclaw.plugin.json`
3. External docs under `docs/`
4. Skill references under `skills/web3-market/references/`
5. Internal memos/RFCs under `skills/web3-market/internal/`

## Core model

Treat the stack as:

- **Product definition**: `Private Steward OS`
- **Network definition**: `Market-backed A2A Network`
- **Protocol split**:
  - `MCP` = tool/data entry and façade surface
  - `A2A` / `ACP` = delegation, coordination, and cross-agent communication
  - `OpenClaw Market` = offer, lease, ledger, settlement, proof, dispute, reconciliation
  - chain/wallet/identity = trust anchor, signature, payment, and audit substrate

## Architectural invariants

Do not violate these rules:

- Keep `web3.*` as the user/agent/UI public contract
- Keep `market.*` as the internal authority / authoritative execution layer
- Keep **Extension = Mechanism, AI = Policy**
- Evolve `serviceSchema` additively toward `Service Wrapper`; do not rewrite the runtime around a fantasy schema
- Use `MCP` for controlled entry, not as the settlement source of truth
- Use `A2A` for collaboration, not as the financial authority layer
- Keep proof, settlement, and dispute tied together; avoid standalone “proof-only” abstractions that cannot reconcile against orders/leases
- Preserve redaction guarantees: no token/endpoint/path leaks in docs, logs, tool results, dashboards, or capability descriptors

## Chain strategy guardrails

When the task involves chain selection, token design, or agent-to-agent settlement shape, use this split:

- **Current runtime fact**: `EVM` is the default implemented market rail, and `TON` already participates in the current dual-stack payment/receipt path.
- **Recommended next-stage direction**: for `Agentic Commerce` and objectized rights/lease/receipt design, prefer a **`Sui-first` architecture**.
- **Role split**:
  - `Sui` = agent-native commerce ledger for capability/lease/receipt/escrow/reward objects
  - `EVM` = stablecoin liquidity rail, treasury, bridge, and external DeFi compatibility
  - `TON` = distribution, lightweight payment entry, Telegram-facing reach
- **Do not overclaim**: `Sui-first` is a target-state architecture choice, not a statement that the current repo runtime has already migrated away from `EVM + TON`.

Use `Sui-first` when the problem is mainly about:

- AI-to-AI trading of rights, permissions, access windows, service receipts, or machine-verifiable obligations
- object-like assets with explicit ownership transfer
- multi-step atomic commerce where `PTB` semantics are valuable
- low-friction agent settlement that should not be modeled as a pile of mutable mappings

Be more cautious when the problem is mainly about:

- maximum existing liquidity and wallet compatibility
- direct reuse of mature EVM DeFi rails
- Telegram-native distribution flows
- high-contention shared state that could collapse into shared-object bottlenecks on `Sui`

Architectural guardrails:

- Treat chain as the **rights and settlement layer**, not the execution engine.
- Keep prompt/data/model weights/results off-chain except for hashes, commitments, receipts, and policy anchors.
- Prefer **off-chain quote/discovery + on-chain lease/settlement/audit** instead of pushing hot-path routing into shared on-chain objects.
- Default to **stablecoin settlement** for business value; do not rush a native OpenClaw token before staking/slashing/governance are genuinely needed.

First reference for this topic:

- `skills/web3-market/references/openclaw-sui-first-agentic-commerce.md`

## Reference map

### Main architecture and execution references

Read these first for architecture or protocol work:

- `skills/web3-market/references/openclaw-private-steward-architecture-2026-2028.md`
- `skills/web3-market/references/openclaw-sui-first-agentic-commerce.md`
- `skills/web3-market/references/openclaw-eaas-a2a-mcp-productization.md`
- `skills/web3-market/references/web3-brain-architecture.md`
- `skills/web3-market/references/web3-market-plan-overview.md`
- `skills/web3-market/references/web3-market-plan-phase1-execution.md`
- `skills/web3-market/references/web3-market-resource-implementation-checklist.md`

### Market/runtime reference set

Load as needed:

- `skills/web3-market/references/web3-agent-wallet-plan.md`
- `skills/web3-market/references/web3-market-privacy-knowledge.md`
- `skills/web3-market/references/web3-market-technical-debt.md`
- `skills/web3-market/references/web3-market-resource-api.md`
- `skills/web3-market/references/web3-market-resource-security.md`
- `skills/web3-market/references/web3-market-resource-ops.md`
- `skills/web3-market/references/web3-market-resource-testing.md`
- `skills/web3-market/references/web3-market-resource-config-examples.md`
- `skills/web3-market/references/web3-market-tools-commands-evolution.md`
- `skills/web3-market/references/web3-mdl-libp2p-discovery-plan.md`

### Executive and implementation deliverables

Read when drafting plans, leadership updates, or implementation breakdowns:

- `skills/web3-market/internal/BOARD_STRATEGY_MEMO_2026_PRIVATE_STEWARD.md`
- `skills/web3-market/internal/RFC_2026_PRIVATE_STEWARD_MARKET_STACK.md`
- `skills/web3-market/internal/WEB3_OVERALL_PROGRESS.md`
- `skills/web3-market/internal/WEB3_MARKET_GO_LIVE_REVIEW_2026-03.md`
- `skills/web3-market/internal/WEB3_GAP_AUDIT_REPORT.md`

### External docs to align with

When changing public contracts or public narratives, align with:

- `docs/concepts/web3-market.md`
- `docs/reference/web3-market-dev.md`
- `docs/reference/web3-sui-first-architecture.md`
- `docs/reference/web3-eaas-protocol-spec.md`
- `docs/reference/web3-eaas-developer-guide.md`
- `docs/reference/web3-eaas-protocol-upgrade-report-2026.md`
- `docs/reference/web3-everything-as-a-service-vision.md`
- `docs/reference/ai-steward-service-market-plan.md`

## File map

Use these repo areas deliberately:

- `extensions/market-core/src/market/handlers/*.ts` = authority state machines and write paths
- `extensions/market-core/src/market/types.ts` / `validators.ts` / `resources.ts` = canonical market object model and validation
- `extensions/web3-core/src/market/handlers.ts` = façade/proxy layer for `web3.market.*`
- `extensions/web3-core/src/capabilities/catalog/market.ts` = agent-readable capability descriptors
- `extensions/web3-core/src/resources/*` = lease-token storage, safe consumer routing, credential redaction
- `src/agents/tools/sessions-send-tool.a2a.ts` and `src/agents/tools/sessions-spawn-tool.ts` = existing coordination runtime

When adding new market capabilities to already-large files, prefer creating leaf modules and keeping entry files thin.

## Task playbooks

### For runtime / protocol implementation

1. Read `openclaw-private-steward-architecture-2026-2028.md` to confirm the target layer and protocol boundary.
2. Read `RFC_2026_PRIVATE_STEWARD_MARKET_STACK.md` for proposed modules, interfaces, and phase order.
3. Confirm current repo truth in runtime files before editing.
4. Implement additive changes first:
   - type/model additions
   - validator additions
   - authority handler additions
   - façade additions
   - capability descriptor additions
5. Reuse existing `offer` / `order` / `lease` / `service-proof` / `dispute` flows when possible instead of inventing parallel state machines.
6. Add tests in the touched leaf modules and keep file + SQLite store behavior aligned.

### For product / strategy work

1. Read `openclaw-eaas-a2a-mcp-productization.md`.
2. Anchor every claim to a current runtime fact or clearly label it as roadmap.
3. Present `Private Steward` as the product and `Web3 Market` as the accountable economic substrate.
4. Explain `MCP`, `A2A`, and `Market` as complementary layers, not mutually exclusive bets.

### For A2A / MCP integration design

1. Keep public entry at `web3.*` or another redacted façade.
2. Keep order/lock/release/refund authority inside `market.*`.
3. Use lease-gated access and stored credentials; do not expose raw tokens to top-level agent UX unless the existing contract explicitly requires a one-time response.
4. Tie coordination outputs back to proof/settlement/audit IDs.

## Non-negotiables

- Never leak `accessToken`, provider endpoints, or real file paths
- Plaintext tokens may only appear in successful lease issuance responses and only once, per current contract
- `market.ledger.append` remains provider-only
- File + SQLite store modes must behave the same
- Keep `/pay_status` and status/reconciliation user flows consistent when evolving deeper market layers

## Workflow

1. Classify the task: runtime, protocol, product, or executive planning.
2. Load the smallest relevant reference set from the map above.
3. Verify the current repo truth before making claims.
4. Implement or draft in thin-entry, overlay-first style.
5. Validate touched runtime/docs as appropriate.
6. After updating `skills/*`, run `scripts/sync-codebuddy.sh` so the mirrored skill view stays current.
