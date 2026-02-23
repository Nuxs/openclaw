import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig, type MarketPluginConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import type { Order, Settlement } from "../types.js";
import {
  createBridgeListHandler,
  createBridgeRequestHandler,
  createBridgeRoutesHandler,
  createBridgeStatusHandler,
  createBridgeUpdateHandler,
} from "./bridge.js";

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

function seedOrder(store: MarketStateStore): Order {
  const now = new Date().toISOString();
  const order: Order = {
    orderId: "order-1",
    offerId: "offer-1",
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

function seedSettlement(store: MarketStateStore): Settlement {
  const settlement: Settlement = {
    settlementId: "settle-1",
    orderId: "order-1",
    status: "settlement_locked",
    amount: "100",
    lockedAt: new Date().toISOString(),
  };
  store.saveSettlement(settlement);
  return settlement;
}

let tempDir: string;
let store: MarketStateStore;
let config: MarketPluginConfig;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bridge-test-"));
  config = resolveConfig({ access: { mode: "open" } });
  store = new MarketStateStore(tempDir, config);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("bridge.routes", () => {
  it("returns default routes and assets", () => {
    const handler = createBridgeRoutesHandler(store, config);
    const r = createResponder();
    handler({ params: {}, respond: r.respond, client: createClient(["operator.read"]) } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.routes.length).toBeGreaterThan(0);
    expect(payload.assets.length).toBeGreaterThan(0);
  });

  it("filters routes by fromChain", () => {
    const handler = createBridgeRoutesHandler(store, config);
    const r = createResponder();
    handler({
      params: { fromChain: "ton" },
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);
    const payload = r.result()!.payload as any;
    expect(payload.routes.every((route: any) => route.fromChain === "ton")).toBe(true);
  });

  it("rejects invalid fromChain", () => {
    const handler = createBridgeRoutesHandler(store, config);
    const r = createResponder();
    handler({
      params: { fromChain: "invalid" },
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });
});

describe("bridge.request", () => {
  it("creates a bridge transfer", () => {
    seedOrder(store);
    const handler = createBridgeRequestHandler(store, config);
    const r = createResponder();
    handler({
      params: {
        fromChain: "ton",
        toChain: "evm",
        assetSymbol: "USDC",
        amount: "100",
        orderId: "order-1",
      },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const transfer = r.result()!.payload as any;
    expect(transfer.status).toBe("bridge_requested");
    expect(transfer.fromChain).toBe("ton");
    expect(transfer.toChain).toBe("evm");
  });

  it("fails without orderId or settlementId", () => {
    const handler = createBridgeRequestHandler(store, config);
    const r = createResponder();
    handler({
      params: { fromChain: "ton", toChain: "evm", assetSymbol: "USDC", amount: "100" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });

  it("fails with unknown route", () => {
    seedOrder(store);
    const handler = createBridgeRequestHandler(store, config);
    const r = createResponder();
    handler({
      params: {
        fromChain: "ton",
        toChain: "evm",
        assetSymbol: "UNKNOWN",
        amount: "100",
        orderId: "order-1",
      },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });
});

describe("bridge.update", () => {
  function seedTransfer() {
    seedOrder(store);
    const handler = createBridgeRequestHandler(store, config);
    const r = createResponder();
    handler({
      params: {
        fromChain: "ton",
        toChain: "evm",
        assetSymbol: "USDC",
        amount: "50",
        orderId: "order-1",
      },
      respond: r.respond,
      client: createClient(),
    } as any);
    return r.result()!.payload as any;
  }

  it("transitions to bridge_in_flight", () => {
    const transfer = seedTransfer();
    const handler = createBridgeUpdateHandler(store, config);
    const r = createResponder();
    handler({
      params: { bridgeId: transfer.bridgeId, status: "bridge_in_flight" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(true);
    expect((r.result()!.payload as any).status).toBe("bridge_in_flight");
  });

  it("rejects invalid transition", () => {
    const transfer = seedTransfer();
    const handler = createBridgeUpdateHandler(store, config);
    const r = createResponder();
    handler({
      params: { bridgeId: transfer.bridgeId, status: "bridge_completed" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });

  it("fails for non-existent bridgeId", () => {
    const handler = createBridgeUpdateHandler(store, config);
    const r = createResponder();
    handler({
      params: { bridgeId: "nonexistent", status: "bridge_in_flight" },
      respond: r.respond,
      client: createClient(),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });
});

describe("bridge.status", () => {
  it("retrieves transfer by bridgeId", () => {
    seedOrder(store);
    const reqHandler = createBridgeRequestHandler(store, config);
    const rr = createResponder();
    reqHandler({
      params: {
        fromChain: "ton",
        toChain: "evm",
        assetSymbol: "USDC",
        amount: "10",
        orderId: "order-1",
      },
      respond: rr.respond,
      client: createClient(),
    } as any);
    const bridgeId = (rr.result()!.payload as any).bridgeId;

    const handler = createBridgeStatusHandler(store, config);
    const r = createResponder();
    handler({
      params: { bridgeId },
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);
    expect(r.result()!.ok).toBe(true);
    expect((r.result()!.payload as any).bridgeId).toBe(bridgeId);
  });

  it("fails for unknown bridgeId", () => {
    const handler = createBridgeStatusHandler(store, config);
    const r = createResponder();
    handler({
      params: { bridgeId: "nonexistent" },
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);
    expect(r.result()!.ok).toBe(false);
  });
});

describe("bridge.list", () => {
  it("lists all bridge transfers", () => {
    seedOrder(store);
    const reqHandler = createBridgeRequestHandler(store, config);
    const rr = createResponder();
    reqHandler({
      params: {
        fromChain: "ton",
        toChain: "evm",
        assetSymbol: "USDC",
        amount: "10",
        orderId: "order-1",
      },
      respond: rr.respond,
      client: createClient(),
    } as any);

    const handler = createBridgeListHandler(store, config);
    const r = createResponder();
    handler({
      params: {},
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);
    expect(r.result()!.ok).toBe(true);
    expect(Array.isArray(r.result()!.payload)).toBe(true);
  });

  it("filters by status", () => {
    seedOrder(store);
    const reqHandler = createBridgeRequestHandler(store, config);
    const rr = createResponder();
    reqHandler({
      params: {
        fromChain: "ton",
        toChain: "evm",
        assetSymbol: "USDC",
        amount: "10",
        orderId: "order-1",
      },
      respond: rr.respond,
      client: createClient(),
    } as any);

    const handler = createBridgeListHandler(store, config);
    const r = createResponder();
    handler({
      params: { status: "bridge_completed" },
      respond: r.respond,
      client: createClient(["operator.read"]),
    } as any);
    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as unknown;
    if (!Array.isArray(payload)) throw new Error("expected payload to be array");
    expect(payload.length).toBe(0);
  });
});
