import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { MarketStateStore } from "../state/store.js";
import { createSettlementRefundHandler, createSettlementReleaseHandler } from "./handlers.js";
import type { Offer, Order, Settlement } from "./types.js";

type HandlerResult = { ok: boolean; payload: Record<string, unknown> } | undefined;

type StoreMode = "file" | "sqlite";

type StoreModeInput = {
  mode: StoreMode;
  store: MarketStateStore;
  config: ReturnType<typeof resolveConfig>;
};

function createResponder() {
  let result: HandlerResult;
  return {
    respond: (ok: boolean, payload: Record<string, unknown>) => {
      result = { ok, payload };
    },
    result: () => result,
  };
}

function createOffer(input: Partial<Offer>): Offer {
  const now = new Date().toISOString();
  return {
    offerId: "offer-1",
    sellerId: "seller-1",
    assetId: "asset-1",
    assetType: "data",
    assetMeta: {},
    price: 10,
    currency: "USD",
    usageScope: { purpose: "research" },
    deliveryType: "download",
    status: "offer_published",
    offerHash: "offer-hash",
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function createOrder(input: Partial<Order>): Order {
  const now = new Date().toISOString();
  return {
    orderId: "order-1",
    offerId: "offer-1",
    buyerId: "buyer-1",
    quantity: 1,
    status: "payment_locked",
    orderHash: "order-hash",
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

async function withStoreModes(tempDir: string, run: (input: StoreModeInput) => Promise<void>) {
  for (const mode of ["file", "sqlite"] as const) {
    const modeDir = path.join(tempDir, mode);
    await fs.mkdir(modeDir, { recursive: true });
    const config = resolveConfig({
      store: { mode },
      settlement: { mode: "anchor_only" },
      access: { mode: "open", requireActor: true, requireActorMatch: true },
    });
    const store = new MarketStateStore(modeDir, config);
    await run({ mode, store, config });
  }
}

describe("market-core settlement handlers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-market-settlement-test-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("releases settlement and updates order", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const offer = createOffer({ offerId: "offer-release", sellerId: "seller-1" });
      const order = createOrder({
        orderId: "order-release",
        offerId: offer.offerId,
        buyerId: "buyer-1",
        status: "delivery_completed",
      });
      const lockedAt = new Date().toISOString();
      const settlement: Settlement = {
        settlementId: "settlement-release",
        orderId: order.orderId,
        status: "settlement_locked",
        amount: "150",
        lockedAt,
        lockTxHash: "lock-tx",
      };

      store.saveOffer(offer);
      store.saveOrder(order);
      store.saveSettlement(settlement);

      const handler = createSettlementReleaseHandler(store, config);
      const responder = createResponder();
      await handler({
        params: {
          actorId: offer.sellerId,
          orderId: order.orderId,
          payees: [
            { address: "0x0000000000000000000000000000000000000002", amount: "100" },
            { address: "0x0000000000000000000000000000000000000003", amount: "50" },
          ],
        },
        respond: responder.respond,
      } as any);

      expect(responder.result()?.ok).toBe(true);

      const savedOrder = store.getOrder(order.orderId);
      const savedSettlement = store.getSettlementByOrder(order.orderId);
      expect(savedOrder?.status).toBe("settlement_completed");
      expect(savedSettlement?.status).toBe("settlement_released");
      expect(savedSettlement?.amount).toBe("150");
      expect(savedSettlement?.lockedAt).toBe(lockedAt);
      expect(savedSettlement?.lockTxHash).toBe("lock-tx");
    });
  });

  it("refunds settlement and records reason", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const offer = createOffer({ offerId: "offer-refund", sellerId: "seller-1" });
      const order = createOrder({
        orderId: "order-refund",
        offerId: offer.offerId,
        buyerId: "buyer-2",
        status: "payment_locked",
      });
      const settlement: Settlement = {
        settlementId: "settlement-refund",
        orderId: order.orderId,
        status: "settlement_locked",
        amount: "200",
        lockedAt: new Date().toISOString(),
        lockTxHash: "lock-tx",
      };

      store.saveOffer(offer);
      store.saveOrder(order);
      store.saveSettlement(settlement);

      const handler = createSettlementRefundHandler(store, config);
      const responder = createResponder();
      await handler({
        params: {
          actorId: order.buyerId,
          orderId: order.orderId,
          payer: order.buyerId,
          reason: "delivery timeout",
        },
        respond: responder.respond,
      } as any);

      expect(responder.result()?.ok).toBe(true);

      const savedOrder = store.getOrder(order.orderId);
      const savedSettlement = store.getSettlementByOrder(order.orderId);
      expect(savedOrder?.status).toBe("settlement_cancelled");
      expect(savedSettlement?.status).toBe("settlement_refunded");
      expect(savedSettlement?.amount).toBe("200");
      expect(savedSettlement?.refundReason).toBe("delivery timeout");
    });
  });
});
