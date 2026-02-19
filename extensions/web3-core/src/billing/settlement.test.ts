import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import type { PendingSettlement } from "../state/store.js";
import { Web3StateStore } from "../state/store.js";
import { flushPendingSettlements, isSettlementReady } from "./settlement.js";

const callGatewayMock = vi.fn();

vi.mock("../../../../src/gateway/call.ts", () => ({
  callGateway: (...args: unknown[]) => callGatewayMock(...args),
}));

let tempDir: string;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function makeStore() {
  tempDir = mkdtempSync(join(tmpdir(), "openclaw-web3-settlement-test-"));
  return new Web3StateStore(tempDir);
}

function readyEntry(overrides?: Partial<PendingSettlement>): PendingSettlement {
  return {
    sessionIdHash: "hash-ready",
    createdAt: new Date().toISOString(),
    orderId: "order-1",
    payer: "0xpayer",
    amount: "100",
    actorId: "0xactor",
    ...overrides,
  };
}

function notReadyEntry(overrides?: Partial<PendingSettlement>): PendingSettlement {
  return {
    sessionIdHash: "hash-not-ready",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("isSettlementReady", () => {
  it("returns true when orderId, payer, and amount are all present", () => {
    expect(isSettlementReady(readyEntry())).toBe(true);
  });

  it("returns false when orderId is missing", () => {
    expect(isSettlementReady({ ...readyEntry(), orderId: undefined })).toBe(false);
  });

  it("returns false when payer is missing", () => {
    expect(isSettlementReady({ ...readyEntry(), payer: undefined })).toBe(false);
  });

  it("returns false when amount is missing", () => {
    expect(isSettlementReady({ ...readyEntry(), amount: undefined })).toBe(false);
  });

  it("returns false when all fields are empty strings", () => {
    expect(isSettlementReady({ ...readyEntry(), orderId: "", payer: "", amount: "" })).toBe(false);
  });
});

describe("flushPendingSettlements", () => {
  it("does nothing when billing is disabled", async () => {
    const store = makeStore();
    const config = resolveConfig({ billing: { enabled: false } });
    store.upsertPendingSettlement(readyEntry());

    await flushPendingSettlements(store, config);

    // Entries should still be there (not touched)
    expect(store.getPendingSettlements()).toHaveLength(1);
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("does nothing when no pending settlements", async () => {
    const store = makeStore();
    const config = resolveConfig({ billing: { enabled: true } });

    await flushPendingSettlements(store, config);

    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("skips not-ready entries and keeps them in queue", async () => {
    const store = makeStore();
    const config = resolveConfig({ billing: { enabled: true } });
    store.savePendingSettlements([notReadyEntry()]);

    await flushPendingSettlements(store, config);

    const remaining = store.getPendingSettlements();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].sessionIdHash).toBe("hash-not-ready");
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("clears entry from queue on successful settlement lock", async () => {
    const store = makeStore();
    const config = resolveConfig({ billing: { enabled: true } });
    store.savePendingSettlements([readyEntry()]);
    callGatewayMock.mockResolvedValue({ ok: true });

    await flushPendingSettlements(store, config);

    expect(store.getPendingSettlements()).toHaveLength(0);
    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "market.settlement.lock",
        params: expect.objectContaining({
          orderId: "order-1",
          amount: "100",
          payer: "0xpayer",
        }),
      }),
    );
  });

  it("increments attempts and keeps entry on callGateway failure", async () => {
    const store = makeStore();
    const config = resolveConfig({ billing: { enabled: true } });
    store.savePendingSettlements([readyEntry({ attempts: 2 })]);
    callGatewayMock.mockRejectedValue(new Error("network error"));

    await flushPendingSettlements(store, config);

    const remaining = store.getPendingSettlements();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].attempts).toBe(3);
    expect(remaining[0].lastError).toBe("network error");
  });

  it("increments attempts when result.ok is false", async () => {
    const store = makeStore();
    const config = resolveConfig({ billing: { enabled: true } });
    store.savePendingSettlements([readyEntry()]);
    callGatewayMock.mockResolvedValue({ ok: false, error: "insufficient funds" });

    await flushPendingSettlements(store, config);

    const remaining = store.getPendingSettlements();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].attempts).toBe(1);
    expect(remaining[0].lastError).toBe("insufficient funds");
  });

  it("handles mixed ready and not-ready entries", async () => {
    const store = makeStore();
    const config = resolveConfig({ billing: { enabled: true } });
    store.savePendingSettlements([
      readyEntry({ sessionIdHash: "ready-1" }),
      notReadyEntry({ sessionIdHash: "not-ready-1" }),
      readyEntry({ sessionIdHash: "ready-2", orderId: "order-2" }),
    ]);
    callGatewayMock.mockResolvedValue({ ok: true });

    await flushPendingSettlements(store, config);

    const remaining = store.getPendingSettlements();
    // Only the not-ready entry should remain
    expect(remaining).toHaveLength(1);
    expect(remaining[0].sessionIdHash).toBe("not-ready-1");
    expect(callGatewayMock).toHaveBeenCalledTimes(2);
  });

  it("handles empty pending list correctly", async () => {
    const store = makeStore();
    const config = resolveConfig({ billing: { enabled: true } });
    store.savePendingSettlements([]);

    await flushPendingSettlements(store, config);

    expect(store.getPendingSettlements()).toHaveLength(0);
  });
});
