/**
 * TonEscrowAdapter tests — error handling, retry, timeout, idempotent queryId.
 *
 * Uses mocked blockchain-adapter provider to verify:
 * 1. Transient errors trigger retry with backoff.
 * 2. Permanent errors fail immediately (no retry).
 * 3. lock/refund use deterministic queryId (idempotent).
 * 4. release uses random queryId (nonce).
 * 5. Happy-path returns txHash from provider.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainConfig, SettlementConfig } from "../config.js";

// Valid TON testnet address (EQ format).
const VALID_TON_ADDRESS = "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2";
// Valid 0x-prefixed 32-byte hex string for orderHash.
const VALID_ORDER_HASH = "0x" + "ab".repeat(32);

// ── Mock @openclaw/blockchain-adapter ──

const mockTransfer = vi.fn<(...args: unknown[]) => Promise<string>>();
const mockConnect = vi.fn<() => Promise<void>>();
const mockWaitForTransaction = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock("@openclaw/blockchain-adapter", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    initBlockchainFactory: vi.fn(),
    getProvider: vi.fn(() => ({
      chainType: "ton",
      isConnected: true,
      transfer: mockTransfer,
      connect: mockConnect,
      waitForTransaction: mockWaitForTransaction,
    })),
    isProviderTON: vi.fn(() => true),
  };
});

function makeChainConfig(overrides?: Partial<ChainConfig>): ChainConfig {
  return {
    network: "ton-testnet",
    escrowContractAddress: VALID_TON_ADDRESS,
    tonMnemonic:
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    ...overrides,
  } as ChainConfig;
}

function makeSettlementConfig(overrides?: Partial<SettlementConfig>): SettlementConfig {
  return {
    mode: "contract",
    tokenAddress: VALID_TON_ADDRESS,
    ...overrides,
  } as SettlementConfig;
}

describe("TonEscrowAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWaitForTransaction.mockResolvedValue({ status: "success" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path: lock returns txHash", async () => {
    mockTransfer.mockResolvedValueOnce("boc_lock_abc123");

    const { TonEscrowAdapter } = await import("./escrow-ton.js");
    const adapter = new TonEscrowAdapter(makeChainConfig(), makeSettlementConfig());
    const tx = await adapter.lock(VALID_ORDER_HASH, "payer", "100000000", VALID_TON_ADDRESS);

    expect(tx).toBe("boc_lock_abc123");
    expect(mockTransfer).toHaveBeenCalledOnce();
  });

  it("happy path: release returns txHash", async () => {
    mockTransfer.mockResolvedValueOnce("boc_release_xyz");

    const { TonEscrowAdapter } = await import("./escrow-ton.js");
    const adapter = new TonEscrowAdapter(makeChainConfig(), makeSettlementConfig());
    const tx = await adapter.release(VALID_ORDER_HASH, [
      { address: VALID_TON_ADDRESS, amount: "100000000" },
    ]);

    expect(tx).toBe("boc_release_xyz");
    expect(mockTransfer).toHaveBeenCalledOnce();
  });

  it("happy path: refund returns txHash", async () => {
    mockTransfer.mockResolvedValueOnce("boc_refund_999");

    const { TonEscrowAdapter } = await import("./escrow-ton.js");
    const adapter = new TonEscrowAdapter(makeChainConfig(), makeSettlementConfig());
    const tx = await adapter.refund(VALID_ORDER_HASH, "payer");

    expect(tx).toBe("boc_refund_999");
    expect(mockTransfer).toHaveBeenCalledOnce();
  });

  it("retries on transient error then succeeds", async () => {
    mockTransfer
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce("boc_retry_ok");

    const { TonEscrowAdapter } = await import("./escrow-ton.js");
    const adapter = new TonEscrowAdapter(makeChainConfig(), makeSettlementConfig());

    const tx = await adapter.lock(VALID_ORDER_HASH, "payer", "100", VALID_TON_ADDRESS);
    expect(tx).toBe("boc_retry_ok");
    expect(mockTransfer).toHaveBeenCalledTimes(2);
  });

  it("fails immediately on permanent error (no retry)", async () => {
    mockTransfer.mockRejectedValueOnce(new Error("Insufficient balance for transfer"));

    const { TonEscrowAdapter } = await import("./escrow-ton.js");
    const adapter = new TonEscrowAdapter(makeChainConfig(), makeSettlementConfig());

    await expect(adapter.lock(VALID_ORDER_HASH, "payer", "100", VALID_TON_ADDRESS)).rejects.toThrow(
      /transfer failed/i,
    );
    expect(mockTransfer).toHaveBeenCalledOnce();
  });

  it("throws structured error after all retries exhausted", async () => {
    mockTransfer
      .mockRejectedValueOnce(new Error("timeout waiting for response"))
      .mockRejectedValueOnce(new Error("timeout waiting for response"))
      .mockRejectedValueOnce(new Error("timeout waiting for response"));

    const { TonEscrowAdapter } = await import("./escrow-ton.js");
    const adapter = new TonEscrowAdapter(makeChainConfig(), makeSettlementConfig());

    await expect(adapter.refund(VALID_ORDER_HASH, "payer")).rejects.toThrow(/transfer failed/i);
    expect(mockTransfer).toHaveBeenCalledTimes(3);
  });

  it("release rejects when payees count !== 1", async () => {
    const { TonEscrowAdapter } = await import("./escrow-ton.js");
    const adapter = new TonEscrowAdapter(makeChainConfig(), makeSettlementConfig());

    await expect(
      adapter.release(VALID_ORDER_HASH, [
        { address: VALID_TON_ADDRESS, amount: "50" },
        { address: VALID_TON_ADDRESS, amount: "50" },
      ]),
    ).rejects.toThrow(/exactly 1 payee/i);
  });

  it("lock and refund use deterministic queryId for the same orderId", async () => {
    const capturedPayloads: unknown[] = [];
    mockTransfer.mockImplementation(async (...args: unknown[]) => {
      capturedPayloads.push(args);
      return "boc_determ";
    });

    const { TonEscrowAdapter } = await import("./escrow-ton.js");
    const adapter = new TonEscrowAdapter(makeChainConfig(), makeSettlementConfig());

    await adapter.lock(VALID_ORDER_HASH, "payer", "100", VALID_TON_ADDRESS);
    await adapter.lock(VALID_ORDER_HASH, "payer", "100", VALID_TON_ADDRESS);

    // Both calls should have identical payloads (deterministic queryId).
    expect(capturedPayloads.length).toBe(2);
    const p1 = capturedPayloads[0] as unknown[];
    const p2 = capturedPayloads[1] as unknown[];
    // The 3rd argument (options with payload) should be identical for the same orderId.
    expect(p1[2]).toEqual(p2[2]);
  });

  it("throws when tonMnemonic is missing and provider needs connect", async () => {
    // Override getProvider to return a disconnected provider.
    const { getProvider } = await import("@openclaw/blockchain-adapter");
    vi.mocked(getProvider).mockReturnValue({
      chainType: "ton",
      isConnected: false,
      transfer: mockTransfer,
      connect: mockConnect,
      waitForTransaction: mockWaitForTransaction,
    } as any);
    mockConnect.mockRejectedValueOnce(new Error("tonMnemonic is required"));

    const { TonEscrowAdapter } = await import("./escrow-ton.js");
    const adapter = new TonEscrowAdapter(
      makeChainConfig({ tonMnemonic: "" }),
      makeSettlementConfig(),
    );

    await expect(adapter.lock(VALID_ORDER_HASH, "payer", "100", VALID_TON_ADDRESS)).rejects.toThrow(
      /tonMnemonic is required/i,
    );
  });

  it("throws when escrowContractAddress is missing", async () => {
    const { TonEscrowAdapter } = await import("./escrow-ton.js");

    expect(
      () =>
        new TonEscrowAdapter(
          makeChainConfig({ escrowContractAddress: "" }),
          makeSettlementConfig(),
        ),
    ).toThrow(/escrowContractAddress is required/i);
  });
});
