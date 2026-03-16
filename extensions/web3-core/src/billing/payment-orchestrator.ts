import { randomUUID } from "node:crypto";
import type {
  PaymentConfirmationStatus,
  PaymentIntent,
  TreasuryRoute,
} from "@openclaw/market-core";
import type { PaymentRequiredRecord, Web3StateStore } from "../state/store.js";
import type {
  BillingPaymentReceipt,
  PaymentOrchestrationStatus,
  PaymentRequiredInvoice,
  PaymentResumeToken,
  PaymentTraceRef,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export function isAutopayCircuitOpen(store: Web3StateStore): boolean {
  const cooldownUntil = store.getX402AutopayStats().cooldownUntil;
  if (!cooldownUntil) {
    return false;
  }
  const cooldownUntilMs = Date.parse(cooldownUntil);
  return !Number.isNaN(cooldownUntilMs) && cooldownUntilMs > Date.now();
}

export function buildPaymentIntent(params: {
  invoice: PaymentRequiredInvoice;
  idempotencyKey: string;
  requestId?: string;
  toolName?: string;
  network?: string;
  createdAt: string;
  quoteId?: string;
}): PaymentIntent {
  const { invoice } = params;
  return {
    intentId: randomUUID(),
    chain: invoice.chain,
    asset: invoice.asset,
    amount: invoice.amount,
    currency: invoice.quote?.toAsset ?? invoice.asset,
    orderId: invoice.settlement?.orderId,
    requestId: params.requestId,
    idempotencyKey: params.idempotencyKey,
    provider: invoice.provider,
    payTo: invoice.payTo,
    payer: invoice.settlement?.payer,
    network: params.network ?? invoice.network,
    mode: "live",
    quoteId: params.quoteId,
    createdAt: params.createdAt,
    metadata: invoice.metadata
      ? {
          ...invoice.metadata,
          tool: params.toolName,
        }
      : params.toolName
        ? { tool: params.toolName }
        : undefined,
  };
}

export function buildPaymentRequiredRecord(params: {
  idempotencyKey: string;
  requestId?: string;
  toolName?: string;
  invoiceHash: string;
  invoice: PaymentRequiredInvoice;
  resumeToken: PaymentResumeToken;
  createdAt: string;
  updatedAt?: string;
  maxRetries?: number;
  network?: string;
  status: PaymentOrchestrationStatus;
  reused: boolean;
  confirmationStatus?: PaymentConfirmationStatus;
  paymentIntent?: PaymentIntent;
  treasuryRoute?: TreasuryRoute;
  lastError?: string;
}): PaymentRequiredRecord {
  return {
    idempotencyKey: params.idempotencyKey,
    requestId: params.requestId,
    toolName: params.toolName,
    invoiceHash: params.invoiceHash,
    resumeToken: params.resumeToken,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt ?? params.createdAt,
    maxRetries: params.maxRetries,
    network: params.network ?? params.invoice.network,
    amount: params.invoice.amount,
    asset: params.invoice.asset,
    provider: params.invoice.provider,
    payTo: params.invoice.payTo,
    status: params.status,
    reused: params.reused,
    confirmationStatus: params.confirmationStatus,
    paymentIntent: params.paymentIntent,
    settlement: params.invoice.settlement,
    fxQuote: params.invoice.quote,
    treasuryRoute: params.treasuryRoute,
    lastError: params.lastError,
  };
}

export function queueSettlementForPaymentRecord(
  store: Web3StateStore,
  record: PaymentRequiredRecord,
): PaymentRequiredRecord {
  const settlement = record.settlement;
  if (!settlement?.orderId || !settlement.payer) {
    return record;
  }
  const existing = store
    .getPendingSettlements()
    .find((entry) => entry.sessionIdHash === record.idempotencyKey);
  store.upsertPendingSettlement({
    sessionIdHash: record.idempotencyKey,
    createdAt: existing?.createdAt ?? record.createdAt,
    orderId: settlement.orderId,
    payer: settlement.payer,
    amount: record.amount,
    actorId: settlement.actorId ?? settlement.payer,
    paymentIntent: record.paymentIntent,
    paymentReceiptId: record.resumeToken.paymentReceiptId,
    paymentChain: record.resumeToken.chain,
    paymentNetwork: record.network ?? record.resumeToken.network,
    paymentTxHash: record.resumeToken.txHash,
    confirmationStatus: record.confirmationStatus,
    fxQuote: record.fxQuote,
    treasuryRoute: record.treasuryRoute,
    attempts: existing?.attempts,
    lastError: existing?.lastError,
  });
  return {
    ...record,
    status: "settlement_pending",
    updatedAt: nowIso(),
  };
}

export function buildPaymentTraceRef(record: PaymentRequiredRecord): PaymentTraceRef {
  return {
    requestId: record.requestId,
    idempotencyKey: record.idempotencyKey,
    invoiceId: record.resumeToken.invoiceId,
    paymentReceiptId: record.resumeToken.paymentReceiptId,
    txHash: record.resumeToken.txHash,
    toolName: record.toolName,
    chain: record.resumeToken.chain,
    network: record.network ?? record.resumeToken.network,
    amount: record.amount,
    status: record.status,
    reused: record.reused,
    orderId: record.settlement?.orderId,
    settlementId: record.settlement?.settlementId,
    confirmationStatus: record.confirmationStatus,
    intentId: record.resumeToken.intentId,
    fxQuoteId: record.fxQuote?.quoteId,
    treasuryRouteId: record.treasuryRoute?.routeId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function buildBillingPaymentReceipt(record: PaymentRequiredRecord): BillingPaymentReceipt {
  return {
    receiptId: record.resumeToken.paymentReceiptId,
    chain: record.resumeToken.chain,
    network: record.network ?? record.resumeToken.network,
    txHash: record.resumeToken.txHash,
    amount: record.amount ?? record.resumeToken.amount,
    tokenAddress: record.asset ?? record.resumeToken.asset,
    confirmedAt: record.consumedAt ?? record.createdAt,
    mode: record.resumeToken.txHash ? "live" : "simulated",
    confirmationStatus: record.confirmationStatus,
    payer: record.resumeToken.payer,
    payTo: record.resumeToken.payTo,
    orderId: record.settlement?.orderId,
    settlementId: record.settlement?.settlementId,
    intentId: record.resumeToken.intentId,
    treasuryRouteId: record.treasuryRoute?.routeId,
  };
}
