# Private Steward Growth Loop

## Purpose

This reference describes how to turn OpenClaw's existing runtime primitives into a long-lived private steward growth loop.

The goal is **not** to invent a parallel runtime. The goal is to make the existing runtime act like a disciplined private steward that remembers, reflects, researches, and follows up safely.

## Repo truth

Current primitives already exist in the repo:

- **Session memory**: `src/config/sessions/types.ts`, session store helpers, market steward session anchors
- **Market execution**: `web3.market.*` façade over `market.*` authority
- **Heartbeat runtime**: `docs/gateway/heartbeat.md`, `src/cron/*`, `src/auto-reply/heartbeat.ts`
- **Compaction-safe memory persistence**: `src/auto-reply/reply/memory-flush.ts`
- **Owner-facing workbench**: `ui/src/ui/views/market*.ts`

## External open-source patterns worth reusing

Based on current open-source Agent Skills research:

### 1. Anthropic / Agent Skills ecosystem

Common structure:

- `SKILL.md` as the activation contract
- `references/` for progressive disclosure
- `scripts/` only when deterministic automation is repeatedly needed

Key lesson:

- Keep the top-level skill concise and procedural.
- Push detailed reasoning aids into references.

### 2. Domainized skills such as `supabase/agent-skills`

Key lesson:

- Skills work best when they define **when to trigger**, **what source of truth to trust**, and **what good behavior looks like in that domain**.
- For steward growth, this means explicit boundaries for approvals, proof, disputes, and auditability.

### 3. Long-horizon workflow skills such as `planning-with-files`

Key lesson:

- Durable execution quality comes from **persisting state outside the transient context window**.
- The private steward should treat session-backed memory and audit anchors as its working disk, not its chat history alone.

## Operating loop

Use the following loop repeatedly:

1. **Remember**
   - Persist order / lease / consent / proof / dispute / settlement anchors.
   - Persist only policy-relevant summaries.

2. **Reflect**
   - Convert the latest result into one operational lesson.
   - Reflection must affect future routing, approval posture, or proof expectations.

3. **Research**
   - Build a narrow queue of next questions:
     - better providers?
     - stronger proof?
     - clearer acceptance criteria?
     - lower approval burden with the same safety?

4. **Heartbeat**
   - Re-check only bounded operational queues.
   - Quiet cycles should harden policy, not produce noise.

5. **Govern**
   - Owner approval, kill switch, and exception handling remain outside the steward's autonomous boundary.

## What to store

Good memory examples:

- "Provider X delivered acceptable proof twice; prefer when low-latency review matters."
- "Orders above 25 USDC in this category should request owner approval."
- "This provider creates dispute overhead; do not auto-route without stronger proof."

Bad memory examples:

- raw tokens
- provider endpoints
- local filesystem secrets
- long narrative chat recaps

## Heartbeat checklist

Heartbeat should primarily ask:

- Are any approvals still pending?
- Did any proof arrive that now requires acceptance?
- Is any dispute still open or missing evidence?
- Is settlement still unresolved?
- Did alerts or repair backlog worsen?
- Are any leases nearing expiry?

If the answer is effectively no, stay quiet.

## UI posture

Owner UI should look like a governance cockpit:

- approvals
- exception pressure
- audit backlog
- kill switch posture
- growth loop next actions

Avoid turning it into a manual shopping catalog.
