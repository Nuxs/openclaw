import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig, type MarketPluginConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import type { Offer, Order, ServiceProof, Settlement } from "../types.js";
import { createProofSubmitHandler, createProofVerifyHandler } from "./proof.js";

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

function seedServiceOrder(store: MarketStateStore) {
  const now = new Date().toISOString();
  const offer: Offer = {
    offerId: "offer-proof-generic",
    sellerId: SELLER,
    assetId: "asset-service",
    assetType: "service",
    assetMeta: {},
    price: 10,
    currency: "USD",
    usageScope: { purpose: "qa" },
    deliveryType: "service",
    status: "offer_published",
    offerHash: "offer-hash-proof-generic",
    createdAt: now,
    updatedAt: now,
  };
  const order: Order = {
    orderId: "order-proof-generic",
    offerId: offer.offerId,
    buyerId: BUYER,
    quantity: 1,
    status: "delivery_completed",
    orderHash: "order-hash-proof-generic",
    createdAt: now,
    updatedAt: now,
  };
  const settlement: Settlement = {
    settlementId: "settlement-proof-generic",
    orderId: order.orderId,
    status: "settlement_locked",
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

let tempDir: string;
let store: MarketStateStore;
let config: MarketPluginConfig;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "generic-proof-handler-test-"));
  config = resolveConfig({ access: { mode: "open" } });
  store = new MarketStateStore(tempDir, config);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("generic proof handlers", () => {
  it("submits proof through the generic alias and verifies by proofId", async () => {
    const seeded = seedServiceOrder(store);
    const submitHandler = createProofSubmitHandler(store, config);
    const submit = createResponder();
    await submitHandler({
      params: {
        actorId: SELLER,
        orderId: seeded.order.orderId,
        proof: {
          type: "tlsnotary",
          artifactHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          issuedAt: "2026-03-01T00:00:00.000Z",
          verifier: "notary-v1",
        },
      },
      respond: submit.respond,
      client: createClient(),
    } as never);

    expect(submit.result()?.ok).toBe(true);
    const proofId = String(submit.result()?.payload.proofId ?? "");
    expect(proofId).not.toBe("");

    const verifyHandler = createProofVerifyHandler(store, config);
    const verify = createResponder();
    verifyHandler({
      params: { actorId: BUYER, proofId },
      respond: verify.respond,
      client: createClient(["operator.read"]),
    } as never);

    expect(verify.result()?.ok).toBe(true);
    expect(verify.result()?.payload.verified).toBe(true);
    expect((verify.result()?.payload.summary as ServiceProof["proof"]).artifactHash).toBe(
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });
});
