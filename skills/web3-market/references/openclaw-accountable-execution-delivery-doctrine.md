# OpenClaw Accountable Execution Delivery Doctrine

## 1. Purpose

Use this document as the default operating doctrine for `web3-market` work after the March 2026 strategy reset. The goal is to keep architecture, productization, delivery order, and narrative aligned with what the repo can actually ship.

This doctrine exists to prevent four recurring mistakes:

- treating Web3 as the product instead of the trust substrate
- letting future-ledger ideas derail current production closure
- overselling roadmap abstractions as implemented runtime facts
- optimizing for protocol novelty before accountable delivery

## 2. Fixed defaults

Unless code or an explicit task says otherwise, assume the following defaults:

1. **Mainline = digital-service closure productization**
   - Make verifiable digital services the first proving ground.
   - Prioritize search, data enrichment, model inference, automation workflows, code review, and security review.
   - Treat human-service and `RWA` work as later phases or explicit experiments.

2. **Production rails = `EVM + TON`**
   - Keep `EVM` on the production path for stablecoin liquidity, treasury behavior, receipts, settlement-grade audit, and DeFi compatibility.
   - Keep `TON` on the production path for lightweight payment entry and Telegram-facing distribution.
   - Do not destabilize working production rails in order to chase cleaner theoretical abstractions.

3. **Future ledger = `Sui-first` parallel prototype**
   - Use `Sui-first` for objectized capability, lease, receipt, escrow, reward, and ownership-transfer design.
   - Keep this line parallel, isolated, and explicitly labeled as prototype, roadmap, or target-state until repo truth changes.
   - Do not block current `EVM + TON` productization on a full `Sui` migration.

4. **Commercial story = accountable execution**
   - Sell the private steward.
   - Sell safe discovery, controlled spend, verified delivery, auditable settlement, and dispute-ready operation.
   - Do not lead with chain choice, wallet sophistication, or tokenization.

## 3. Product framing

Use the narrative stack below consistently:

- **User story**: OpenClaw is the private steward that gets things done safely.
- **Product story**: OpenClaw finds, buys, verifies, settles, and audits outside digital services on the user’s behalf.
- **Technical story**: `MCP` connects tools, `A2A` coordinates agents, and `OpenClaw Market` closes the loop.
- **Strategy story**: OpenClaw is building the accountability layer for personal AI.

## 4. Scope discipline

### In scope for the mainline

- provider onboarding and offer closure
- buyer purchase and lease closure
- proof, acceptance, dispute, settlement, and reconciliation linkage
- governance surfaces such as budget, approval, allow/deny, and audit
- operator-grade status, runbook, and redacted summaries

### Out of scope for the mainline

- open public market without strong governance
- generalized “everything marketplace” claims
- human-service market as the default first beachhead
- `RWA` settlement as a v1 commitment
- full `Sui` production migration before digital-service closure is shippable
- token-first monetization or speculative token roadmap pressure

## 5. Layer responsibility

Keep layer responsibilities crisp:

- `MCP` = tool and data entry, governed façade
- `A2A` / `ACP` = delegation, coordination, handoff, long-running work exchange
- `OpenClaw Market` = offer, lease, proof, settlement, dispute, reconciliation, accountability
- chain / wallet / identity = payment, signature, anchoring, audit substrate

Never let `MCP` or `A2A` silently absorb market authority.

## 6. Engineering default order

When implementing or scoping work, prefer this order:

1. confirm current runtime truth in code
2. lock the user-visible contract and capability semantics
3. extend authority types, validators, and leaf handlers
4. expose redacted façade changes through `web3.*`
5. link proof, acceptance, settlement, dispute, and reconciliation
6. add governance, status, and operator visibility
7. add tests and go-live evidence
8. only then expand roadmap or prototype lanes

This order is intentional: closure before expansion.

## 7. Chain-role doctrine

### `EVM`

Use for:

- treasury
- stablecoin settlement
- bridge compatibility
- institutional and wallet interoperability
- external DeFi compatibility

### `TON`

Use for:

- distribution entry
- Telegram-facing payment flows
- lightweight user acquisition and interaction loops

### `Sui`

Use for:

- prototype ledger semantics for objectized rights and receipts
- research into capability-native commerce objects
- long-range simplification of lease / receipt / escrow / reward modeling

Do not describe `Sui` as the present production ledger unless the repo actually proves it.

## 8. Industrial delivery gates

A change is not “done” merely because a handler or document exists. Prefer these gates:

- **contract gate**: current and planned semantics are clearly separated
- **security gate**: no token, endpoint, or real-path leakage
- **closure gate**: proof, settlement, dispute, and reconciliation remain linked
- **operability gate**: status, alerting, and runbook impact are understood
- **consistency gate**: file and SQLite behavior stay aligned where relevant
- **evidence gate**: tests, manual proof, or runtime traces support the claim

## 9. Communication standard: 信达雅

### 信

- verify against code or authoritative docs before claiming
- call out uncertainty instead of filling gaps with confidence theater
- separate “implemented”, “invite beta”, “prototype”, and “roadmap” wording

### 达

- explain the layer split in plain language
- explain what changes now, what stays stable, and what is deferred
- use short causal statements instead of vague market slogans

### 雅

- keep language crisp, calm, and non-hyped
- avoid chain-maximalist or token-promotional framing
- make the product sound trustworthy, not magical

## 10. Non-negotiable no-go list

Do not do the following by default:

- rewrite the runtime around a fantasy `ServiceWrapper` abstraction
- present `Sui-first` as already migrated production reality
- make Web3 the front-door story for mainstream users
- detach proof from settlement or settlement from dispute
- broaden scope to human services or `RWA` before digital-service closure works
- sacrifice redaction, auditability, or operability for protocol novelty

## 11. Decision checklist

Before approving a design, plan, or implementation, ask:

- Does this strengthen accountable execution or merely add another abstraction?
- Does this keep the production line on `EVM + TON` stable?
- Does this keep `Sui-first` work parallel instead of blocking?
- Does this make digital-service closure more real, or just more ambitious?
- Does the user story still sell the steward rather than the chain?
- Can the resulting flow be audited, reconciled, disputed, and safely operated?
