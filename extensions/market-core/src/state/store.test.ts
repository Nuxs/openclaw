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

      store.runInTransaction(() => {
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

    expect(() => {
      store.runInTransaction(() => {
        store.saveOffer(offer);
        throw new Error("simulated failure mid-transaction");
      });
    }).toThrow("simulated failure mid-transaction");

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

    expect(() => {
      store.runInTransaction(() => {
        store.saveOrder(order);
        store.saveConsent(consent);
        // Crash before saving delivery/lease
        throw new Error("crash mid-4-step");
      });
    }).toThrow("crash mid-4-step");

    expect(store.getOrder("order-rb")).toBeUndefined();
    expect(store.getConsent("consent-rb")).toBeUndefined();
  });

  it("file mode: fn still executes (no true rollback)", async () => {
    const modeDir = path.join(tempDir, "file-no-rollback");
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

    expect(() => {
      store.runInTransaction(() => {
        store.saveOffer(offer);
        throw new Error("file mode crash");
      });
    }).toThrow("file mode crash");

    // File mode has no rollback — the write persists
    expect(store.getOffer("offer-file")).toBeTruthy();
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

      store.runInTransaction(() => {
        store.saveOffer(offer);
      });

      expect(store.getOffer("offer-nested")).toBeTruthy();
    });
  });
});
