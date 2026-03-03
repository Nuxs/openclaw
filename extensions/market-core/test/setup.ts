// Keep extension tests consistent with repo-wide Vitest defaults.
//
// Repo root `vitest.config.ts` loads `test/setup.ts`. When running Vitest from the
// extension directory, the relative `setupFiles` path resolves against this package
// root. This shim keeps behavior aligned with root test execution.
import "../../../test/setup.ts";
