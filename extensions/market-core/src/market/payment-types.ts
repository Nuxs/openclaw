export type PaymentChain = "ton" | "evm";

export type PaymentMode = "live" | "simulated";

export type PaymentConfirmationStatus =
  | "pending"
  | "submitted"
  | "confirmed"
  | "finalized"
  | "failed"
  | "simulated";

export type PaymentRail = "direct" | "x402";

export type TreasuryRoute = {
  routeId: string;
  sourceChain: PaymentChain;
  settlementChain: PaymentChain;
  sourceAsset: string;
  settlementAsset: string;
  strategy: "direct" | "bridge";
  bridgeRouteId?: string;
  provider?: string;
  reason?: string;
};

export type PaymentIntent = {
  intentId: string;
  chain: PaymentChain;
  asset: string;
  amount: string;
  currency: string;
  orderId?: string;
  requestId?: string;
  idempotencyKey?: string;
  provider?: string;
  payTo?: string;
  payer?: string;
  network?: string;
  mode?: PaymentMode;
  quoteId?: string;
  treasuryRouteId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type PaymentReceipt = {
  receiptId?: string;
  chain: PaymentChain;
  network?: string;
  txHash?: string;
  amount?: string;
  tokenAddress?: string;
  confirmedAt?: string;
  mode: PaymentMode;
  confirmationStatus?: PaymentConfirmationStatus;
  rail?: PaymentRail;
  payer?: string;
  payTo?: string;
  orderId?: string;
  settlementId?: string;
  intentId?: string;
  treasuryRouteId?: string;
  explorerUrl?: string;
};

export type FXQuote = {
  quoteId: string;
  fromAsset: string;
  toAsset: string;
  rate: string;
  /** e.g. "cex:binance" | "oracle:pyth" | "manual" */
  source: string;
  expiresAt: string;
  quotedAt?: string;
  fromAmount?: string;
  toAmount?: string;
  chain?: PaymentChain;
  reference?: string;
  roundingRule?: "floor" | "ceil" | "nearest";
};

export type PayoutPreference = {
  providerActorId: string;
  chain: PaymentChain;
  settlementAsset: string;
  rewardToken?: string;
  discountBps?: number;
};

export type ReconciliationSummary = {
  orderId: string;
  settlementId: string;
  leaseId?: string;
  paymentIntent?: PaymentIntent;
  paymentReceipt?: PaymentReceipt;
  fxQuote?: FXQuote;
  treasuryRoute?: TreasuryRoute;
  paymentTrace?: {
    requestId?: string;
    idempotencyKey?: string;
    invoiceId?: string;
    paymentReceiptId?: string;
    txHash?: string;
    toolName?: string;
    chain?: PaymentChain;
    network?: string;
    amount?: string;
    status?: string;
    reused?: boolean;
    confirmationStatus?: PaymentConfirmationStatus;
    intentId?: string;
    fxQuoteId?: string;
    treasuryRouteId?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  settlement: {
    status?: string;
    amount?: string;
    releasedAmount?: string;
    strategy?: import("./types.js").SettlementStrategy;
    tokenAddress?: string;
    lockedAt?: string;
    releasedAt?: string;
    refundedAt?: string;
    paymentChain?: PaymentChain;
    paymentNetwork?: string;
    confirmationStatus?: PaymentConfirmationStatus;
  };
  ledgerSummary?: {
    byUnit: Record<string, { quantity: string; cost: string }>;
    totalCost: string;
  };
  disputes?: { total: number; byStatus: Record<string, number> };
  serviceProofs?: {
    total: number;
    byStatus: Record<string, number>;
    latestSubmittedAt?: string;
    artifactHashes: import("./types.js").Sha256ArtifactHash[];
  };
  archiveReceipt?: { cid?: string; uri?: string; updatedAt?: string };
  anchorReceipt?: { tx?: string; network?: string; block?: number; updatedAt?: string };
};
