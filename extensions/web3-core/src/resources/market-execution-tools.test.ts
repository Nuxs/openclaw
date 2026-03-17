import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import {
  createWeb3MarketAcceptanceRejectTool,
  createWeb3MarketDisputeResolveTool,
  createWeb3MarketExecutionStatusTool,
  createWeb3MarketProofSubmitTool,
} from "./market-execution-tools.js";

const { callGatewayMock, rememberMarketStewardContextMock } = vi.hoisted(() => ({
  callGatewayMock: vi.fn(),
  rememberMarketStewardContextMock: vi.fn(),
}));

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

vi.mock("./market-steward-context.js", () => ({
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

describe("web3 market execution tools", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
    rememberMarketStewardContextMock.mockReset();
    callGatewayMock.mockResolvedValue({ ok: true, result: { ok: true } });
  });

  it("reads execution status by leaseId and persists the recovered lifecycle IDs", async () => {
    callGatewayMock.mockResolvedValueOnce({
      ok: true,
      result: {
        orderId: "order-1",
        executionStatus: "awaiting_acceptance",
        lease: { leaseId: "lease-1" },
        consent: { consentId: "consent-1" },
        proof: { proofId: "proof-1" },
        settlement: { settlementId: "settlement-1" },
      },
    });
    const tool = createWeb3MarketExecutionStatusTool(makeConfig())!;

    await tool.execute("tc-1", { leaseId: "lease-1", limit: 10, sessionKey: "sess-1" });

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.market.execution.status",
        params: { leaseId: "lease-1", limit: 10, sessionKey: "sess-1" },
      }),
    );
    expect(rememberMarketStewardContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "sess-1",
        status: "awaiting_acceptance",
        orderId: "order-1",
        leaseId: "lease-1",
        consentId: "consent-1",
        proofId: "proof-1",
        settlementId: "settlement-1",
      }),
    );
  });

  it("submits redacted proof payloads for the buyer lifecycle", async () => {
    const tool = createWeb3MarketProofSubmitTool(makeConfig())!;

    await tool.execute("tc-2", {
      actorId: "seller-1",
      orderId: "order-1",
      leaseId: "lease-1",
      proof: {
        type: "tlsnotary",
        verifier: "notary-v1",
        artifactHash: "sha256:abc",
      },
    });

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.market.proof.submit",
        params: {
          actorId: "seller-1",
          orderId: "order-1",
          leaseId: "lease-1",
          deliveryId: undefined,
          proof: {
            type: "tlsnotary",
            verifier: "notary-v1",
            artifactHash: "sha256:abc",
          },
        },
      }),
    );
  });

  it("rejects acceptance with a buyer reason and remembers the resulting dispute anchor", async () => {
    callGatewayMock.mockResolvedValueOnce({
      ok: true,
      result: {
        orderId: "order-1",
        proofId: "proof-1",
        acceptanceStatus: "acceptance_rejected",
        disputeId: "dispute-1",
      },
    });
    const tool = createWeb3MarketAcceptanceRejectTool(makeConfig())!;

    await tool.execute("tc-3", {
      actorId: "buyer-1",
      orderId: "order-1",
      proofId: "proof-1",
      reason: "artifact summary does not match request",
      sessionKey: "sess-3",
    });

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.market.acceptance.reject",
        params: {
          actorId: "buyer-1",
          orderId: "order-1",
          reason: "artifact summary does not match request",
          proofId: "proof-1",
          sessionKey: "sess-3",
        },
      }),
    );
    expect(rememberMarketStewardContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "sess-3",
        status: "acceptance_rejected",
        orderId: "order-1",
        proofId: "proof-1",
        disputeId: "dispute-1",
      }),
    );
  });

  it("resolves disputes with partial or refund-ready settlement context", async () => {
    const tool = createWeb3MarketDisputeResolveTool(makeConfig())!;

    await tool.execute("tc-4", {
      actorId: "operator-1",
      disputeId: "dispute-1",
      resolution: "partial",
      payees: [{ address: "0xpayee", amount: "2" }],
    });

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "web3.market.dispute.resolve",
        params: {
          actorId: "operator-1",
          disputeId: "dispute-1",
          orderId: undefined,
          resolution: "partial",
          payer: undefined,
          payees: [{ address: "0xpayee", amount: "2" }],
        },
      }),
    );
  });
});
