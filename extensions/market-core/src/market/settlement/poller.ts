import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { nowIso, recordAuditWithAnchor } from "../handlers/_shared.js";
import {
  listDueOperations,
  markOperationRetryWait,
  markOperationRunning,
  markOperationSucceeded,
} from "./operation-repository.js";
import type { SettlementOperation } from "./operation-types.js";

function isOperationAlreadyApplied(
  store: MarketStateStore,
  operation: SettlementOperation,
): boolean {
  const settlement = store.getSettlementByOrder(operation.orderId);
  if (!settlement) return false;

  if (operation.kind === "lock") {
    return settlement.status === "settlement_locked" || settlement.status === "settlement_released";
  }

  if (operation.kind === "refund") {
    return settlement.status === "settlement_refunded";
  }

  if (operation.kind === "release") {
    const expectedReleased =
      typeof operation.payload.expectedReleased === "string"
        ? operation.payload.expectedReleased
        : typeof operation.payload.releasedAmount === "string"
          ? operation.payload.releasedAmount
          : undefined;
    if (!expectedReleased) {
      return settlement.status === "settlement_released";
    }
    return BigInt(settlement.releasedAmount ?? "0") >= BigInt(expectedReleased);
  }

  return false;
}

/**
 * Best-effort settlement operation reconciler.
 *
 * This poller does not blindly replay on-chain tx by default; it reconciles local state
 * and keeps retry metadata for safe operator intervention / later automated replay.
 */
export async function flushPendingSettlementOperations(
  store: MarketStateStore,
  config: MarketPluginConfig,
): Promise<void> {
  const due = [
    ...listDueOperations(store, { status: "pending", limit: 200 }),
    ...listDueOperations(store, { status: "retry_wait", limit: 200 }),
  ].sort((left, right) => left.nextAttemptAt.localeCompare(right.nextAttemptAt));
  if (due.length === 0) {
    return;
  }

  for (const operation of due) {
    try {
      const running = markOperationRunning(store, operation);
      if (isOperationAlreadyApplied(store, running)) {
        markOperationSucceeded(store, running, running.response, running.txHash);
        await recordAuditWithAnchor({
          store,
          config,
          kind: "repair_retry",
          refId: running.operationId,
          hash: running.orderId,
          anchorId: `settlement-operation:${running.operationId}`,
          actor: "system:settlement-poller",
          details: {
            orderId: running.orderId,
            operationId: running.operationId,
            kind: running.kind,
            reconciled: true,
          },
        });
        continue;
      }

      const message = `operation not yet applied (kind=${running.kind}, orderId=${running.orderId})`;
      markOperationRetryWait(store, config, running, message);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      markOperationRetryWait(store, config, operation, message);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "repair_retry",
        refId: operation.operationId,
        hash: operation.orderId,
        anchorId: `settlement-operation:${operation.operationId}`,
        actor: "system:settlement-poller",
        details: {
          orderId: operation.orderId,
          operationId: operation.operationId,
          error: message,
          at: nowIso(),
        },
      });
    }
  }
}
