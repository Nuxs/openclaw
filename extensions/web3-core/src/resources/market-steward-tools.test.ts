import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { createWeb3MarketStewardBuyTool } from "./market-steward-tools.js";

const { callGatewayMock, resolveMarketStewardContextMock, rememberMarketStewardContextMock } =
  vi.hoisted(() => ({
    callGatewayMock: vi.fn(),
    resolveMarketStewardContextMock: vi.fn(),
    rememberMarketStewardContextMock: vi.fn(),
  }));

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

describe("web3 market steward buy tool", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    resolveMarketStewardContextMock.mockReset();
    rememberMarketStewardContextMock.mockReset();
    resolveMarketStewardContextMock.mockImplementation(
      async (params: {
        sessionKey?: string;
        actorId?: string;
        consumerActorId?: string;
        budgetPolicy?: Record<string, unknown>;
        riskPolicy?: Record<string, unknown>;
        approval?: Record<string, unknown>;
      }) => ({
        sessionKey: params.sessionKey,
        actorId: params.actorId,
        consumerActorId: params.consumerActorId,
        budgetPolicy: params.budgetPolicy,
        riskPolicy: params.riskPolicy,
        approval: params.approval,
        usedStoredIdentity: false,
        usedStoredBudgetPolicy: false,
        usedStoredRiskPolicy: false,
        usedStoredApproval: false,
        usedDefaultBudgetPolicy: false,
        usedDefaultRiskPolicy: false,
      }),
    );
  });

  it("returns an approval-required plan without executing payment or lease", async () => {
    callGatewayMock.mockResolvedValueOnce({
      ok: true,
      result: {
        candidates: [
          {
            score: 9,
            quote: {
              resourceId: "res-1",
              offerId: "offer-1",
              providerActorId: "0xprovider",
              label: "Secure review",
              kind: "service",
              price: { amount: "6", currency: "USDC" },
              estimatedTotal: "6",
              proofRequired: true,
              proofTypes: ["tlsnotary"],
            },
          },
        ],
      },
    });

    const tool = createWeb3MarketStewardBuyTool(makeConfig())!;
    const result = (await tool.execute("tc-1", {
      actorId: "0xbuyer",
      consumerActorId: "0xbuyer",
      query: "security review",
      ttlMs: 60_000,
      budgetPolicy: {
        currency: "USDC",
        maxAmount: "10",
        requireApprovalAbove: "5",
      },
      riskPolicy: {
        maxRiskLevel: "high",
        requireProof: true,
        requireProviderActor: true,
      },
    })) as { content: Array<{ text: string }> };

    const payload = JSON.parse(result.content[0].text) as {
      status: string;
      executed: boolean;
      selectedCandidate?: { resourceId?: string };
    };
    expect(payload.status).toBe("approval_required");
    expect(payload.executed).toBe(false);
    expect(payload.selectedCandidate?.resourceId).toBe("res-1");
    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    expect(rememberMarketStewardContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "0xbuyer",
        consumerActorId: "0xbuyer",
        status: "approval_required",
        resourceId: "res-1",
      }),
    );
  });

  it("executes autopay and lease after policy approval", async () => {
    callGatewayMock
      .mockResolvedValueOnce({
        ok: true,
        result: {
          quote: {
            resourceId: "res-1",
            offerId: "offer-1",
            providerActorId: "0xprovider",
            label: "Secure review",
            kind: "service",
            price: { amount: "4", currency: "USDC" },
            estimatedTotal: "4",
            proofRequired: true,
            proofTypes: ["tlsnotary"],
          },
        },
      })
      .mockResolvedValueOnce({ ok: true, result: { txHash: "0xtx" } })
      .mockResolvedValueOnce({
        ok: true,
        result: { leaseId: "lease-1", orderId: "order-1", consentId: "consent-1" },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          orderId: "order-1",
          executionStatus: "lease_issued",
          consent: { consentId: "consent-1" },
          proof: { proofId: "proof-1" },
          settlement: { settlementId: "settlement-1" },
          dispute: { disputeId: "dispute-1" },
        },
      });

    const tool = createWeb3MarketStewardBuyTool(makeConfig())!;
    const result = (await tool.execute("tc-2", {
      actorId: "0xbuyer",
      consumerActorId: "0xbuyer",
      resourceId: "res-1",
      ttlMs: 60_000,
      autoPay: true,
      execute: true,
      sessionKey: "sess-1",
      budgetPolicy: {
        currency: "USDC",
        maxAmount: "10",
        requireApprovalAbove: "3",
      },
      riskPolicy: {
        maxRiskLevel: "high",
        requireProof: true,
        requireProviderActor: true,
      },
      approval: {
        approved: true,
        approvalId: "approve-1",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    })) as { content: Array<{ text: string }> };

    const payload = JSON.parse(result.content[0].text) as { status: string; executed: boolean };
    expect(payload.status).toBe("executed");
    expect(payload.executed).toBe(true);
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: "web3.market.offer.quote",
        params: { resourceId: "res-1", quantity: 1, ttlMs: 60000 },
      }),
    );
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "web3.wallet.autopay",
        params: expect.objectContaining({ tool: "web3.market.steward.buy", amount: "4" }),
      }),
    );
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: "web3.market.lease.issue",
        params: expect.objectContaining({
          resourceId: "res-1",
          actorId: "0xbuyer",
          sessionKey: "sess-1",
        }),
      }),
    );
    expect(callGatewayMock).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        method: "web3.market.execution.status",
        params: { leaseId: "lease-1" },
      }),
    );
    expect(rememberMarketStewardContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "sess-1",
        actorId: "0xbuyer",
        consumerActorId: "0xbuyer",
        status: "executed",
        orderId: "order-1",
        resourceId: "res-1",
        leaseId: "lease-1",
        consentId: "consent-1",
        proofId: "proof-1",
        disputeId: "dispute-1",
        settlementId: "settlement-1",
      }),
    );
  });

  it("reuses remembered steward identity and policy context when explicit fields are omitted", async () => {
    resolveMarketStewardContextMock.mockResolvedValueOnce({
      sessionKey: "sess-remembered",
      actorId: "0xremembered-buyer",
      consumerActorId: "0xremembered-buyer",
      budgetPolicy: {
        currency: "USDC",
        maxAmount: "20",
        requireApprovalAbove: "50",
      },
      riskPolicy: {
        maxRiskLevel: "high",
        requireProof: true,
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
    callGatewayMock.mockResolvedValueOnce({
      ok: true,
      result: {
        candidates: [
          {
            score: 9,
            quote: {
              resourceId: "res-remembered",
              offerId: "offer-remembered",
              providerActorId: "0xprovider",
              label: "Remembered provider",
              kind: "service",
              price: { amount: "4", currency: "USDC" },
              estimatedTotal: "4",
              proofRequired: true,
              proofTypes: ["tlsnotary"],
            },
          },
        ],
      },
    });

    const tool = createWeb3MarketStewardBuyTool(makeConfig())!;
    const result = (await tool.execute("tc-remembered", {
      query: "find the best remembered provider",
      ttlMs: 60_000,
      sessionKey: "sess-remembered",
    })) as { content: Array<{ text: string }> };

    const payload = JSON.parse(result.content[0].text) as {
      status: string;
      stewardContext?: { usedStoredIdentity?: boolean };
      selectedCandidate?: { resourceId?: string };
    };
    expect(payload.status).toBe("planned");
    expect(payload.selectedCandidate?.resourceId).toBe("res-remembered");
    expect(payload.stewardContext?.usedStoredIdentity).toBe(true);
    expect(resolveMarketStewardContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "sess-remembered",
        actorId: undefined,
        consumerActorId: undefined,
      }),
    );
    expect(rememberMarketStewardContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "sess-remembered",
        actorId: "0xremembered-buyer",
        consumerActorId: "0xremembered-buyer",
        status: "planned",
        resourceId: "res-remembered",
      }),
    );
  });

  it("redacts payment, execution, and lease internals before returning steward results", async () => {
    callGatewayMock
      .mockResolvedValueOnce({
        ok: true,
        result: {
          quote: {
            resourceId: "res-1",
            offerId: "offer-1",
            providerActorId: "0xprovider",
            label: "Secure review",
            kind: "service",
            price: { amount: "4", currency: "USDC" },
            estimatedTotal: "4",
            proofRequired: true,
            proofTypes: ["tlsnotary"],
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          txHash: "0xtx",
          providerEndpoint: "https://provider.example.com",
          accessToken: "tok_secret_123",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          leaseId: "lease-1",
          accessToken: "tok_secret_123",
          providerEndpoint: "https://provider.example.com",
          localPath: "/Users/test/private",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          executionStatus: "awaiting_acceptance",
          trace: [
            {
              details: {
                providerEndpoint: "https://provider.example.com",
                accessToken: "tok_secret_123",
                filePath: "/Users/test/private",
              },
            },
          ],
        },
      });

    const tool = createWeb3MarketStewardBuyTool(makeConfig())!;
    const result = (await tool.execute("tc-3", {
      actorId: "0xbuyer",
      consumerActorId: "0xbuyer",
      resourceId: "res-1",
      ttlMs: 60_000,
      autoPay: true,
      execute: true,
      budgetPolicy: {
        currency: "USDC",
        maxAmount: "10",
      },
      riskPolicy: {
        maxRiskLevel: "high",
        requireProof: true,
        requireProviderActor: true,
      },
      approval: {
        approved: true,
        approvalId: "approve-1",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    })) as { content: Array<{ text: string }> };

    const serialized = result.content[0]?.text ?? "";
    expect(serialized).not.toContain("provider.example.com");
    expect(serialized).not.toContain("tok_secret_123");
    expect(serialized).not.toContain("/Users/test");
  });
});
