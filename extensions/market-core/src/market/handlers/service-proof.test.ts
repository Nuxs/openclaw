import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig, type MarketPluginConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import type { Offer, Order, Settlement } from "../types.js";
import {
  createServiceProofGetHandler,
  createServiceProofListHandler,
  createServiceProofSubmitHandler,
} from "./service-proof.js";

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

const SELLER = "0x00000000000000000000000000000000000000a1";
const BUYER = "0x00000000000000000000000000000000000000b2";

function createClient(scopes = ["operator.write", "operator.read"]) {
  return {
    connect: { client: { id: "gateway-client" }, role: "operator", scopes },
  };
}

function seedServiceOrder(
  store: MarketStateStore,
  opts: {
    orderId?: string;
    offerId?: string;
    status?: Order["status"];
    settlementStatus?: Settlement["status"];
  } = {},
): { offer: Offer; order: Order; settlement: Settlement } {
  const now = new Date().toISOString();
  const offerId = opts.offerId ?? `offer-${Math.random()}`;
  const orderId = opts.orderId ?? `order-${Math.random()}`;

  const offer: Offer = {
    offerId,
    sellerId: SELLER,
    assetId: "asset-service",
    assetType: "service",
    assetMeta: {},
    price: 10,
    currency: "USD",
    usageScope: { purpose: "qa" },
    deliveryType: "service",
    status: "offer_published",
    offerHash: `hash-${offerId}`,
    createdAt: now,
    updatedAt: now,
  };
  const order: Order = {
    orderId,
    offerId,
    buyerId: BUYER,
    quantity: 1,
    status: opts.status ?? "delivery_completed",
    orderHash: `hash-${orderId}`,
    createdAt: now,
    updatedAt: now,
  };
  const settlement: Settlement = {
    settlementId: `settlement-${orderId}`,
    orderId,
    status: opts.settlementStatus ?? "settlement_locked",
    amount: "10",
    releasedAmount: "0",
    strategy: "one-shot",
    tokenAddress: "0x0000000000000000000000000000000000000001",
    lockedAt: now,
  };

  store.saveOffer(offer);
  store.saveOrder(order);
  store.saveSettlement(settlement);
  return { offer, order, settlement };
}

function submitProof(
  store: MarketStateStore,
  config: MarketPluginConfig,
  orderId: string,
  actorId = SELLER,
) {
  const handler = createServiceProofSubmitHandler(store, config);
  const r = createResponder();
  handler({
    params: {
      actorId,
      orderId,
      proof: {
        type: "tlsnotary",
        artifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        issuedAt: "2026-03-01T00:00:00.000Z",
        verifier: "notary-v1",
      },
    },
    respond: r.respond,
    client: createClient(),
  } as any);
  return r.result()!;
}

let tempDir: string;
let store: MarketStateStore;
let config: MarketPluginConfig;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "service-proof-handler-test-"));
  config = resolveConfig({ access: { mode: "open" } });
  store = new MarketStateStore(tempDir, config);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("service proof handlers", () => {
  it("submits proof when order/settlement preconditions pass", async () => {
    const seeded = seedServiceOrder(store);
    const result = submitProof(store, config, seeded.order.orderId);
    expect(result.ok).toBe(true);
    expect((result.payload as any).orderStatus).toBe("delivery_completed");
    expect((result.payload as any).settlementStatus).toBe("settlement_locked");
  });

  it("rejects submit when order status is not delivery_completed/settlement_completed", async () => {
    const seeded = seedServiceOrder(store, { status: "payment_locked" });
    const result = submitProof(store, config, seeded.order.orderId);
    expect(result.ok).toBe(false);
    expect((result.payload as any).error).toContain("order.status");
  });

  it("rejects submit when settlement is refunded", async () => {
    const seeded = seedServiceOrder(store, { settlementStatus: "settlement_refunded" });
    const result = submitProof(store, config, seeded.order.orderId);
    expect(result.ok).toBe(false);
    expect((result.payload as any).error).toContain("settlement already refunded");
  });

  it("gets service proof by proofId", async () => {
    const seeded = seedServiceOrder(store);
    const submit = submitProof(store, config, seeded.order.orderId);
    expect(submit.ok).toBe(true);

    const handler = createServiceProofGetHandler(store, config);
    const r = createResponder();
    handler({
      params: { proofId: (submit.payload as any).proofId, actorId: BUYER },
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);

    expect(r.result()!.ok).toBe(true);
    expect((r.result()!.payload as any).proof.orderId).toBe(seeded.order.orderId);
  });

  it("lists service proofs by orderId", async () => {
    const a = seedServiceOrder(store, { orderId: "order-a", offerId: "offer-a" });
    const b = seedServiceOrder(store, { orderId: "order-b", offerId: "offer-b" });
    expect(submitProof(store, config, a.order.orderId).ok).toBe(true);
    expect(submitProof(store, config, b.order.orderId).ok).toBe(true);

    const handler = createServiceProofListHandler(store, config);
    const r = createResponder();
    handler({
      params: { orderId: "order-a", actorId: BUYER, limit: 10 },
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);

    expect(r.result()!.ok).toBe(true);
    expect((r.result()!.payload as any).count).toBe(1);
    expect((r.result()!.payload as any).proofs[0].orderId).toBe("order-a");
  });
});
