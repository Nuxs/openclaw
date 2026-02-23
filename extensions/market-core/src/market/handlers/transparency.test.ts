import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig, type MarketPluginConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import type { Offer, Order } from "../types.js";
import {
  createMarketAuditQueryHandler,
  createMarketStatusSummaryHandler,
  createMarketTransparencySummaryHandler,
  createMarketTransparencyTraceHandler,
} from "./transparency.js";

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return { ...actual, verifyMessage: vi.fn().mockResolvedValue(true) };
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

function createClient(scopes = ["operator.read"]) {
  return {
    connect: { client: { id: "gateway-client" }, role: "operator", scopes },
  };
}

function seedOffer(store: MarketStateStore): Offer {
  const now = new Date().toISOString();
  const offer: Offer = {
    offerId: "offer-t1",
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
  };
  store.saveOffer(offer);
  return offer;
}

function seedOrder(store: MarketStateStore): Order {
  const now = new Date().toISOString();
  const order: Order = {
    orderId: "order-t1",
    offerId: "offer-t1",
    buyerId: "0x0000000000000000000000000000000000000001",
    quantity: 1,
    status: "payment_locked",
    orderHash: "order-hash",
    createdAt: now,
    updatedAt: now,
  };
  store.saveOrder(order);
  return order;
}

let tempDir: string;
let store: MarketStateStore;
let config: MarketPluginConfig;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "transparency-test-"));
  config = resolveConfig({ access: { mode: "open" } });
  store = new MarketStateStore(tempDir, config);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("market.status.summary (transparency)", () => {
  it("returns summary with empty store", () => {
    const handler = createMarketStatusSummaryHandler(store, config);
    const r = createResponder();
    handler({ params: {}, respond: r.respond, client: createClient() } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.totals.offers).toBe(0);
    expect(payload.totals.orders).toBe(0);
  });

  it("returns counts after seeding data", () => {
    seedOffer(store);
    seedOrder(store);
    const handler = createMarketStatusSummaryHandler(store, config);
    const r = createResponder();
    handler({ params: {}, respond: r.respond, client: createClient() } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.totals.offers).toBe(1);
    expect(payload.totals.orders).toBe(1);
  });
});

describe("market.audit.query (transparency)", () => {
  it("returns empty events on fresh store", () => {
    const handler = createMarketAuditQueryHandler(store, config);
    const r = createResponder();
    handler({ params: {}, respond: r.respond, client: createClient() } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.count).toBe(0);
    expect(payload.events).toEqual([]);
  });

  it("respects limit parameter", () => {
    const handler = createMarketAuditQueryHandler(store, config);
    const r = createResponder();
    handler({ params: { limit: 5 }, respond: r.respond, client: createClient() } as any);
    expect(r.result()!.ok).toBe(true);
  });
});

describe("market.transparency.summary", () => {
  it("returns summary with empty store", () => {
    const handler = createMarketTransparencySummaryHandler(store, config);
    const r = createResponder();
    handler({ params: {}, respond: r.respond, client: createClient() } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.totals.offers).toBe(0);
    expect(payload.audit.count).toBe(0);
  });

  it("counts seeded data correctly", () => {
    seedOffer(store);
    seedOrder(store);
    const handler = createMarketTransparencySummaryHandler(store, config);
    const r = createResponder();
    handler({ params: {}, respond: r.respond, client: createClient() } as any);
    const payload = r.result()!.payload as any;
    expect(payload.totals.offers).toBe(1);
    expect(payload.totals.orders).toBe(1);
    expect(payload.purposes.research).toBe(1);
  });
});

describe("market.transparency.trace", () => {
  it("traces by offerId", () => {
    seedOffer(store);
    seedOrder(store);
    const handler = createMarketTransparencyTraceHandler(store, config);
    const r = createResponder();
    handler({
      params: { offerId: "offer-t1" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.offers.length).toBe(1);
    expect(payload.orders.length).toBe(1);
  });

  it("traces by orderId", () => {
    seedOffer(store);
    seedOrder(store);
    const handler = createMarketTransparencyTraceHandler(store, config);
    const r = createResponder();
    handler({
      params: { orderId: "order-t1" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.orders.length).toBe(1);
  });

  it("returns empty when no match", () => {
    const handler = createMarketTransparencyTraceHandler(store, config);
    const r = createResponder();
    handler({
      params: { offerId: "nonexistent" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.offers.length).toBe(0);
  });
});
