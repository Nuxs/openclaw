import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { EscrowAdapter } from "../escrow.js";
import { hashCanonical } from "../hash.js";
import { assertOrderTransition } from "../state-machine.js";
import type { Settlement } from "../types.js";
import { normalizeBuyerId, requireString } from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  nowIso,
  randomUUID,
  recordAudit,
  recordAuditWithAnchor,
  requireActorId,
  requireOptionalAddress,
} from "./_shared.js";

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
      assertOrderTransition(order.status, "payment_locked");

      const existingSettlement = store.getSettlementByOrder(orderId);
      if (existingSettlement && existingSettlement.status !== "settlement_refunded") {
        throw new Error("settlement already exists for order");
      }

      let txHash: string | undefined;
      if (config.settlement.mode === "contract") {
        const escrow = new EscrowAdapter(config.chain, config.settlement);
        txHash = await escrow.lock(order.orderHash, payer, amount);
      }

      order.status = "payment_locked";
      order.updatedAt = nowIso();
      order.paymentTxHash = txHash;
      store.saveOrder(order);

      const settlementId = existingSettlement?.settlementId ?? randomUUID();
      const settlement: Settlement = {
        settlementId,
        orderId,
        status: "settlement_locked",
        amount,
        tokenAddress: config.settlement.tokenAddress,
        lockedAt: nowIso(),
        lockTxHash: txHash,
      };
      store.saveSettlement(settlement);
      recordAudit(store, "payment_locked", orderId, order.orderHash, actorId || payer, {
        amount,
        txHash,
      });

      respond(true, { orderId, status: order.status, txHash, settlementId });
    } catch (err) {
      respond(false, { error: String(err) });
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
      const payees = (input.payees ?? []) as { address: string; amount: string }[];
      if (payees.length === 0) throw new Error("payees is required");

      const order = store.getOrder(orderId);
      if (!order) throw new Error("order not found");
      const offer = store.getOffer(order.offerId);
      if (!offer) throw new Error("offer not found");
      if (actorId) {
        assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      }
      assertOrderTransition(order.status, "settlement_completed");

      let txHash: string | undefined;
      if (config.settlement.mode === "contract") {
        const escrow = new EscrowAdapter(config.chain, config.settlement);
        txHash = await escrow.release(order.orderHash, payees);
      }

      order.status = "settlement_completed";
      order.updatedAt = nowIso();
      store.saveOrder(order);

      const existingSettlement = store.getSettlementByOrder(orderId);
      const settlementId = existingSettlement?.settlementId ?? randomUUID();
      const settlementHash = hashCanonical({ orderId, payees, txHash });
      const settlement: Settlement = {
        settlementId,
        orderId,
        status: "settlement_released",
        amount: payees.reduce((sum, p) => sum + BigInt(p.amount), 0n).toString(),
        tokenAddress: config.settlement.tokenAddress,
        lockedAt: existingSettlement?.lockedAt,
        lockTxHash: existingSettlement?.lockTxHash,
        releasedAt: nowIso(),
        releaseTxHash: txHash,
        settlementHash,
      };

      store.saveSettlement(settlement);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "settlement_released",
        refId: settlementId,
        hash: settlementHash,
        anchorId: `settlement:${settlementId}`,
        actor: actorId || offer.sellerId,
        details: { payees, txHash },
      });
      respond(true, { orderId, status: order.status, txHash, settlementId, settlementHash });
    } catch (err) {
      respond(false, { error: String(err) });
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
        const escrow = new EscrowAdapter(config.chain, config.settlement);
        txHash = await escrow.refund(order.orderHash, payer);
      }

      order.status = "settlement_cancelled";
      order.updatedAt = nowIso();
      store.saveOrder(order);

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
        tokenAddress: config.settlement.tokenAddress,
        lockedAt: existingSettlement?.lockedAt,
        lockTxHash: existingSettlement?.lockTxHash,
        refundedAt: nowIso(),
        refundReason: reason,
        refundTxHash: txHash,
        settlementHash,
      };

      store.saveSettlement(settlement);
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
      respond(false, { error: String(err) });
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
        tokenAddress: settlement.tokenAddress ?? null,
        lockTxHash: settlement.lockTxHash ?? null,
        releaseTxHash: settlement.releaseTxHash ?? null,
        refundTxHash: settlement.refundTxHash ?? null,
        lockedAt: settlement.lockedAt ?? null,
        releasedAt: settlement.releasedAt ?? null,
        refundedAt: settlement.refundedAt ?? null,
      });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}
