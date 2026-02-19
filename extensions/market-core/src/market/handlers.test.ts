import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { MarketStateStore } from "../state/store.js";
import {
  createConsentGrantHandler,
  createDeliveryIssueHandler,
  createOfferCreateHandler,
  createOfferPublishHandler,
  createSettlementLockHandler,
  createSettlementStatusHandler,
} from "./handlers.js";
import type { Offer, Order } from "./types.js";

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    verifyMessage: vi.fn().mockResolvedValue(true),
  };
});

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

function createClient(scopes = ["operator.write"]) {
  return {
    connect: {
      client: {
        id: "test-client",
      },
      role: "operator",
      scopes,
    },
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
    buyerId: "0x0000000000000000000000000000000000000001",
    quantity: 1,
    status: "payment_locked",
    orderHash: "order-hash",
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

describe("market-core handlers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-market-test-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it("rejects scoped access when client is missing", async () => {
    const config = resolveConfig({
      store: { mode: "file" },
      access: {
        mode: "scoped",
        readScopes: ["operator.read"],
        writeScopes: ["operator.write"],
      },
    });
    const store = new MarketStateStore(tempDir, config);
    const handler = createOfferCreateHandler(store, config);
    const { respond, result } = createResponder();

    await handler({
      params: {
        actorId: "seller-1",
        assetId: "asset-1",
        assetType: "data",
        price: 10,
        currency: "USD",
        usageScope: { purpose: "research" },
        deliveryType: "download",
      },
      respond,
    } as any);

    expect(result()?.ok).toBe(false);
    expect(result()?.payload.error).toContain("client missing");
  });

  it("enforces actor match on offer publish", async () => {
    const config = resolveConfig({
      store: { mode: "file" },
      access: {
        mode: "open",
        requireActor: true,
        requireActorMatch: true,
      },
    });
    const store = new MarketStateStore(tempDir, config);
    const createHandler = createOfferCreateHandler(store, config);
    const publishHandler = createOfferPublishHandler(store, config);

    const created = createResponder();
    await createHandler({
      params: {
        actorId: "seller-1",
        assetId: "asset-1",
        assetType: "data",
        price: 10,
        currency: "USD",
        usageScope: { purpose: "research" },
        deliveryType: "download",
      },
      respond: created.respond,
    } as any);

    const offerId = created.result()?.payload.offerId as string;
    const publish = createResponder();
    await publishHandler({
      params: { offerId, actorId: "seller-2" },
      respond: publish.respond,
    } as any);

    expect(publish.result()?.ok).toBe(false);
    expect(publish.result()?.payload.error).toContain("actorId does not match offer.sellerId");
  });

  it("validates consent signature hex format", async () => {
    const config = resolveConfig({ store: { mode: "file" } });
    const store = new MarketStateStore(tempDir, config);

    const offer = createOffer({ status: "offer_published" });
    const order = createOrder({ status: "payment_locked", offerId: offer.offerId });
    store.saveOffer(offer);
    store.saveOrder(order);

    const handler = createConsentGrantHandler(store, config);
    const { respond, result } = createResponder();

    await handler({
      params: {
        orderId: order.orderId,
        signature: "not-hex",
        consentScope: { purpose: "research" },
      },
      respond,
    } as any);

    expect(result()?.ok).toBe(false);
    expect(result()?.payload.error).toContain("consent signature must be hex");
  });

  it("grants consent with valid signature and matching scope", async () => {
    const config = resolveConfig({ store: { mode: "file" } });
    const store = new MarketStateStore(tempDir, config);

    const offer = createOffer({ status: "offer_published" });
    const order = createOrder({ status: "payment_locked", offerId: offer.offerId });
    store.saveOffer(offer);
    store.saveOrder(order);

    const handler = createConsentGrantHandler(store, config);
    const { respond, result } = createResponder();

    await handler({
      params: {
        orderId: order.orderId,
        signature: "0xabc",
        consentScope: { purpose: "research" },
      },
      respond,
    } as any);

    expect(result()?.ok).toBe(true);
    expect(result()?.payload.status).toBe("consent_granted");
  });

  it("stores delivery payload externally when credentials mode is external", async () => {
    const credentialsPath = path.join(tempDir, "credentials");
    const config = resolveConfig({
      store: { mode: "file" },
      credentials: {
        mode: "external",
        storePath: credentialsPath,
        encryptionKey: "test-secret",
      },
    });
    const store = new MarketStateStore(tempDir, config);

    const offer = createOffer({ status: "offer_published" });
    const order = createOrder({ status: "consent_granted", offerId: offer.offerId });
    store.saveOffer(offer);
    store.saveOrder(order);

    const handler = createDeliveryIssueHandler(store, config);
    const { respond, result } = createResponder();

    await handler({
      params: {
        orderId: order.orderId,
        actorId: offer.sellerId,
        payload: { downloadUrl: "https://example.com/data" },
      },
      respond,
    } as any);

    expect(result()?.ok).toBe(true);
    const deliveryId = result()?.payload.deliveryId as string;
    const delivery = store.getDelivery(deliveryId);
    expect(delivery?.payload).toBeUndefined();
    expect(delivery?.payloadRef?.ref).toBe(`${deliveryId}.json`);

    const target = path.join(credentialsPath, "deliveries", `${deliveryId}.json`);
    await expect(fs.stat(target)).resolves.toBeDefined();
  });

  it("allows scoped access with matching client scopes", async () => {
    const config = resolveConfig({
      store: { mode: "file" },
      access: {
        mode: "scoped",
        readScopes: ["operator.read"],
        writeScopes: ["operator.write"],
      },
    });
    const store = new MarketStateStore(tempDir, config);
    const handler = createOfferCreateHandler(store, config);
    const { respond, result } = createResponder();

    await handler({
      params: {
        sellerId: "seller-1",
        assetId: "asset-1",
        assetType: "data",
        price: 10,
        currency: "USD",
        usageScope: { purpose: "research" },
        deliveryType: "download",
      },
      respond,
      client: createClient(),
    } as any);

    expect(result()?.ok).toBe(true);
    expect(result()?.payload.offerId).toBeDefined();
  });

  it("returns settlement status by orderId", async () => {
    const config = resolveConfig({
      store: { mode: "file" },
      access: { mode: "open" },
    });
    const store = new MarketStateStore(tempDir, config);

    const offer = createOffer({ status: "offer_published" });
    const order = createOrder({ status: "payment_locked", offerId: offer.offerId });
    store.saveOffer(offer);
    store.saveOrder(order);
    store.saveSettlement({
      settlementId: "settlement-1",
      orderId: order.orderId,
      status: "settlement_locked",
      amount: "10",
      lockTxHash: "0xlock",
    });

    const handler = createSettlementStatusHandler(store, config);
    const { respond, result } = createResponder();

    await handler({
      params: { orderId: order.orderId },
      respond,
      client: createClient(["operator.read"]),
    } as any);

    expect(result()?.ok).toBe(true);
    expect(result()?.payload.settlementId).toBe("settlement-1");
    expect(result()?.payload.status).toBe("settlement_locked");
    expect(result()?.payload.lockTxHash).toBe("0xlock");
  });

  it("does not mutate order when settlement already exists", async () => {
    const config = resolveConfig({
      store: { mode: "file" },
      access: { mode: "open" },
      settlement: { mode: "anchor_only" },
    });
    const store = new MarketStateStore(tempDir, config);

    const offer = createOffer({ status: "offer_published" });
    const order = createOrder({ status: "order_created", offerId: offer.offerId });
    store.saveOffer(offer);
    store.saveOrder(order);
    store.saveSettlement({
      settlementId: "settlement-1",
      orderId: order.orderId,
      status: "settlement_locked",
      amount: "10",
      lockTxHash: "0xlock",
    });

    const handler = createSettlementLockHandler(store, config);
    const { respond, result } = createResponder();

    await handler({
      params: { orderId: order.orderId, amount: "10", payer: order.buyerId },
      respond,
      client: createClient(),
    } as any);

    expect(result()?.ok).toBe(false);
    const updated = store.getOrder(order.orderId);
    expect(updated?.status).toBe("order_created");
  });
});
