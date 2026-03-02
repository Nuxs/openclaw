import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { createEscrowAdapter } from "../escrow-factory.js";
import { hashCanonical } from "../hash.js";
import { assertDisputeTransition, assertOrderTransition } from "../state-machine.js";
import type {
  Dispute,
  DisputeEvidence,
  DisputeResolution,
  DisputeStatus,
  Settlement,
} from "../types.js";
import {
  normalizeBuyerId,
  requireChainAddress,
  requireEnum,
  requireLimit,
  requireString,
} from "../validators.js";
import {
  assertAccess,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";

type PayeeInput = { address: string; amount: string };

function requireDisputeStatus(value: unknown): DisputeStatus {
  return requireEnum({ status: value }, "status", [
    "dispute_opened",
    "dispute_evidence_submitted",
    "dispute_resolved",
    "dispute_rejected",
  ] as DisputeStatus[]);
}

function requireResolution(value: unknown): DisputeResolution {
  return requireEnum({ resolution: value }, "resolution", [
    "release",
    "refund",
    "partial",
  ] as DisputeResolution[]);
}

function requirePayees(network: string, input: Record<string, unknown>): PayeeInput[] {
  const raw = input.payees;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("payees is required");
  }
  return raw.map((entry, index) => {
    const candidate = (entry ?? {}) as Record<string, unknown>;
    const address = requireChainAddress(network, candidate.address, `payees[${index}].address`);
    const amount = requireString(candidate.amount, `payees[${index}].amount`);
    return { address, amount };
  });
}

function createDisputeHash(dispute: Dispute) {
  return hashCanonical({
    disputeId: dispute.disputeId,
    orderId: dispute.orderId,
    initiatorActorId: dispute.initiatorActorId,
    respondentActorId: dispute.respondentActorId,
    reason: dispute.reason,
    status: dispute.status,
    resolution: dispute.resolution,
    openedAt: dispute.openedAt,
    resolvedAt: dispute.resolvedAt,
  });
}

