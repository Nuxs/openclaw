/**
 * Settlement handler tests — TOCTOU concurrency safety + basic happy-path.
 *
 * Tests verify that:
 * 1. withSettlementLock serializes concurrent operations on the same orderId.
 * 2. Optimistic re-validation inside the transaction rejects stale writes.
 * 3. Happy-path lock → partial release → full release works correctly.
 * 4. Concurrent release + refund for the same order are serialized.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import {
  createSettlementLockHandler,
  createSettlementReleaseHandler,
  createSettlementRefundHandler,
  releaseSettlementIncremental,
} from "./settlement.js";

type StoreMode = "file" | "sqlite";

type StoreModeInput = {
  mode: StoreMode;
  store: MarketStateStore;
  config: ReturnType<typeof resolveConfig>;
};

type HandlerResult = { ok: boolean; payload: Record<string, unknown> } | undefined;

function createResponder() {
  let result: HandlerResult;
  return {
    respond: (ok: boolean, payload: Record<string, unknown>) => {
      result = { ok, payload };
    },
    result: () => result,
  };
}

async function withStoreModes(tempDir: string, run: (input: StoreModeInput) => Promise<void>) {
  for (const mode of ["file", "sqlite"] as const) {
    const modeDir = path.join(tempDir, mode);
    await fs.mkdir(modeDir, { recursive: true });
    const config = resolveConfig({
      store: { mode },
      access: { mode: "open", requireActor: true, requireActorMatch: true },
      settlement: { mode: "anchor_only" },
    });
    const store = new MarketStateStore(modeDir, config);
    await run({ mode, store, config });
  }
}

function seedOrderAndSettlement(store: MarketStateStore, overrides?: { amount?: string }) {
  const now = new Date().toISOString();
  const seller = "0x0000000000000000000000000000000000000001";
  const buyer = "0x0000000000000000000000000000000000000002";
  const amount = overrides?.amount ?? "1000";

  store.saveOffer({
    offerId: "offer-1",
    sellerId: seller,
    assetId: "asset-1",
    assetType: "service",
    assetMeta: {},
    price: 1,
    currency: "USDC",
    usageScope: { purpose: "compute" },
    deliveryType: "service",
    status: "offer_published",
    offerHash: "offer-hash",
    createdAt: now,
    updatedAt: now,
  });

  store.saveOrder({
    orderId: "order-1",
    offerId: "offer-1",
    buyerId: buyer,
    quantity: 1,
    status: "delivery_completed",
    orderHash: "order-hash",
    createdAt: now,
    updatedAt: now,
  });

  store.saveSettlement({
    settlementId: "settlement-1",
    orderId: "order-1",
    status: "settlement_locked",
    amount,
    releasedAmount: "0",
    strategy: "metered",
    lockedAt: now,
  });

  return { seller, buyer, now };
}

function seedOrderForLock(store: MarketStateStore) {
  const now = new Date().toISOString();
  const seller = "0x0000000000000000000000000000000000000001";
  const buyer = "0x0000000000000000000000000000000000000002";

  store.saveOffer({
    offerId: "offer-lock",
    sellerId: seller,
    assetId: "asset-lock",
    assetType: "service",
    assetMeta: {},
    price: 1,
    currency: "USDC",
    usageScope: { purpose: "compute" },
    deliveryType: "service",
    status: "offer_published",
    offerHash: "offer-lock-hash",
    createdAt: now,
    updatedAt: now,
  });

  store.saveOrder({
    orderId: "order-lock",
    offerId: "offer-lock",
    buyerId: buyer,
    quantity: 1,
    status: "order_created",
    orderHash: "order-lock-hash",
    createdAt: now,
    updatedAt: now,
  });

  return { seller, buyer, now };
}

describe("settlement handler concurrency safety", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-settlement-test-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("serializes concurrent release calls via withSettlementLock (no over-release)", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const { seller } = seedOrderAndSettlement(store, { amount: "1000" });

      // Fire two concurrent partial releases of 600 each (total 1200 > 1000).
      const results = await Promise.allSettled([
        releaseSettlementIncremental({
          store,
          config,
          orderId: "order-1",
          actorId: seller,
          payees: [{ address: seller, amount: "600" }],
        }),
        releaseSettlementIncremental({
          store,
          config,
          orderId: "order-1",
          actorId: seller,
          payees: [{ address: seller, amount: "600" }],
        }),
      ]);

      // Exactly one should succeed, the other should fail with SETTLEMENT_OVER_RELEASE.
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const err = (rejected[0] as PromiseRejectedResult).reason as Error;
      expect(err.message).toContain("SETTLEMENT_OVER_RELEASE");

      // Final state: exactly 600 released, not 1200.
      const settlement = store.getSettlementByOrder("order-1");
      expect(settlement?.releasedAmount).toBe("600");
    });
  });

  it("happy path: partial → partial → full release (metered)", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const { seller } = seedOrderAndSettlement(store, { amount: "300" });

      const r1 = await releaseSettlementIncremental({
        store,
        config,
        orderId: "order-1",
        actorId: seller,
        payees: [{ address: seller, amount: "100" }],
      });
      expect(r1.completed).toBe(false);
      expect(r1.releasedAmount).toBe("100");
      expect(r1.remainingAmount).toBe("200");

      const r2 = await releaseSettlementIncremental({
        store,
        config,
        orderId: "order-1",
        actorId: seller,
        payees: [{ address: seller, amount: "200" }],
      });
      expect(r2.completed).toBe(true);
      expect(r2.releasedAmount).toBe("300");
      expect(r2.remainingAmount).toBe("0");
      expect(r2.orderStatus).toBe("settlement_completed");
    });
  });

  it("rejects release after full release (idempotent guard)", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const { seller } = seedOrderAndSettlement(store, { amount: "100" });

      await releaseSettlementIncremental({
        store,
        config,
        orderId: "order-1",
        actorId: seller,
        payees: [{ address: seller, amount: "100" }],
      });

      await expect(
        releaseSettlementIncremental({
          store,
          config,
          orderId: "order-1",
          actorId: seller,
          payees: [{ address: seller, amount: "1" }],
        }),
      ).rejects.toThrow("already fully released");
    });
  });

  it("lock handler serializes concurrent lock attempts", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const { buyer } = seedOrderForLock(store);

      const handler = createSettlementLockHandler(store, config);

      const r1 = createResponder();
      const r2 = createResponder();

      await Promise.allSettled([
        handler({
          params: {
            orderId: "order-lock",
            amount: "500",
            payer: buyer,
            actorId: buyer,
          },
          respond: r1.respond,
        } as any),
        handler({
          params: {
            orderId: "order-lock",
            amount: "500",
            payer: buyer,
            actorId: buyer,
          },
          respond: r2.respond,
        } as any),
      ]);

      // One succeeds, one fails (duplicate lock or invalid transition).
      const outcomes = [r1.result(), r2.result()].filter(Boolean);
      const successes = outcomes.filter((o) => o!.ok);
      const failures = outcomes.filter((o) => !o!.ok);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
    });
  });

  it("concurrent release + refund for the same order are serialized", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const { seller, buyer } = seedOrderAndSettlement(store, { amount: "500" });

      // Modify order status to allow refund path.
      const order = store.getOrder("order-1")!;
      order.status = "payment_locked";
      store.saveOrder(order);

      const releaseHandler = createSettlementReleaseHandler(store, config);
      const refundHandler = createSettlementRefundHandler(store, config);

      const rRelease = createResponder();
      const rRefund = createResponder();

      await Promise.allSettled([
        releaseHandler({
          params: {
            orderId: "order-1",
            actorId: seller,
            payees: [{ address: seller, amount: "500" }],
          },
          respond: rRelease.respond,
        } as any),
        refundHandler({
          params: {
            orderId: "order-1",
            actorId: buyer,
            payer: buyer,
          },
          respond: rRefund.respond,
        } as any),
      ]);

      // Only one should succeed — the loser hits a state machine or conflict error.
      const results = [rRelease.result(), rRefund.result()].filter(Boolean);
      const successes = results.filter((r) => r!.ok);
      expect(successes.length).toBeLessThanOrEqual(1);

      // State must be consistent: no half-release + half-refund.
      const finalSettlement = store.getSettlementByOrder("order-1");
      expect(
        finalSettlement?.status === "settlement_released" ||
          finalSettlement?.status === "settlement_refunded" ||
          finalSettlement?.status === "settlement_locked",
      ).toBe(true);
    });
  });
});
