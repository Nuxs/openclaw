# OpenClaw 2026-2028 Private Steward Architecture Blueprint

## 1. Purpose

Define the target architecture for evolving OpenClaw from a capable agent runtime into a **Private Steward OS** with a **Market-backed A2A** stack. Use this document to align runtime work, protocol choices, and roadmap sequencing without overstating what is already implemented.

## 2. Strategic thesis

OpenClaw should not be framed as only:

- another agent framework
- another MCP host
- another A2A bridge
- another Web3 marketplace

OpenClaw’s best long-range definition is:

> **Private Steward OS + Market-backed A2A Network**

That means:

- the product façade is the **private steward** that represents the user
- the network substrate is a market where services can be discovered, leased, proven, settled, disputed, and audited
- `MCP`, `A2A`, `ACP`, and chain/wallet rails are supporting layers, not the product identity

## 3. Current runtime anchor

Treat the following as the current repo truth:

- runtime centers on `resource` / `lease` / `ledger` / `service proof`
- `web3.*` is the public contract
- `market.*` is the internal authority layer
- `serviceSchema` is the current concrete service descriptor
- `Service Wrapper` is planned target-state abstraction
- A2A/subagent orchestration already exists in core agent tooling, but is not yet fused into a single market-native execution plane

This matters because the right plan is **evolution**, not rewrite.

## 4. Six-layer target architecture

### L1. Personal Context Plane

**Goal**: establish user sovereignty.

Responsibilities:

- local-first memory and preferences
- budget policy and risk tolerance
- identity, wallet, and consent defaults
- revocable long-term context

Principles:

- prefer device-local state
- treat cloud reasoning as stateless augmentation
- propagate user policy into every expensive or risky action

### L2. Action Plane

**Goal**: convert intent into reliable execution.

Execution model:

- `MCP-first` for standard tools, data, and workflows
- computer-use fallback for long-tail systems without suitable APIs

Principles:

- prefer typed connectors over fragile UI automation
- require stronger approvals for GUI-driven or high-risk actions
- keep traces and rollback points for destructive steps

### L3. Agent Coordination Plane

**Goal**: enable multi-agent collaboration without collapsing authority boundaries.

Responsibilities:

- task decomposition
- delegation
- reply/announce/status exchange
- cross-session and cross-agent handoff

Principles:

- let `A2A` / `ACP` solve coordination
- do not let coordination protocols become the financial source of truth
- tie delegated work back to order/proof/settlement identifiers

### L4. Market Plane

**Goal**: turn generic tool use into accountable service procurement.

Responsibilities:

- catalog and offer discovery
- pricing and comparability
- lease issuance
- service execution routing
- marketplace-facing capability abstractions

Target objects:

- `Offer`
- `ServiceWrapper`
- `Lease`
- `ExecutionSession`
- `ProofBundle`
- `SettlementIntent`
- `DisputeCase`

### L5. Trust & Settlement Plane

**Goal**: replace “trust the provider” with “trust the protocol”.

Responsibilities:

- authority ledger
- escrow lock/release/refund
- proof verification
- dispute and arbitration lifecycle
- reconciliation summaries

Principles:

- proof without settlement linkage is insufficient
- settlement without dispute paths is unsafe
- user-facing summaries must be shareable but redacted

### L6. Governance & Ops Plane

**Goal**: make the system operable, reviewable, and stoppable.

Responsibilities:

- redaction
- observability
- risk policy
- approvals
- budget ceilings
- provider allow/deny rules
- audit and operator workflows

Principles:

- treat governance as a product surface, not back-office glue
- optimize for incident containment and replayability

## 5. Protocol responsibility split

### `MCP`

Use for:

- tool/data entry
- capability exposure
- façade endpoints
- governed app integration

Do not use as:

- settlement authority
- dispute authority
- market economics protocol

### `A2A` / `ACP`

Use for:

- agent-to-agent delegation
- coordination and handoff
- cross-organization collaboration
- long-running task status flow

Do not use as:

- escrow system
- financial state machine
- redaction authority

### `OpenClaw Market`

Use for:

- offer/resource discovery
- lease and controlled access
- ledger and reconciliation
- proof, dispute, and settlement
- market-native policy hooks

### Chain / wallet / identity rails

Use for:

- payment
- signature
- anchoring
- attested identity and receipt verification

## 6. Architectural invariants

Preserve these invariants across all phases:

1. Keep `web3.*` as the public contract.
2. Keep `market.*` as the internal authority layer.
3. Keep **Extension = Mechanism, AI = Policy**.
4. Keep redaction guarantees absolute.
5. Keep `serviceSchema` backward compatible while introducing `ServiceWrapper` additively.
6. Keep A2A and market settlement coupled by identifiers, not fused into one protocol.
7. Keep runtime truth ahead of narrative; planned documents must never erase present constraints.

## 7. Repo mapping

### Current authority layer

- `extensions/market-core/src/market/types.ts`
- `extensions/market-core/src/market/resources.ts`
- `extensions/market-core/src/market/validators.ts`
- `extensions/market-core/src/market/handlers/*.ts`

### Current façade layer

- `extensions/web3-core/src/market/handlers.ts`
- `extensions/web3-core/src/capabilities/catalog/market.ts`
- `extensions/web3-core/src/resources/*`

### Current coordination layer

- `src/agents/tools/sessions-send-tool.a2a.ts`
- `src/agents/tools/sessions-spawn-tool.ts`

### Recommended next structure

When adding new market semantics:

- extend `market-core` with leaf handlers and types first
- expose only redacted, intention-safe façades via `web3-core`
- keep already-large façade files thin; split into leaf modules before they become new merge magnets

## 8. 2026-2028 roadmap

### 2026: Digital Service EaaS

Primary outcome:

- make digital services first-class without breaking the existing runtime

Required moves:

- strengthen `serviceSchema`
- introduce additive `ServiceWrapper` fields
- generalize proof model beyond service-only naming
- stabilize `Market as MCP façade`
- productize reconciliation and status summaries

### 2027: Market-backed multi-agent workflows

Primary outcome:

- connect market contracts to agent coordination

Required moves:

- lease-gated provider MCP servers
- A2A-linked execution sessions
- milestone/acceptance workflows
- reputation + proof coupling
- operator-grade policy surface

### 2028: Human services and RWA

Primary outcome:

- unify digital, human, and RWA services under one accountable stack

Required moves:

- human attestation and milestone sign-off
- oracle / IoT / logistics proof rails
- broader arbitration models
- open discovery network and partner ecosystem

## 9. Decision checklist

Before approving any major change, ask:

- Does this keep `web3.*` public and `market.*` internal?
- Is this additive to the current runtime or a fantasy rewrite?
- Does this strengthen accountability, not just connectivity?
- Is the layer assignment clear: MCP, A2A, Market, or chain?
- Can the result be audited, reconciled, and disputed?
- Does the proposal preserve private-steward trust assumptions?

## 10. Recommended shorthand

Use these phrases consistently:

- **Private Steward OS** = product identity
- **Market-backed A2A** = network + execution model
- **accountable execution** = core differentiator
- **economic accountability layer for personal AI** = investor/strategy framing
