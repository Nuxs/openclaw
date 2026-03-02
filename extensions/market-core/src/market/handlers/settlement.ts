import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { createEscrowAdapter } from "../escrow-factory.js";
import { hashCanonical } from "../hash.js";
import { assertOrderTransition, assertSettlementTransition } from "../state-machine.js";
import type { Settlement, SettlementStrategy } from "../types.js";
import { normalizeBuyerId, requireChainAddress, requireString } from "../validators.js";
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

type SettlementPayee = { address: string; amount: string };

function parseAmount(raw: string, field: string): bigint {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`E_INVALID_ARGUMENT: ${field} must be integer string`);
  }
  return BigInt(raw);
}

function normalizeSettlementStrategy(raw: unknown): SettlementStrategy {
  return raw === "metered" ? "metered" : "one-shot";
}

function getReleasedAmount(settlement: Settlement | undefined): bigint {
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

function sumPayees(payees: SettlementPayee[]): bigint {
  return payees.reduce((sum, payee) => sum + parseAmount(payee.amount, "payees[].amount"), 0n);
}

export async function releaseSettlementIncremental(params: {
  store: MarketStateStore;
  config: MarketPluginConfig;
  orderId: string;
  actorId?: string;
  payees: SettlementPayee[];
  releaseAmount?: string;
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
  const { store, config, orderId, actorId, payees, releaseAmount } = params;

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

  let txHash: string | undefined;
  if (config.settlement.mode === "contract") {
    const escrow = createEscrowAdapter(config.chain, config.settlement);
    txHash = await escrow.release(order.orderHash, payees);
  }

  if (completed) {
    order.status = "settlement_completed";
  }
  order.updatedAt = nowIso();

  const strategy = normalizeSettlementStrategy(existingSettlement.strategy);
  const settlementId = existingSettlement.settlementId;
  const settlementHash = hashCanonical({
    orderId,
    payees,
    releaseAmount: targetReleaseAmount.toString(),
    releasedAmount: updatedReleased.toString(),
    txHash,
  });
  const settlement: Settlement = {
    settlementId,
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
  };

  await store.runInTransaction(() => {
    store.saveOrder(order);
    store.saveSettlement(settlement);
  });

  await recordAuditWithAnchor({
    store,
    config,
    kind: "settlement_released",
    refId: settlementId,
    hash: settlementHash,
    anchorId: `settlement:${settlementId}`,
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

  return {
    orderId,
    settlementId,
    settlementHash,
    txHash,
    status: nextSettlementStatus,
    orderStatus: order.status,
    releasedAmount: updatedReleased.toString(),
    remainingAmount: (totalAmount - updatedReleased).toString(),
    strategy,
    completed,
  };
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

      let txHash: string | undefined;
      if (config.settlement.mode === "contract") {
        const escrow = createEscrowAdapter(config.chain, config.settlement);
        txHash = await escrow.lock(order.orderHash, payer, amount, offer.sellerId);
      }

      order.status = "payment_locked";
      order.updatedAt = nowIso();
      order.paymentTxHash = txHash;

      const settlementId = existingSettlement?.settlementId ?? randomUUID();
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
      };
      await store.runInTransaction(() => {
        store.saveOrder(order);
        store.saveSettlement(settlement);
      });
      recordAudit(store, "payment_locked", orderId, order.orderHash, actorId || payer, {
        amount,
        strategy,
        txHash,
      });

      respond(true, {
        orderId,
        status: order.status,
        txHash,
        settlementId,
        strategy,
        releasedAmount: settlement.releasedAmount,
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

      const result = await releaseSettlementIncremental({
        store,
        config,
        orderId,
        actorId,
        payees,
        releaseAmount,
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

      let txHash: string | undefined;
      if (config.settlement.mode === "contract") {
        const escrow = createEscrowAdapter(config.chain, config.settlement);
        txHash = await escrow.refund(order.orderHash, payerAddress);
      }

      order.status = "settlement_cancelled";
      order.updatedAt = nowIso();

      const existingSettlement = store.getSettlementByOrder(orderId);
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
      };
      await store.runInTransaction(() => {
        store.saveOrder(order);
        store.saveSettlement(settlement);
      });
      await recordAuditWithAnchor({
        store,
        config,
        kind: "settlement_refunded",
        refId: settlementId,
        hash: settlementHash,
        anchorId: `settlement:${settlementId}`,
        actor: actorId || payer,
        details: reason ? { payer, txHash, reason } : { payer, txHash },
      });
      respond(true, { orderId, status: order.status, txHash, settlementId });
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
