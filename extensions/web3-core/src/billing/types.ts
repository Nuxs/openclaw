/**
 * Billing / quota types — track per-session and per-wallet usage,
 * gate tool calls when quota is exhausted.
 */

import type {
  FXQuote,
  PaymentConfirmationStatus,
  PaymentIntent,
  TreasuryRoute,
} from "@openclaw/market-core";

export type UsageRecord = {
  /** Hashed session id */
  sessionIdHash: string;
  /** Wallet address (if bound) */
  walletAddress?: string;
  /** Credits consumed so far */
  creditsUsed: number;
  /** Max credits allowed */
  creditsQuota: number;
  /** Number of LLM calls */
  llmCalls: number;
  /** Number of tool calls */
  toolCalls: number;
  /** ISO timestamp of last activity */
  lastActivity: string;
};

export type Invoice = {
  id: string;
  walletAddress: string;
  amount: string;
  tokenAddress?: string;
  /** "pending" | "paid" | "expired" */
  status: string;
  createdAt: string;
  paidTx?: string;
};

export type BillingCheckResult = {
  allowed: boolean;
  remaining: number;
  reason?: string;
};

export type PaymentOrchestrationStatus =
  | "authorized"
  | "settlement_pending"
  | "settlement_submitted"
  | "consumed"
  | "failed";

export type PaymentSettlementContext = {
  orderId?: string;
  settlementId?: string;
  payer?: string;
  actorId?: string;
};

export type PaymentRequiredInvoice = {
  invoiceId: string;
  provider: string;
  chain: "evm" | "ton";
  asset: string;
  amount: string;
  payTo: string;
  nonce: string;
  expiresAt: string;
  idempotencyKey?: string;
  network?: string;
  requestId?: string;
  tool?: string;
  settlement?: PaymentSettlementContext;
  quote?: FXQuote;
  metadata?: Record<string, unknown>;
};

export type PaymentResumeToken = {
  invoiceId: string;
  paymentReceiptId: string;
  txHash?: string;
  chain: "evm" | "ton";
  issuedAt: string;
  expiresAt: string;
  tokenVersion?: 1 | 2;
  nonce?: string;
  signature?: string;
  network?: string;
  asset?: string;
  amount?: string;
  payTo?: string;
  payer?: string;
  orderId?: string;
  settlementId?: string;
  quoteId?: string;
  intentId?: string;
};

export type BillingPaymentReceipt = {
  receiptId: string;
  chain: "evm" | "ton";
  network?: string;
  txHash?: string;
  amount?: string;
  tokenAddress?: string;
  confirmedAt: string;
  mode: "live" | "simulated";
  confirmationStatus?: PaymentConfirmationStatus;
  payer?: string;
  payTo?: string;
  orderId?: string;
  settlementId?: string;
  intentId?: string;
  treasuryRouteId?: string;
};

export type PaymentTraceRef = {
  requestId?: string;
  idempotencyKey: string;
  invoiceId: string;
  paymentReceiptId: string;
  txHash?: string;
  toolName?: string;
  chain?: "evm" | "ton";
  network?: string;
  amount?: string;
  status?: PaymentOrchestrationStatus;
  reused?: boolean;
  orderId?: string;
  settlementId?: string;
  confirmationStatus?: PaymentConfirmationStatus;
  intentId?: string;
  fxQuoteId?: string;
  treasuryRouteId?: string;
  createdAt: string;
  updatedAt?: string;
};

export type PaymentOrchestrationRecord = {
  status: PaymentOrchestrationStatus;
  reused: boolean;
  paymentIntent?: PaymentIntent;
  fxQuote?: FXQuote;
  treasuryRoute?: TreasuryRoute;
  settlement?: PaymentSettlementContext;
};
