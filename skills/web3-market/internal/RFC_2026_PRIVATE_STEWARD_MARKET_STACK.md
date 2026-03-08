# RFC 2026: Private Steward + Market-backed A2A Stack

## 1. Status

Proposed.

## 2. Purpose

Define the implementation path for evolving the current Web3 market runtime into a broader EaaS stack that supports:

- digital-service procurement as a first-class workflow
- MCP-facing public façades
- A2A-linked execution orchestration
- stronger proof, acceptance, settlement, and dispute coupling
- additive evolution from `serviceSchema` toward `ServiceWrapper`

This RFC is written so an AI coding agent can execute the work in phased slices without inventing a new architecture or breaking the current public contract.

## 3. Non-goals

Do not do the following in this RFC:

- replace `web3.*` with a new public namespace
- expose `market.*` as user-facing public API
- rewrite the entire market state machine around a brand-new object model
- claim that human-service or RWA protocols are production-ready before digital-service closure exists
- weaken redaction guarantees in order to make demos easier

## 4. Current repo anchor

### Authority layer already exists

Current authority logic is centered in:

- `extensions/market-core/src/market/types.ts`
- `extensions/market-core/src/market/resources.ts`
- `extensions/market-core/src/market/validators.ts`
- `extensions/market-core/src/market/handlers/*.ts`

Notable existing domains:

- `offer.ts`
- `order.ts`
- `lease.ts`
- `ledger.ts`
- `service-proof.ts`
- `settlement.ts`
- `dispute.ts`

### Façade layer already exists

Current public-facing orchestration is centered in:

- `extensions/web3-core/src/market/handlers.ts`
- `extensions/web3-core/src/capabilities/catalog/market.ts`
- `extensions/web3-core/src/resources/*`

### Coordination layer already exists

Current agent coordination runtime is centered in:

- `src/agents/tools/sessions-send-tool.a2a.ts`
- `src/agents/tools/sessions-spawn-tool.ts`

## 5. Design principles

1. Keep **Extension = Mechanism, AI = Policy**.
2. Keep `web3.*` public and `market.*` internal.
3. Keep changes additive and backward compatible.
4. Keep proof, settlement, and dispute linked by shared identifiers.
5. Keep already-large files thin; move new logic into leaf modules.
6. Keep sensitive outputs redacted by default.

## 6. Proposed target model

### 6.1 Additive type evolution

Do not remove `serviceSchema`. Introduce a target wrapper additively.

Suggested additive types:

```ts
type ServiceCategory = "digital" | "human" | "rwa";
type AcceptanceMode = "auto" | "human" | "milestone" | "oracle";
type ProofFamily = "tlsnotary" | "signed_receipt" | "human_attestation" | "oracle_event";

type AcceptancePolicy = {
  mode: AcceptanceMode;
  reviewWindowHours?: number;
  milestoneCount?: number;
  arbitratorType?: "manual" | "dao" | "partner";
};

type ProofPolicy = {
  families: ProofFamily[];
  required: boolean;
  minArtifacts?: number;
};

type ServiceWrapper = {
  version: "v1";
  category: ServiceCategory;
  serviceSchema?: unknown; // compatibility anchor
  acceptance: AcceptancePolicy;
  proof: ProofPolicy;
  tags?: string[];
};
```

### 6.2 Compatibility rule

Persist and transport `serviceSchema` exactly as today. Add `serviceWrapper` as an optional, additive field. The runtime must accept old objects while newer flows consume richer wrapper metadata.

## 7. Proposed public and internal interfaces

### 7.1 Public façade additions (`web3.market.*`)

Add these only as redacted, intention-safe façades:

- `web3.market.offer.quote`
- `web3.market.offer.compare`
- `web3.market.proof.submit`
- `web3.market.proof.verify`
- `web3.market.acceptance.sign`
- `web3.market.acceptance.reject`
- `web3.market.execution.status`

Compatibility rule:

- keep existing `web3.market.service.proof.*`
- map it internally to the generic proof model
- deprecate by documentation first, not by hard removal

### 7.2 Internal authority additions (`market.*`)

Keep authority-layer write paths internal. Proposed additions:

- `market.proof.submit`
- `market.proof.verify`
- `market.acceptance.sign`
- `market.acceptance.reject`
- `market.execution.get`

Do not expose these directly to user-facing clients.

## 8. Module plan

### 8.1 `market-core`

#### Extend existing files

- `extensions/market-core/src/market/types.ts`
  - add `ServiceWrapper`, `AcceptancePolicy`, `ProofPolicy`, generic proof types
- `extensions/market-core/src/market/validators.ts`
  - validate additive wrapper/policy fields
- `extensions/market-core/src/market/resources.ts`
  - thread wrapper-compatible service metadata through resource definitions
- `extensions/market-core/src/market/handlers/offer.ts`
  - extend offer metadata and comparability hooks where appropriate
- `extensions/market-core/src/market/handlers/service-proof.ts`
  - preserve compatibility and adapt current flows toward generic proof handling
- `extensions/market-core/src/market/handlers/dispute.ts`
  - accept new proof/acceptance references in dispute evidence paths

