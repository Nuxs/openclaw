import { hashCanonical } from "../hash.js";
import type { Settlement, SettlementStrategy } from "../types.js";

export type SettlementPayee = { address: string; amount: string };

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
