import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { MarketStateStore } from "../state/store.js";
import {
  createConsentGrantHandler,
  createDeliveryCompleteHandler,
  createDeliveryIssueHandler,
  createDisputeEvidenceHandler,
  createDisputeOpenHandler,
  createDisputeResolveHandler,
  createLedgerAppendHandler,
  createLeaseIssueHandler,
  createMarketMetricsSnapshotHandler,
  createOrderCreateHandler,
  createResourcePublishHandler,
  createSettlementLockHandler,
} from "./handlers.js";

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

describe("market-core e2e flow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-market-e2e-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it("runs order, dispute, lease, and metrics flow for file/sqlite", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const resourcePublishHandler = createResourcePublishHandler(store, config);
      const orderCreateHandler = createOrderCreateHandler(store, config);
      const settlementLockHandler = createSettlementLockHandler(store, config);
      const consentGrantHandler = createConsentGrantHandler(store, config);
      const deliveryIssueHandler = createDeliveryIssueHandler(store, config);
      const deliveryCompleteHandler = createDeliveryCompleteHandler(store, config);
      const disputeOpenHandler = createDisputeOpenHandler(store, config);
      const disputeEvidenceHandler = createDisputeEvidenceHandler(store, config);
      const disputeResolveHandler = createDisputeResolveHandler(store, config);
      const leaseIssueHandler = createLeaseIssueHandler(store, config);
      const ledgerAppendHandler = createLedgerAppendHandler(store, config);
      const metricsHandler = createMarketMetricsSnapshotHandler(store, config);

      const providerActorId = "0x00000000000000000000000000000000000000a1";
      const buyerActorId = "0x00000000000000000000000000000000000000b1";

      const publish = createResponder();
      await resourcePublishHandler({
        params: {
          actorId: providerActorId,
          resource: {
            kind: "model",
            label: "Atlas LLM",
            description: "High-fidelity summarization model",
            tags: ["llm", "summarization"],
            price: { unit: "token", amount: "10", currency: "USD" },
            offer: {
              assetId: "atlas-llm",
              assetType: "api",
              currency: "USD",
              usageScope: { purpose: "research" },
              deliveryType: "api",
            },
          },
        },
        respond: publish.respond,
      } as any);

      expect(publish.result()?.ok).toBe(true);
      const resourceId = publish.result()?.payload.resourceId as string;
      const offerId = publish.result()?.payload.offerId as string;

      const orderCreate = createResponder();
      await orderCreateHandler({
        params: {
          actorId: buyerActorId,
          buyerId: buyerActorId,
          offerId,
          quantity: 1,
        },
        respond: orderCreate.respond,
      } as any);

      expect(orderCreate.result()?.ok).toBe(true);
      const orderId = orderCreate.result()?.payload.orderId as string;

      const lock = createResponder();
      await settlementLockHandler({
        params: {
          actorId: buyerActorId,
          orderId,
          amount: "100",
          payer: buyerActorId,
        },
        respond: lock.respond,
      } as any);
      expect(lock.result()?.ok).toBe(true);

      const consent = createResponder();
      await consentGrantHandler({
        params: {
          actorId: buyerActorId,
          orderId,
          signature: "0xabc",
          consentScope: { purpose: "research" },
        },
        respond: consent.respond,
      } as any);
      expect(consent.result()?.ok).toBe(true);

      const issue = createResponder();
      await deliveryIssueHandler({
        params: {
          actorId: providerActorId,
          orderId,
          payload: { accessToken: "tok-market" },
        },
        respond: issue.respond,
      } as any);
      expect(issue.result()?.ok).toBe(true);
      const deliveryId = issue.result()?.payload.deliveryId as string;

      const complete = createResponder();
      await deliveryCompleteHandler({
        params: { actorId: providerActorId, deliveryId },
        respond: complete.respond,
      } as any);
      expect(complete.result()?.ok).toBe(true);

      const disputeOpen = createResponder();
      await disputeOpenHandler({
        params: {
          actorId: buyerActorId,
          orderId,
          reason: "Output failed quality checks",
        },
        respond: disputeOpen.respond,
      } as any);
      expect(disputeOpen.result()?.ok).toBe(true);
      const disputeId = disputeOpen.result()?.payload.disputeId as string;

      const evidence = createResponder();
      await disputeEvidenceHandler({
        params: {
          actorId: buyerActorId,
          disputeId,
          evidence: {
            summary: "Latency spikes above SLA, outputs incomplete",
          },
        },
        respond: evidence.respond,
      } as any);
      expect(evidence.result()?.ok).toBe(true);

      const resolve = createResponder();
      await disputeResolveHandler({
        params: {
          actorId: providerActorId,
          disputeId,
          resolution: "release",
          payees: [{ address: providerActorId, amount: "100" }],
        },
        respond: resolve.respond,
      } as any);
      expect(resolve.result()?.ok).toBe(true);

      expect(store.getOrder(orderId)?.status).toBe("settlement_completed");
      expect(store.getSettlementByOrder(orderId)?.status).toBe("settlement_released");

      const leaseIssue = createResponder();
      await leaseIssueHandler({
        params: {
          actorId: buyerActorId,
          resourceId,
          consumerActorId: buyerActorId,
          ttlMs: 60_000,
        },
        respond: leaseIssue.respond,
      } as any);
      expect(leaseIssue.result()?.ok).toBe(true);
      const leaseId = leaseIssue.result()?.payload.leaseId as string;

      const ledgerAppend = createResponder();
      await ledgerAppendHandler({
        params: {
          actorId: providerActorId,
          entry: {
            leaseId,
            resourceId,
            kind: "model",
            providerActorId,
            consumerActorId: buyerActorId,
            unit: "token",
            quantity: "42",
            cost: "420",
            currency: "USD",
          },
        },
        respond: ledgerAppend.respond,
      } as any);
      expect(ledgerAppend.result()?.ok).toBe(true);

      const metrics = createResponder();
      await metricsHandler({ respond: metrics.respond } as any);
      expect(metrics.result()?.ok).toBe(true);
      const payload = metrics.result()?.payload as {
        disputes?: { total?: number };
        leases?: { total?: number };
        settlements?: { total?: number };
      };
      expect(payload.disputes?.total ?? 0).toBeGreaterThan(0);
      expect(payload.leases?.total ?? 0).toBeGreaterThan(0);
      expect(payload.settlements?.total ?? 0).toBeGreaterThan(0);
    });
  });
});
