import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import type { Offer, Order, ServiceProof, Settlement } from "../types.js";
import { createAcceptanceRejectHandler, createAcceptanceSignHandler } from "./acceptance.js";

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

function createClient(scopes = ["operator.write", "operator.read"]) {
  return {
    connect: { client: { id: "gateway-client" }, role: "operator", scopes },
  };
}

const SELLER = "0x0000000000000000000000000000000000000001";
const BUYER = "0x0000000000000000000000000000000000000002";

async function withStoreModes(
  tempDir: string,
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
      settlement: { mode: "anchor_only" },
    });
    const store = new MarketStateStore(modeDir, config);
    await run({ mode, store, config });
  }
}

function seedAcceptanceFlow(store: MarketStateStore) {
  const now = new Date().toISOString();
  const offer: Offer = {
    offerId: "offer-acceptance",
    sellerId: SELLER,
    assetId: "asset-acceptance",
    assetType: "service",
    assetMeta: {},
    price: 100,
    currency: "USDC",
    usageScope: { purpose: "code-review" },
    deliveryType: "service",
    status: "offer_published",
    offerHash: "offer-hash-acceptance",
    createdAt: now,
    updatedAt: now,
  };
  const order: Order = {
    orderId: "order-acceptance",
    offerId: offer.offerId,
    buyerId: BUYER,
    quantity: 1,
    status: "delivery_completed",
    orderHash: "order-hash-acceptance",
    createdAt: now,
    updatedAt: now,
  };
  const settlement: Settlement = {
    settlementId: "settlement-acceptance",
    orderId: order.orderId,
    status: "settlement_locked",
    amount: "100",
    releasedAmount: "0",
    strategy: "one-shot",
    lockedAt: now,
  };
  const proof: ServiceProof = {
    proofId: "proof-acceptance",
    orderId: order.orderId,
    actorId: SELLER,
    proof: {
      type: "tlsnotary",
      artifactHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      issuedAt: now,
      verifier: "notary-v1",
    },
    proofHash: "proof-hash-acceptance",
    submittedAt: now,
    status: "proof_submitted",
  };

  store.saveOffer(offer);
  store.saveOrder(order);
  store.saveSettlement(settlement);
  store.saveServiceProof(proof);
  return { offer, order, settlement, proof };
}

describe("acceptance handlers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "acceptance-handler-test-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("signs acceptance and releases the remaining settlement in both store modes", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const seeded = seedAcceptanceFlow(store);
      const handler = createAcceptanceSignHandler(store, config);
      const r = createResponder();

      await handler({
        params: {
          actorId: BUYER,
          orderId: seeded.order.orderId,
          proofId: seeded.proof.proofId,
        },
        respond: r.respond,
        client: createClient(),
      } as never);

      expect(r.result()?.ok).toBe(true);
      expect(r.result()?.payload.acceptanceStatus).toBe("acceptance_signed");
      expect(store.getOrder(seeded.order.orderId)?.status).toBe("settlement_completed");
      expect(store.getSettlementByOrder(seeded.order.orderId)?.status).toBe("settlement_released");
    });
  });

  it("rejects acceptance by opening a dispute in both store modes", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const seeded = seedAcceptanceFlow(store);
      const handler = createAcceptanceRejectHandler(store, config);
      const r = createResponder();

      await handler({
        params: {
          actorId: BUYER,
          orderId: seeded.order.orderId,
          proofId: seeded.proof.proofId,
          reason: "proof summary does not match requested deliverable",
        },
        respond: r.respond,
        client: createClient(),
      } as never);

      expect(r.result()?.ok).toBe(true);
      expect(r.result()?.payload.acceptanceStatus).toBe("acceptance_rejected");
      expect(store.getDisputeByOrder(seeded.order.orderId)?.status).toBe("dispute_opened");
    });
  });
});
