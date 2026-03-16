import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import {
  createWeb3MarketOfferCloseTool,
  createWeb3MarketOfferCreateTool,
  createWeb3MarketOfferPublishTool,
  createWeb3MarketOfferUpdateTool,
} from "./market-provider-tools.js";

const callGatewayMock = vi.fn();

vi.mock("../core-imports.js", () => ({
  loadCallGateway: async () => callGatewayMock,
  normalizeGatewayResult: (payload: unknown) => {
    if (payload && typeof payload === "object") {
      const result = payload as { ok?: boolean; error?: string; result?: unknown };
      if (result.ok === false) {
        return { ok: false, error: result.error ?? "gateway call failed" };
      }
      return { ok: true, result: "result" in result ? result.result : payload };
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

describe("web3 market provider tools", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    callGatewayMock.mockResolvedValue({ ok: true, result: { ok: true } });
  });

  it("creates offer drafts with the expected provider fields", async () => {
    const tool = createWeb3MarketOfferCreateTool(makeConfig())!;

    await tool.execute("tc-1", {
      actorId: "provider-1",
      assetId: "runtime-ollama",
      assetType: "service",
      price: 3,
      currency: "USDC",
      usageScope: "session",
      deliveryType: "api",
      assetMeta: { model: "llama3.1" },
    });

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.market.offer.create",
        params: {
          actorId: "provider-1",
          assetId: "runtime-ollama",
          assetType: "service",
          price: 3,
          currency: "USDC",
          usageScope: "session",
          deliveryType: "api",
          assetMeta: { model: "llama3.1" },
        },
      }),
    );
  });

  it("rejects offer updates that provide no mutable fields", async () => {
    const tool = createWeb3MarketOfferUpdateTool(makeConfig())!;

    const result = (await tool.execute("tc-2", {
      actorId: "provider-1",
      offerId: "offer-1",
    })) as { content: Array<{ text: string }> };

    const parsed = JSON.parse(result.content[0].text) as {
      error: string;
      details?: { fields?: string[] };
    };
    expect(parsed.error).toBe("E_INVALID_ARGUMENT");
    expect(parsed.details?.fields).toEqual(["price", "usageScope", "deliveryType", "assetMeta"]);
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("publishes offers with a stable next action for resource publish", async () => {
    const tool = createWeb3MarketOfferPublishTool(makeConfig())!;

    const result = (await tool.execute("tc-3", {
      actorId: "provider-1",
      offerId: "offer-1",
    })) as { content: Array<{ text: string }> };

    const parsed = JSON.parse(result.content[0].text) as {
      onboardingStage: string;
      nextAction: string;
    };
    expect(parsed.onboardingStage).toBe("offer_published");
    expect(parsed.nextAction).toContain("Publish or refresh the resource listing");
    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.market.offer.publish",
        params: { actorId: "provider-1", offerId: "offer-1" },
      }),
    );
  });

  it("closes offers through the dedicated lifecycle tool", async () => {
    const tool = createWeb3MarketOfferCloseTool(makeConfig())!;

    await tool.execute("tc-4", {
      actorId: "provider-1",
      offerId: "offer-1",
    });

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.market.offer.close",
        params: { actorId: "provider-1", offerId: "offer-1" },
      }),
    );
  });
});
