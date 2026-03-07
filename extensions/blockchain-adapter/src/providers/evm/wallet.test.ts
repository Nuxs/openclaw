import { hashMessage, hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import type { ChainInfo } from "../../types/chain.js";
import { EvmWallet } from "./wallet.js";

const TEST_CHAIN_INFO: ChainInfo = {
  id: 11155111,
  name: "Sepolia",
  symbol: "ETH",
  decimals: 18,
  explorerUrl: "https://sepolia.etherscan.io",
  rpcUrl: "https://rpc.sepolia.org",
};

describe("EvmWallet", () => {
  it("connects with private key and exposes the derived address", async () => {
    const privateKey =
      "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as const;
    const wallet = new EvmWallet(TEST_CHAIN_INFO);

    const connected = await wallet.connect({ privateKey });

    expect(connected.address).toBe(privateKeyToAccount(privateKey).address);
    expect(wallet.getAddress()).toBe(privateKeyToAccount(privateKey).address);
  });

  it("uses provided remote signer address instead of generating a random one", async () => {
    const remoteAddress = "0x1111111111111111111111111111111111111111" as const;
    const signMessage = vi.fn(async () => "0xdeadbeef" as const);
    const wallet = new EvmWallet(TEST_CHAIN_INFO);

    const connected = await wallet.connect({
      remoteSigner: {
        address: remoteAddress,
        signMessage,
      },
    });

    expect(connected.address).toBe(remoteAddress);
    expect(wallet.getAddress()).toBe(remoteAddress);
    expect(wallet.signerMode.type).toBe("remote-signature");
  });

  it("hashes plain message before delegating to remote signer", async () => {
    const remoteAddress = "0x2222222222222222222222222222222222222222" as const;
    const signMessage = vi.fn(async () => "0xbeef" as const);
    const wallet = new EvmWallet(TEST_CHAIN_INFO);

    await wallet.connect({
      remoteSigner: {
        address: remoteAddress,
        signMessage,
      },
    });

    await wallet.signMessage("hello");

    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(signMessage).toHaveBeenCalledWith(hashMessage("hello"));
  });

  it("hashes typed data before delegating to remote signer", async () => {
    const remoteAddress = "0x3333333333333333333333333333333333333333" as const;
    const signMessage = vi.fn(async () => "0xcafe" as const);
    const wallet = new EvmWallet(TEST_CHAIN_INFO);

    await wallet.connect({
      remoteSigner: {
        address: remoteAddress,
        signMessage,
      },
    });

    const domain = {
      name: "OpenClaw",
      version: "1",
      chainId: 11155111,
      verifyingContract: "0x0000000000000000000000000000000000000001",
    } as const;
    const types = {
      Proof: [{ name: "taskId", type: "string" }],
    };
    const value = { taskId: "task-1" };

    await wallet.signTypedData(domain, types, value, "Proof");

    expect(signMessage).toHaveBeenCalledTimes(1);
    expect(signMessage).toHaveBeenCalledWith(
      hashTypedData({
        domain,
        types,
        primaryType: "Proof",
        message: value,
      }),
    );
  });

  it("rejects sendTransaction in remote signer mode", async () => {
    const remoteAddress = "0x4444444444444444444444444444444444444444" as const;
    const wallet = new EvmWallet(TEST_CHAIN_INFO);

    await wallet.connect({
      remoteSigner: {
        address: remoteAddress,
        signMessage: async () => "0x1234",
      },
    });

    await expect(
      wallet.sendTransaction({
        to: "0x5555555555555555555555555555555555555555",
        value: 1n,
      }),
    ).rejects.toThrow("Remote signer mode does not support sendTransaction yet");
  });
});
