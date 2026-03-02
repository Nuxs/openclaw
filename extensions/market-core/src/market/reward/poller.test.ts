import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as blockchainAdapter from "@openclaw/blockchain-adapter";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveConfig, type MarketPluginConfig } from "../../config.js";
import { MarketStateStore } from "../../state/store.js";
import { flushPendingRewards } from "./poller.js";

vi.mock("@openclaw/blockchain-adapter", () => ({
  getProvider: vi.fn(),
}));

describe("Reward Poller", () => {
  let tempDir: string;
  let store: MarketStateStore;
  let config: MarketPluginConfig;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "poller-test-"));
    config = resolveConfig({ access: { mode: "open" } });
    store = new MarketStateStore(tempDir, config);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("confirms a submitted reward when receipt is success", async () => {
    // 1. Setup reward in submitted status
    const rewardId = "test-reward";
    store.saveReward({
      rewardId,
      chainFamily: "evm",
      network: "base",
      recipient: "0x123",
      amount: "100",
      asset: { type: "erc20", tokenAddress: "0xabc" } as any,
      nonce: "1",
      deadline: "2030-01-01T00:00:00Z",
      eventHash: "0xhash",
      status: "onchain_submitted",
      onchain: { txHash: "0xtx", submittedAt: "2026-01-01T00:00:00Z" },
      attempts: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    // 2. Mock provider response
    const mockProvider = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        blockNumber: "123",
        transactionHash: "0xtx",
      }),
    };
    (blockchainAdapter.getProvider as any).mockReturnValue(mockProvider);

    // 3. Run poller
    await flushPendingRewards(store, config);

    // 4. Verify status updated
    const updated = store.getReward(rewardId)!;
    expect(updated.status).toBe("onchain_confirmed");
    expect(updated.onchain?.confirmedAt).toBeDefined();

    // 5. Verify audit event
    const audit = store.readAuditEvents().find((e) => e.kind === "reward_status_updated");
    expect(audit).toBeDefined();
    expect((audit!.details as any).newStatus).toBe("onchain_confirmed");
  });

  it("marks as failed when receipt is reverted", async () => {
    const rewardId = "test-reward-fail";
    store.saveReward({
      rewardId,
      chainFamily: "evm",
      network: "base",
      recipient: "0x123",
      amount: "100",
      asset: { type: "erc20", tokenAddress: "0xabc" } as any,
      nonce: "1",
      deadline: "2030-01-01T00:00:00Z",
      eventHash: "0xhash",
      status: "onchain_submitted",
      onchain: { txHash: "0xhash_bad", submittedAt: "2026-01-01T00:00:00Z" },
      attempts: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    const mockProvider = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: "reverted",
        blockNumber: "124",
        transactionHash: "0xhash_bad",
      }),
    };
    (blockchainAdapter.getProvider as any).mockReturnValue(mockProvider);

    await flushPendingRewards(store, config);

    const updated = store.getReward(rewardId)!;
    expect(updated.status).toBe("onchain_failed");
    expect(updated.lastError).toContain("reverted");
  });
});
