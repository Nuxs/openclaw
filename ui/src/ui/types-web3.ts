/**
 * Web3 / Market type definitions — overlay module.
 *
 * All Web3 and Market-related types are defined here and re-exported
 * from `types.ts` so upstream merge conflicts stay minimal (single
 * import + re-export line).
 */

export type Web3BillingUsage = {
  creditsUsed: number;
  creditsQuota: number;
  llmCalls: number;
  toolCalls: number;
  lastActivity: string;
};

export type Web3BillingSummary = {
  enabled: boolean;
  sessionIdHash: string;
  usage: Web3BillingUsage | null;
};

export type Web3StatusSummary = {
  auditEventsRecent: number;
  auditLastAt: string | null;
  archiveProvider: string | null;
  archiveLastCid: string | null;
  archivePending: number;
  anchorNetwork: string | null;
  anchorLastTx: string | null;
  pendingAnchors: number;
  anchoringEnabled: boolean;
  resources?: {
    providers: number;
    total: number;
    byKind: Record<string, number>;
  };
  disputes?: {
    total: number;
    byStatus: Record<string, number>;
    open: number;
    investigating: number;
    resolved: number;
    rejected: number;
    expired: number;
  };
  alerts?: {
    total: number;
    active: number;
    byLevel: Record<string, number>;
  };
  queues?: {
    anchors: { pending: number; failed: number };
    archives: { pending: number; failed: number };
    settlements: { pending: number; failed: number };
  };
  brain?: {
    source: "web3/decentralized" | "centralized" | null;
    provider: string | null;
    model: string | null;
    availability: "ok" | "degraded" | "unavailable" | null;
  };
  billing?: {
    status: "active" | "exhausted" | "unbound";
    credits: number;
  };
  settlement?: {
    pending: number;
  };
  identity?: {
    siweEnabled: boolean;
    bindingsCount: number;
    bindings: Array<{
      address: string;
      chainId: number;
      verifiedAt: string;
      ensName: string | null;
    }>;
    primary: { address: string; ensName: string | null } | null;
  };
};

export type Web3IndexResourceKind = "model" | "search" | "storage";

export type Web3IndexResource = {
  resourceId: string;
  kind: Web3IndexResourceKind;
  label?: string;
  description?: string;
  tags?: string[];
  price?: string;
  unit?: string;
};

export type Web3IndexSignature = {
  scheme: "ed25519";
  publicKey: string;
  signature: string;
  payloadHash: string;
  signedAt: string;
};

export type Web3IndexEntry = {
  providerId: string;
  resources: Web3IndexResource[];
  updatedAt: string;
  expiresAt?: string;
  lastHeartbeatAt?: string;
  signature?: Web3IndexSignature;
};

export type Web3IndexStats = {
  providers: number;
  resources: number;
  byKind: Record<string, number>;
};

export type Web3AlertSeverity = "p0" | "p1";

export type Web3Alert = {
  rule: string;
  severity: Web3AlertSeverity;
  triggered: boolean;
  value: number;
};

export type Web3MetricsSnapshot = {
  audit: { total: number; byKind: Record<string, number> };
  anchoring: { enabled: boolean; pending: number };
  archive: { provider: string | null; pending: number };
  settlement: { pending: number };
  billing: { enabled: boolean; usageRecords: number; creditsUsed: number };
  resources: { providers: number; total: number; byKind: Record<string, number> };
  alerts: Web3Alert[];
};

export type Web3MonitorSnapshot = {
  web3: Web3MetricsSnapshot;
  market: MarketMetricsSnapshot | null;
  marketError: string | null;
};

export type MarketStatusSummary = {
  offers: Record<string, number>;
  orders: Record<string, number>;
  deliveries: Record<string, number>;
  settlements: Record<string, number>;
  leases: {
    total: number;
    byStatus: Record<string, number>;
    active: number;
    expired: number;
    revoked: number;
  };
  disputes: {
    total: number;
    byStatus: Record<string, number>;
    open: number;
    resolved: number;
    rejected: number;
  };
  revocations: {
    total: number;
    pending: number;
    failed: number;
  };
  audit: {
    events: number;
    anchorPending: number;
  };
  repair: {
    candidates: number;
    expiredActive: number;
    orphaned: number;
  };
  totals: {
    offers: number;
    orders: number;
    deliveries: number;
    settlements: number;
  };
};

export type MarketAlertSeverity = "p0" | "p1";

export type MarketAlert = {
  rule: string;
  severity: MarketAlertSeverity;
  triggered: boolean;
  value: number;
};

export type MarketMetricsGroup = {
  total: number;
  byStatus: Record<string, number>;
};

export type MarketSettlementMetrics = MarketMetricsGroup & {
  failureRate: number;
};

export type MarketLeaseMetrics = MarketMetricsGroup & {
  active: number;
  expired: number;
  revoked: number;
};

export type MarketDisputeMetrics = MarketMetricsGroup & {
  open: number;
  resolved: number;
  rejected: number;
};

