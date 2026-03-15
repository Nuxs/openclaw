import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import {
  createWeb3MarketBuyTool,
  createWeb3MarketCompareTool,
  createWeb3MarketLeaseTool,
  createWeb3MarketOrderCreateTool,
  createWeb3MarketPublishTool,
  createWeb3MarketQuoteTool,
  createWeb3MarketRevokeLeaseTool,
  createWeb3MarketUnpublishTool,
} from "./market-tools.js";

const callGatewayMock = vi.fn();

vi.mock("../core-imports.js", () => ({
  loadCallGateway: async () => callGatewayMock,
  normalizeGatewayResult: (payload: unknown) => {
    if (payload && typeof payload === "object") {
      const r = payload as { ok?: boolean; error?: string; result?: unknown };
      if (r.ok === false) return { ok: false, error: r.error ?? "gateway call failed" };
      return { ok: true, result: "result" in r ? r.result : payload };
    }
    return { ok: true, result: payload };
  },
}));

function makeConfig(overrides: Record<string, unknown> = {}) {
  return resolveConfig({
    resources: {
      enabled: true,
      advertiseToMarket: true,
      consumer: { enabled: true },
      ...overrides,
    },
  });
}

describe("web3 market tools", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    callGatewayMock.mockResolvedValue({ ok: true, result: { ok: true } });
  });

  it("passes actorId and resource through publish tool", async () => {
    const tool = createWeb3MarketPublishTool(makeConfig())!;

    await tool.execute("tc-1", {
      actorId: "0xabc",
      resource: { kind: "storage", label: "Fast storage" },
    });

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.resources.publish",
        params: {
          actorId: "0xabc",
          resource: { kind: "storage", label: "Fast storage" },
        },
      }),
    );
  });

  it("rejects publish without actorId", async () => {
    const tool = createWeb3MarketPublishTool(makeConfig())!;

    const result = (await tool.execute("tc-1", {
      actorId: "",
      resource: { kind: "storage" },
    })) as { content: Array<{ text: string }> };

    const parsed = JSON.parse(result.content[0].text) as {
      error: string;
      details?: { fields?: string[] };
    };
    expect(parsed.error).toBe("E_INVALID_ARGUMENT");
    expect(parsed.details?.fields).toEqual(["actorId", "resource"]);
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("passes quote and compare through new buyer tools", async () => {
    const quoteTool = createWeb3MarketQuoteTool(makeConfig())!;
    const compareTool = createWeb3MarketCompareTool(makeConfig())!;

    await quoteTool.execute("tc-1", { resourceId: "res_1", quantity: 2, ttlMs: 60_000 });
    await compareTool.execute("tc-2", { kind: "service", query: "review", limit: 3 });

    expect(callGatewayMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "web3.market.offer.quote",
        params: { resourceId: "res_1", quantity: 2, ttlMs: 60000 },
      }),
    );
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "web3.market.offer.compare",
        params: expect.objectContaining({ kind: "service", query: "review", limit: 3 }),
      }),
    );
  });

  it("passes required lease fields through lease tool", async () => {
    const tool = createWeb3MarketLeaseTool(makeConfig())!;

    await tool.execute("tc-1", {
      resourceId: "res_1",
      actorId: "0xprovider",
      consumerActorId: "0xconsumer",
      ttlMs: 60_000,
      maxCost: "0.5",
      sessionKey: "sess_1",
    });

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.resources.lease",
        params: expect.objectContaining({
          resourceId: "res_1",
          actorId: "0xprovider",
          consumerActorId: "0xconsumer",
          ttlMs: 60_000,
          maxCost: "0.5",
          sessionKey: "sess_1",
        }),
      }),
    );
  });

  it("creates an order from a resolved resource offer", async () => {
    callGatewayMock
      .mockResolvedValueOnce({ ok: true, result: { resource: { offerId: "offer_1" } } })
      .mockResolvedValueOnce({ ok: true, result: { orderId: "order_1" } });

    const tool = createWeb3MarketOrderCreateTool(makeConfig())!;
    await tool.execute("tc-3", {
      actorId: "0xbuyer",
      buyerId: "0xbuyer",
      resourceId: "res_1",
      quantity: 2,
    });

    expect(callGatewayMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "web3.market.resource.get",
        params: { resourceId: "res_1" },
      }),
    );
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "web3.market.order.create",
        params: { actorId: "0xbuyer", buyerId: "0xbuyer", offerId: "offer_1", quantity: 2 },
      }),
    );
  });

  it("runs autopay before leasing in buy tool", async () => {
    callGatewayMock
      .mockResolvedValueOnce({
        ok: true,
        result: {
          quote: {
            providerActorId: "0xprovider",
            price: { amount: "2" },
          },
        },
      })
      .mockResolvedValueOnce({ ok: true, result: { txHash: "0xtx" } })
      .mockResolvedValueOnce({ ok: true, result: { leaseId: "lease_1" } });

    const tool = createWeb3MarketBuyTool(makeConfig())!;
    await tool.execute("tc-4", {
      resourceId: "res_1",
      actorId: "0xbuyer",
      consumerActorId: "0xbuyer",
      ttlMs: 60000,
      autoPay: true,
      sessionKey: "sess_buy",
    });

    expect(callGatewayMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "web3.market.offer.quote",
        params: { resourceId: "res_1", quantity: 1, ttlMs: 60000 },
      }),
    );
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "web3.wallet.autopay",
        params: expect.objectContaining({
          chain: "evm",
          to: "0xprovider",
          amount: "2",
          value: "2",
        }),
      }),
    );
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: "web3.market.lease.issue",
        params: expect.objectContaining({
          resourceId: "res_1",
          actorId: "0xbuyer",
          consumerActorId: "0xbuyer",
          ttlMs: 60000,
          sessionKey: "sess_buy",
        }),
      }),
    );
  });

  it("passes actorId through unpublish tool", async () => {
    const tool = createWeb3MarketUnpublishTool(makeConfig())!;

    await tool.execute("tc-1", {
      actorId: "0xabc",
      resourceId: "res_1",
    });

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.resources.unpublish",
        params: { actorId: "0xabc", resourceId: "res_1" },
      }),
    );
  });

  it("passes actorId through revoke lease tool", async () => {
    const tool = createWeb3MarketRevokeLeaseTool(makeConfig())!;

    await tool.execute("tc-1", {
      actorId: "0xabc",
      leaseId: "lease_1",
      reason: "cleanup",
    });

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.resources.revokeLease",
        params: { actorId: "0xabc", leaseId: "lease_1", reason: "cleanup" },
      }),
    );
  });
});
