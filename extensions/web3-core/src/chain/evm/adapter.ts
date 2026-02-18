/**
 * EVM chain adapter — default implementation using viem.
 * Anchors audit hashes as calldata in a minimal transaction (or to a contract if configured).
 */

import type { ChainConfig } from "../../config.js";
import type { ChainAdapter, AnchorInput, AnchorResult, VerifyResult } from "../types.js";

// Chain ID mapping
const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  optimism: 10,
  arbitrum: 42161,
  sepolia: 11155111,
};

// Default public RPC endpoints (rate-limited; users should supply their own)
const DEFAULT_RPC: Record<string, string> = {
  base: "https://mainnet.base.org",
  optimism: "https://mainnet.optimism.io",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  ethereum: "https://eth.llamarpc.com",
  sepolia: "https://rpc.sepolia.org",
};

export class EvmChainAdapter implements ChainAdapter {
  readonly networkId: string;
  private readonly rpcUrl: string;
  private readonly chainId: number;
  private readonly privateKey: string | undefined;

  constructor(config: ChainConfig) {
    this.networkId = config.network;
    this.chainId = CHAIN_IDS[config.network] ?? 8453;
    this.rpcUrl = config.rpcUrl ?? DEFAULT_RPC[config.network] ?? DEFAULT_RPC.base;
    this.privateKey = config.privateKey;
  }

  async anchorHash(input: AnchorInput): Promise<AnchorResult> {
    if (!this.privateKey) {
      throw new Error("chain.privateKey is required to anchor hashes on-chain");
    }

    // Dynamic import viem to keep the plugin lightweight when chain features are unused
    const { createWalletClient, createPublicClient, http, toHex } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");

    const account = privateKeyToAccount(this.privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      transport: http(this.rpcUrl),
    });

    // Encode anchor data as calldata: "OPCLAW:" + anchorId + ":" + payloadHash
    const calldata = toHex(`OPCLAW:${input.anchorId}:${input.payloadHash}`);

    const tx = await client.sendTransaction({
      to: account.address, // self-transfer with calldata
      value: 0n,
      data: calldata as `0x${string}`,
      chain: { id: this.chainId } as any,
    });

    let block: number | undefined;
    try {
      const publicClient = createPublicClient({ transport: http(this.rpcUrl) });
      const receipt = await publicClient.getTransactionReceipt({ hash: tx as `0x${string}` });
      block = Number(receipt.blockNumber);
    } catch {
      block = undefined;
    }

    return {
      tx,
      network: this.networkId,
      block,
    };
  }

  async verifyAnchor(input: { payloadHash: string; tx: string }): Promise<VerifyResult> {
    const { createPublicClient, http, fromHex } = await import("viem");

    const client = createPublicClient({
      transport: http(this.rpcUrl),
    });

    try {
      const receipt = await client.getTransactionReceipt({ hash: input.tx as `0x${string}` });
      const txData = await client.getTransaction({ hash: input.tx as `0x${string}` });

      // Decode calldata
      const decoded = fromHex(txData.input as `0x${string}`, "string");
      const match = decoded.match(/^OPCLAW:(.+):(.+)$/);

      if (!match) return { ok: false };
      const [, anchorId, payloadHash] = match;

      return {
        ok: payloadHash === input.payloadHash,
        anchorId,
        block: Number(receipt.blockNumber),
      };
    } catch {
      return { ok: false };
    }
  }

  async getBalance(): Promise<{ balance: string; symbol: string }> {
    if (!this.privateKey) return { balance: "0", symbol: "ETH" };

    const { createPublicClient, http, formatEther } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");

    const account = privateKeyToAccount(this.privateKey as `0x${string}`);
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const balance = await client.getBalance({ address: account.address });

    return { balance: formatEther(balance), symbol: "ETH" };
  }
}
