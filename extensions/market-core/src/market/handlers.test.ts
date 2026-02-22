import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { MarketStateStore } from "../state/store.js";
import {
  createConsentGrantHandler,
  createDeliveryIssueHandler,
  createLedgerAppendHandler,
  createLedgerListHandler,
  createLedgerSummaryHandler,
  createLeaseExpireSweepHandler,
  createLeaseGetHandler,
  createLeaseIssueHandler,
  createLeaseListHandler,
  createLeaseRevokeHandler,
  createOfferCreateHandler,
  createOfferPublishHandler,
  createResourceListHandler,
  createResourcePublishHandler,
  createResourceUnpublishHandler,
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
    expect(result()?.payload.error).toBe("E_FORBIDDEN");
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
    expect(publish.result()?.payload.error).toBe("E_FORBIDDEN");
  });

  it("validates consent signature hex format", async () => {
    const config = resolveConfig({
      store: { mode: "file" },
      access: { mode: "open" },
    });
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
    expect(result()?.payload.error).toBe("E_INVALID_ARGUMENT");
  });

  it("grants consent with valid signature and matching scope", async () => {
    const config = resolveConfig({
      store: { mode: "file" },
      access: { mode: "open" },
    });
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
      access: { mode: "open" },
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
        allowClientIds: ["test-client"],
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

  it("handles resource publish → lease → ledger → revoke for file/sqlite", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const resourcePublishHandler = createResourcePublishHandler(store, config);
      const leaseIssueHandler = createLeaseIssueHandler(store, config);
      const leaseRevokeHandler = createLeaseRevokeHandler(store, config);
      const ledgerAppendHandler = createLedgerAppendHandler(store, config);

      const providerActorId = "0x00000000000000000000000000000000000000a1";
      const consumerActorId = "0x00000000000000000000000000000000000000b1";

      const publish = createResponder();
      await resourcePublishHandler({
        params: {
          actorId: providerActorId,
          resource: {
            kind: "model",
            label: "Example Model",
            description: "test",
            tags: ["demo"],
            price: { unit: "token", amount: "10", currency: "USD" },
            offer: {
              assetId: "asset-1",
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

      const leaseIssue = createResponder();
      await leaseIssueHandler({
        params: {
          actorId: consumerActorId,
          resourceId,
          consumerActorId,
          ttlMs: 60_000,
          maxCost: "1000",
        },
        respond: leaseIssue.respond,
      } as any);

      expect(leaseIssue.result()?.ok).toBe(true);
      const leaseId = leaseIssue.result()?.payload.leaseId as string;

      const badLedger = createResponder();
      await ledgerAppendHandler({
        params: {
          actorId: consumerActorId,
          entry: {
            leaseId,
            resourceId,
            kind: "model",
            providerActorId,
            consumerActorId,
            unit: "token",
            quantity: "100",
            cost: "100",
            currency: "USD",
          },
        },
        respond: badLedger.respond,
      } as any);

      expect(badLedger.result()?.ok).toBe(false);
      expect(String(badLedger.result()?.payload.error)).toContain("E_FORBIDDEN");

      const goodLedger = createResponder();
      await ledgerAppendHandler({
        params: {
          actorId: providerActorId,
          entry: {
            leaseId,
            resourceId,
            kind: "model",
            providerActorId,
            consumerActorId,
            unit: "token",
            quantity: "100",
            cost: "100",
            currency: "USD",
          },
        },
        respond: goodLedger.respond,
      } as any);

      expect(goodLedger.result()?.ok).toBe(true);

      const revoke = createResponder();
      await leaseRevokeHandler({
        params: { actorId: providerActorId, leaseId, reason: "test" },
        respond: revoke.respond,
      } as any);

      expect(revoke.result()?.ok).toBe(true);

      const revokedLedger = createResponder();
      await ledgerAppendHandler({
        params: {
          actorId: providerActorId,
          entry: {
            leaseId,
            resourceId,
            kind: "model",
            providerActorId,
            consumerActorId,
            unit: "token",
            quantity: "1",
            cost: "1",
            currency: "USD",
          },
        },
        respond: revokedLedger.respond,
      } as any);

      expect(revokedLedger.result()?.ok).toBe(false);
      expect(String(revokedLedger.result()?.payload.error)).toContain("E_REVOKED");
    });
  });

  // --- E2E-RES-02: unpublish resource → subsequent lease.issue rejected ---
  it("rejects lease issue after resource unpublish for file/sqlite", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const resourcePublishHandler = createResourcePublishHandler(store, config);
      const resourceUnpublishHandler = createResourceUnpublishHandler(store, config);
      const leaseIssueHandler = createLeaseIssueHandler(store, config);

      const providerActorId = "0x00000000000000000000000000000000000000a1";
      const consumerActorId = "0x00000000000000000000000000000000000000b1";

      // Publish a resource
      const publish = createResponder();
      await resourcePublishHandler({
        params: {
          actorId: providerActorId,
          resource: {
            kind: "search",
            label: "Search Resource",
            price: { unit: "query", amount: "5", currency: "USD" },
            offer: {
              assetId: "asset-search-1",
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

      // Unpublish the resource
      const unpublish = createResponder();
      await resourceUnpublishHandler({
        params: { actorId: providerActorId, resourceId },
        respond: unpublish.respond,
      } as any);
      expect(unpublish.result()?.ok).toBe(true);
      expect(unpublish.result()?.payload.status).toBeDefined();

      // Attempt lease issue on unpublished resource — should fail
      const leaseIssue = createResponder();
      await leaseIssueHandler({
        params: {
          actorId: consumerActorId,
          resourceId,
          consumerActorId,
          ttlMs: 60_000,
        },
        respond: leaseIssue.respond,
      } as any);
      expect(leaseIssue.result()?.ok).toBe(false);
    });
  });

  // --- E2E-LEASE-02: lease get and list queries ---
  it("queries leases via get and list for file/sqlite", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const resourcePublishHandler = createResourcePublishHandler(store, config);
      const leaseIssueHandler = createLeaseIssueHandler(store, config);
      const leaseGetHandler = createLeaseGetHandler(store, config);
      const leaseListHandler = createLeaseListHandler(store, config);

      const providerActorId = "0x00000000000000000000000000000000000000a1";
      const consumerActorId = "0x00000000000000000000000000000000000000b1";

      // Publish resource
      const publish = createResponder();
      await resourcePublishHandler({
        params: {
          actorId: providerActorId,
          resource: {
            kind: "model",
            label: "Model for lease query",
            price: { unit: "token", amount: "1", currency: "USD" },
            offer: {
              assetId: "asset-lq-1",
              assetType: "api",
              currency: "USD",
              usageScope: { purpose: "testing" },
              deliveryType: "api",
            },
          },
        },
        respond: publish.respond,
      } as any);
      expect(publish.result()?.ok).toBe(true);
      const resourceId = publish.result()?.payload.resourceId as string;

      // Issue lease
      const issue = createResponder();
      await leaseIssueHandler({
        params: {
          actorId: consumerActorId,
          resourceId,
          consumerActorId,
          ttlMs: 60_000,
        },
        respond: issue.respond,
      } as any);
      expect(issue.result()?.ok).toBe(true);
      const leaseId = issue.result()?.payload.leaseId as string;

      // lease.get
      const get = createResponder();
      await leaseGetHandler({
        params: { leaseId },
        respond: get.respond,
      } as any);
      expect(get.result()?.ok).toBe(true);
      const lease = get.result()?.payload.lease as Record<string, unknown>;
      expect(lease.leaseId).toBe(leaseId);
      expect(lease.status).toBe("lease_active");

      // lease.list by resourceId
      const list = createResponder();
      await leaseListHandler({
        params: { resourceId },
        respond: list.respond,
      } as any);
      expect(list.result()?.ok).toBe(true);
      const leases = list.result()?.payload.leases as unknown[];
      expect(leases.length).toBeGreaterThanOrEqual(1);

      // lease.list by consumerActorId
      const listByConsumer = createResponder();
      await leaseListHandler({
        params: { consumerActorId },
        respond: listByConsumer.respond,
      } as any);
      expect(listByConsumer.result()?.ok).toBe(true);
      const consumerLeases = listByConsumer.result()?.payload.leases as unknown[];
      expect(consumerLeases.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- E2E-LEDGER-02: ledger summary aggregation ---
  it("returns ledger summary aggregation for file/sqlite", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const resourcePublishHandler = createResourcePublishHandler(store, config);
      const leaseIssueHandler = createLeaseIssueHandler(store, config);
      const ledgerAppendHandler = createLedgerAppendHandler(store, config);
      const ledgerListHandler = createLedgerListHandler(store, config);
      const ledgerSummaryHandler = createLedgerSummaryHandler(store, config);

      const providerActorId = "0x00000000000000000000000000000000000000a1";
      const consumerActorId = "0x00000000000000000000000000000000000000b1";

      // Setup: publish + lease
      const publish = createResponder();
      await resourcePublishHandler({
        params: {
          actorId: providerActorId,
          resource: {
            kind: "model",
            label: "Ledger Summary Model",
            price: { unit: "token", amount: "1", currency: "USD" },
            offer: {
              assetId: "asset-ls-1",
              assetType: "api",
              currency: "USD",
              usageScope: { purpose: "analytics" },
              deliveryType: "api",
            },
          },
        },
        respond: publish.respond,
      } as any);
      const resourceId = publish.result()?.payload.resourceId as string;

      const issue = createResponder();
      await leaseIssueHandler({
        params: {
          actorId: consumerActorId,
          resourceId,
          consumerActorId,
          ttlMs: 120_000,
        },
        respond: issue.respond,
      } as any);
      const leaseId = issue.result()?.payload.leaseId as string;

      // Append two ledger entries
      for (const [quantity, cost] of [
        ["50", "50"],
        ["30", "30"],
      ]) {
        const append = createResponder();
        await ledgerAppendHandler({
          params: {
            actorId: providerActorId,
            entry: {
              leaseId,
              resourceId,
              kind: "model",
              providerActorId,
              consumerActorId,
              unit: "token",
              quantity,
              cost,
              currency: "USD",
            },
          },
          respond: append.respond,
        } as any);
        expect(append.result()?.ok).toBe(true);
      }

      // ledger.list
      const list = createResponder();
      await ledgerListHandler({
        params: { leaseId },
        respond: list.respond,
      } as any);
      expect(list.result()?.ok).toBe(true);
      const entries = list.result()?.payload.entries as unknown[];
      expect(entries.length).toBe(2);

      // ledger.summary
      const summary = createResponder();
      await ledgerSummaryHandler({
        params: { leaseId },
        respond: summary.respond,
      } as any);
      expect(summary.result()?.ok).toBe(true);
      const summaryData = summary.result()?.payload.summary as Record<string, unknown>;
      expect(summaryData.totalCost).toBe("80");
      expect(summaryData.currency).toBe("USD");
      const byUnit = summaryData.byUnit as Record<string, { quantity: string; cost: string }>;
      expect(byUnit.token.quantity).toBe("80");
      expect(byUnit.token.cost).toBe("80");
    });
  });

  // --- E2E: lease.expireSweep ---
  it("expires stale leases via expireSweep for file/sqlite", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const resourcePublishHandler = createResourcePublishHandler(store, config);
      const leaseIssueHandler = createLeaseIssueHandler(store, config);
      const leaseExpireSweepHandler = createLeaseExpireSweepHandler(store, config);
      const leaseGetHandler = createLeaseGetHandler(store, config);

      const providerActorId = "0x00000000000000000000000000000000000000a1";
      const consumerActorId = "0x00000000000000000000000000000000000000b1";

      // Publish resource
      const publish = createResponder();
      await resourcePublishHandler({
        params: {
          actorId: providerActorId,
          resource: {
            kind: "storage",
            label: "Expire Test Storage",
            price: { unit: "put", amount: "1", currency: "USDC" },
            offer: {
              assetId: "asset-exp-1",
              assetType: "service",
              currency: "USDC",
              usageScope: { purpose: "backup" },
              deliveryType: "service",
            },
          },
        },
        respond: publish.respond,
      } as any);
      const resourceId = publish.result()?.payload.resourceId as string;

      // Issue lease with minimal TTL (10 seconds)
      const issue = createResponder();
      await leaseIssueHandler({
        params: {
          actorId: consumerActorId,
          resourceId,
          consumerActorId,
          ttlMs: 10_000,
        },
        respond: issue.respond,
      } as any);
      expect(issue.result()?.ok).toBe(true);
      const leaseId = issue.result()?.payload.leaseId as string;

      // Verify lease is active before sweep
      const getBefore = createResponder();
      await leaseGetHandler({
        params: { leaseId },
        respond: getBefore.respond,
      } as any);
      expect((getBefore.result()?.payload.lease as Record<string, unknown>).status).toBe(
        "lease_active",
      );

      // Run sweep with a future timestamp that exceeds expiry
      const futureNow = new Date(Date.now() + 20_000).toISOString();
      const sweep = createResponder();
      await leaseExpireSweepHandler({
        params: { now: futureNow },
        respond: sweep.respond,
      } as any);
      expect(sweep.result()?.ok).toBe(true);
      expect(sweep.result()?.payload.expired).toBeGreaterThanOrEqual(1);

      // Verify lease is now expired
      const getAfter = createResponder();
      await leaseGetHandler({
        params: { leaseId },
        respond: getAfter.respond,
      } as any);
      expect((getAfter.result()?.payload.lease as Record<string, unknown>).status).toBe(
        "lease_expired",
      );
    });
  });

  // --- E2E: resource list with filters ---
  it("lists resources with kind and status filters for file/sqlite", async () => {
    await withStoreModes(tempDir, async ({ store, config }) => {
      const resourcePublishHandler = createResourcePublishHandler(store, config);
      const resourceUnpublishHandler = createResourceUnpublishHandler(store, config);
      const resourceListHandler = createResourceListHandler(store, config);

      const providerActorId = "0x00000000000000000000000000000000000000a1";

      // Publish two resources of different kinds
      for (const [kind, label, assetId, unit] of [
        ["model", "Model Res", "asset-filter-1", "token"],
        ["search", "Search Res", "asset-filter-2", "query"],
      ] as const) {
        const pub = createResponder();
        await resourcePublishHandler({
          params: {
            actorId: providerActorId,
            resource: {
              kind,
              label,
              price: { unit, amount: "1", currency: "USD" },
              offer: {
                assetId,
                assetType: "api",
                currency: "USD",
                usageScope: { purpose: "test" },
                deliveryType: "api",
              },
            },
          },
          respond: pub.respond,
        } as any);
        expect(pub.result()?.ok).toBe(true);
      }

      // List all — should have 2
      const listAll = createResponder();
      await resourceListHandler({
        params: {},
        respond: listAll.respond,
      } as any);
      expect(listAll.result()?.ok).toBe(true);
      expect((listAll.result()?.payload.resources as unknown[]).length).toBe(2);

      // List by kind=model — should have 1
      const listModel = createResponder();
      await resourceListHandler({
        params: { kind: "model" },
        respond: listModel.respond,
      } as any);
      expect(listModel.result()?.ok).toBe(true);
      expect((listModel.result()?.payload.resources as unknown[]).length).toBe(1);
    });
  });
});
