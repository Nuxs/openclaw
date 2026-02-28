/**
 * EVM Reward Claim adapter — EIP-712 typed-data signing for reward claims.
 *
 * Extracted from the reward handler to improve testability and keep the handler
 * focused on orchestration. Mirrors the adapter pattern used by `TonEscrowAdapter`
 * and `EvmAnchorAdapter`.
 */

import type { ChainConfig } from "../../config.js";

/** Well-known chain-id mapping for common EVM networks. */
const CHAIN_ID_BY_NETWORK: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  optimism: 10,
  arbitrum: 42161,
  sepolia: 11155111,
};

export type EvmClaimInput = {
  recipient: string;
  tokenAddress: string;
  amount: string;
  nonce: string;
  deadline: string;
  eventHash: string;
};

export type EvmClaimResult = {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
  distributorAddress: string;
  signature: string;
};

export class EvmRewardClaimAdapter {
  private readonly chainConfig: ChainConfig;

  constructor(chainConfig: ChainConfig) {
    this.chainConfig = chainConfig;
  }

  /**
   * Sign an EIP-712 RewardClaim and return the full typed-data envelope + signature.
   *
   * Throws if required configuration (privateKey, rewardDistributorAddress) is missing.
   */
  async signClaim(input: EvmClaimInput): Promise<EvmClaimResult> {
    const privateKey = this.chainConfig.privateKey?.trim();
    if (!privateKey || !privateKey.startsWith("0x")) {
      throw new Error("E_INVALID_ARGUMENT: chain.privateKey is required for claim issuance");
    }

    const distributorAddress = this.chainConfig.rewardDistributorAddress?.trim();
    if (!distributorAddress) {
      throw new Error(
        "E_INVALID_ARGUMENT: chain.rewardDistributorAddress is required for evm claim issuance",
      );
    }

    const { getAddress, keccak256, toHex } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");

    const chainId = CHAIN_ID_BY_NETWORK[this.chainConfig.network] ?? 8453;

    const deadlineMs = Date.parse(input.deadline);
    if (Number.isNaN(deadlineMs)) {
      throw new Error("E_INVALID_ARGUMENT: deadline must be a valid ISO timestamp");
    }
    const deadlineSeconds = BigInt(Math.floor(deadlineMs / 1000));

    const nonceHex = input.nonce.startsWith("0x") ? input.nonce : `0x${input.nonce}`;
    const nonce = BigInt(nonceHex);
    const amount = BigInt(input.amount);

    const eventHash =
      input.eventHash.startsWith("0x") && input.eventHash.length === 66
        ? (input.eventHash as `0x${string}`)
        : (keccak256(toHex(input.eventHash)) as `0x${string}`);

    const domain = {
      name: "OpenClawRewardDistributor",
      version: "1",
      chainId,
      verifyingContract: getAddress(distributorAddress),
    } as const;

    const types = {
      RewardClaim: [
        { name: "recipient", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "eventHash", type: "bytes32" },
      ],
    } as const;

    const message = {
      recipient: getAddress(input.recipient),
      token: getAddress(input.tokenAddress),
      amount,
      nonce,
      deadline: deadlineSeconds,
      eventHash,
    } as const;

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: "RewardClaim",
      message,
    });

    return {
      domain: domain as unknown as Record<string, unknown>,
      types: types as unknown as Record<string, unknown>,
      primaryType: "RewardClaim",
      message: message as unknown as Record<string, unknown>,
      distributorAddress: getAddress(distributorAddress),
      signature,
    };
  }
}
