import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import { createLedgerAppendHandler } from "./ledger.js";

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

async function withStoreModesConfig(
  tempDir: string,
  partial: Record<string, unknown>,
  run: (input: StoreModeInput) => Promise<void>,
) {
  for (const mode of ["file", "sqlite"] as const) {
    const modeDir = path.join(tempDir, mode);
    await fs.mkdir(modeDir, { recursive: true });
    const config = resolveConfig({
      store: { mode },
      access: { mode: "open", requireActor: true, requireActorMatch: true },
      ...partial,
    });
    const store = new MarketStateStore(modeDir, config);
    await run({ mode, store, config });
  }
}

async function withStoreModes(tempDir: string, run: (input: StoreModeInput) => Promise<void>) {
  return withStoreModesConfig(tempDir, { settlement: { mode: "anchor_only" } }, run);
}

describe("market-core ledger -> metered settlement release", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-market-ledger-settlement-test-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("auto releases metered settlement on ledger append", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const now = new Date().toISOString();
      const providerActorId = "0x0000000000000000000000000000000000000001";
      const consumerActorId = "0x0000000000000000000000000000000000000002";

      store.saveOffer({
        offerId: "offer-1",
        sellerId: providerActorId,
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
        buyerId: consumerActorId,
        quantity: 1,
        status: "delivery_completed",
        orderHash: "order-hash",
        createdAt: now,
        updatedAt: now,
      });

      store.saveResource({
        resourceId: "resource-1",
        kind: "model",
        status: "resource_published",
        providerActorId,
        offerId: "offer-1",
        label: "model",
        price: {
          unit: "token",
          amount: "1",
          currency: "USDC",
        },
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      store.saveLease({
        leaseId: "lease-1",
        resourceId: "resource-1",
        kind: "model",
        providerActorId,
        consumerActorId,
        orderId: "order-1",
        status: "lease_active",
        issuedAt: now,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });

      store.saveSettlement({
        settlementId: "settlement-1",
        orderId: "order-1",
        status: "settlement_locked",
        amount: "200",
        releasedAmount: "0",
        strategy: "metered",
        lockedAt: now,
      });

      const append = createLedgerAppendHandler(store, config);

      const firstResponder = createResponder();
      await append({
        params: {
          actorId: providerActorId,
          entry: {
            leaseId: "lease-1",
            resourceId: "resource-1",
            kind: "model",
            providerActorId,
            consumerActorId,
            unit: "token",
            quantity: "80",
            cost: "80",
            currency: "USDC",
          },
        },
        respond: firstResponder.respond,
      } as any);

      expect(firstResponder.result()?.ok).toBe(true);
      const firstSettlement = store.getSettlementByOrder("order-1");
      const firstOrder = store.getOrder("order-1");
      expect(firstSettlement?.status).toBe("settlement_locked");
      expect(firstSettlement?.releasedAmount).toBe("80");
      expect(firstOrder?.status).toBe("delivery_completed");

      const secondResponder = createResponder();
      await append({
        params: {
          actorId: providerActorId,
          entry: {
            leaseId: "lease-1",
            resourceId: "resource-1",
            kind: "model",
            providerActorId,
            consumerActorId,
            unit: "token",
            quantity: "120",
            cost: "120",
            currency: "USDC",
          },
        },
        respond: secondResponder.respond,
      } as any);

      expect(secondResponder.result()?.ok).toBe(true);
      const finalSettlement = store.getSettlementByOrder("order-1");
      const finalOrder = store.getOrder("order-1");
      expect(finalSettlement?.status).toBe("settlement_released");
      expect(finalSettlement?.releasedAmount).toBe("200");
      expect(finalOrder?.status).toBe("settlement_completed");
    });
  });

  it("uses unique ledger-scoped idempotency keys for repeated equal-cost auto releases", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const now = new Date().toISOString();
      const providerActorId = "0x0000000000000000000000000000000000000001";
      const consumerActorId = "0x0000000000000000000000000000000000000002";

      store.saveOffer({
        offerId: "offer-repeat",
        sellerId: providerActorId,
        assetId: "asset-repeat",
        assetType: "service",
        assetMeta: {},
        price: 1,
        currency: "USDC",
        usageScope: { purpose: "compute" },
        deliveryType: "service",
        status: "offer_published",
        offerHash: "offer-repeat-hash",
        createdAt: now,
        updatedAt: now,
      });

      store.saveOrder({
        orderId: "order-repeat",
        offerId: "offer-repeat",
        buyerId: consumerActorId,
        quantity: 1,
        status: "delivery_completed",
        orderHash: "order-repeat-hash",
        createdAt: now,
        updatedAt: now,
      });

      store.saveResource({
        resourceId: "resource-repeat",
        kind: "model",
        status: "resource_published",
        providerActorId,
        offerId: "offer-repeat",
        label: "model",
        price: {
          unit: "token",
          amount: "1",
          currency: "USDC",
        },
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      store.saveLease({
        leaseId: "lease-repeat",
        resourceId: "resource-repeat",
        kind: "model",
        providerActorId,
        consumerActorId,
        orderId: "order-repeat",
        status: "lease_active",
        issuedAt: now,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });

      store.saveSettlement({
        settlementId: "settlement-repeat",
        orderId: "order-repeat",
        status: "settlement_locked",
        amount: "100",
        releasedAmount: "0",
        strategy: "metered",
        lockedAt: now,
      });

      const append = createLedgerAppendHandler(store, config);

      for (let index = 0; index < 2; index += 1) {
        const responder = createResponder();
        await append({
          params: {
            actorId: providerActorId,
            entry: {
              leaseId: "lease-repeat",
              resourceId: "resource-repeat",
              kind: "model",
              providerActorId,
              consumerActorId,
              unit: "token",
              quantity: "50",
              cost: "50",
              currency: "USDC",
            },
          },
          respond: responder.respond,
        } as any);
        expect(responder.result()?.ok).toBe(true);
      }

      const settlement = store.getSettlementByOrder("order-repeat");
      const operations = store.listSettlementOperations({ orderId: "order-repeat" });
      expect(settlement?.releasedAmount).toBe("100");
      expect(settlement?.status).toBe("settlement_released");
      expect(operations).toHaveLength(2);
      expect(new Set(operations.map((entry) => entry.idempotencyKey)).size).toBe(2);
    });
  });

  it("downgrades metered settlement to one-shot when auto release fails", async () => {
    await withStoreModesConfig(
      tempDir,
      { settlement: { mode: "contract" } },
      async ({ store, config }) => {
        const now = new Date().toISOString();
        const providerActorId = "0x0000000000000000000000000000000000000001";
        const consumerActorId = "0x0000000000000000000000000000000000000002";

        store.saveOffer({
          offerId: "offer-1",
          sellerId: providerActorId,
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
          buyerId: consumerActorId,
          quantity: 1,
          status: "delivery_completed",
          orderHash: "order-hash",
          createdAt: now,
          updatedAt: now,
        });

        store.saveResource({
          resourceId: "resource-1",
          kind: "model",
          status: "resource_published",
          providerActorId,
          offerId: "offer-1",
          label: "model",
          price: {
            unit: "token",
            amount: "1",
            currency: "USDC",
          },
          version: 1,
          createdAt: now,
          updatedAt: now,
        });

        store.saveLease({
          leaseId: "lease-1",
          resourceId: "resource-1",
          kind: "model",
          providerActorId,
          consumerActorId,
          orderId: "order-1",
          status: "lease_active",
          issuedAt: now,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });

        store.saveSettlement({
          settlementId: "settlement-1",
          orderId: "order-1",
          status: "settlement_locked",
          amount: "200",
          releasedAmount: "0",
          strategy: "metered",
          lockedAt: now,
        });

        const append = createLedgerAppendHandler(store, config);
        const responder = createResponder();
        await append({
          params: {
            actorId: providerActorId,
            entry: {
              leaseId: "lease-1",
              resourceId: "resource-1",
              kind: "model",
              providerActorId,
              consumerActorId,
              unit: "token",
              quantity: "80",
              cost: "80",
              currency: "USDC",
            },
          },
          respond: responder.respond,
        } as any);

        const response = responder.result();
        expect(response?.ok).toBe(true);
        expect(response?.payload.settlementReleaseError).toContain("downgraded to one-shot");

        const updatedSettlement = store.getSettlementByOrder("order-1");
        expect(updatedSettlement?.strategy).toBe("one-shot");
        expect(updatedSettlement?.status).toBe("settlement_locked");
      },
    );
  });

  it("rejects ledger append when lease maxCost would be exceeded", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const now = new Date().toISOString();
      const providerActorId = "0x0000000000000000000000000000000000000001";
      const consumerActorId = "0x0000000000000000000000000000000000000002";

      store.saveOffer({
        offerId: "offer-max-cost",
        sellerId: providerActorId,
        assetId: "asset-max-cost",
        assetType: "service",
        assetMeta: {},
        price: 1,
        currency: "USDC",
        usageScope: { purpose: "compute" },
        deliveryType: "service",
        status: "offer_published",
        offerHash: "offer-max-cost-hash",
        createdAt: now,
        updatedAt: now,
      });

      store.saveOrder({
        orderId: "order-max-cost",
        offerId: "offer-max-cost",
        buyerId: consumerActorId,
        quantity: 1,
        status: "delivery_completed",
        orderHash: "order-max-cost-hash",
        createdAt: now,
        updatedAt: now,
      });

      store.saveResource({
        resourceId: "resource-max-cost",
        kind: "model",
        status: "resource_published",
        providerActorId,
        offerId: "offer-max-cost",
        label: "model",
        price: {
          unit: "token",
          amount: "1",
          currency: "USDC",
        },
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      store.saveLease({
        leaseId: "lease-max-cost",
        resourceId: "resource-max-cost",
        kind: "model",
        providerActorId,
        consumerActorId,
        orderId: "order-max-cost",
        status: "lease_active",
        issuedAt: now,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        maxCost: "100",
      });

      const append = createLedgerAppendHandler(store, config);

      const first = createResponder();
      await append({
        params: {
          actorId: providerActorId,
          entry: {
            leaseId: "lease-max-cost",
            resourceId: "resource-max-cost",
            kind: "model",
            providerActorId,
            consumerActorId,
            unit: "token",
            quantity: "80",
            cost: "80",
            currency: "USDC",
          },
        },
        respond: first.respond,
      } as any);
      expect(first.result()?.ok).toBe(true);

      const second = createResponder();
      await append({
        params: {
          actorId: providerActorId,
          entry: {
            leaseId: "lease-max-cost",
            resourceId: "resource-max-cost",
            kind: "model",
            providerActorId,
            consumerActorId,
            unit: "token",
            quantity: "30",
            cost: "30",
            currency: "USDC",
          },
        },
        respond: second.respond,
      } as any);

      expect(second.result()?.ok).toBe(false);
      expect(String(second.result()?.payload.error)).toContain("E_QUOTA_EXCEEDED");

      const entries = store.listLedger({ leaseId: "lease-max-cost" });
      expect(entries).toHaveLength(1);
      expect(entries[0]?.cost).toBe("80");
    });
  });
});
