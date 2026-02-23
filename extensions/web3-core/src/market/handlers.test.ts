import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig, type Web3PluginConfig } from "../config.js";
import { Web3StateStore } from "../state/store.js";

// Mock callGateway to avoid real gateway calls
const mockCallGateway = vi.fn();
vi.mock("../../../../src/gateway/call.ts", () => ({
  callGateway: (...args: unknown[]) => mockCallGateway(...args),
}));

// Dynamically import after mocks are established
const { createMarketReconciliationSummaryHandler } = await import("./handlers.js");

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
