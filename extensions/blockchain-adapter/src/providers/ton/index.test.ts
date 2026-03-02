import { Address } from "@ton/core";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TONProvider } from "./index.js";

// Mock @ton/core Address.parse
vi.mock("@ton/core", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Address: {
      parse: (addr: string) => ({
        toString: () => addr,
        workChain: 0,
        hash: Buffer.from(addr.slice(0, 32)),
      }),
    },
  };
});

// Mock @ton/ton TonClient and WalletContractV4
vi.mock("@ton/ton", () => {
  class MockTonClient {
    parameters = { endpoint: "https://mock-rpc" };
    getTransactions = vi.fn();
    getMasterchainInfo = vi.fn();
  }
  return {
    TonClient: MockTonClient,
    WalletContractV4: {
      create: vi.fn(),
    },
  };
});

describe("TONProvider getTransactionReceipt", () => {
  let provider: TONProvider;

  beforeEach(() => {
    provider = new TONProvider({ testnet: true });
    // Mock connected wallet
    (provider as any).connectedWallet = {
      address: "EQD__________________________________________0vo",
      publicKey: "mock-pubkey",
      chainId: -3,
    };
  });

  it("returns null if transaction not found", async () => {
    const client = (provider as any).client;
    client.getTransactions.mockResolvedValue([]);

    const receipt = await provider.getTransactionReceipt("some-hash");
    expect(receipt).toBeUndefined();
  });

  it("finds transaction by hash", async () => {
    const client = (provider as any).client;
    const txHash = "mock-tx-hash";
    const mockTx = {
      hash: () => ({
        toString: (enc: string) => (enc === "hex" ? txHash : "base64-hash"),
      }),
      lt: BigInt(12345),
      inMessage: {
        hash: () => ({ toString: () => "msg-hash" }),
      },
    };

    client.getTransactions.mockResolvedValue([mockTx]);

    const receipt = await provider.getTransactionReceipt(txHash);
    expect(receipt).not.toBeUndefined();
    expect(receipt?.txHash).toBe(txHash);
    expect(receipt?.status).toBe("success");
  });

  it("finds transaction by inMessage hash", async () => {
    const client = (provider as any).client;
    const msgHash = "mock-msg-hash";
    const txHash = "actual-tx-hash";
    const mockTx = {
      hash: () => ({
        toString: (enc: string) => (enc === "hex" ? txHash : "other-base64"),
      }),
      lt: BigInt(12345),
      inMessage: {
        hash: () => ({
          toString: (enc: string) => (enc === "hex" ? msgHash : "msg-base64"),
        }),
      },
    };

    client.getTransactions.mockResolvedValue([mockTx]);

    const receipt = await provider.getTransactionReceipt(msgHash);
    expect(receipt).not.toBeUndefined();
    expect(receipt?.txHash).toBe(txHash);
  });
});
