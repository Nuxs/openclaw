/**
 * Settlement Release Handler & Incremental Release Logic
 *
 * Handles both full and incremental release of escrowed funds.
 * `releaseSettlementIncremental` is the core business function shared
 * by the gateway handler, ledger auto-release, and task-result flow.
 */

import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { createEscrowAdapter } from "../escrow-factory.js";
import { hashCanonical } from "../hash.js";
import { withSettlementLock } from "../settlement-lock.js";
import {
  buildSettlementOperation,
  getOperationByIdempotencyKey,
  markOperationRetryWait,
  markOperationRunning,
  markOperationSucceeded,
} from "../settlement/operation-repository.js";
import { assertOrderTransition, assertSettlementTransition } from "../state-machine.js";
import type { Settlement, SettlementStrategy } from "../types.js";
import { requireChainAddress, requireString } from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  recordAudit,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";
import {
  buildReleaseOperationKey,
  buildReleaseResultFromOperation,
  getReleasedAmount,
  getSettlementRevision,
  normalizeSettlementStrategy,
  parseAmount,
  sumPayees,
  type SettlementPayee,
} from "./settlement-shared.js";

// ---------------------------------------------------------------------------
// Core business logic — used by the handler, ledger, and task-result flows
// ---------------------------------------------------------------------------

