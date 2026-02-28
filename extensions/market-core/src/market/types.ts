export type AssetType = "data" | "api" | "service";
export type DeliveryType = "download" | "api" | "service";

// Reward/claim primitives are defined in a leaf module to avoid bloating this file.
export type {
  RewardAsset,
  RewardChainFamily,
  RewardGrant,
  RewardNonceRecord,
  RewardStatus,
} from "./reward/types.js";

export type OfferStatus = "offer_created" | "offer_published" | "offer_closed";
export type OrderStatus =
  | "order_created"
  | "payment_locked"
  | "consent_granted"
  | "delivery_ready"
  | "delivery_completed"
  | "settlement_completed"
  | "order_cancelled"
  | "settlement_cancelled"
  | "consent_revoked";

export type DeliveryStatus = "delivery_ready" | "delivery_completed" | "delivery_revoked";
export type ConsentStatus = "consent_granted" | "consent_revoked";
export type SettlementStatus = "settlement_locked" | "settlement_released" | "settlement_refunded";

export type UsageScope = {
  purpose: string;
  region?: string;
  durationDays?: number;
  transferable?: boolean;
};

export type AssetMeta = {
  title?: string;
  description?: string;
  tags?: string[];
  schemaHash?: string;
};

export type Offer = {
  offerId: string;
  sellerId: string;
  assetId: string;
  assetType: AssetType;
  assetMeta: AssetMeta;
  price: number;
  currency: string;
  usageScope: UsageScope;
  deliveryType: DeliveryType;
  status: OfferStatus;
  offerHash: string;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  orderId: string;
  offerId: string;
  buyerId: string;
  quantity: number;
  status: OrderStatus;
  orderHash: string;
  createdAt: string;
  updatedAt: string;
  paymentTxHash?: string;
};

export type ConsentScope = {
  purpose: string;
  durationDays?: number;
  scopeHash?: string;
};

export type Consent = {
  consentId: string;
  orderId: string;
  scope: ConsentScope;
  signature: string;
  status: ConsentStatus;
  consentHash: string;
  grantedAt: string;
  revokedAt?: string;
  revokeReason?: string;
  revokeHash?: string;
};

export type DeliveryPayload =
  | { type: "download"; downloadUrl: string }
  | { type: "api"; accessToken: string; quota?: number }
  | { type: "service"; serviceQuota?: number; ticketId?: string };

export type DeliveryPayloadRef = {
  store: "credentials";
  ref: string;
};

export type Delivery = {
  deliveryId: string;
  orderId: string;
  deliveryType: DeliveryType;
  status: DeliveryStatus;
  deliveryHash: string;
  issuedAt: string;
  revokedAt?: string;
  revokeReason?: string;
  revokeHash?: string;
  payload?: DeliveryPayload;
  payloadRef?: DeliveryPayloadRef;
};

export type Settlement = {
  settlementId: string;
  orderId: string;
  status: SettlementStatus;
  amount: string;
  tokenAddress?: string;
  lockedAt?: string;
  releasedAt?: string;
  refundedAt?: string;
  refundReason?: string;
  lockTxHash?: string;
  releaseTxHash?: string;
  refundTxHash?: string;
  settlementHash?: string;
};

export type AuditEventKind =
  | "offer_created"
  | "offer_published"
  | "offer_updated"
  | "offer_closed"
  | "resource_published"
  | "resource_unpublished"
  | "order_created"
  | "order_cancelled"
  | "payment_locked"
  | "consent_granted"
  | "consent_revoked"
  | "delivery_issued"
  | "delivery_revoked"
  | "delivery_completed"
  | "lease_issued"
  | "lease_revoked"
  | "lease_expired"
  | "ledger_appended"
  | "settlement_released"
  | "settlement_refunded"
  | "dispute_opened"
  | "dispute_evidence_submitted"
  | "dispute_resolved"
  | "dispute_rejected"
  | "repair_retry"
  | "revocation_retry"
  | "revocation_succeeded"
  | "revocation_failed"
  | "token_economy_configured"
  | "token_minted"
  | "token_burned"
  | "token_governance_updated"
  | "reward_created"
  | "reward_status_updated"
  | "reward_claim_issued"
  | "reward_onchain_submitted"
  | "reward_onchain_confirmed"
  | "reward_onchain_failed"
  | "reward_cancelled"
  | "bridge_requested"
  | "bridge_in_flight"
  | "bridge_completed"
  | "bridge_failed";

export type AuditEvent = {
  id: string;
  kind: AuditEventKind;
  refId: string;
  hash?: string;
  actor?: string;
  timestamp: string;
  details?: Record<string, unknown>;
};

export type RevocationJobStatus = "pending" | "succeeded" | "failed";

export type RevocationJob = {
  jobId: string;
  deliveryId: string;
  orderId?: string;
  offerId?: string;
  consentId?: string;
  reason?: string;
  payloadHash: string;
  attempts: number;
  status: RevocationJobStatus;
  lastError?: string;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
};

export type DisputeStatus =
  | "dispute_opened"
  | "dispute_evidence_submitted"
  | "dispute_resolved"
  | "dispute_rejected";

export type DisputeResolution = "release" | "refund" | "partial";

export type DisputeEvidence = {
  evidenceId: string;
  summary: string;
  cid?: string;
  hash: string;
  submittedAt: string;
  actorId?: string;
};

