export type RewardChainFamily = "evm" | "ton";

export type RewardAsset =
  | {
      type: "erc20";
      /** ERC-20 token contract address (EVM only). */
      tokenAddress: string;
    }
  | {
      type: "ton";
      /** TON native coin (Jetton support is not implemented yet). */
      asset: "ton";
    };

export type RewardStatus =
  | "reward_created"
  | "claim_issued"
  | "onchain_submitted"
  | "onchain_confirmed"
  | "onchain_failed"
  | "reward_cancelled";

/**
 * Backend-authoritative reward grant record.
 *
 * NOTE: This is a market-core state object (file/sqlite) and must be stable.
 * Only add fields; do not change semantics of existing ones.
 */
export type RewardGrant = {
  rewardId: string;

  chainFamily: RewardChainFamily;
  /** Chain/network identifier (e.g. "evm-mainnet", "ton-mainnet"). */
  network: string;

  recipient: string;
  amount: string;
  asset: RewardAsset;

  /** Server-side nonce for replay protection (also included in on-chain claim). */
  nonce: string;
  /** ISO timestamp string. Claim expires after this moment. */
  deadline: string;

  /** Business event hash (or stable reward spec hash) that led to this grant. */
  eventHash: string;

  status: RewardStatus;

  /** Optional issuance data for the on-chain claim path. */
  claim?: {
    /** EIP-712 typed data for EVM, or chain-specific claim payload. */
    payload: Record<string, unknown>;
    signature: string;
    issuedAt: string;
  };

  /** Optional on-chain evidence (tx hash / BOC / etc). */
  onchain?: {
    txHash: string;
    submittedAt: string;
    confirmedAt?: string;
  };

  attempts: number;
  lastError?: string;

  createdAt: string;
  updatedAt: string;
};

/**
 * Used-nonce index record for replay protection.
 *
 * nonceId must be stable, e.g. `${chainFamily}:${network}:${recipient}:${nonce}`.
 */
export type RewardNonceRecord = {
  nonceId: string;
  rewardId: string;
  chainFamily: RewardChainFamily;
  network: string;
  recipient: string;
  nonce: string;
  expiresAt: string;
  createdAt: string;
};
