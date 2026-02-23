// Keep extension tests consistent with repo-wide Vitest defaults.
//
// Repo root `vitest.config.ts` loads `test/setup.ts`. When running Vitest from the
// extension directory (e.g. `pnpm -C extensions/blockchain-adapter test`), the
// relative `setupFiles` path resolves against this package root. Provide a thin
// shim so the same setup is applied.
import "../../../test/setup.ts";
