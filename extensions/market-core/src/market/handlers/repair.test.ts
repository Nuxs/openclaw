import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig, type MarketPluginConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import type { MarketLease, MarketResource } from "../resources.js";
import type { Delivery, Order } from "../types.js";
import { createMarketRepairRetryHandler } from "./repair.js";

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

function createClient(scopes = ["operator.write"]) {
  return {
    connect: { client: { id: "gateway-client" }, role: "operator", scopes },
  };
}

let tempDir: string;
let store: MarketStateStore;
let config: MarketPluginConfig;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "repair-test-"));
  config = resolveConfig({ access: { mode: "open" } });
  store = new MarketStateStore(tempDir, config);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

function seedResource(): string {
  const now = new Date().toISOString();
  const resource: MarketResource = {
    resourceId: "res-1",
    kind: "model",
    providerActorId: "provider-1",
    offerId: "offer-res-1",
    label: "Test Model",
    version: 1,
    status: "resource_published",
    price: { unit: "token", amount: "0.01", currency: "USD" },
    policy: {},
    createdAt: now,
    updatedAt: now,
  };
  store.saveResource(resource);
  return resource.resourceId;
}

function seedOrder(): Order {
  const now = new Date().toISOString();
  const order: Order = {
    orderId: "order-r1",
    offerId: "offer-r1",
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

function seedExpiredLease(): MarketLease {
  const resourceId = seedResource();
  const order = seedOrder();
  const past = new Date(Date.now() - 60_000).toISOString();
  const lease: MarketLease = {
    leaseId: "lease-expired-1",
    resourceId,
    kind: "model",
    providerActorId: "provider-1",
    consumerActorId: "consumer-1",
    orderId: order.orderId,
    accessTokenHash: "sha256:abc",
    status: "lease_active",
    issuedAt: new Date(Date.now() - 120_000).toISOString(),
    expiresAt: past,
  };
  store.saveLease(lease);
  return lease;
}

describe("market.repair.retry", () => {
  it("reports zero candidates on clean store", () => {
    const handler = createMarketRepairRetryHandler(store, config);
    const r = createResponder();
    handler({
      params: {},
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.processed).toBe(0);
    expect(payload.succeeded).toBe(0);
    expect(payload.failed).toBe(0);
  });

  it("repairs expired leases", () => {
    seedExpiredLease();
    const handler = createMarketRepairRetryHandler(store, config);
    const r = createResponder();
    handler({
      params: {},
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.processed).toBe(1);
    expect(payload.succeeded).toBe(1);

    // Verify the lease was expired
    const lease = store.getLease("lease-expired-1");
    expect(lease?.status).toBe("lease_expired");
  });

  it("dry run does not mutate state", () => {
    seedExpiredLease();
    const handler = createMarketRepairRetryHandler(store, config);
    const r = createResponder();
    handler({
      params: { dryRun: true },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.processed).toBe(1);

    // Lease should still be active
    const lease = store.getLease("lease-expired-1");
    expect(lease?.status).toBe("lease_active");
  });

  it("respects limit parameter", () => {
    seedExpiredLease();
    const handler = createMarketRepairRetryHandler(store, config);
    const r = createResponder();
    handler({
      params: { limit: 0 },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.processed).toBe(0);
  });
});
