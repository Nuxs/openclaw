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
import {
  normalizeBuyerId,
  requireChainAddress,
  requireLimit,
  requireOptionalEnum,
  requireOptionalIsoTimestamp,
  requireString,
} from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
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

export function createSettlementStatusHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const orderId = typeof input.orderId === "string" ? input.orderId : undefined;
      const settlementId = typeof input.settlementId === "string" ? input.settlementId : undefined;

      if (!orderId && !settlementId) {
        throw new Error("orderId or settlementId is required");
      }

      let settlement = settlementId ? store.getSettlement(settlementId) : undefined;
      if (!settlement && orderId) {
        settlement = store.getSettlementByOrder(orderId);
      }
      if (!settlement) throw new Error("settlement not found");

      const resolvedOrderId = orderId ?? settlement.orderId;
      const order = store.getOrder(resolvedOrderId);
      const offer = order ? store.getOffer(order.offerId) : undefined;

      if (actorId && order) {
        const buyerMatch = normalizeBuyerId(actorId) === normalizeBuyerId(order.buyerId ?? "");
        const sellerMatch = offer ? actorId === offer.sellerId : false;
        if (!buyerMatch && !sellerMatch) {
          throw new Error("actorId does not match buyerId or sellerId");
        }
      }

      respond(true, {
        orderId: resolvedOrderId,
        orderStatus: order?.status ?? null,
        settlementId: settlement.settlementId,
        status: settlement.status ?? null,
        amount: settlement.amount ?? null,
        releasedAmount:
          settlement.releasedAmount ??
          (settlement.status === "settlement_released" ? settlement.amount : "0"),
        strategy: settlement.strategy ?? "one-shot",
        tokenAddress: settlement.tokenAddress ?? null,
        lockTxHash: settlement.lockTxHash ?? null,
        releaseTxHash: settlement.releaseTxHash ?? null,
        refundTxHash: settlement.refundTxHash ?? null,
        lockedAt: settlement.lockedAt ?? null,
        releasedAt: settlement.releasedAt ?? null,
        refundedAt: settlement.refundedAt ?? null,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

function parseSettlementAmount(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveSettlementTimestamp(settlement: Settlement): string | undefined {
  return (
    settlement.releasedAt ?? settlement.refundedAt ?? settlement.lockedAt ?? settlement.updatedAt
  );
}

export function createSettlementQueryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const orderId = typeof input.orderId === "string" ? input.orderId.trim() : undefined;
      const settlementId =
        typeof input.settlementId === "string" ? input.settlementId.trim() : undefined;
      const status = requireOptionalEnum(input, "status", [
        "settlement_locked",
        "settlement_released",
        "settlement_refunded",
      ] as const);
      const timeRange = requireOptionalEnum(input, "timeRange", [
        "today",
        "week",
        "month",
      ] as const);
      const now = new Date();
      const nowMs = now.getTime();
      const since =
        requireOptionalIsoTimestamp(input, "since") ??
        (timeRange === "today"
          ? new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
          : timeRange === "week"
            ? new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()
            : timeRange === "month"
              ? new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString()
              : undefined);
      const until =
        requireOptionalIsoTimestamp(input, "until") ?? (since ? now.toISOString() : undefined);
      const limit = requireLimit(input, "limit", 50, 200);

      const orders = store.listOrders();
      const orderMap = new Map(orders.map((order) => [order.orderId, order]));
      const offers = store.listOffers();
      const offerMap = new Map(offers.map((offer) => [offer.offerId, offer]));

      const filtered = store
        .listSettlements()
        .filter((settlement) => {
          if (settlementId && settlement.settlementId !== settlementId) return false;
          if (orderId && settlement.orderId !== orderId) return false;
          if (status && settlement.status !== status) return false;

          const ts = resolveSettlementTimestamp(settlement);
          if (since && (!ts || Date.parse(ts) < Date.parse(since))) return false;
          if (until && (!ts || Date.parse(ts) > Date.parse(until))) return false;

          if (actorId) {
            const order = orderMap.get(settlement.orderId);
            const offer = order ? offerMap.get(order.offerId) : undefined;
            const actorMatchesBuyer = order
              ? normalizeBuyerId(order.buyerId) === normalizeBuyerId(actorId)
              : false;
            const actorMatchesSeller = offer
              ? normalizeBuyerId(offer.sellerId) === normalizeBuyerId(actorId)
              : false;
            if (!actorMatchesBuyer && !actorMatchesSeller) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const aTs = resolveSettlementTimestamp(a);
          const bTs = resolveSettlementTimestamp(b);
          return Date.parse(bTs ?? "") - Date.parse(aTs ?? "");
        });

      const settlements = filtered.slice(0, limit).map((settlement) => {
        const order = orderMap.get(settlement.orderId);
        const offer = order ? offerMap.get(order.offerId) : undefined;
        return {
          settlementId: settlement.settlementId,
          orderId: settlement.orderId,
          status: settlement.status,
          amount: settlement.amount,
          releasedAmount:
            settlement.releasedAmount ??
            (settlement.status === "settlement_released" ? settlement.amount : "0"),
          orderStatus: order?.status ?? null,
          buyerId: order?.buyerId ?? null,
          sellerId: offer?.sellerId ?? null,
          lockedAt: settlement.lockedAt ?? null,
          releasedAt: settlement.releasedAt ?? null,
          refundedAt: settlement.refundedAt ?? null,
        };
      });

      const total = settlements.reduce(
        (sum, settlement) => sum + parseSettlementAmount(settlement.amount),
        0,
      );
      const settled = settlements
        .filter((settlement) => settlement.status === "settlement_released")
        .reduce((sum, settlement) => sum + parseSettlementAmount(settlement.releasedAmount), 0);
      const pending = settlements
        .filter((settlement) => settlement.status === "settlement_locked")
        .reduce((sum, settlement) => sum + parseSettlementAmount(settlement.amount), 0);
      const refunded = settlements
        .filter((settlement) => settlement.status === "settlement_refunded")
        .reduce((sum, settlement) => sum + parseSettlementAmount(settlement.amount), 0);

      let trend = 0;
      if (since && until) {
        const sinceMs = Date.parse(since);
        const untilMs = Date.parse(until);
        const windowMs = Math.max(1, untilMs - sinceMs);
        const prevSince = new Date(sinceMs - windowMs).toISOString();
        const prevUntil = new Date(sinceMs).toISOString();

        const previousTotal = store
          .listSettlements()
          .filter((settlement) => {
            const ts = resolveSettlementTimestamp(settlement);
            if (!ts) return false;
            const tsMs = Date.parse(ts);
            return tsMs >= Date.parse(prevSince) && tsMs < Date.parse(prevUntil);
          })
          .reduce((sum, settlement) => sum + parseSettlementAmount(settlement.amount), 0);

        if (previousTotal > 0) {
          trend = ((total - previousTotal) / previousTotal) * 100;
        } else if (total > 0) {
          trend = 100;
        }
      }

      respond(true, {
        count: settlements.length,
        orderCount: new Set(settlements.map((item) => item.orderId)).size,
        total,
        settled,
        pending,
        refunded,
        trend,
        range: since || until ? { since: since ?? null, until: until ?? null } : null,
        settlements,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
