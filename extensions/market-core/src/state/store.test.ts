import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { MarketStateStore } from "./store.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-market-store-test-"));
});

afterEach(async () => {
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

async function withStoreModes(
  run: (input: {
    mode: "file" | "sqlite";
    store: MarketStateStore;
    config: ReturnType<typeof resolveConfig>;
  }) => Promise<void>,
) {
  for (const mode of ["file", "sqlite"] as const) {
    const modeDir = path.join(tempDir, mode);
    await fs.mkdir(modeDir, { recursive: true });
    const config = resolveConfig({
      store: { mode },
      access: { mode: "open", requireActor: true, requireActorMatch: true },
    });
    const store = new MarketStateStore(modeDir, config);
    await run({ mode, store, config });
  }
}

describe("MarketStateStore.runInTransaction", () => {
  it("commits both writes atomically on success (both modes)", async () => {
    await withStoreModes(async ({ store }) => {
      const now = new Date().toISOString();
      const offer = {
        offerId: "offer-tx-1",
        sellerId: "seller-1",
        assetId: "asset-1",
        assetType: "data" as const,
        assetMeta: {},
        price: 10,
        currency: "USD",
        usageScope: { purpose: "research" },
        deliveryType: "download" as const,
        status: "offer_published" as const,
        offerHash: "hash-1",
        createdAt: now,
        updatedAt: now,
      };
      const resource = {
        resourceId: "res-tx-1",
        kind: "model" as const,
        status: "resource_published" as const,
        providerActorId: "provider-1",
        offerId: "offer-tx-1",
        offerHash: "hash-1",
        label: "Test Resource",
        price: { unit: "token" as const, amount: "10", currency: "USD" },
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      await store.runInTransaction(() => {
        store.saveOffer(offer);
        store.saveResource(resource);
      });

      expect(store.getOffer("offer-tx-1")).toBeTruthy();
      expect(store.getResource("res-tx-1")).toBeTruthy();
    });
  });

  it("SQLite mode rolls back all writes on error", async () => {
    const modeDir = path.join(tempDir, "sqlite-rollback");
    await fs.mkdir(modeDir, { recursive: true });
    const config = resolveConfig({
      store: { mode: "sqlite" },
      access: { mode: "open", requireActor: true, requireActorMatch: true },
    });
    const store = new MarketStateStore(modeDir, config);

    const now = new Date().toISOString();
    const offer = {
      offerId: "offer-rollback",
      sellerId: "seller-1",
      assetId: "asset-1",
      assetType: "data" as const,
      assetMeta: {},
      price: 10,
      currency: "USD",
      usageScope: { purpose: "research" },
      deliveryType: "download" as const,
      status: "offer_published" as const,
      offerHash: "hash-rb",
      createdAt: now,
      updatedAt: now,
    };

    await expect(
      store.runInTransaction(() => {
        store.saveOffer(offer);
        throw new Error("simulated failure mid-transaction");
      }),
    ).rejects.toThrow("simulated failure mid-transaction");

    // Offer should NOT be persisted due to rollback
    expect(store.getOffer("offer-rollback")).toBeUndefined();
  });

  it("SQLite mode: partial writes are fully rolled back (4-step)", async () => {
    const modeDir = path.join(tempDir, "sqlite-4step");
    await fs.mkdir(modeDir, { recursive: true });
    const config = resolveConfig({
      store: { mode: "sqlite" },
      access: { mode: "open", requireActor: true, requireActorMatch: true },
    });
    const store = new MarketStateStore(modeDir, config);
    const now = new Date().toISOString();

    const order = {
      orderId: "order-rb",
      offerId: "offer-1",
      buyerId: "0x0000000000000000000000000000000000000001",
      quantity: 1,
      status: "delivery_ready" as const,
      orderHash: "hash-order",
      createdAt: now,
      updatedAt: now,
    };

    const consent = {
      consentId: "consent-rb",
      orderId: "order-rb",
      scope: { purpose: "research", durationDays: 30 },
      signature: "sig",
      status: "consent_granted" as const,
      consentHash: "hash-consent",
      grantedAt: now,
    };

    await expect(
      store.runInTransaction(() => {
        store.saveOrder(order);
        store.saveConsent(consent);
        // Crash before saving delivery/lease
        throw new Error("crash mid-4-step");
      }),
    ).rejects.toThrow("crash mid-4-step");

    expect(store.getOrder("order-rb")).toBeUndefined();
    expect(store.getConsent("consent-rb")).toBeUndefined();
  });

  it("file mode rolls back writes on error", async () => {
    const modeDir = path.join(tempDir, "file-rollback");
    await fs.mkdir(modeDir, { recursive: true });
    const config = resolveConfig({
      store: { mode: "file" },
      access: { mode: "open", requireActor: true, requireActorMatch: true },
    });
    const store = new MarketStateStore(modeDir, config);
    const now = new Date().toISOString();

    const offer = {
      offerId: "offer-file",
      sellerId: "seller-1",
      assetId: "asset-1",
      assetType: "data" as const,
      assetMeta: {},
      price: 10,
      currency: "USD",
      usageScope: { purpose: "research" },
      deliveryType: "download" as const,
      status: "offer_published" as const,
      offerHash: "hash-file",
      createdAt: now,
      updatedAt: now,
    };

    await expect(
      store.runInTransaction(() => {
        store.saveOffer(offer);
        throw new Error("file mode crash");
      }),
    ).rejects.toThrow("file mode crash");

    expect(store.getOffer("offer-file")).toBeUndefined();
  });

  it("nested transaction fn succeeds without error propagation", async () => {
    await withStoreModes(async ({ store }) => {
      const now = new Date().toISOString();
      const offer = {
        offerId: "offer-nested",
        sellerId: "seller-1",
        assetId: "asset-1",
        assetType: "data" as const,
        assetMeta: {},
        price: 10,
        currency: "USD",
        usageScope: { purpose: "research" },
        deliveryType: "download" as const,
        status: "offer_published" as const,
        offerHash: "hash-nested",
        createdAt: now,
        updatedAt: now,
      };

      await store.runInTransaction(() => {
        store.saveOffer(offer);
      });

      expect(store.getOffer("offer-nested")).toBeTruthy();
    });
  });

  it("propagates nested transaction errors and rolls back outer writes", async () => {
    await withStoreModes(async ({ store }) => {
      const now = new Date().toISOString();
      const offer = {
        offerId: "offer-nested-error",
        sellerId: "seller-1",
        assetId: "asset-1",
        assetType: "data" as const,
        assetMeta: {},
        price: 10,
        currency: "USD",
        usageScope: { purpose: "research" },
        deliveryType: "download" as const,
        status: "offer_published" as const,
        offerHash: "hash-nested-error",
        createdAt: now,
        updatedAt: now,
      };

      await expect(
        store.runInTransaction(async () => {
          store.saveOffer(offer);
          await store.runInTransaction(() => {
            throw new Error("nested tx failure");
          });
        }),
      ).rejects.toThrow("nested tx failure");

      expect(store.getOffer("offer-nested-error")).toBeUndefined();
    });
  });

  it("file mode serializes concurrent runInTransaction calls", async () => {
    const modeDir = path.join(tempDir, "file-serial");
    await fs.mkdir(modeDir, { recursive: true });
    const config = resolveConfig({
      store: { mode: "file" },
      access: { mode: "open", requireActor: true, requireActorMatch: true },
    });
    const store = new MarketStateStore(modeDir, config);
    const now = new Date().toISOString();
    const timeline: string[] = [];

    const firstTx = store.runInTransaction(async () => {
      timeline.push("tx1-start");
      store.saveOffer({
        offerId: "offer-serial",
        sellerId: "seller-1",
        assetId: "asset-1",
        assetType: "data",
        assetMeta: {},
        price: 10,
        currency: "USD",
        usageScope: { purpose: "research" },
        deliveryType: "download",
        status: "offer_published",
        offerHash: "hash-serial",
        createdAt: now,
        updatedAt: now,
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
      timeline.push("tx1-end");
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const secondTx = store.runInTransaction(() => {
      timeline.push("tx2-start");
      expect(store.getOffer("offer-serial")).toBeTruthy();
      timeline.push("tx2-end");
    });

    await Promise.all([firstTx, secondTx]);

    expect(timeline.indexOf("tx2-start")).toBeGreaterThan(timeline.indexOf("tx1-end"));
    expect(store.getOffer("offer-serial")).toBeTruthy();
  });

  it("persists settlement operations and supports idempotency lookup (both modes)", async () => {
    await withStoreModes(async ({ store }) => {
      const now = new Date().toISOString();
      const operation = {
        operationId: "op-1",
        orderId: "order-1",
        settlementId: "settlement-1",
        kind: "release" as const,
        status: "pending" as const,
        idempotencyKey: "idem:order-1:release",
        payload: { releaseAmount: "100" },
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      };

      store.saveSettlementOperation(operation);

      expect(store.getSettlementOperation("op-1")?.idempotencyKey).toBe("idem:order-1:release");
      expect(
        store.getSettlementOperationByIdempotencyKey("idem:order-1:release")?.operationId,
      ).toBe("op-1");
      expect(store.listSettlementOperations({ status: "pending" }).length).toBeGreaterThanOrEqual(
        1,
      );
    });
  });
});
