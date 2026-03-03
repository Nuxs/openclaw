import type {
  SettlementOperation,
  SettlementOperationFilter,
  SettlementOperationKind,
  SettlementOperationStatus,
} from "../types.js";

export type {
  SettlementOperation,
  SettlementOperationFilter,
  SettlementOperationKind,
  SettlementOperationStatus,
};

export const FINAL_SETTLEMENT_OPERATION_STATUSES: ReadonlySet<SettlementOperationStatus> = new Set([
  "succeeded",
  "failed",
]);

export const RETRYABLE_SETTLEMENT_OPERATION_STATUSES: ReadonlySet<SettlementOperationStatus> =
  new Set(["pending", "retry_wait"]);