export function createDisputeOpenHandler(
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
      const reason = requireString(input.reason, "reason");

      const order = store.getOrder(orderId);
      if (!order) throw new Error("order not found");
      const offer = store.getOffer(order.offerId);
      if (!offer) throw new Error("offer not found");

      const normalizedActor = normalizeBuyerId(actorId);
      const normalizedBuyer = normalizeBuyerId(order.buyerId);
      const normalizedSeller = normalizeBuyerId(offer.sellerId);
      const isBuyer = normalizedActor === normalizedBuyer;
      const isSeller = normalizedActor === normalizedSeller;
      if (!isBuyer && !isSeller) {
        throw new Error("actorId must match buyer or seller");
      }

      const existing = store.getDisputeByOrder(orderId);
      if (
        existing &&
        existing.status !== "dispute_resolved" &&
        existing.status !== "dispute_rejected"
      ) {
        throw new Error("dispute already exists for order");
      }

      const now = nowIso();
      const dispute: Dispute = {
        disputeId: randomUUID(),
        orderId,
        initiatorActorId: actorId,
        respondentActorId: isBuyer ? offer.sellerId : order.buyerId,
        arbitratorType: "platform",
        reason,
        status: "dispute_opened",
        evidence: [],
        disputeHash: "",
        openedAt: now,
        updatedAt: now,
      };
      dispute.disputeHash = createDisputeHash(dispute);

      store.saveDispute(dispute);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "dispute_opened",
        refId: dispute.disputeId,
        hash: dispute.disputeHash,
        anchorId: `dispute:${dispute.disputeId}`,
        actor: actorId,
        details: { orderId, reason, respondentActorId: dispute.respondentActorId },
      });

      respond(true, {
        disputeId: dispute.disputeId,
        status: dispute.status,
        disputeHash: dispute.disputeHash,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createDisputeEvidenceHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const disputeId = typeof input.disputeId === "string" ? input.disputeId : undefined;
      const orderId = typeof input.orderId === "string" ? input.orderId : undefined;
      if (!disputeId && !orderId) {
        throw new Error("disputeId or orderId is required");
      }

      const dispute = disputeId
        ? store.getDispute(disputeId)
        : orderId
          ? store.getDisputeByOrder(orderId)
          : undefined;
      if (!dispute) throw new Error("dispute not found");

      const normalizedActor = normalizeBuyerId(actorId);
      const initiatorMatch = normalizeBuyerId(dispute.initiatorActorId) === normalizedActor;
      const respondentMatch = normalizeBuyerId(dispute.respondentActorId) === normalizedActor;
      if (!initiatorMatch && !respondentMatch) {
        throw new Error("actorId must match dispute parties");
      }

      if (dispute.status === "dispute_resolved" || dispute.status === "dispute_rejected") {
        throw new Error("dispute already closed");
      }

      const evidenceInput = (input.evidence ?? {}) as Record<string, unknown>;
      const summary = requireString(evidenceInput.summary, "evidence.summary");
      const cid =
        typeof evidenceInput.cid === "string" && evidenceInput.cid.trim().length > 0
          ? evidenceInput.cid.trim()
          : undefined;
      const submittedAt = nowIso();
      const evidenceHash = hashCanonical({
        disputeId: dispute.disputeId,
        actorId,
        summary,
        cid,
        submittedAt,
      });
      const evidence: DisputeEvidence = {
        evidenceId: randomUUID(),
        summary,
        cid,
        hash: evidenceHash,
        submittedAt,
        actorId,
      };

      const nextStatus: DisputeStatus =
        dispute.status === "dispute_opened" ? "dispute_evidence_submitted" : dispute.status;
      if (nextStatus !== dispute.status) {
        assertDisputeTransition(dispute.status, nextStatus);
        dispute.status = nextStatus;
      }

      dispute.evidence = [...(dispute.evidence ?? []), evidence];
      dispute.updatedAt = submittedAt;
      dispute.disputeHash = createDisputeHash(dispute);
      store.saveDispute(dispute);

      await recordAuditWithAnchor({
        store,
        config,
        kind: "dispute_evidence_submitted",
        refId: dispute.disputeId,
        hash: evidenceHash,
        anchorId: `dispute:${dispute.disputeId}:evidence:${evidence.evidenceId}`,
        actor: actorId,
        details: { summary, cid },
      });

      respond(true, {
        disputeId: dispute.disputeId,
        status: dispute.status,
        evidenceId: evidence.evidenceId,
        disputeHash: dispute.disputeHash,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createDisputeResolveHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      requireActorId(opts, config, input);

      const disputeId = typeof input.disputeId === "string" ? input.disputeId : undefined;
      const orderId = typeof input.orderId === "string" ? input.orderId : undefined;
      if (!disputeId && !orderId) {
        throw new Error("disputeId or orderId is required");
      }

      const dispute = disputeId
        ? store.getDispute(disputeId)
        : orderId
          ? store.getDisputeByOrder(orderId)
          : undefined;
      if (!dispute) throw new Error("dispute not found");

      if (dispute.status === "dispute_resolved" || dispute.status === "dispute_rejected") {
        throw new Error("dispute already closed");
      }

      const resolution = requireResolution(input.resolution);
      const order = store.getOrder(dispute.orderId);
      if (!order) throw new Error("order not found");
      const offer = store.getOffer(order.offerId);
      if (!offer) throw new Error("offer not found");

      let txHash: string | undefined;
      if (resolution === "refund") {
        const payer = requireChainAddress(config.chain.network, input.payer, "payer");
        assertOrderTransition(order.status, "settlement_cancelled");
        if (config.settlement.mode === "contract") {
          const escrow = createEscrowAdapter(config.chain, config.settlement);
          txHash = await escrow.refund(order.orderHash, payer);
        }
        order.status = "settlement_cancelled";
        order.updatedAt = nowIso();

        const existingSettlement = store.getSettlementByOrder(order.orderId);
        const settlementId = existingSettlement?.settlementId ?? randomUUID();
        const settlementHash = hashCanonical({ orderId: order.orderId, payer, txHash });
        const settlement: Settlement = {
          settlementId,
          orderId: order.orderId,
          status: "settlement_refunded",
          amount: existingSettlement?.amount ?? "0",
          tokenAddress: config.settlement.tokenAddress,
          lockedAt: existingSettlement?.lockedAt,
          lockTxHash: existingSettlement?.lockTxHash,
          refundedAt: nowIso(),
          refundTxHash: txHash,
          settlementHash,
        };

        assertDisputeTransition(dispute.status, "dispute_resolved");
        dispute.status = "dispute_resolved";
        dispute.resolution = resolution;
        dispute.resolvedAt = nowIso();
        dispute.updatedAt = dispute.resolvedAt;
        dispute.disputeHash = createDisputeHash(dispute);

        await store.runInTransaction(() => {
          store.saveOrder(order);
          store.saveSettlement(settlement);
          store.saveDispute(dispute);
        });

        await recordAuditWithAnchor({
          store,
          config,
          kind: "dispute_resolved",
          refId: dispute.disputeId,
          hash: dispute.disputeHash,
          anchorId: `dispute:${dispute.disputeId}`,
          details: { resolution, settlementId, txHash },
        });

        respond(true, {
          disputeId: dispute.disputeId,
          status: dispute.status,
          resolution,
          settlementId,
        });
        return;
      }

      const payees = requirePayees(config.chain.network, input);
      assertOrderTransition(order.status, "settlement_completed");
      if (config.settlement.mode === "contract") {
        const escrow = createEscrowAdapter(config.chain, config.settlement);
        txHash = await escrow.release(order.orderHash, payees);
      }
      order.status = "settlement_completed";
      order.updatedAt = nowIso();

      const existingSettlement = store.getSettlementByOrder(order.orderId);
      const settlementId = existingSettlement?.settlementId ?? randomUUID();
      const settlementHash = hashCanonical({ orderId: order.orderId, payees, txHash });
      const settlement: Settlement = {
        settlementId,
        orderId: order.orderId,
        status: "settlement_released",
        amount: payees.reduce((sum, p) => sum + BigInt(p.amount), 0n).toString(),
        tokenAddress: config.settlement.tokenAddress,
        lockedAt: existingSettlement?.lockedAt,
        lockTxHash: existingSettlement?.lockTxHash,
        releasedAt: nowIso(),
        releaseTxHash: txHash,
        settlementHash,
      };

      assertDisputeTransition(dispute.status, "dispute_resolved");
      dispute.status = "dispute_resolved";
      dispute.resolution = resolution;
      dispute.resolvedAt = nowIso();
      dispute.updatedAt = dispute.resolvedAt;
      dispute.disputeHash = createDisputeHash(dispute);

      await store.runInTransaction(() => {
        store.saveOrder(order);
        store.saveSettlement(settlement);
        store.saveDispute(dispute);
      });

      await recordAuditWithAnchor({
        store,
        config,
        kind: "dispute_resolved",
        refId: dispute.disputeId,
        hash: dispute.disputeHash,
        anchorId: `dispute:${dispute.disputeId}`,
        details: { resolution, settlementId, txHash },
      });

      respond(true, {
        disputeId: dispute.disputeId,
        status: dispute.status,
        resolution,
        settlementId,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createDisputeRejectHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      requireActorId(opts, config, input);

      const disputeId = typeof input.disputeId === "string" ? input.disputeId : undefined;
      const orderId = typeof input.orderId === "string" ? input.orderId : undefined;
      if (!disputeId && !orderId) {
        throw new Error("disputeId or orderId is required");
      }

      const dispute = disputeId
        ? store.getDispute(disputeId)
        : orderId
          ? store.getDisputeByOrder(orderId)
          : undefined;
      if (!dispute) throw new Error("dispute not found");

      if (dispute.status === "dispute_resolved" || dispute.status === "dispute_rejected") {
        throw new Error("dispute already closed");
      }

      assertDisputeTransition(dispute.status, "dispute_rejected");
      dispute.status = "dispute_rejected";
      dispute.resolvedAt = nowIso();
      dispute.updatedAt = dispute.resolvedAt;
      dispute.disputeHash = createDisputeHash(dispute);
      store.saveDispute(dispute);

      await recordAuditWithAnchor({
        store,
        config,
        kind: "dispute_rejected",
        refId: dispute.disputeId,
        hash: dispute.disputeHash,
        anchorId: `dispute:${dispute.disputeId}`,
        details: {
          disputeId: dispute.disputeId,
          orderId: dispute.orderId,
          status: dispute.status,
          resolvedAt: dispute.resolvedAt,
        },
      });

      respond(true, {
        disputeId: dispute.disputeId,
        status: dispute.status,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createDisputeGetHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const disputeId = typeof input.disputeId === "string" ? input.disputeId : undefined;
      const orderId = typeof input.orderId === "string" ? input.orderId : undefined;
      if (!disputeId && !orderId) {
        throw new Error("disputeId or orderId is required");
      }
      const dispute = disputeId
        ? store.getDispute(disputeId)
        : orderId
          ? store.getDisputeByOrder(orderId)
          : undefined;
      if (!dispute) throw new Error("dispute not found");
      respond(true, { dispute });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createDisputeListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const orderId = typeof input.orderId === "string" ? input.orderId.trim() : undefined;
      const status = input.status ? requireDisputeStatus(input.status) : undefined;
      const limit = requireLimit(input, "limit", 50, 200);

      let disputes = store.listDisputes();
      if (orderId) {
        disputes = disputes.filter((entry) => entry.orderId === orderId);
      }
      if (status) {
        disputes = disputes.filter((entry) => entry.status === status);
      }
      if (limit !== undefined) {
        disputes = disputes.slice(0, Math.max(0, limit));
      }

      respond(true, { disputes });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
