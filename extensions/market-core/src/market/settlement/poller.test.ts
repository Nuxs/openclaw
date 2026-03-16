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

  it("marks retry_wait release as succeeded when expectedReleased is already reconciled", async () => {
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
        status: "settlement_locked",
        amount: "100",
        releasedAmount: "60",
        strategy: "metered",
        revision: 2,
        updatedAt: now,
      });

      const op = buildSettlementOperation({
        orderId: "o1",
        settlementId: "s1",
        kind: "release",
        idempotencyKey: "idem:o1:release",
        payload: { expectedReleased: "60", releaseAmount: "10", priorReleased: "50" },
        status: "retry_wait",
      });
      store.saveSettlementOperation(op);

      await flushPendingSettlementOperations(store, config);

      const updated = store.getSettlementOperation(op.operationId);
      expect(updated?.status).toBe("succeeded");
      expect(updated?.completedAt).toBeDefined();
      expect(updated?.lastAttemptAt).toBeDefined();
      expect(updated?.manualInterventionRequired).toBe(false);
      expect(updated?.nextAction).toBeUndefined();
    });
  });

  it("reconciles stale pending operations instead of leaving them stuck forever", async () => {
    await withStoreModes(async (_mode, store) => {
      const now = new Date().toISOString();
      const config = resolveConfig({
        store: { mode: "file" },
        access: { mode: "open", requireActor: true, requireActorMatch: true },
        settlement: { mode: "anchor_only" },
      });

      store.saveSettlement({
        settlementId: "s2",
        orderId: "o2",
        status: "settlement_locked",
        amount: "50",
        releasedAmount: "0",
        strategy: "one-shot",
        revision: 1,
        updatedAt: now,
      });

      const op = buildSettlementOperation({
        orderId: "o2",
        settlementId: "s2",
        kind: "lock",
        idempotencyKey: "idem:o2:lock",
        payload: {},
        status: "pending",
      });
      store.saveSettlementOperation(op);

      await flushPendingSettlementOperations(store, config);

      const updated = store.getSettlementOperation(op.operationId);
      expect(updated?.status).toBe("succeeded");
      expect(updated?.completedAt).toBeDefined();
      expect(updated?.lastAttemptAt).toBeDefined();
    });
  });
});
