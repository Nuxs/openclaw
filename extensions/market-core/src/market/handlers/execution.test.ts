import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import type { AuditEvent, Offer, Order, ServiceProof, Settlement } from "../types.js";
import { createExecutionGetHandler } from "./execution.js";

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

function seedExecutionSummary(store: MarketStateStore) {
  const now = new Date().toISOString();
  const offer: Offer = {
    offerId: "offer-execution",
    sellerId: "0x00000000000000000000000000000000000000a1",
    assetId: "asset-execution",
    assetType: "service",
    assetMeta: {},
    price: 25,
    currency: "USDC",
    usageScope: { purpose: "security-review" },
    deliveryType: "service",
    status: "offer_published",
    offerHash: "offer-hash-execution",
    createdAt: now,
    updatedAt: now,
  };
  const order: Order = {
    orderId: "order-execution",
    offerId: offer.offerId,
    buyerId: "0x00000000000000000000000000000000000000b2",
    quantity: 1,
    status: "delivery_completed",
    orderHash: "order-hash-execution",
    createdAt: now,
    updatedAt: now,
  };
  const settlement: Settlement = {
    settlementId: "settlement-execution",
    orderId: order.orderId,
    status: "settlement_locked",
    amount: "25",
    releasedAmount: "0",
    strategy: "one-shot",
    lockedAt: now,
  };
  const proof: ServiceProof = {
    proofId: "proof-execution",
    orderId: order.orderId,
    actorId: offer.sellerId,
    proof: {
      type: "tlsnotary",
      artifactHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      issuedAt: now,
      verifier: "notary-v1",
    },
    proofHash: "proof-hash-execution",
    submittedAt: now,
    status: "proof_submitted",
  };
  const auditEvent: AuditEvent = {
    id: "audit-execution-1",
    kind: "service_proof_submitted",
    refId: proof.proofId,
    timestamp: now,
    actor: offer.sellerId,
    details: { orderId: order.orderId, proofId: proof.proofId },
  };

  store.saveOffer(offer);
  store.saveOrder(order);
  store.saveSettlement(settlement);
  store.saveServiceProof(proof);
  store.appendAuditEvent(auditEvent);
}

describe("execution handler", () => {
  let tempDir: string;
  let store: MarketStateStore;
  let config: ReturnType<typeof resolveConfig>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "execution-handler-test-"));
    config = resolveConfig({ access: { mode: "open" } });
    store = new MarketStateStore(tempDir, config);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("aggregates proof, acceptance, settlement, and trace into one execution summary", () => {
    seedExecutionSummary(store);
    const handler = createExecutionGetHandler(store, config);
    const r = createResponder();

    handler({
      params: { orderId: "order-execution", limit: 10 },
      respond: r.respond,
    } as never);

    expect(r.result()?.ok).toBe(true);
    expect(r.result()?.payload.executionStatus).toBe("awaiting_acceptance");
    expect((r.result()?.payload.acceptance as { status: string }).status).toBe(
      "acceptance_pending",
    );
    expect((r.result()?.payload.trace as unknown[]).length).toBeGreaterThan(0);
  });
});