#### Add new leaf modules

- `extensions/market-core/src/market/handlers/acceptance.ts`
- `extensions/market-core/src/market/handlers/proof.ts`
- `extensions/market-core/src/market/handlers/execution.ts`

#### Update barrel only as export surface

- `extensions/market-core/src/market/handlers/index.ts`

Rule: keep all new business logic in the new leaf modules, not the barrel.

### 8.2 `web3-core`

#### Extend current façade entrypoints carefully

- `extensions/web3-core/src/market/handlers.ts`
- `extensions/web3-core/src/capabilities/catalog/market.ts`

Because `handlers.ts` is already large, treat it as a thin entry. If new public surfaces expand materially, split new façade logic into leaf modules such as:

- `extensions/web3-core/src/market/handlers/offer.ts`
- `extensions/web3-core/src/market/handlers/proof.ts`
- `extensions/web3-core/src/market/handlers/acceptance.ts`
- `extensions/web3-core/src/market/handlers/execution.ts`

and keep `handlers.ts` as a barrel/proxy coordinator.

### 8.3 Steward policy runtime

Add a new thin policy area in core, for example:

- `src/agents/steward/budget-policy.ts`
- `src/agents/steward/provider-selection.ts`
- `src/agents/steward/risk-policy.ts`

These files should contain deterministic policy plumbing and policy evaluation helpers, not market authority writes.

### 8.4 Coordination bridge

Use existing coordination runtime instead of inventing a second one:

- `src/agents/tools/sessions-send-tool.a2a.ts`
- `src/agents/tools/sessions-spawn-tool.ts`

Add market-linked metadata via IDs and structured result objects rather than embedding settlement logic directly into A2A flows.

## 9. Phase plan

### Phase 0: Contract and skill alignment

Scope:

- align skill docs, public docs, and capability language
- define the additive model and naming

Code impact:

- docs and capability descriptions only

Acceptance:

- all docs distinguish current runtime vs target state
- no public doc implies `Service Wrapper` already exists in runtime

### Phase 1: Digital-service wrapper and generic proof foundation

Scope:

- add additive wrapper types
- add generic proof types
- preserve compatibility with `serviceSchema` and `service proof`

Files:

- `extensions/market-core/src/market/types.ts`
- `extensions/market-core/src/market/validators.ts`
- `extensions/market-core/src/market/resources.ts`
- `extensions/market-core/src/market/handlers/service-proof.ts`
- related tests

Acceptance:

- existing service flows still pass
- new wrapper metadata validates and persists
- reconciliation can refer to generic proof summary data

### Phase 2: Acceptance and execution-state model

Scope:

- add acceptance authority
- add execution-state query surface
- tie proof, acceptance, and disputes together

Files:

- new `market-core` leaf handlers
- `extensions/web3-core/src/market/handlers.ts`
- `extensions/web3-core/src/capabilities/catalog/market.ts`

Acceptance:

- a digital-service order can be accepted or rejected explicitly
- execution status can be queried without leaking raw credentials
- dispute evidence can reference proof and acceptance IDs

### Phase 3: Market-backed MCP and A2A bridge

Scope:

- expose MCP-safe market façades
- tie A2A execution to lease/proof/acceptance metadata

Files:

- `extensions/web3-core/src/market/*`
- `src/agents/tools/sessions-send-tool.a2a.ts`
- `src/agents/tools/sessions-spawn-tool.ts`
- optional new steward policy files

Acceptance:

- MCP façade exposes redacted, stable entrypoints
- A2A-executed work can report execution/proof references
- no settlement authority leaks into coordination protocols

### Phase 4: Human-service and RWA preparation

Scope:

- add new proof families and acceptance modes without breaking digital-service closure

Acceptance:

- design remains additive
- digital-service flows remain the default maturity baseline

## 10. Testing plan

### Runtime tests

For every market-core change:

- add or update leaf tests next to touched files
- preserve file-store and SQLite-store parity
- test negative redaction and authority cases

### Capability tests

For every public surface addition:

- update capability descriptors
- ensure examples and summaries remain redacted
- ensure prerequisites reflect reality

### Coordination tests

For A2A-linked work:

- test ID propagation and result linking
- avoid embedding raw token or endpoint data in coordination transcripts

## 11. Acceptance gates

Block rollout if any of these fail:

1. sensitive data appears in outward-facing results
2. a planned façade bypasses `market.*` authority semantics
3. `serviceSchema` compatibility is broken
4. proof is added without reconciliation linkage
5. A2A flows become a hidden settlement authority
6. already-large market façade files accumulate uncontrolled inline logic

## 12. AI-agent execution order

When implementing this RFC, proceed in the following order:

1. confirm current truth in runtime files
2. add additive types
3. add validators
4. add authority handlers in new leaf modules
5. update barrels
6. add façade methods
7. update capability descriptors
8. update tests
9. update public docs only after runtime and capability truth is stable

Do not invert this order.

## 13. Final rule

The target is not “more protocols.” The target is a steward that can responsibly buy, prove, settle, and escalate work. Every implementation decision should make that end state clearer, safer, and more operable.
