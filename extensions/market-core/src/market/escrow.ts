import { getAddress } from "viem";
import type { ChainConfig, SettlementConfig } from "../config.js";

const ESCROW_ABI = [
  {
    type: "function",
    name: "lock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orderId", type: "bytes32" },
      { name: "payer", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "token", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orderId", type: "bytes32" },
      { name: "payees", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orderId", type: "bytes32" },
      { name: "payer", type: "address" },
    ],
    outputs: [],
  },
] as const;

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

export class EscrowAdapter {
  private readonly chainId: number;
  private readonly rpcUrl: string;
  private readonly privateKey?: string;
  private readonly contractAddress?: string;
  private readonly tokenAddress?: string;
  private readonly mode: SettlementConfig["mode"];

  constructor(chain: ChainConfig, settlement: SettlementConfig) {
    this.chainId = CHAIN_IDS[chain.network] ?? 8453;
    this.rpcUrl = chain.rpcUrl ?? DEFAULT_RPC[chain.network] ?? DEFAULT_RPC.base;
    this.privateKey = chain.privateKey;
    this.contractAddress = chain.escrowContractAddress;
    this.tokenAddress = settlement.tokenAddress;
    this.mode = settlement.mode;
  }

  private ensureContractReady() {
    if (this.mode !== "contract") {
      throw new Error("settlement.mode is not set to contract");
    }
    if (!this.privateKey) {
      throw new Error("chain.privateKey is required for escrow contract calls");
    }
    if (!this.contractAddress) {
      throw new Error("chain.escrowContractAddress is required for escrow contract calls");
    }
    if (!this.tokenAddress) {
      throw new Error("settlement.tokenAddress is required for escrow contract calls");
    }
  }

  async lock(orderId: string, payer: string, amount: string): Promise<string> {
    this.ensureContractReady();
    const { createWalletClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");

    const account = privateKeyToAccount(this.privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      transport: http(this.rpcUrl),
    });

    const tx = await client.writeContract({
      address: getAddress(this.contractAddress as `0x${string}`),
      abi: ESCROW_ABI,
      functionName: "lock",
      args: [
        orderId as `0x${string}`,
        getAddress(payer),
        BigInt(amount),
        getAddress(this.tokenAddress as `0x${string}`),
      ],
      chain: { id: this.chainId } as any,
    });

    return tx;
  }

  async release(orderId: string, payees: { address: string; amount: string }[]): Promise<string> {
    this.ensureContractReady();
    const { createWalletClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");

    const account = privateKeyToAccount(this.privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      transport: http(this.rpcUrl),
    });

    const tx = await client.writeContract({
      address: getAddress(this.contractAddress as `0x${string}`),
      abi: ESCROW_ABI,
      functionName: "release",
      args: [
        orderId as `0x${string}`,
        payees.map((p) => getAddress(p.address)),
        payees.map((p) => BigInt(p.amount)),
      ],
      chain: { id: this.chainId } as any,
    });

    return tx;
  }

  async refund(orderId: string, payer: string): Promise<string> {
    this.ensureContractReady();
    const { createWalletClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");

    const account = privateKeyToAccount(this.privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      transport: http(this.rpcUrl),
    });

    const tx = await client.writeContract({
      address: getAddress(this.contractAddress as `0x${string}`),
      abi: ESCROW_ABI,
      functionName: "refund",
      args: [orderId as `0x${string}`, getAddress(payer)],
      chain: { id: this.chainId } as any,
    });

    return tx;
  }
}
