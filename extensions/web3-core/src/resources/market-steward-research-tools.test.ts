import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { createWeb3MarketStewardResearchTool } from "./market-steward-research-tools.js";

const { callGatewayMethodMock, resolveMarketStewardContextMock, rememberMarketStewardContextMock } =
  vi.hoisted(() => ({
    callGatewayMethodMock: vi.fn(),
    resolveMarketStewardContextMock: vi.fn(),
    rememberMarketStewardContextMock: vi.fn(),
  }));

vi.mock("./market-tools-shared.js", () => ({
  callGatewayMethod: callGatewayMethodMock,
  safeResult: (payload: unknown) => ({
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  }),
  errorResult: (error: unknown, details?: Record<string, unknown>) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: String(error), details }, null, 2),
      },
    ],
    details: { error, details },
  }),
}));

vi.mock("./market-steward-context.js", () => ({
  resolveMarketStewardContext: resolveMarketStewardContextMock,
  rememberMarketStewardContext: rememberMarketStewardContextMock,
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

describe("web3 market steward research tool", () => {
  beforeEach(() => {
    callGatewayMethodMock.mockReset();
    resolveMarketStewardContextMock.mockReset();
    rememberMarketStewardContextMock.mockReset();
    resolveMarketStewardContextMock.mockResolvedValue({
      sessionKey: "sess-1",
      actorId: "0xbuyer",
      consumerActorId: "0xbuyer",
      budgetPolicy: {
        currency: "USDC",
        maxAmount: "10",
      },
      riskPolicy: {
        maxRiskLevel: "medium",
        requireProof: false,
        requireProviderActor: true,
      },
      approval: undefined,
      usedStoredIdentity: true,
      usedStoredBudgetPolicy: true,
      usedStoredRiskPolicy: true,
      usedStoredApproval: false,
      usedDefaultBudgetPolicy: false,
      usedDefaultRiskPolicy: false,
    });
  });

  it("returns no-spend research findings and persists the next research backlog", async () => {
    callGatewayMethodMock.mockResolvedValueOnce({
      ok: true,
      result: {
        candidates: [
          {
            score: 9,
            quote: {
              resourceId: "res-primary",
              offerId: "offer-1",
              providerActorId: "0xprovider-a",
              label: "Proof-first review",
              kind: "service",
              price: { amount: "6", currency: "USDC" },
              estimatedTotal: "6",
              proofRequired: true,
              proofTypes: ["tlsnotary"],
            },
          },
          {
            score: 7,
            quote: {
              resourceId: "res-cheap",
              offerId: "offer-2",
              providerActorId: "0xprovider-b",
              label: "Cheaper route",
              kind: "service",
              price: { amount: "4", currency: "USDC" },
              estimatedTotal: "4",
              proofRequired: false,
              proofTypes: [],
            },
          },
        ],
      },
    });

    const tool = createWeb3MarketStewardResearchTool(makeConfig())!;
    const result = (await tool.execute("tc-1", {
      query: "secure code review",
      ttlMs: 60_000,
      sessionKey: "sess-1",
    })) as { content: Array<{ text: string }> };

    const payload = JSON.parse(result.content[0].text) as {
      status: string;
      candidatesConsidered: number;
      policyRecommendations: string[];
      nextResearchBacklog: string[];
      alternatives: Array<{ resourceId: string }>;
    };
    expect(payload.status).toBe("research_updated");
    expect(payload.candidatesConsidered).toBe(2);
    expect(payload.policyRecommendations[0]).toContain("Require proof");
    expect(payload.alternatives[0]?.resourceId).toBe("res-cheap");
    expect(payload.nextResearchBacklog[0]).toContain("proof-backed");
    expect(callGatewayMethodMock).toHaveBeenCalledTimes(1);
    expect(rememberMarketStewardContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "sess-1",
        status: "research_updated",
        resourceId: "res-primary",
        researchBacklog: expect.arrayContaining([expect.stringContaining("proof-backed")]),
        lastResearchedAt: expect.any(String),
      }),
    );
  });

  it("surfaces compare failures without attempting any spend path", async () => {
    callGatewayMethodMock.mockResolvedValueOnce({
      ok: false,
      error: "compare failed",
    });

    const tool = createWeb3MarketStewardResearchTool(makeConfig())!;
    const result = (await tool.execute("tc-2", {
      query: "secure code review",
      ttlMs: 60_000,
      sessionKey: "sess-1",
    })) as { content: Array<{ text: string }> };

    const payload = JSON.parse(result.content[0].text) as {
      error: string;
      details?: { method?: string };
    };
    expect(payload.error).toContain("compare failed");
    expect(payload.details?.method).toBe("web3.market.offer.compare");
    expect(callGatewayMethodMock).toHaveBeenCalledTimes(1);
    expect(rememberMarketStewardContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "sess-1",
        status: "compare_failed",
      }),
    );
  });
});
