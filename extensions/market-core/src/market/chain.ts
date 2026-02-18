import type { ChainConfig } from "../config.js";

const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  optimism: 10,
  arbitrum: 42161,
  sepolia: 11155111,
};

const DEFAULT_RPC: Record<string, string> = {
  base: "https://mainnet.base.org",
  optimism: "https://mainnet.optimism.io",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  ethereum: "https://eth.llamarpc.com",
  sepolia: "https://rpc.sepolia.org",
};

export type AnchorResult = {
  tx: string;
  network: string;
  block?: number;
};

export class EvmAnchorAdapter {
  readonly networkId: string;
  private readonly rpcUrl: string;
  private readonly chainId: number;
  private readonly privateKey?: string;

  constructor(config: ChainConfig) {
    this.networkId = config.network;
    this.chainId = CHAIN_IDS[config.network] ?? 8453;
    this.rpcUrl = config.rpcUrl ?? DEFAULT_RPC[config.network] ?? DEFAULT_RPC.base;
    this.privateKey = config.privateKey;
  }

  async anchorHash(anchorId: string, payloadHash: string): Promise<AnchorResult> {
    if (!this.privateKey) {
      throw new Error("chain.privateKey is required to anchor hashes on-chain");
    }

    const { createWalletClient, createPublicClient, http, toHex } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");

    const account = privateKeyToAccount(this.privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      transport: http(this.rpcUrl),
    });

    const calldata = toHex(`OPCLAW-MARKET:${anchorId}:${payloadHash}`);
    const tx = await client.sendTransaction({
      to: account.address,
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

    return { tx, network: this.networkId, block };
  }
}
