import { hashCanonical } from "../hash.js";
import type { PaymentChain, PaymentConfirmationStatus } from "../payment-types.js";
import type { Settlement, SettlementStrategy } from "../types.js";

export type SettlementPayee = { address: string; amount: string };

type SettlementPaymentContext = Partial<
  Pick<
    Settlement,
    | "paymentChain"
    | "paymentNetwork"
    | "paymentIntentId"
    | "paymentReceiptId"
    | "paymentTxHash"
    | "paymentConfirmedAt"
    | "confirmationStatus"
    | "fxQuoteId"
    | "treasuryRouteId"
  >
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function compactPaymentContext(context: SettlementPaymentContext): SettlementPaymentContext {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  ) as SettlementPaymentContext;
}

function resolvePaymentChain(value: unknown): PaymentChain | undefined {
  return value === "ton" || value === "evm" ? value : undefined;
}

export function resolvePaymentConfirmationStatus(
  value: unknown,
): PaymentConfirmationStatus | undefined {
  switch (value) {
    case "pending":
    case "submitted":
    case "confirmed":
    case "finalized":
    case "failed":
    case "simulated":
      return value;
    default:
      return undefined;
  }
}

export function isFinalPaymentConfirmationStatus(
  status: PaymentConfirmationStatus | undefined,
): boolean {
  return status === "confirmed" || status === "finalized" || status === "simulated";
}

export function readSettlementPaymentContext(
  input: Record<string, unknown>,
): SettlementPaymentContext {
  const paymentIntent = isRecord(input.paymentIntent) ? input.paymentIntent : undefined;
  const fxQuote = isRecord(input.fxQuote) ? input.fxQuote : undefined;
  const treasuryRoute = isRecord(input.treasuryRoute) ? input.treasuryRoute : undefined;
  return compactPaymentContext({
    paymentChain:
      resolvePaymentChain(input.paymentChain) ?? resolvePaymentChain(paymentIntent?.chain),
    paymentNetwork:
      readTrimmedString(input.paymentNetwork) ?? readTrimmedString(paymentIntent?.network),
    paymentIntentId: readTrimmedString(paymentIntent?.intentId),
    paymentReceiptId: readTrimmedString(input.paymentReceiptId),
    paymentTxHash: readTrimmedString(input.paymentTxHash),
    paymentConfirmedAt: readTrimmedString(input.paymentConfirmedAt),
    confirmationStatus: resolvePaymentConfirmationStatus(input.confirmationStatus),
    fxQuoteId: readTrimmedString(fxQuote?.quoteId),
    treasuryRouteId: readTrimmedString(treasuryRoute?.routeId),
  });
}

export function copySettlementPaymentContext(
  settlement: Settlement | undefined,
): SettlementPaymentContext {
  if (!settlement) {
    return {};
  }
  return compactPaymentContext({
    paymentChain: settlement.paymentChain,
    paymentNetwork: settlement.paymentNetwork,
    paymentIntentId: settlement.paymentIntentId,
    paymentReceiptId: settlement.paymentReceiptId,
    paymentTxHash: settlement.paymentTxHash,
    paymentConfirmedAt: settlement.paymentConfirmedAt,
    confirmationStatus: settlement.confirmationStatus,
    fxQuoteId: settlement.fxQuoteId,
    treasuryRouteId: settlement.treasuryRouteId,
  });
}

export function parseAmount(raw: string, field: string): bigint {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`E_INVALID_ARGUMENT: ${field} must be integer string`);
  }
  return BigInt(raw);
}

export function normalizeSettlementStrategy(raw: unknown): SettlementStrategy {
  return raw === "metered" ? "metered" : "one-shot";
}

export function getReleasedAmount(settlement: Settlement | undefined): bigint {
  if (!settlement) {
    return 0n;
  }
  if (typeof settlement.releasedAmount === "string" && /^\d+$/.test(settlement.releasedAmount)) {
    return BigInt(settlement.releasedAmount);
  }
  if (settlement.status === "settlement_released" && /^\d+$/.test(settlement.amount)) {
    return BigInt(settlement.amount);
  }
  return 0n;
}

export function getSettlementRevision(settlement: Settlement | undefined): number {
  return Math.max(0, settlement?.revision ?? 0);
}

export function sumPayees(payees: SettlementPayee[]): bigint {
  return payees.reduce((sum, payee) => sum + parseAmount(payee.amount, "payees[].amount"), 0n);
}

export function buildReleaseOperationKey(
  orderId: string,
  payees: SettlementPayee[],
  releaseAmount: string | undefined,
  providedKey?: string,
): string {
  if (providedKey && providedKey.trim().length > 0) {
    return providedKey.trim();
  }
  return `release:${orderId}:${hashCanonical({ payees, releaseAmount: releaseAmount ?? null })}`;
}

export function buildReleaseResultFromOperation(params: {
  orderId: string;
  response: Record<string, unknown>;
  settlement: Settlement;
  priorReleased: bigint;
}) {
  const { orderId, response, settlement, priorReleased } = params;
  return {
    orderId,
    settlementId: String(response.settlementId ?? settlement.settlementId),
    settlementHash: String(response.settlementHash ?? ""),
    txHash: typeof response.txHash === "string" ? response.txHash : undefined,
    status: (response.settlementStatus as Settlement["status"]) ?? settlement.status,
    orderStatus: String(response.status ?? "unknown"),
    releasedAmount: String(response.releasedAmount ?? priorReleased.toString()),
    remainingAmount: String(response.remainingAmount ?? "0"),
    strategy: normalizeSettlementStrategy(settlement.strategy),
    completed: Boolean(response.completed ?? false),
  };
}
