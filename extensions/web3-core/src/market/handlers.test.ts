import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig, type Web3PluginConfig } from "../config.js";
import { Web3StateStore } from "../state/store.js";

// Mock callGateway to avoid real gateway calls
const mockCallGateway = vi.fn();
const resolveEnsAddressMock = vi.fn();

vi.mock("../../../../src/gateway/call.ts", () => ({
  callGateway: (...args: unknown[]) => mockCallGateway(...args),
}));

vi.mock("../identity/ens.js", async () => {
  const actual = await vi.importActual<typeof import("../identity/ens.js")>("../identity/ens.js");
  return {
    ...actual,
    resolveEnsAddress: (...args: unknown[]) => resolveEnsAddressMock(...args),
  };
});

// Dynamically import after mocks are established
const { createMarketReconciliationSummaryHandler, createMarketReputationSummaryHandler } =
  await import("./handlers.js");

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

let tempDir: string;
let store: Web3StateStore;
let config: Web3PluginConfig;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "web3-market-handlers-test-"));
  store = new Web3StateStore(tempDir);
  config = resolveConfig({
    resources: { enabled: true },
    brain: { timeoutMs: 5000 },
  });
  mockCallGateway.mockReset();
  resolveEnsAddressMock.mockReset();
});

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe("market.reconciliation.summary", () => {
  it("fails without orderId or settlementId", async () => {
    const handler = createMarketReconciliationSummaryHandler(store, config);
    const r = createResponder();
    await handler({ params: {}, respond: r.respond } as any);
    expect(r.result()!.ok).toBe(false);
  });

  it("builds summary from settlement response (evm)", async () => {
    mockCallGateway.mockImplementation(async (opts: { method: string }) => {
      if (opts.method === "market.settlement.status") {
        return {
          ok: true,
          result: {
            orderId: "order-1",
            settlementId: "settle-1",
            status: "settlement_locked",
            amount: "100",
            tokenAddress: "0xUSDC",
            lockTxHash: "0xabc",
            lockedAt: "2026-01-01T00:00:00Z",
          },
        };
      }
      if (opts.method === "market.dispute.list") {
        return { ok: true, result: { disputes: [] } };
      }
      return { ok: true, result: {} };
    });

    const handler = createMarketReconciliationSummaryHandler(store, config);
    const r = createResponder();
    await handler({
      params: { orderId: "order-1" },
      respond: r.respond,
    } as any);

    expect(r.result()!.ok).toBe(true);
    const summary = r.result()!.payload as any;
    expect(summary.orderId).toBe("order-1");
    expect(summary.settlementId).toBe("settle-1");
    expect(summary.paymentReceipt).toBeDefined();
    expect(summary.paymentReceipt.chain).toBe("evm");
    expect(summary.paymentReceipt.mode).toBe("live");
    expect(summary.paymentReceipt.txHash).toBe("0xabc");
    expect(summary.settlement.status).toBe("settlement_locked");
  });

  it("uses ton chain when specified", async () => {
    mockCallGateway.mockImplementation(async (opts: { method: string }) => {
      if (opts.method === "market.settlement.status") {
        return {
          ok: true,
          result: {
            orderId: "order-2",
            settlementId: "settle-2",
            status: "settlement_locked",
            amount: "50",
          },
        };
      }
      if (opts.method === "market.dispute.list") {
        return { ok: true, result: { disputes: [] } };
      }
      return { ok: true, result: {} };
    });

    const handler = createMarketReconciliationSummaryHandler(store, config);
    const r = createResponder();
    await handler({
      params: { orderId: "order-2", chain: "ton" },
      respond: r.respond,
    } as any);

    expect(r.result()!.ok).toBe(true);
    const summary = r.result()!.payload as any;
    expect(summary.paymentReceipt?.chain).toBe("ton");
    expect(summary.paymentReceipt?.mode).toBe("simulated");
  });

  it("includes dispute summary when includeDisputes=true", async () => {
    mockCallGateway.mockImplementation(async (opts: { method: string }) => {
      if (opts.method === "market.settlement.status") {
        return {
          ok: true,
          result: {
            orderId: "order-3",
            settlementId: "settle-3",
            status: "settlement_locked",
            amount: "200",
          },
        };
      }
      if (opts.method === "market.dispute.list") {
        return {
          ok: true,
          result: {
            disputes: [{ status: "dispute_opened" }, { status: "dispute_resolved" }],
          },
        };
      }
      return { ok: true, result: {} };
    });

    const handler = createMarketReconciliationSummaryHandler(store, config);
    const r = createResponder();
    await handler({
      params: { orderId: "order-3", includeDisputes: true },
      respond: r.respond,
    } as any);

    expect(r.result()!.ok).toBe(true);
    const summary = r.result()!.payload as any;
    expect(summary.disputes.total).toBe(2);
    expect(summary.disputes.byStatus.dispute_opened).toBe(1);
    expect(summary.disputes.byStatus.dispute_resolved).toBe(1);
  });

  it("includes service proof summary in reconciliation payload", async () => {
    mockCallGateway.mockImplementation(async (opts: { method: string }) => {
      if (opts.method === "market.settlement.status") {
        return {
          ok: true,
          result: {
            orderId: "order-proof-1",
            settlementId: "settle-proof-1",
            status: "settlement_locked",
            amount: "120",
          },
        };
      }
      if (opts.method === "market.dispute.list") {
        return { ok: true, result: { disputes: [] } };
      }
      if (opts.method === "market.service.proof.list") {
        return {
          ok: true,
          result: {
            proofs: [
              {
                status: "proof_submitted",
                submittedAt: "2026-03-01T00:00:00.000Z",
                proof: {
                  artifactHash:
                    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                },
              },
              {
                status: "proof_submitted",
                submittedAt: "2026-03-02T00:00:00.000Z",
                proof: {
                  artifactHash:
                    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                },
              },
            ],
          },
        };
      }
      return { ok: true, result: {} };
    });

    const handler = createMarketReconciliationSummaryHandler(store, config);
    const r = createResponder();
    await handler({
      params: { orderId: "order-proof-1" },
      respond: r.respond,
    } as any);

    expect(r.result()!.ok).toBe(true);
    const summary = r.result()!.payload as any;
    expect(summary.serviceProofs.total).toBe(2);
    expect(summary.serviceProofs.byStatus.proof_submitted).toBe(2);
    expect(summary.serviceProofs.latestSubmittedAt).toBe("2026-03-02T00:00:00.000Z");
    expect(summary.serviceProofs.artifactHashes).toHaveLength(2);
  });

  it("handles settlement.status gateway failure", async () => {
    mockCallGateway.mockImplementation(async () => ({
      ok: false,
      error: "settlement not found",
    }));

    const handler = createMarketReconciliationSummaryHandler(store, config);
    const r = createResponder();
    await handler({
      params: { orderId: "nonexistent" },
      respond: r.respond,
    } as any);
    expect(r.result()!.ok).toBe(false);
  });

  it("accepts settlementId as input", async () => {
    mockCallGateway.mockImplementation(async (opts: { method: string }) => {
      if (opts.method === "market.settlement.status") {
        return {
          ok: true,
          result: {
            orderId: "order-4",
            settlementId: "settle-4",
            status: "settlement_released",
            amount: "300",
            releaseTxHash: "0xdef",
            releasedAt: "2026-02-01T00:00:00Z",
          },
        };
      }
      if (opts.method === "market.dispute.list") {
        return { ok: true, result: { disputes: [] } };
      }
      return { ok: true, result: {} };
    });

    const handler = createMarketReconciliationSummaryHandler(store, config);
    const r = createResponder();
    await handler({
      params: { settlementId: "settle-4" },
      respond: r.respond,
    } as any);

    expect(r.result()!.ok).toBe(true);
    const summary = r.result()!.payload as any;
    expect(summary.orderId).toBe("order-4");
    expect(summary.settlementId).toBe("settle-4");
    expect(summary.paymentReceipt.txHash).toBe("0xdef");
  });
});

