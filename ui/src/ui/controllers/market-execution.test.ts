import { describe, expect, it, vi } from "vitest";
import type { GatewayBrowserClient } from "../gateway.ts";
import { loadMarketExecutions } from "./market-execution.ts";

function createClient(resolver: (method: string, params: Record<string, unknown>) => unknown): {
  client: GatewayBrowserClient;
  requestMock: ReturnType<typeof vi.fn>;
} {
  const requestMock = vi.fn((method: string, params: Record<string, unknown> = {}) =>
    resolver(method, params),
  );
  return {
    client: {
      request: requestMock,
    } as unknown as GatewayBrowserClient,
    requestMock,
  };
}

describe("market execution controller", () => {
  it("loads recent execution summaries from leases and dispute activity", async () => {
    const { client, requestMock } = createClient(async (_method, params) => {
      if (params.leaseId === "lease-2") {
        return {
          result: {
            orderId: "order-2",
            executionStatus: "disputed",
            order: {
              orderId: "order-2",
              buyerId: "buyer-2",
              updatedAt: "2026-03-15T10:00:00.000Z",
            },
            offer: { sellerId: "seller-2", currency: "USDC" },
            resource: { resourceId: "res-2", label: "Risk review" },
            lease: { leaseId: "lease-2", issuedAt: "2026-03-14T12:00:00.000Z" },
            acceptance: { status: "acceptance_rejected" },
            dispute: { status: "dispute_opened", openedAt: "2026-03-15T11:00:00.000Z" },
            trace: [
              {
                id: "trace-2",
                kind: "acceptance_rejected",
                refId: "order-2",
                actor: "buyer-2",
                timestamp: "2026-03-15T11:00:00.000Z",
                details: { reason: "quality_mismatch" },
              },
            ],
          },
        };
      }

      return {
        result: {
          orderId: "order-1",
          executionStatus: "awaiting_acceptance",
          order: { orderId: "order-1", buyerId: "buyer-1", updatedAt: "2026-03-14T08:00:00.000Z" },
          offer: { sellerId: "seller-1", currency: "USDC" },
          resource: { resourceId: "res-1", label: "Secure review" },
          lease: { leaseId: "lease-1", issuedAt: "2026-03-14T09:00:00.000Z" },
          proof: {
            proofId: "proof-1",
            status: "proof_submitted",
            submittedAt: "2026-03-14T10:00:00.000Z",
            summary: { type: "tlsnotary" },
          },
          acceptance: { status: "acceptance_pending" },
          trace: [],
        },
      };
    });

    const state: Parameters<typeof loadMarketExecutions>[0] = {
      client,
      connected: true,
      hello: { features: { methods: ["web3.market.execution.status"] } },
      marketLeases: [
        {
          leaseId: "lease-1",
          orderId: "order-1",
          resourceId: "res-1",
          kind: "search",
          providerActorId: "seller-1",
          consumerActorId: "buyer-1",
          status: "lease_active",
          issuedAt: "2026-03-14T09:00:00.000Z",
          expiresAt: "2026-03-20T09:00:00.000Z",
        },
        {
          leaseId: "lease-2",
          orderId: "order-2",
          resourceId: "res-2",
          kind: "search",
          providerActorId: "seller-2",
          consumerActorId: "buyer-2",
          status: "lease_active",
          issuedAt: "2026-03-14T12:00:00.000Z",
          expiresAt: "2026-03-20T12:00:00.000Z",
        },
      ],
      marketDisputes: [
        {
          disputeId: "dispute-2",
          orderId: "order-2",
          initiatorActorId: "buyer-2",
          respondentActorId: "seller-2",
          reason: "quality mismatch",
          status: "dispute_opened",
          openedAt: "2026-03-15T11:00:00.000Z",
        },
      ],
      marketExecutionLoading: false,
      marketExecutionError: null,
      marketExecutions: [],
    };

    await loadMarketExecutions(state);

    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(state.marketExecutionError).toBeNull();
    expect(state.marketExecutions).toHaveLength(2);
    expect(state.marketExecutions[0]?.orderId).toBe("order-2");
    expect(state.marketExecutions[0]?.disputeStatus).toBe("dispute_opened");
    expect(state.marketExecutions[1]?.proofType).toBe("tlsnotary");
  });

  it("fails fast when execution status method is unavailable", async () => {
    const { client, requestMock } = createClient(async () => ({ result: {} }));
    const state: Parameters<typeof loadMarketExecutions>[0] = {
      client,
      connected: true,
      hello: { features: { methods: ["web3.market.status.summary"] } },
      marketLeases: [],
      marketDisputes: [],
      marketExecutionLoading: false,
      marketExecutionError: null,
      marketExecutions: [],
    };

    await loadMarketExecutions(state);

    expect(requestMock).not.toHaveBeenCalled();
    expect(state.marketExecutions).toEqual([]);
    expect(state.marketExecutionError).toContain("web3.market.execution.status");
  });
});