export type Dispute = {
  disputeId: string;
  orderId: string;
  initiatorActorId: string;
  respondentActorId: string;
  arbitratorType: "platform" | "community" | "onchain";
  reason: string;
  status: DisputeStatus;
  resolution?: DisputeResolution;
  evidence: DisputeEvidence[];
  disputeHash: string;
  openedAt: string;
  resolvedAt?: string;
  updatedAt: string;
};

export type TokenEconomyStatus = "token_draft" | "token_active" | "token_paused";

export type TokenEconomyEmission = {
  rate: string;
  period: "day" | "week" | "month";
  cap?: string;
};

export type TokenEconomyBurnPolicy = {
  burnRateBps?: number;
};

export type TokenGovernancePolicy = {
  quorumBps?: number;
  votingPeriodDays?: number;
  proposalThreshold?: string;
};

export type TokenEconomyPolicy = {
  symbol: string;
  name?: string;
  decimals?: number;
  chain?: string;
  tokenAddress?: string;
  emission?: TokenEconomyEmission;
  burn?: TokenEconomyBurnPolicy;
  governance?: TokenGovernancePolicy;
};

export type TokenEconomyState = {
  status: TokenEconomyStatus;
  policy: TokenEconomyPolicy;
  totals: {
    /** Cumulative amount ever minted (monotonically increasing). */
    minted: string;
    /** Cumulative amount ever burned (monotonically increasing). */
    burned: string;
    /**
     * Net supply on-chain: `minted - burned`.
     * Currently equals `circulating` because locked/staked tracking is not yet implemented.
     */
    totalSupply: string;
    /**
     * Freely transferable supply: `totalSupply - locked - staked`.
     * Currently equals `totalSupply`; will diverge once locked/staked deductions are added.
     */
    circulating: string;
  };
  updatedAt: string;
};

export type CrossChainAsset = {
  assetId: string;
  symbol: string;
  decimals: number;
  chains: string[];
  addresses?: Record<string, string | undefined>;
};

export type BridgeRoute = {
  routeId: string;
  fromChain: string;
  toChain: string;
  assetSymbol: string;
  minAmount?: string;
  maxAmount?: string;
  feeBps?: number;
  estimatedSeconds?: number;
  provider?: string;
};

export type BridgeStatus =
  | "bridge_requested"
  | "bridge_in_flight"
  | "bridge_completed"
  | "bridge_failed";

export type BridgeTransfer = {
  bridgeId: string;
  orderId?: string;
  settlementId?: string;
  routeId: string;
  fromChain: string;
  toChain: string;
  assetSymbol: string;
  amount: string;
  status: BridgeStatus;
  txHash?: string;
  failureReason?: string;
  requestedAt: string;
  updatedAt: string;
};

export type BridgeTransferFilter = {
  orderId?: string;
  settlementId?: string;
  status?: BridgeStatus;
  fromChain?: string;
  toChain?: string;
  assetSymbol?: string;
  limit?: number;
};

/** Filter for bridge route lookups (independent of transfer-specific fields). */
export type BridgeRouteFilter = {
  fromChain?: string;
  toChain?: string;
  assetSymbol?: string;
};

// ---- Dual-Stack Payment Objects (TON + EVM) ----
// Ref: docs/web3/WEB3_DUAL_STACK_STRATEGY.md

/** Chain family for payment routing. */
export type PaymentChain = "ton" | "evm";

/** Live payments hit on-chain; simulated are off-chain dry-runs. */
export type PaymentMode = "live" | "simulated";

/** Intent to pay — created before on-chain tx. */
export type PaymentIntent = {
  intentId: string;
  chain: PaymentChain;
  asset: string;
  amount: string;
  currency: string;
  orderId?: string;
  createdAt: string;
};

/** On-chain payment confirmation. */
export type PaymentReceipt = {
  receiptId?: string;
  chain: PaymentChain;
  network?: string;
  txHash?: string;
  amount?: string;
  tokenAddress?: string;
  confirmedAt?: string;
  mode: PaymentMode;
};

/** Foreign-exchange quote snapshot. */
export type FXQuote = {
  quoteId: string;
  fromAsset: string;
  toAsset: string;
  rate: string;
  /** e.g. "cex:binance" | "oracle:pyth" | "manual" */
  source: string;
  expiresAt: string;
  roundingRule?: "floor" | "ceil" | "nearest";
};

/** Provider payout preference per chain. */
export type PayoutPreference = {
  providerActorId: string;
  chain: PaymentChain;
  settlementAsset: string;
  rewardToken?: string;
  discountBps?: number;
};

/** Unified reconciliation summary for a completed order. */
export type ReconciliationSummary = {
  orderId: string;
  settlementId: string;
  leaseId?: string;
  paymentReceipt?: PaymentReceipt;
  settlement: {
    status?: string;
    amount?: string;
    tokenAddress?: string;
    lockedAt?: string;
    releasedAt?: string;
    refundedAt?: string;
  };
  ledgerSummary?: {
    byUnit: Record<string, { quantity: string; cost: string }>;
    totalCost: string;
  };
  disputes?: { total: number; byStatus: Record<string, number> };
  archiveReceipt?: { cid?: string; uri?: string; updatedAt?: string };
  anchorReceipt?: { tx?: string; network?: string; block?: number; updatedAt?: string };
};
