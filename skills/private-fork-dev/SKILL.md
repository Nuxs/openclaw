---
name: private-fork-dev
description: Maintain a private OpenClaw fork with minimal upstream merge conflicts (overlay hooks) and reliable pnpm workspace installs.
---

# private-fork-dev

## Trigger

Use this skill when working on a **private fork** that regularly syncs `upstream/main`, especially when:

- Merge conflicts repeat in the same “hot” files (orchestrators/registries).
- Private features should be upstream-friendly (overlay hooks).
- `pnpm install` tries to fetch local workspace packages and fails with 404 (often due to mirror registries + workspace linking).

## Principles

- Keep upstream “hot” files as close to upstream as possible.
- Implement private logic in **new leaf modules**.
- Limit upstream-file edits to **a few lines** (imports + one call/spread).

## Workflow

### 1) Before writing code: decide whether this file is a merge magnet

- Use overlay hooks for **entrypoints/orchestrators/registries/barrels**.
- Avoid overlay hooks for **leaf utilities** (prefer direct merge with upstream).

### 2) Implement private behavior with overlay hooks

- Create a `private-*` module or `*-<area>.ts` overlay module next to the upstream file.
- In the upstream file, add only:
  - 1 import
  - 1–3 hook calls (provider resolution / execute / post-process)

### 3) Sync upstream safely (`private/scripts/sync-upstream.sh`)

- Run the script.
- If conflicts happen:
  - Keep upstream blocks first.
  - Re-apply private lines (imports + hook calls) in a dedicated “private fork” section.
- Validate with `pnpm check`.

### 4) Fix pnpm workspace 404 / mirror issues

If `pnpm install` tries to fetch a local workspace package (e.g. `@openclaw/blockchain-adapter`) from a mirror registry:

- Ensure repo `.npmrc` enables workspace linking.
- Re-run `pnpm install`.

See `references/pnpm-workspace-404.md` for the exact checklist.
