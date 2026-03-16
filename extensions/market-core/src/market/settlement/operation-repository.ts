import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { nowIso, randomUUID } from "../handlers/_shared.js";
import type {
  SettlementOperation,
  SettlementOperationFilter,
  SettlementOperationKind,
  SettlementOperationStatus,
} from "./operation-types.js";

function computeBackoffMs(config: MarketPluginConfig, attempts: number): number {
  const base = Math.max(100, config.settlement.retryBaseDelayMs ?? 1_000);
  const cap = Math.max(base, config.settlement.retryMaxDelayMs ?? 8_000);
  const delay = Math.min(base * 2 ** Math.max(0, attempts), cap);
  const jitter = Math.floor(delay * 0.2 * Math.random());
  return delay + jitter;
}

export function buildSettlementOperation(input: {
  orderId: string;
  settlementId?: string;
  kind: SettlementOperationKind;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  status?: SettlementOperationStatus;
  attempts?: number;
  maxAttempts?: number;
  txHash?: string;
  response?: Record<string, unknown>;
  lastError?: string;
  nextAttemptAt?: string;
}): SettlementOperation {
  const now = nowIso();
  return {
    operationId: randomUUID(),
    orderId: input.orderId,
    settlementId: input.settlementId,
    kind: input.kind,
    status: input.status ?? "pending",
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
    response: input.response,
    txHash: input.txHash,
    attempts: input.attempts ?? 0,
    maxAttempts: input.maxAttempts ?? 3,
    nextAttemptAt: input.nextAttemptAt ?? now,
    lastError: input.lastError,
    createdAt: now,
    updatedAt: now,
  };
}

export function saveOperation(
  store: MarketStateStore,
  op: SettlementOperation,
): SettlementOperation {
  const updated: SettlementOperation = {
    ...op,
    updatedAt: nowIso(),
  };
  store.saveSettlementOperation(updated);
  return updated;
}

export function getOperationByIdempotencyKey(
  store: MarketStateStore,
  idempotencyKey: string,
): SettlementOperation | undefined {
  return store.getSettlementOperationByIdempotencyKey(idempotencyKey);
}

export function listDueOperations(
  store: MarketStateStore,
  filter?: Omit<SettlementOperationFilter, "dueBefore">,
): SettlementOperation[] {
  return store.listSettlementOperations({
    ...filter,
    dueBefore: nowIso(),
  });
}

export function markOperationRunning(
  store: MarketStateStore,
  op: SettlementOperation,
): SettlementOperation {
  return saveOperation(store, { ...op, status: "running" });
}

export function markOperationSucceeded(
  store: MarketStateStore,
  op: SettlementOperation,
  response?: Record<string, unknown>,
  txHash?: string,
): SettlementOperation {
  const completedAt = nowIso();
  return saveOperation(store, {
    ...op,
    status: "succeeded",
    response: response ?? op.response,
    txHash: txHash ?? op.txHash,
    lastError: undefined,
    lastAttemptAt: completedAt,
    completedAt,
    manualInterventionRequired: false,
    nextAction: undefined,
  });
}

export function markOperationRetryWait(
  store: MarketStateStore,
  config: MarketPluginConfig,
  op: SettlementOperation,
  errorMessage: string,
): SettlementOperation {
  const attempts = op.attempts + 1;
  if (attempts >= op.maxAttempts) {
    return saveOperation(store, {
      ...op,
      attempts,
      status: "failed",
      lastError: errorMessage,
      nextAttemptAt: nowIso(),
    });
  }

  const waitMs = computeBackoffMs(config, attempts);
  return saveOperation(store, {
    ...op,
    attempts,
    status: "retry_wait",
    lastError: errorMessage,
    nextAttemptAt: new Date(Date.now() + waitMs).toISOString(),
  });
}
