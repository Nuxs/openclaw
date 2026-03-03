import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import { buildSettlementOperation } from "./operation-repository.js";
import { flushPendingSettlementOperations } from "./poller.js";

type StoreMode = "file" | "sqlite";

describe("settlement poller", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-settlement-poller-test-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  async function withStoreModes(run: (mode: StoreMode, store: MarketStateStore) => Promise<void>) {
    for (const mode of ["file", "sqlite"] as const) {
      const modeDir = path.join(tempDir, mode);
      await fs.mkdir(modeDir, { recursive: true });
      const config = resolveConfig({
        store: { mode },
        access: { mode: "open", requireActor: true, requireActorMatch: true },
        settlement: { mode: "anchor_only" },
      });
      const store = new MarketStateStore(modeDir, config);
      await run(mode, store);
    }
  }

  it("marks retry_wait operation as succeeded when state already reconciled", async () => {
    await withStoreModes(async (_mode, store) => {
      const now = new Date().toISOString();
      const config = resolveConfig({
        store: { mode: "file" },
        access: { mode: "open", requireActor: true, requireActorMatch: true },
        settlement: { mode: "anchor_only" },
      });

      store.saveSettlement({
        settlementId: "s1",
        orderId: "o1",
        status: "settlement_released",
        amount: "100",
        releasedAmount: "100",
        strategy: "metered",
        revision: 2,
        updatedAt: now,
      });

      const op = buildSettlementOperation({
        orderId: "o1",
        settlementId: "s1",
        kind: "release",
        idempotencyKey: "idem:o1:release",
        payload: { releasedAmount: "100" },
        status: "retry_wait",
      });
      store.saveSettlementOperation(op);

      await flushPendingSettlementOperations(store, config);

      const updated = store.getSettlementOperation(op.operationId);
      expect(updated?.status).toBe("succeeded");
    });
  });
});
