import type { PaymentChain, PaymentConfirmationStatus } from "./payment-types.js";

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
  taskId?: string;
  taskBidId?: string;
};

export type ConsentScope = {
  purpose: string;
  durationDays?: number;
  scopeHash?: string;
};

export type ConsentReplayPolicy = {
  mode: "audit" | "erasure-check" | "retained";
  allowRedactedReplay?: boolean;
  deleteAfterRevoke?: boolean;
  retainUntil?: string;
  maxReplayViews?: number;
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
  retentionUntil?: string;
  replayPolicy?: ConsentReplayPolicy;
  subjectAssetIds?: string[];
  erasedAt?: string;
  eraseReason?: string;
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

/**
 * A sha256 artifact hash string.
 *
 * Format: `sha256:<hex>`.
 * Validation is enforced at runtime via `requireExecutionProof()`.
 */
export type Sha256ArtifactHash = `sha256:${string}`;

export type ExecutionProof = {
  type: "tlsnotary";
  artifactHash: Sha256ArtifactHash;
  /** ISO timestamp. */
  issuedAt: string;
  redactedFields?: string[];
  /** The verifier identifier (e.g. "tlsnotary"). */
  verifier: string;
};

export type ServiceProofStatus = "proof_submitted";

export type ServiceProof = {
  proofId: string;
  orderId: string;
  leaseId?: string;
  deliveryId?: string;
  actorId: string;
  proof: ExecutionProof;
  proofHash: string;
  submittedAt: string;
  status: ServiceProofStatus;
};

export type ServiceProofFilter = {
  orderId?: string;
  limit?: number;
};

export type SettlementStrategy = "one-shot" | "metered";

export type Settlement = {
  settlementId: string;
  orderId: string;
  status: SettlementStatus;
  amount: string;
  releasedAmount?: string;
  strategy?: SettlementStrategy;
  tokenAddress?: string;
  lockedAt?: string;
  releasedAt?: string;
  refundedAt?: string;
  refundReason?: string;
  lockTxHash?: string;
  releaseTxHash?: string;
  refundTxHash?: string;
  paymentChain?: PaymentChain;
  paymentNetwork?: string;
  paymentIntentId?: string;
  paymentReceiptId?: string;
  paymentTxHash?: string;
  paymentConfirmedAt?: string;
  confirmationStatus?: PaymentConfirmationStatus;
  fxQuoteId?: string;
  treasuryRouteId?: string;
  settlementHash?: string;
  revision?: number;
  updatedAt?: string;
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
  | "service_proof_submitted"
  | "acceptance_signed"
  | "acceptance_rejected"
  | "lease_issued"
  | "lease_revoked"
  | "lease_expired"
  | "ledger_appended"
  | "settlement_released"
  | "settlement_refunded"
  | "settlement_over_release_blocked"
  | "task_published"
  | "task_bid_submitted"
  | "task_awarded"
  | "task_result_submitted"
  | "task_result_reviewed"
  | "task_receipt_recorded"
  | "task_cancelled"
  | "task_expired"
  | "privacy_replay_generated"
  | "privacy_erasure_requested"
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

export type SettlementOperationKind = "lock" | "release" | "refund";

export type SettlementOperationStatus =
  | "pending"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed";

export type SettlementOperation = {
  operationId: string;
  orderId: string;
  settlementId?: string;
  kind: SettlementOperationKind;
  status: SettlementOperationStatus;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  response?: Record<string, unknown>;
  txHash?: string;
  requestId?: string;
  traceId?: string;
  confirmationStatus?: PaymentConfirmationStatus;
  manualInterventionRequired?: boolean;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  completedAt?: string;
  lastError?: string;
  nextAction?: string;
  createdAt: string;
  updatedAt: string;
};

export type SettlementOperationFilter = {
  orderId?: string;
  status?: SettlementOperationStatus;
  dueBefore?: string;
  limit?: number;
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

export type {
  FXQuote,
  PaymentChain,
  PaymentConfirmationStatus,
  PaymentIntent,
  PaymentMode,
  PaymentRail,
  PaymentReceipt,
  PayoutPreference,
  ReconciliationSummary,
  TreasuryRoute,
} from "./payment-types.js";

// ── Task Market Types ──

export type TaskOrderStatus =
  | "task_open"
  | "task_awarded"
  | "task_closed"
  | "task_cancelled"
  | "task_expired";

export type TaskOrder = {
  taskId: string;
  creatorActorId: string;
  title: string;
  summary?: string;
  requirements: string[];
  budget: { amount: string; currency: string };
  status: TaskOrderStatus;
  expiryAt: string;
  createdAt: string;
  updatedAt: string;
  taskHash: string;
  metadata?: Record<string, unknown>;
  awardedBidId?: string;
  orderId?: string;
  settlementId?: string;
  resultId?: string;
  closedAt?: string;
  cancellationReason?: string;
};

export type TaskOrderFilter = {
  taskId?: string;
  creatorActorId?: string;
  status?: TaskOrderStatus;
  limit?: number;
};

export type TaskBidStatus = "bid_submitted" | "bid_withdrawn" | "bid_accepted" | "bid_rejected";

export type TaskBid = {
  bidId: string;
  taskId: string;
  bidderActorId: string;
  price: string;
  currency: string;
  etaHours?: number;
  summary?: string;
  status: TaskBidStatus;
  bidHash: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskBidFilter = {
  taskId?: string;
  bidderActorId?: string;
  status?: TaskBidStatus;
  limit?: number;
};

export type TaskResultStatus = "result_submitted" | "result_accepted" | "result_rejected";

export type TaskResult = {
  resultId: string;
  taskId: string;
  bidId: string;
  delivererActorId: string;
  summary?: string;
  artifacts: string[];
  proofIds?: string[];
  resultHash: string;
  status: TaskResultStatus;
  submittedAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
};

export type TaskResultFilter = {
  taskId?: string;
  bidId?: string;
  delivererActorId?: string;
  status?: TaskResultStatus;
  limit?: number;
};

export type TaskReceiptStatus =
  | "receipt_pending"
  | "receipt_settled"
  | "receipt_refunded"
  | "receipt_disputed";

export type TaskReceipt = {
  receiptId: string;
  taskId: string;
  bidId: string;
  resultId: string;
  payerActorId: string;
  payeeActorId: string;
  amount: string;
  currency: string;
  settlementId: string;
  status: TaskReceiptStatus;
  receiptHash: string;
  createdAt: string;
  updatedAt: string;
  settledAt?: string;
  disputeId?: string;
};

export type TaskReceiptFilter = {
  taskId?: string;
  bidId?: string;
  payerActorId?: string;
  payeeActorId?: string;
  settlementId?: string;
  status?: TaskReceiptStatus;
  limit?: number;
};

// ── Privacy / Consent Replay Types ──

export type PrivacyReplaySummary = {
  title: string;
  purpose: string;
  retentionAction: "delete_on_revoke" | "retain" | "manual_review";
  redactedFields: string[];
  evidenceRefs: string[];
  timeline: Array<{ timestamp: string; kind: string; details?: Record<string, unknown> }>;
};

export type PrivacyReplayStatus = "replay_generated" | "replay_viewed" | "replay_erased";

export type PrivacyReplay = {
  replayId: string;
  consentId: string;
  orderId: string;
  taskId?: string;
  actorId: string;
  status: PrivacyReplayStatus;
  summary: PrivacyReplaySummary;
  replayHash: string;
  generatedAt: string;
  updatedAt: string;
  erasedAt?: string;
  eraseReason?: string;
};

export type PrivacyReplayFilter = {
  consentId?: string;
  orderId?: string;
  actorId?: string;
  status?: PrivacyReplayStatus;
  limit?: number;
};
