import {
  getEVMProvider,
  initBlockchainFactory,
  type IProviderEVM,
} from "@openclaw/blockchain-adapter";
import { encodeFunctionData, getAddress } from "viem";
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

let blockchainFactoryReady = false;

function ensureBlockchainFactory() {
  if (!blockchainFactoryReady) {
    initBlockchainFactory();
    blockchainFactoryReady = true;
  }
}

export class EscrowAdapter {
  private readonly chainId: number;
  private readonly privateKey?: string;
  private readonly contractAddress?: string;
  private readonly tokenAddress?: string;
  private readonly mode: SettlementConfig["mode"];

  constructor(chain: ChainConfig, settlement: SettlementConfig) {
    this.chainId = CHAIN_IDS[chain.network] ?? 8453;
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

  private async loadEvmProvider(): Promise<IProviderEVM> {
    this.ensureContractReady();
    ensureBlockchainFactory();

    const provider = getEVMProvider(this.chainId) as IProviderEVM;
    if (!provider.isConnected) {
      await provider.connect({ privateKey: this.privateKey as `0x${string}` });
    }
    return provider;
  }

  async lock(orderId: string, payer: string, amount: string, _payee?: string): Promise<string> {
    const provider = await this.loadEvmProvider();
    const data = encodeFunctionData({
      abi: ESCROW_ABI,
      functionName: "lock",
      args: [
        orderId as `0x${string}`,
        getAddress(payer),
        BigInt(amount),
        getAddress(this.tokenAddress as `0x${string}`),
      ],
    });

    return provider.sendTransaction({
      to: getAddress(this.contractAddress as `0x${string}`),
      value: 0n,
      data,
    });
  }

  async release(orderId: string, payees: { address: string; amount: string }[]): Promise<string> {
    const provider = await this.loadEvmProvider();
    const data = encodeFunctionData({
      abi: ESCROW_ABI,
      functionName: "release",
      args: [
        orderId as `0x${string}`,
        payees.map((p) => getAddress(p.address)),
        payees.map((p) => BigInt(p.amount)),
      ],
    });

    return provider.sendTransaction({
      to: getAddress(this.contractAddress as `0x${string}`),
      value: 0n,
      data,
    });
  }

  async refund(orderId: string, payer: string): Promise<string> {
    const provider = await this.loadEvmProvider();
    const data = encodeFunctionData({
      abi: ESCROW_ABI,
      functionName: "refund",
      args: [orderId as `0x${string}`, getAddress(payer)],
    });

    return provider.sendTransaction({
      to: getAddress(this.contractAddress as `0x${string}`),
      value: 0n,
      data,
    });
  }
}
