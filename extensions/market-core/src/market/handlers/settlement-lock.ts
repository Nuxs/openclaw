/**
 * Settlement Lock Handler
 *
 * Creates escrow locks for orders, persisting settlement state
 * and recording audit events. Supports both contract-based and
 * custodial settlement modes.
 */

import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { createEscrowAdapter } from "../escrow-factory.js";
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
import { normalizeBuyerId, requireString } from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAudit,
  requireActorId,
} from "./_shared.js";
import { getSettlementRevision, normalizeSettlementStrategy } from "./settlement-shared.js";

export function createSettlementLockHandler(
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
      const amount = requireString(input.amount, "amount");
      const payer = requireString(input.payer, "payer");
      const strategy = normalizeSettlementStrategy(input.strategy);
      const idempotencyKey =
        typeof input.idempotencyKey === "string" && input.idempotencyKey.trim().length > 0
          ? input.idempotencyKey.trim()
          : `lock:${orderId}:${payer}:${amount}`;

      // Per-orderId mutex prevents duplicate lock attempts.
      await withSettlementLock(orderId, async () => {
        const order = store.getOrder(orderId);
        if (!order) throw new Error("order not found");
        const offer = store.getOffer(order.offerId);
        if (!offer) throw new Error("offer not found");
        if (actorId) {
          assertActorMatch(config, normalizeBuyerId(actorId), normalizeBuyerId(payer), "payer");
          assertActorMatch(
            config,
            normalizeBuyerId(actorId),
            normalizeBuyerId(order.buyerId),
            "buyerId",
          );
        }
        assertOrderTransition(order.status, "payment_locked");

        const existingSettlement = store.getSettlementByOrder(orderId);
        if (existingSettlement && existingSettlement.status !== "settlement_refunded") {
          throw new Error("settlement already exists for order");
        }
        const priorSettlementRevision = getSettlementRevision(existingSettlement);

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
          settlementId: existingSettlement?.settlementId,
          kind: "lock",
          idempotencyKey,
          payload: { payer, amount, sellerId: offer.sellerId, strategy },
          maxAttempts: Math.max(1, (config.settlement.maxRetries ?? 2) + 1),
        });
        store.saveSettlementOperation(operation);

        let txHash: string | undefined;
        try {
          operation = markOperationRunning(store, operation);
          if (config.settlement.mode === "contract") {
            const escrow = createEscrowAdapter(config.chain, config.settlement);
            txHash = await escrow.lock(order.orderHash, payer, amount, offer.sellerId, {
              idempotencyKey,
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          markOperationRetryWait(store, config, operation, message);
          throw err;
        }

        const settlementId = existingSettlement?.settlementId ?? randomUUID();

        // Optimistic re-validation + atomic write inside transaction.
        try {
          await store.runInTransaction(() => {
            const freshSettlement = store.getSettlementByOrder(orderId);
            if (
              freshSettlement &&
              (freshSettlement.status !== "settlement_refunded" ||
                getSettlementRevision(freshSettlement) !== priorSettlementRevision)
            ) {
              throw new Error("E_CONFLICT: SETTLEMENT_CONCURRENT_LOCK");
            }

            order.status = "payment_locked";
            order.updatedAt = nowIso();
            order.paymentTxHash = txHash;

            const settlement: Settlement = {
              settlementId,
              orderId,
              status: "settlement_locked",
              amount,
              releasedAmount: "0",
              strategy,
              tokenAddress: config.settlement.tokenAddress,
              lockedAt: nowIso(),
              lockTxHash: txHash,
              revision: getSettlementRevision(existingSettlement) + 1,
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

        const committedSettlement = store.getSettlementByOrder(orderId)!;
        recordAudit(store, "payment_locked", orderId, order.orderHash, actorId || payer, {
          amount,
          strategy,
          txHash,
        });

        const responsePayload = {
          orderId,
          status: "payment_locked",
          txHash,
          settlementId: committedSettlement.settlementId,
          strategy,
          releasedAmount: committedSettlement.releasedAmount,
        };
        markOperationSucceeded(store, operation, responsePayload, txHash);

        respond(true, responsePayload);
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
