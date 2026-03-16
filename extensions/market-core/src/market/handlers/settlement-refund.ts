/**
 * Settlement Refund Handler
 *
 * Handles refunding escrowed funds back to the payer, with
 * idempotency, optimistic concurrency control, and audit logging.
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
import { assertOrderTransition } from "../state-machine.js";
import type { Settlement } from "../types.js";
import { normalizeBuyerId, requireChainAddress, requireString } from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";
import { copySettlementPaymentContext, getSettlementRevision } from "./settlement-shared.js";

export function createSettlementRefundHandler(
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
      const payer = requireString(input.payer, "payer");
      const payerAddress =
        config.settlement.mode === "contract"
          ? requireChainAddress(config.chain.network, payer, "payer")
          : payer;
      const reason =
        typeof input.reason === "string" && input.reason.trim().length > 0
          ? input.reason
          : undefined;
      const idempotencyKey =
        typeof input.idempotencyKey === "string" && input.idempotencyKey.trim().length > 0
          ? input.idempotencyKey.trim()
          : `refund:${orderId}:${payer}:${reason ?? "none"}`;

      await withSettlementLock(orderId, async () => {
        const order = store.getOrder(orderId);
        if (!order) throw new Error("order not found");
        if (actorId) {
          assertActorMatch(config, normalizeBuyerId(actorId), normalizeBuyerId(payer), "payer");
          assertActorMatch(
            config,
            normalizeBuyerId(actorId),
            normalizeBuyerId(order.buyerId),
            "buyerId",
          );
        }
        assertOrderTransition(order.status, "settlement_cancelled");
        const settlementBeforeRefund = store.getSettlementByOrder(orderId);
        const priorSettlementRevision = getSettlementRevision(settlementBeforeRefund);

        const existingOperation = getOperationByIdempotencyKey(store, idempotencyKey);
        if (existingOperation?.status === "succeeded" && existingOperation.response) {
          respond(true, existingOperation.response);
          return;
        }
        if (
          existingOperation &&
          (existingOperation.status === "pending" ||
            existingOperation.status === "running" ||
            existingOperation.status === "retry_wait")
        ) {
          throw new Error("E_CONFLICT: SETTLEMENT_OPERATION_IN_PROGRESS");
        }

        let operation = buildSettlementOperation({
          orderId,
          settlementId: store.getSettlementByOrder(orderId)?.settlementId,
          kind: "refund",
          idempotencyKey,
          payload: { payer: payerAddress, reason: reason ?? null },
          maxAttempts: Math.max(1, (config.settlement.maxRetries ?? 2) + 1),
        });
        store.saveSettlementOperation(operation);

        let txHash: string | undefined;
        try {
          operation = markOperationRunning(store, operation);
          if (config.settlement.mode === "contract") {
            const escrow = createEscrowAdapter(config.chain, config.settlement);
            txHash = await escrow.refund(order.orderHash, payerAddress, { idempotencyKey });
            operation = txHash ? { ...operation, txHash } : operation;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          markOperationRetryWait(store, config, operation, message);
          throw err;
        }

        // Optimistic re-validation + atomic write inside transaction.
        try {
          await store.runInTransaction(() => {
            const freshOrder = store.getOrder(orderId);
            if (freshOrder && freshOrder.status !== order.status) {
              throw new Error("E_CONFLICT: SETTLEMENT_CONCURRENT_MODIFICATION");
            }

            const existingSettlement = store.getSettlementByOrder(orderId);
            if (
              existingSettlement &&
              (existingSettlement.status !==
                (settlementBeforeRefund?.status ?? existingSettlement.status) ||
                getSettlementRevision(existingSettlement) !== priorSettlementRevision)
            ) {
              throw new Error("E_CONFLICT: SETTLEMENT_CONCURRENT_MODIFICATION");
            }

            const settlementId = existingSettlement?.settlementId ?? randomUUID();
            const settlementPayload: Record<string, unknown> = { orderId, payer, txHash };
            if (reason) settlementPayload.reason = reason;
            const settlementHash = hashCanonical(settlementPayload);
            const paymentContext = copySettlementPaymentContext(existingSettlement);
            const settlement: Settlement = {
              settlementId,
              orderId,
              status: "settlement_refunded",
              amount: existingSettlement?.amount ?? "0",
              releasedAmount: existingSettlement?.releasedAmount,
              strategy: existingSettlement?.strategy,
              tokenAddress: config.settlement.tokenAddress,
              lockedAt: existingSettlement?.lockedAt,
              lockTxHash: existingSettlement?.lockTxHash,
              refundedAt: nowIso(),
              refundReason: reason,
              refundTxHash: txHash,
              ...paymentContext,
              settlementHash,
              revision: getSettlementRevision(existingSettlement) + 1,
              updatedAt: nowIso(),
            };

            order.status = "settlement_cancelled";
            order.updatedAt = nowIso();

            store.saveOrder(order);
            store.saveSettlement(settlement);
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          markOperationRetryWait(store, config, operation, message);
          throw err;
        }

        const committedSettlement = store.getSettlementByOrder(orderId)!;
        await recordAuditWithAnchor({
          store,
          config,
          kind: "settlement_refunded",
          refId: committedSettlement.settlementId,
          hash: committedSettlement.settlementHash ?? "",
          anchorId: `settlement:${committedSettlement.settlementId}`,
          actor: actorId || payer,
          details: reason ? { payer, txHash, reason } : { payer, txHash },
        });
        const responsePayload = {
          orderId,
          status: "settlement_cancelled",
          txHash,
          settlementId: committedSettlement.settlementId,
        };
        markOperationSucceeded(store, operation, responsePayload, txHash);
        respond(true, responsePayload);
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
