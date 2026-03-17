import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import type { Offer, Order, ServiceProof } from "../types.js";
import { createReputationSummaryHandler } from "./reputation.js";

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
    });
    const store = new MarketStateStore(modeDir, config);
    await run({ mode, store, config });
  }
}

function seedReputationFlow(store: MarketStateStore) {
  const now = "2026-03-05T12:00:00.000Z";
  const providerActorId = "0x00000000000000000000000000000000000000A1";
  const resourceId = "resource-reputation";
  const offer: Offer = {
    offerId: "offer-reputation",
    sellerId: providerActorId,
    assetId: "asset-reputation",
    assetType: "service",
    assetMeta: {},
    price: 20,
    currency: "USDC",
    usageScope: { purpose: "security-review" },
    deliveryType: "service",
    status: "offer_published",
    offerHash: "offer-hash-reputation",
    createdAt: now,
    updatedAt: now,
  };
  const order: Order = {
    orderId: "order-reputation",
    offerId: offer.offerId,
    buyerId: "0x00000000000000000000000000000000000000b2",
    quantity: 1,
    status: "delivery_completed",
    orderHash: "order-hash-reputation",
    createdAt: now,
    updatedAt: now,
  };
  const proof: ServiceProof = {
    proofId: "proof-reputation",
    orderId: order.orderId,
    actorId: providerActorId,
    proof: {
      type: "tlsnotary",
      artifactHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      issuedAt: now,
      verifier: "notary-v1",
    },
    proofHash: "proof-hash-reputation",
    submittedAt: now,
    status: "proof_submitted",
  };

  store.saveOffer(offer);
  store.saveResource({
    resourceId,
    kind: "service",
    status: "resource_published",
    providerActorId,
    offerId: offer.offerId,
    offerHash: offer.offerHash,
    label: "Security review",
    tags: ["security", "review"],
    price: { unit: "call", amount: "20", currency: "USDC" },
    serviceSchema: { inputs: ["repo"], outputs: ["report"] },
    serviceWrapper: {
      version: "v1",
      category: "digital",
      serviceSchema: { inputs: ["repo"], outputs: ["report"] },
      acceptance: { mode: "human", reviewWindowHours: 168, arbitratorType: "manual" },
      proof: { families: ["tlsnotary"], required: true },
      tags: ["security", "review"],
    },
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  store.saveOrder(order);
  store.saveLease({
    leaseId: "lease-reputation",
    resourceId,
    kind: "service",
    providerActorId,
    consumerActorId: order.buyerId,
    orderId: order.orderId,
    status: "lease_active",
    issuedAt: now,
    expiresAt: "2026-03-06T12:00:00.000Z",
  });
  store.saveServiceProof(proof);
  store.saveDispute({
    disputeId: "dispute-reputation",
    orderId: order.orderId,
    initiatorActorId: order.buyerId,
    respondentActorId: providerActorId,
    arbitratorType: "platform",
    reason: "Needs clarification",
    status: "dispute_opened",
    evidence: [],
    disputeHash: "dispute-hash-reputation",
    openedAt: now,
    updatedAt: now,
  });

  return { providerActorId, resourceId };
}

describe("reputation handler", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reputation-handler-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns derived agentReputation alongside the legacy summary in both store modes", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const seeded = seedReputationFlow(store);
      const handler = createReputationSummaryHandler(store, config);
      const r = createResponder();

      handler({
        params: { providerActorId: seeded.providerActorId },
        respond: r.respond,
      } as never);

      expect(r.result()?.ok).toBe(true);
      expect(r.result()?.payload.score).toBe(68);
      const agentReputation = r.result()?.payload.agentReputation as {
        agentDid?: string;
        derivedScore?: number;
        profile?: { completedJobs?: number; specializations?: string[] };
        proofs?: Array<{ type?: string; count?: number }>;
      };
      expect(agentReputation.agentDid).toBe(seeded.providerActorId);
      expect(agentReputation.derivedScore).toBe(68);
      expect(agentReputation.profile?.completedJobs).toBe(1);
      expect(agentReputation.profile?.specializations).toEqual(["digital", "review", "security"]);
      expect(agentReputation.proofs).toEqual([{ type: "tlsnotary", count: 1, verifiedRate: 1 }]);
    });
  });
});