describe("market.reputation.summary", () => {
  it("enriches reputation payload with ENS from reverse lookup", async () => {
    mockCallGateway.mockResolvedValue({
      ok: true,
      result: {
        providerActorId: "0x00000000000000000000000000000000000000a1",
        score: 88,
        signals: ["stable"],
      },
    });
    resolveEnsAddressMock.mockResolvedValue({
      name: "provider.eth",
      address: "0x00000000000000000000000000000000000000a1",
      resolver: "0xresolver",
      resolvedAt: "2026-03-03T00:00:00.000Z",
    });

    const handler = createMarketReputationSummaryHandler(store, config);
    const r = createResponder();
    await handler({ params: {}, respond: r.respond } as any);

    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.identity.ensName).toBe("provider.eth");
    expect(payload.identity.ensSource).toBe("reverse");
    expect(payload.identity.ensStatus).toBe("ok");
  });

  it("uses binding ENS before reverse lookup and degrades when unavailable", async () => {
    store.addBinding({
      address: "0x00000000000000000000000000000000000000a2",
      chainId: 1,
      verifiedAt: "2026-03-03T00:00:00.000Z",
      ensName: "bound.eth",
    });

    mockCallGateway.mockResolvedValue({
      ok: true,
      result: {
        providerActorId: "0x00000000000000000000000000000000000000a2",
        score: 70,
        signals: ["insufficient_data"],
      },
    });

    const handler = createMarketReputationSummaryHandler(store, config);
    const r = createResponder();
    await handler({ params: {}, respond: r.respond } as any);

    expect(r.result()!.ok).toBe(true);
    const payload = r.result()!.payload as any;
    expect(payload.identity.ensName).toBe("bound.eth");
    expect(payload.identity.ensSource).toBe("binding");
    expect(resolveEnsAddressMock).not.toHaveBeenCalled();

    mockCallGateway.mockResolvedValueOnce({
      ok: true,
      result: {
        providerActorId: "0x00000000000000000000000000000000000000b1",
        score: 55,
        signals: ["high_dispute_rate"],
      },
    });
    resolveEnsAddressMock.mockResolvedValueOnce(null);
    const degraded = createResponder();
    await handler({ params: {}, respond: degraded.respond } as any);

    expect(degraded.result()!.ok).toBe(true);
    const degradedPayload = degraded.result()!.payload as any;
    expect(degradedPayload.identity.ensName).toBeNull();
    expect(degradedPayload.identity.ensStatus).toBe("degraded");
  });
});
