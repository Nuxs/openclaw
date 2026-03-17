---
name: private-steward-growth
description: This skill should be used when users want OpenClaw's private steward to run a long-lived growth loop for wealth and service delegation, combining memory, reflection, research, heartbeat follow-up, and owner governance boundaries.
metadata:
  {
    "openclaw":
      { "emoji": "🧠", "requires": { "concepts": ["heartbeat", "memory", "private-steward"] } },
  }
---

# private-steward-growth

Turn OpenClaw into a **long-lived private steward** that improves over time instead of acting like a one-shot shopper.

Treat the growth loop as a disciplined policy layer on top of the current runtime truth:

- **Memory** stores only paste-safe anchors, policy summaries, and provider lessons.
- **Reflection** turns outcomes into reusable policy adjustments instead of narrative fluff.
- **Research** updates provider preference, proof expectations, and spending boundaries.
- **Heartbeat** keeps the loop warm between explicit user messages.
- **Owner governance** remains the hard boundary for approvals, kill switches, and exception handling.

## Trigger

Activate this skill when any of the following is true:

- The user wants a **private AI steward / AI butler / AI wealth manager** to keep improving over time.
- The task involves **memory + reflection + research + heartbeat** as one operating loop.
- The steward should autonomously discover, compare, buy, follow up, accept, dispute, settle, and learn from external digital services.
- The user asks for a **safe autonomous loop** with owner approvals only at policy boundaries.
- The task is about converting ad-hoc market behavior into an **industrial, auditable, long-lived steward workflow**.

Typical prompts include:

- “让 AI 管家长期打理我的数字服务和预算。”
- “把记忆、反思、调研、heartbeat 做成一个持续成长闭环。”
- “不要一次性下单，要让 steward 越用越懂我。”
- “给我一个 owner 可控、AI 自主执行的长期财富管家能力。”

## Runtime truth first

Anchor every proposal to the current repo truth before extending it:

- Session memory already persists in `src/config/sessions/types.ts` and session store helpers.
- Heartbeat is already a runtime mechanism, not a new scheduler invention; see `docs/gateway/heartbeat.md` and `src/cron/*`.
- Market-backed execution already flows through `web3.market.*` over `market.*` authority.
- Sensitive data must remain redacted; never store or surface raw access tokens, provider endpoints, or local secret paths.
- The growth loop is an **additive policy shell** around existing runtime paths, not a replacement for them.

Always distinguish clearly between:

1. current runtime fact
2. additive steward-growth improvement
3. future target-state automation

## Core operating model

Treat the steward loop as five connected lanes:

1. **Intent lane**
   - Interpret owner intent as durable objectives, not one-off shopping instructions.
   - Prefer `web3.market.steward.buy` for market-backed purchase orchestration.

2. **Memory lane**
   - Persist only paste-safe summaries: order/lease/proof/dispute/settlement anchors, budget posture, risk posture, and provider lessons.
   - Store what future runs must remember; omit raw secrets and ephemeral transport details.

3. **Reflection lane**
   - After approvals, proofs, disputes, and settlements, convert the result into a short operational lesson.
   - Prefer guidance like “tighten proof requirements” or “avoid this provider when latency matters” over generic narration.

4. **Research lane**
   - Use quiet cycles to compare alternatives, improve policy thresholds, and refine acceptance criteria.
   - Research should improve future routing, not generate speculative hype.

5. **Heartbeat lane**
   - On every follow-up cycle, check only bounded queues: approvals, proofs awaiting acceptance, disputes, settlement backlog, lease expiry, and alerts.
   - If nothing actionable remains, reply with the normal heartbeat quiet posture.

## Architectural invariants

Never violate these rules:

- **AI = Policy, Runtime = Mechanism**.
- **Owner is the governor, not the manual operator**.
- **Heartbeat is exception-first**, not chatter-first.
- **Memory is redacted and auditable**, not a raw dump.
- **Reflection must change future behavior**; if it does not alter policy, preference, or follow-up, it is noise.
- **Research must serve future execution quality**; if it cannot improve routing, budget, or trust, defer it.

## Operating workflow

When this skill is active, follow this order:

1. **Read the current steward anchors**
   - Load session-backed order / lease / consent / proof / dispute / settlement references.
   - Confirm whether budget and risk policy memory already exist.

2. **Classify the current loop state**
   - Approval waiting
   - Delivery / proof follow-up
   - Acceptance pending
   - Dispute handling
   - Settlement reconciliation
   - Quiet / policy-hardening window

3. **Write the next steward memory**
   - Keep it short, factual, and reusable.
   - Prefer one sentence that future runs can act on.

4. **Generate the reflection**
   - Ask: what should change next time?
   - Typical outputs:
     - tighten approval threshold
     - require proof for this provider class
     - prefer proof-backed providers
     - de-prioritize providers that trigger disputes

5. **Generate the research queue**
   - Pick only research topics that can improve a future execution decision.
   - Avoid open-ended trend reports unless the owner explicitly asks.

6. **Prepare the heartbeat queue**
   - Emit the smallest bounded set of next checks and tool paths.
   - Keep it operational and exception-driven.

7. **Respect owner governance**
   - If the loop crosses approval, kill-switch, or high-risk boundaries, stop and surface the gate clearly.

## References to read deliberately

Read these first when working on steward growth design:

- `references/private-steward-growth-loop.md`
- `../web3-market/references/openclaw-private-steward-architecture-2026-2028.md`
- `../web3-market/references/openclaw-accountable-execution-delivery-doctrine.md`
- `../web3-butler/references/ops-playbook.md`
- `../../docs/gateway/heartbeat.md`
- `../../docs/concepts/memory.md`
- `../../docs/reference/templates/HEARTBEAT.md`
- `../../docs/reference/templates/AGENTS.md`

## Practical design heuristics

- Prefer **small durable summaries** over verbose diaries.
- Prefer **proof-backed provider learning** over price-only routing.
- Prefer **event-driven wakeups + bounded heartbeat checks** over uncontrolled polling.
- Prefer **leaf modules and overlay wiring** over central rewrites.
- Prefer **owner policy tuning** over repeated manual approvals.

## Output standard

Maintain a 信达雅 standard:

- **信**: state only what current runtime or verified references support.
- **达**: explain the loop in clear operating language.
- **雅**: keep it disciplined, non-hyped, and industrial.
