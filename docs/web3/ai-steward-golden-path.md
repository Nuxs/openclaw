# AI Steward Golden Path for Web3 Market

> **Status**: Draft
> **Updated**: 2026-02-23
> **Scope**: Web3 Market steward operations (identity, billing, audit, market health)

This guide describes the minimal, safe, repeatable path for an AI steward to operate Web3 Market in OpenClaw. It focuses on observable state, redaction rules, and minimal next actions.

## Principles

- **Read first**: Always inspect capabilities and summaries before proposing actions.
- **No secrets in outputs**: Never emit `accessToken`, provider endpoints, or real file paths.
- **Prefer stable APIs**: Use `web3.capabilities.*` and only call `stable` methods unless explicitly authorized.
- **One action at a time**: Provide a single minimal next action after diagnosis.

## Primary entrypoints

- `/web3`: one page dashboard for identity, billing, audit, and market health.
- `/web3-market status`: market health snapshot and enablement hints.
- `web3.capabilities.list`: authoritative capability catalog with `stability`.
- `web3.status.summary`: canonical status snapshot for UI and agents.

## Golden path: single pass triage

1. **Discover capabilities**
   - Call `web3.capabilities.list`.
   - If required methods are missing, stop and report the missing capabilities.

2. **Check health in one screen**
   - Call `/web3` or `web3.status.summary`.
   - Focus on identity bindings, credits, audit pending queues, and market enablement.

3. **Market status**
   - Call `web3.market.status.summary` for offers, orders, and disputes.
   - If market is disabled, recommend `/web3-market start`.

4. **Give one next action**
   - Examples: `/bind_wallet`, `/credits`, `/audit_status`, `/web3-market status`.

## Approval gates

The steward must request explicit confirmation before:

- Enabling or writing config.
- Publishing or unpublishing resources.
- Issuing or revoking leases.
- Resolving disputes.
- Any token economy writes or bridge requests.

## Safe output template

Use a consistent paste safe format:

- **Verdict**: ok | degraded | blocked
- **Blocker**: missing capability or configuration
- **Evidence**: 2 to 4 redacted fields only
- **Next**: one minimal action

## Related docs

- Web3 Core plugin: [/plugins/web3-core](/plugins/web3-core)
- Web3 Market dev: [/reference/web3-market-dev](/reference/web3-market-dev)
- Resource market API: [/reference/web3-resource-market-api](/reference/web3-resource-market-api)
- Web3 overall progress: [/web3/WEB3_OVERALL_PROGRESS](/web3/WEB3_OVERALL_PROGRESS)
- Dual stack strategy: [/web3/WEB3_DUAL_STACK_STRATEGY](/web3/WEB3_DUAL_STACK_STRATEGY)
