import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { createWeb3MarketStewardBuyTool } from "./market-steward-tools.js";

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

describe("web3 market steward buy tool", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
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
      .mockResolvedValueOnce({ ok: true, result: { leaseId: "lease-1" } })
      .mockResolvedValueOnce({ ok: true, result: { executionStatus: "lease_issued" } });

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
