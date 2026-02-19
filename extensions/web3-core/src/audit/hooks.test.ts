import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { Web3StateStore } from "../state/store.js";
import { hashString } from "./canonicalize.js";
import { createAuditHooks } from "./hooks.js";

vi.mock("../storage/adapter.js", () => ({
  createStorageAdapter: vi.fn(),
}));

vi.mock("../storage/archive.js", () => ({
  archiveContent: vi.fn(),
}));

describe("audit hooks", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it("queues archive and anchor when archive fails and no private key", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-web3-audit-"));
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({
      storage: { provider: "ipfs", pinataJwt: "token" },
      chain: { network: "base" },
    });

    const { createStorageAdapter } = await import("../storage/adapter.js");
    const { archiveContent } = await import("../storage/archive.js");

    (createStorageAdapter as any).mockReturnValue({
      providerId: "ipfs",
      put: vi.fn(),
      get: vi.fn(),
    });
    (archiveContent as any).mockRejectedValue(new Error("archive failed"));

    const hooks = createAuditHooks(store, config);
    await hooks.onSessionEnd(
      { messageCount: 1, durationMs: 10 } as any,
      { sessionKey: "session-1" } as any,
    );

    expect(store.getPendingArchives()).toHaveLength(1);
    expect(store.getPendingTxs()).toHaveLength(1);
  });

  it("queues pending settlements when billing is enabled", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-web3-audit-"));
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({
      billing: { enabled: true, quotaPerSession: 10, costPerToolCall: 1, costPerLlmCall: 1 },
    });

    const hooks = createAuditHooks(store, config);
    await hooks.onSessionEnd(
      {
        messageCount: 2,
        durationMs: 100,
        settlement: { orderId: "order-2", payer: "0xpayer", amount: "5" },
      } as any,
      { sessionKey: "session-2" } as any,
    );

    const pending = store.getPendingSettlements();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.sessionIdHash).toBe(hashString("session-2"));
    expect(pending[0]?.orderId).toBe("order-2");
    expect(pending[0]?.payer).toBe("0xpayer");
    expect(pending[0]?.amount).toBe("5");
  });

  it("skips pending settlement when required fields are missing", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-web3-audit-"));
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({
      billing: { enabled: true, quotaPerSession: 10, costPerToolCall: 1, costPerLlmCall: 1 },
    });

    const hooks = createAuditHooks(store, config);
    await hooks.onSessionEnd(
      { messageCount: 1, durationMs: 10, settlement: { amount: "2" } } as any,
      { sessionKey: "session-3" } as any,
    );

    expect(store.getPendingSettlements()).toHaveLength(0);
  });
});