export type MarketRevocationMetrics = {
  total: number;
  pending: number;
  failed: number;
};

export type MarketAuditMetrics = {
  events: number;
  anchorPending: number;
};

export type MarketMetricsSnapshot = {
  offers: MarketMetricsGroup;
  orders: MarketMetricsGroup;
  settlements: MarketSettlementMetrics;
  leases: MarketLeaseMetrics;
  disputes: MarketDisputeMetrics;
  revocations: MarketRevocationMetrics;
  audit: MarketAuditMetrics;
  alerts: MarketAlert[];
};

export type MarketReputationSummary = {
  providerActorId?: string;
  resourceId?: string;
  score: number;
  signals: string[];
  leases: {
    total: number;
    byStatus: Record<string, number>;
  };
  disputes: {
    total: number;
    byStatus: Record<string, number>;
  };
  ledger: {
    totalCost: string;
    currency: string;
  };
};

export type TokenEconomyState = {
  status: "token_draft" | "token_active" | "token_paused";
  policy: {
    symbol: string;
    name?: string;
    decimals?: number;
    chain?: string;
    tokenAddress?: string;
    emission?: {
      rate: string;
      period: "day" | "week" | "month";
      cap?: string;
    };
    burn?: {
      burnRateBps?: number;
    };
    governance?: {
      quorumBps?: number;
      votingPeriodDays?: number;
      proposalThreshold?: string;
    };
  };
  totals: {
    minted: string;
    burned: string;
    totalSupply: string;
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

export type BridgeTransfer = {
  bridgeId: string;
  orderId?: string;
  settlementId?: string;
  routeId: string;
  fromChain: string;
  toChain: string;
  assetSymbol: string;
  amount: string;
  status: "bridge_requested" | "bridge_in_flight" | "bridge_completed" | "bridge_failed";
  txHash?: string;
  failureReason?: string;
  requestedAt: string;
  updatedAt: string;
};

export type BridgeRoutesSnapshot = {
  assets: CrossChainAsset[];
  routes: BridgeRoute[];
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

export type MarketResourceKind = "model" | "search" | "storage";
export type MarketResourceStatus = "resource_draft" | "resource_published" | "resource_unpublished";
export type MarketLeaseStatus = "lease_active" | "lease_revoked" | "lease_expired";
export type MarketDisputeStatus =
  | "dispute_opened"
  | "dispute_evidence_submitted"
  | "dispute_resolved"
  | "dispute_rejected";

export type MarketPrice = {
  unit: "token" | "call" | "query" | "gb_day" | "put" | "get";
  amount: string;
  currency: string;
  tokenAddress?: string;
};

export type MarketResource = {
  resourceId: string;
  kind: MarketResourceKind;
  status: MarketResourceStatus;
  providerActorId: string;
  offerId?: string;
  label: string;
  description?: string;
  tags?: string[];
  price: MarketPrice;
  updatedAt?: string;
};

export type MarketLease = {
  leaseId: string;
  resourceId: string;
  kind: MarketResourceKind;
  providerActorId: string;
  consumerActorId: string;
  orderId: string;
  status: MarketLeaseStatus;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
};

export type MarketLedgerSummary = {
  byUnit: Record<string, { quantity: string; cost: string }>;
  totalCost: string;
  currency: string;
};

export type MarketLedgerUnit = "token" | "call" | "query" | "byte";

export type MarketLedgerEntry = {
  ledgerId: string;
  timestamp: string;
  leaseId: string;
  resourceId: string;
  kind: MarketResourceKind;
  providerActorId: string;
  consumerActorId: string;
  unit: MarketLedgerUnit;
  quantity: string;
  cost: string;
  currency: string;
  tokenAddress?: string;
  sessionId?: string;
  runId?: string;
  entryHash: string;
};

export type MarketDispute = {
  disputeId: string;
  orderId: string;
  initiatorActorId: string;
  respondentActorId: string;
  reason: string;
  status: MarketDisputeStatus;
  openedAt: string;
  resolvedAt?: string;
};

export type MarketResourceStatusFilter = MarketResourceStatus | "all";
export type MarketLeaseStatusFilter = MarketLeaseStatus | "all";
export type MarketDisputeStatusFilter = MarketDisputeStatus | "all";
export type MarketLedgerUnitFilter = MarketLedgerUnit | "all";

export type MarketResourceSort = "updated_desc" | "updated_asc";
export type MarketLeaseSort = "issued_desc" | "issued_asc";
export type MarketDisputeSort = "opened_desc" | "opened_asc";
export type MarketLedgerSort = "time_desc" | "time_asc";

export type MarketFilters = {
  resourceSearch: string;
  resourceStatus: MarketResourceStatusFilter;
  resourceSort: MarketResourceSort;
  leaseSearch: string;
  leaseStatus: MarketLeaseStatusFilter;
  leaseSort: MarketLeaseSort;
  disputeSearch: string;
  disputeStatus: MarketDisputeStatusFilter;
  disputeSort: MarketDisputeSort;
  ledgerSearch: string;
  ledgerUnit: MarketLedgerUnitFilter;
  ledgerSort: MarketLedgerSort;
};

// ── Task Market View Models ──

export type TaskOrderView = {
  taskId: string;
  title: string;
  status: string;
  creatorActorId: string;
  budget: { amount: string; currency: string };
  requirements: string[];
  expiryAt: string;
  createdAt: string;
  awardedBidId?: string;
  bidCount?: number;
};

export type TaskBidView = {
  bidId: string;
  taskId: string;
  bidderActorId: string;
  price: string;
  currency: string;
  status: string;
  etaHours?: number;
  summary?: string;
  createdAt: string;
};

export type TaskResultView = {
  resultId: string;
  taskId: string;
  bidId: string;
  delivererActorId: string;
  status: string;
  artifacts: string[];
  submittedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
};

export type TaskReceiptView = {
  receiptId: string;
  taskId: string;
  amount: string;
  currency: string;
  status: string;
  settledAt?: string;
  disputeId?: string;
};

export type MarketTaskSummary = {
  openTasks: number;
  awardedTasks: number;
  closedTasks: number;
  totalBids: number;
  pendingResults: number;
  settledReceipts: number;
  disputedReceipts: number;
};

// ── Privacy View Models ──

export type ConsentView = {
  consentId: string;
  orderId: string;
  status: string;
  purpose: string;
  durationDays?: number;
  grantedAt: string;
  revokedAt?: string;
  retentionUntil?: string;
};

export type PrivacyAssetView = {
  consentId: string;
  assetId: string;
  title: string;
  purpose: string;
  status: string;
  taskId?: string;
};

export type PrivacyReplayView = {
  replayId: string;
  consentId: string;
  status: string;
  retentionAction: string;
  generatedAt: string;
  erasedAt?: string;
};

export type MarketPrivacySummary = {
  activeConsents: number;
  revokedConsents: number;
  pendingErasure: number;
  totalReplays: number;
  assetCount: number;
};

// ── Ops View Models ──

export type OpsAlertView = {
  id: string;
  level: string;
  category: string;
  status: string;
  message: string;
  timestamp: string;
};

export type OpsHealthProbe = {
  name: string;
  status: "healthy" | "degraded" | "down";
  lastCheck: string;
  details?: string;
};

export type MarketPresetMode = "single-node" | "trusted-circle" | "hybrid-cloud-edge";
export type MarketPresetIntent = "consumer" | "provider" | "hybrid";
export type MarketRuntimeHintKind = "ollama" | "lmstudio" | "openai-compat" | "custom";

export type MarketPresetOperation = {
  op: "set" | "setIfMissing" | "setIfEmpty" | "mergeStringSet";
  path: Array<string | number>;
  value: unknown;
  summary: string;
};

export type MarketPresetRole = {
  id: string;
  label: string;
  responsibility: string;
};

export type MarketDetectedProvider = {
  label: string;
  source: "configured" | "hint";
  runtime: MarketRuntimeHintKind;
  offerBackend: "openai-compat" | "custom";
  models: string[];
  publishable: boolean;
  note?: string;
};

export type MarketPresetPreview = {
  mode: MarketPresetMode;
  intent: MarketPresetIntent;
  summary: string;
  layout: {
    pattern: string;
    trustDomain: string;
    roles: MarketPresetRole[];
    validationScenarios: string[];
  };
  detectedProviders: MarketDetectedProvider[];
  operations: MarketPresetOperation[];
  checks: GaReadinessCheck[];
  nextSteps: string[];
};

export type MarketPresetVerification = {
  mode: MarketPresetMode;
  healthy: boolean;
  summary: string;
  readiness: GaReadiness;
  metrics: {
    publishedResources: number;
    activeLeases: number;
    activeAlerts: number;
    discoveryEnabled: boolean;
    consumerEnabled: boolean;
    advertiseToMarket: boolean;
    providerListenEnabled: boolean;
    providerBind?: string;
    walletReady: boolean;
    paymentReady: boolean;
    billingEnabled: boolean;
    autopayEnabled: boolean;
  };
  recommendedActions: string[];
};

export type MarketOpsSummary = {
  activeAlerts: number;
  alertsByLevel: Record<string, number>;
  healthProbes: OpsHealthProbe[];
  walletHealthy: boolean;
  discoveryHealthy: boolean;
  paymentHealthy: boolean;
  settlementHealthy: boolean;
  preset: MarketPresetVerification | null;
};

// ── GA Readiness ──

export type GaReadinessCheck = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
  action?: string;
};

export type GaReadiness = {
  ready: boolean;
  checks: GaReadinessCheck[];
  passCount: number;
  warnCount: number;
  failCount: number;
};

export type {
  MarketExecutionSummaryView,
  MarketExecutionTraceView,
} from "./types-web3-market-execution.ts";
