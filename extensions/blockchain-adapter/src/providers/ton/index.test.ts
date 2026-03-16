import { Address, beginCell } from "@ton/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  afterEach(() => {
    vi.useRealTimers();
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

  it("derives TON BOC submission identifiers into message hashes", async () => {
    const client = (provider as any).client;
    const submissionCell = beginCell().storeUint(7, 8).endCell();
    const submissionId = submissionCell.toBoc().toString("base64");
    const txHash = "tx-from-boc";
    const inMessageHashHex = submissionCell.hash().toString("hex");
    const inMessageHashBase64 = submissionCell.hash().toString("base64");
    const mockTx = {
      hash: () => ({
        toString: (enc: string) => (enc === "hex" ? txHash : "tx-base64"),
      }),
      lt: BigInt(12346),
      inMessage: {
        hash: () => ({
          toString: (enc: string) => (enc === "hex" ? inMessageHashHex : inMessageHashBase64),
        }),
      },
    };

    client.getTransactions.mockResolvedValue([mockTx]);

    const receipt = await provider.getTransactionReceipt(submissionId);
    expect(receipt?.txHash).toBe(txHash);
  });

  it("waits for requested confirmation depth after first TON receipt", async () => {
    vi.useFakeTimers();
    const receipt = {
      txHash: "confirmed-ton-tx",
      blockNumber: 100,
      status: "success" as const,
      from: "EQD__________________________________________0vo",
      logs: [],
    };
    const getReceipt = vi.spyOn(provider, "getTransactionReceipt").mockResolvedValue(receipt);
    const getBlock = vi
      .spyOn(provider, "getBlockNumber")
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(12);

    const promise = provider.waitForTransaction("ton-boc-submission", 3);
    await vi.advanceTimersByTimeAsync(2_500);

    await expect(promise).resolves.toEqual(receipt);
    expect(getReceipt).toHaveBeenCalledTimes(3);
    expect(getBlock).toHaveBeenCalledTimes(3);
  });

  it("emits callbacks for newly observed contract transactions", async () => {
    const client = (provider as any).client;
    const callback = vi.fn();
    const contract = "EQC_contract_for_events";
    (provider as any).eventListeners.set(`${contract}:transfer`, new Set([callback]));
    (provider as any).lastSeenTransactionLt.set(contract, 100n);
    client.getTransactions.mockResolvedValue([
      {
        hash: () => ({ toString: (enc: string) => (enc === "hex" ? "new-hash" : "new-b64") }),
        lt: 101n,
        inMessage: {
          hash: () => ({ toString: (enc: string) => (enc === "hex" ? "msg-new" : "msg-b64") }),
        },
      },
      {
        hash: () => ({ toString: (enc: string) => (enc === "hex" ? "old-hash" : "old-b64") }),
        lt: 100n,
      },
    ]);

    await (provider as any).checkNewTransactions();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        contract,
        eventName: "transfer",
        txHash: "new-hash",
        lt: "101",
        messageHash: "msg-new",
      }),
    );
    expect((provider as any).lastSeenTransactionLt.get(contract)).toBe(101n);
  });
});