export async function releaseSettlementIncremental(params: {
  store: MarketStateStore;
  config: MarketPluginConfig;
  orderId: string;
  actorId?: string;
  payees: SettlementPayee[];
  releaseAmount?: string;
  idempotencyKey?: string;
}): Promise<{
  orderId: string;
  settlementId: string;
  settlementHash: string;
  txHash?: string;
  status: Settlement["status"];
  orderStatus: string;
  releasedAmount: string;
  remainingAmount: string;
  strategy: SettlementStrategy;
  completed: boolean;
}> {
  const { store, config, orderId, actorId, payees, releaseAmount, idempotencyKey } = params;

  // Per-orderId mutex prevents concurrent release/refund for the same order.
  return withSettlementLock(orderId, async () => {
    const order = store.getOrder(orderId);
    if (!order) throw new Error("order not found");
    const offer = store.getOffer(order.offerId);
    if (!offer) throw new Error("offer not found");
    if (actorId) {
      assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
    }

    const existingSettlement = store.getSettlementByOrder(orderId);
    if (!existingSettlement) {
      throw new Error("settlement not found");
    }
    if (existingSettlement.status === "settlement_refunded") {
      throw new Error("E_CONFLICT: settlement already refunded");
    }

    const totalAmount = parseAmount(existingSettlement.amount, "settlement.amount");
    const priorReleased = getReleasedAmount(existingSettlement);
    const priorRevision = getSettlementRevision(existingSettlement);
    if (priorReleased >= totalAmount) {
      throw new Error("E_CONFLICT: settlement already fully released");
    }

    const requestedByPayees = sumPayees(payees);
    const targetReleaseAmount =
      typeof releaseAmount === "string"
        ? parseAmount(requireString(releaseAmount, "amount"), "amount")
        : requestedByPayees;

    if (targetReleaseAmount <= 0n) {
      throw new Error("E_INVALID_ARGUMENT: release amount must be positive");
    }
    if (requestedByPayees !== targetReleaseAmount) {
      throw new Error("E_INVALID_ARGUMENT: payees total must match amount");
    }

    const operationKey = buildReleaseOperationKey(orderId, payees, releaseAmount, idempotencyKey);
    const existingOperation = getOperationByIdempotencyKey(store, operationKey);
    if (existingOperation?.status === "succeeded" && existingOperation.response) {
      return buildReleaseResultFromOperation({
        orderId,
        response: existingOperation.response,
        settlement: existingSettlement,
        priorReleased,
      });
    }
    if (
      existingOperation &&
      (existingOperation.status === "pending" ||
        existingOperation.status === "running" ||
        existingOperation.status === "retry_wait")
    ) {
      throw new Error("E_CONFLICT: SETTLEMENT_OPERATION_IN_PROGRESS");
    }

    const remaining = totalAmount - priorReleased;
    if (targetReleaseAmount > remaining) {
      throw new Error("E_CONFLICT: SETTLEMENT_OVER_RELEASE");
    }

    const updatedReleased = priorReleased + targetReleaseAmount;
    const completed = updatedReleased === totalAmount;
    const nextSettlementStatus: Settlement["status"] = completed
      ? "settlement_released"
      : "settlement_locked";
    assertSettlementTransition(existingSettlement.status, nextSettlementStatus);

    if (completed) {
      assertOrderTransition(order.status, "settlement_completed");
    }

    let operation = buildSettlementOperation({
      orderId,
      settlementId: existingSettlement.settlementId,
      kind: "release",
      idempotencyKey: operationKey,
      payload: {
        payees,
        releaseAmount: targetReleaseAmount.toString(),
        actorId,
        priorReleased: priorReleased.toString(),
      },
      maxAttempts: Math.max(1, (config.settlement.maxRetries ?? 2) + 1),
    });

    await store.runInTransaction(() => {
      store.saveSettlementOperation(operation);
    });

    let txHash: string | undefined;
    try {
      operation = markOperationRunning(store, operation);
      if (config.settlement.mode === "contract") {
        const escrow = createEscrowAdapter(config.chain, config.settlement);
        txHash = await escrow.release(order.orderHash, payees, { idempotencyKey: operationKey });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      markOperationRetryWait(store, config, operation, message);
      throw err;
    }

    try {
      await store.runInTransaction(() => {
        const freshSettlement = store.getSettlementByOrder(orderId);
        if (!freshSettlement) {
          throw new Error("E_CONFLICT: SETTLEMENT_MISSING");
        }
        const freshReleased = getReleasedAmount(freshSettlement);
        const freshRevision = getSettlementRevision(freshSettlement);
        if (
          freshReleased !== priorReleased ||
          freshSettlement.status !== existingSettlement.status ||
          freshRevision !== priorRevision
        ) {
          throw new Error("E_CONFLICT: SETTLEMENT_CONCURRENT_MODIFICATION");
        }

        if (completed) {
          order.status = "settlement_completed";
        }
        order.updatedAt = nowIso();

        const strategy = normalizeSettlementStrategy(existingSettlement.strategy);
        const settlementHash = hashCanonical({
          orderId,
          payees,
          releaseAmount: targetReleaseAmount.toString(),
          releasedAmount: updatedReleased.toString(),
          txHash,
        });
        const settlement: Settlement = {
          settlementId: existingSettlement.settlementId,
          orderId,
          status: nextSettlementStatus,
          amount: existingSettlement.amount,
          releasedAmount: updatedReleased.toString(),
          strategy,
          tokenAddress: config.settlement.tokenAddress,
          lockedAt: existingSettlement.lockedAt,
          lockTxHash: existingSettlement.lockTxHash,
          releasedAt: completed ? nowIso() : existingSettlement.releasedAt,
          releaseTxHash: txHash,
          settlementHash,
          revision: priorRevision + 1,
          updatedAt: nowIso(),
        };

        store.saveOrder(order);
        store.saveSettlement(settlement);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      markOperationRetryWait(store, config, operation, message);
      throw err;
    }

    // Re-read committed state for the response.
    const committedSettlement = store.getSettlementByOrder(orderId)!;
    const committedOrder = store.getOrder(orderId)!;
    const strategy = normalizeSettlementStrategy(committedSettlement.strategy);

    await recordAuditWithAnchor({
      store,
      config,
      kind: "settlement_released",
      refId: committedSettlement.settlementId,
      hash: committedSettlement.settlementHash ?? "",
      anchorId: `settlement:${committedSettlement.settlementId}`,
      actor: actorId || offer.sellerId,
      details: {
        payees,
        txHash,
        releasedAmount: updatedReleased.toString(),
        remainingAmount: (totalAmount - updatedReleased).toString(),
        completed,
        strategy,
      },
    });

    const responsePayload = {
      orderId,
      settlementId: committedSettlement.settlementId,
      settlementHash: committedSettlement.settlementHash ?? "",
      txHash,
      status: committedOrder.status,
      settlementStatus: committedSettlement.status,
      releasedAmount: updatedReleased.toString(),
      remainingAmount: (totalAmount - updatedReleased).toString(),
      strategy,
      completed,
    };
    markOperationSucceeded(store, operation, responsePayload, txHash);
    return {
      orderId,
      settlementId: committedSettlement.settlementId,
      settlementHash: committedSettlement.settlementHash ?? "",
      txHash,
      status: committedSettlement.status,
      orderStatus: committedOrder.status,
      releasedAmount: updatedReleased.toString(),
      remainingAmount: (totalAmount - updatedReleased).toString(),
      strategy,
      completed,
    };
  });
}

// ---------------------------------------------------------------------------
// Gateway handler
// ---------------------------------------------------------------------------

export function createSettlementReleaseHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const orderId = requireString(input.orderId, "orderId");
      const payeesInput = (input.payees ?? []) as { address: string; amount: string }[];
      if (payeesInput.length === 0) throw new Error("payees is required");
      const payees = payeesInput.map((entry, index) => ({
        address:
          config.settlement.mode === "contract"
            ? requireChainAddress(config.chain.network, entry.address, `payees[${index}].address`)
            : requireString(entry.address, `payees[${index}].address`),
        amount: requireString(entry.amount, `payees[${index}].amount`),
      }));
      const releaseAmount =
        typeof input.amount === "string" && input.amount.trim().length > 0
          ? input.amount
          : undefined;
      const idempotencyKey =
        typeof input.idempotencyKey === "string" && input.idempotencyKey.trim().length > 0
          ? input.idempotencyKey.trim()
          : undefined;

      const result = await releaseSettlementIncremental({
        store,
        config,
        orderId,
        actorId,
        payees,
        releaseAmount,
        idempotencyKey,
      });

      respond(true, {
        orderId: result.orderId,
        status: result.orderStatus,
        settlementStatus: result.status,
        txHash: result.txHash,
        settlementId: result.settlementId,
        settlementHash: result.settlementHash,
        releasedAmount: result.releasedAmount,
        remainingAmount: result.remainingAmount,
        strategy: result.strategy,
        completed: result.completed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("SETTLEMENT_OVER_RELEASE")) {
        const input = (params ?? {}) as Record<string, unknown>;
        const orderId = typeof input.orderId === "string" ? input.orderId : "unknown";
        const actorId = typeof input.actorId === "string" ? input.actorId : undefined;
        recordAudit(store, "settlement_over_release_blocked", orderId, undefined, actorId, {
          reason: "SETTLEMENT_OVER_RELEASE",
        });
      }
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
