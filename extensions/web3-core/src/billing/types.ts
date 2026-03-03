/**
 * Billing / quota types — track per-session and per-wallet usage,
 * gate tool calls when quota is exhausted.
 */

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
};

export type PaymentTraceRef = {
  requestId?: string;
  idempotencyKey: string;
  invoiceId: string;
  paymentReceiptId: string;
  txHash?: string;
  toolName?: string;
  createdAt: string;
};
