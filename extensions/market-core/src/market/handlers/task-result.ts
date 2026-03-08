import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import {
  assertTaskOrderTransition,
  assertTaskReceiptTransition,
  assertTaskResultTransition,
} from "../task-state-machine.js";
import type { Dispute, TaskReceipt, TaskResult } from "../types.js";
import {
  requireLimit,
  requireOptionalEnum,
  requireString,
  requireStringArray,
} from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";
import { releaseSettlementIncremental } from "./settlement.js";

export function createTaskResultSubmitHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const task = store.getTask(requireString(input.taskId, "taskId"));
      if (!task || !task.awardedBidId) {
        throw new Error("E_NOT_FOUND: awarded task not found");
      }
      if (task.status !== "task_awarded") {
        throw new Error("E_CONFLICT: task is not awaiting result");
      }
      const bid = store.getTaskBid(task.awardedBidId);
      if (!bid) {
        throw new Error("E_NOT_FOUND: awarded bid not found");
      }
      assertActorMatch(config, actorId, bid.bidderActorId, "bidderActorId");
      const submittedAt = nowIso();
      const result: TaskResult = {
        resultId: randomUUID(),
        taskId: task.taskId,
        bidId: bid.bidId,
        delivererActorId: actorId,
        summary: typeof input.summary === "string" ? input.summary.trim() : undefined,
        artifacts: requireStringArray(input, "artifacts", {
          maxItems: 20,
          maxLen: 256,
          unique: true,
        }),
        proofIds: Array.isArray(input.proofIds)
          ? requireStringArray(input, "proofIds", { maxItems: 20, maxLen: 128, unique: true })
          : undefined,
        resultHash: "",
        status: "result_submitted",
        submittedAt,
        updatedAt: submittedAt,
      };
      result.resultHash = hashCanonical({
        resultId: result.resultId,
        taskId: result.taskId,
        bidId: result.bidId,
        artifacts: result.artifacts,
        proofIds: result.proofIds,
      });
      task.resultId = result.resultId;
      task.updatedAt = submittedAt;
      await store.runInTransaction(() => {
        store.saveTaskResult(result);
        store.saveTask(task);
      });
      await recordAuditWithAnchor({
        store,
        config,
        kind: "task_result_submitted",
        refId: result.resultId,
        hash: result.resultHash,
        anchorId: `task-result:${result.resultId}`,
        actor: actorId,
        details: { taskId: task.taskId, bidId: bid.bidId },
      });
      respond(true, {
        resultId: result.resultId,
        status: result.status,
        resultHash: result.resultHash,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

function upsertTaskReceipt(store: MarketStateStore, receipt: TaskReceipt): TaskReceipt {
  const existing = store.listTaskReceipts().find((entry) => entry.resultId === receipt.resultId);
  if (!existing) {
    store.saveTaskReceipt(receipt);
    return receipt;
  }
  const merged: TaskReceipt = { ...existing, ...receipt, receiptId: existing.receiptId };
  store.saveTaskReceipt(merged);
  return merged;
}

export function createTaskResultReviewHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const decision = requireOptionalEnum(input, "decision", ["accept", "reject"] as const);
      if (!decision) {
        throw new Error("E_INVALID_ARGUMENT: decision is required");
      }
      const result = store.getTaskResult(requireString(input.resultId, "resultId"));
      if (!result) {
        throw new Error("E_NOT_FOUND: result not found");
      }
      const task = store.getTask(result.taskId);
      if (!task || !task.awardedBidId || !task.orderId || !task.settlementId) {
        throw new Error("E_NOT_FOUND: task execution context not found");
      }
      assertActorMatch(config, actorId, task.creatorActorId, "creatorActorId");
      const bid = store.getTaskBid(task.awardedBidId);
      if (!bid) {
        throw new Error("E_NOT_FOUND: awarded bid not found");
      }
      const reviewedAt = nowIso();
      const reviewNote = typeof input.note === "string" ? input.note.trim() : undefined;

      if (decision === "accept") {
        assertTaskResultTransition(result.status, "result_accepted");
        assertTaskOrderTransition(task.status, "task_closed");
        const release = await releaseSettlementIncremental({
          store,
          config,
          orderId: task.orderId,
          actorId: bid.bidderActorId,
          payees: [{ address: bid.bidderActorId, amount: bid.price }],
          releaseAmount: bid.price,
          idempotencyKey:
            typeof input.idempotencyKey === "string"
              ? input.idempotencyKey
              : `task:${task.taskId}:accept`,
        });
        result.status = "result_accepted";
        result.reviewedAt = reviewedAt;
        result.reviewNote = reviewNote;
        result.updatedAt = reviewedAt;
        task.status = "task_closed";
        task.closedAt = reviewedAt;
        task.updatedAt = reviewedAt;
        store.saveTaskResult(result);
        store.saveTask(task);
        const receipt = upsertTaskReceipt(store, {
          receiptId: randomUUID(),
          taskId: task.taskId,
          bidId: bid.bidId,
          resultId: result.resultId,
          payerActorId: task.creatorActorId,
          payeeActorId: bid.bidderActorId,
          amount: bid.price,
          currency: bid.currency,
          settlementId: task.settlementId,
          status: "receipt_settled",
          receiptHash: hashCanonical({
            taskId: task.taskId,
            resultId: result.resultId,
            settlementId: task.settlementId,
            status: "receipt_settled",
          }),
          createdAt: reviewedAt,
          updatedAt: reviewedAt,
          settledAt: reviewedAt,
        });
        await recordAuditWithAnchor({
          store,
          config,
          kind: "task_result_reviewed",
          refId: result.resultId,
          hash: receipt.receiptHash,
          anchorId: `task-result:${result.resultId}:accept`,
          actor: actorId,
          details: {
            decision,
            receiptId: receipt.receiptId,
            settlementId: task.settlementId,
            releaseStatus: release.status,
          },
        });
        await recordAuditWithAnchor({
          store,
          config,
          kind: "task_receipt_recorded",
          refId: receipt.receiptId,
          hash: receipt.receiptHash,
          anchorId: `task-receipt:${receipt.receiptId}`,
          actor: actorId,
          details: {
            taskId: task.taskId,
            resultId: result.resultId,
          },
        });
        respond(true, {
          taskId: task.taskId,
          resultId: result.resultId,
          receiptId: receipt.receiptId,
          status: result.status,
          receiptStatus: receipt.status,
        });
        return;
      }

      assertTaskResultTransition(result.status, "result_rejected");
      result.status = "result_rejected";
      result.reviewedAt = reviewedAt;
      result.reviewNote = reviewNote;
      result.updatedAt = reviewedAt;
      store.saveTaskResult(result);

      const receipt = upsertTaskReceipt(store, {
        receiptId: randomUUID(),
        taskId: task.taskId,
        bidId: bid.bidId,
        resultId: result.resultId,
        payerActorId: task.creatorActorId,
        payeeActorId: bid.bidderActorId,
        amount: bid.price,
        currency: bid.currency,
        settlementId: task.settlementId,
        status: "receipt_disputed",
        receiptHash: hashCanonical({
          taskId: task.taskId,
          resultId: result.resultId,
          settlementId: task.settlementId,
          status: "receipt_disputed",
        }),
        createdAt: reviewedAt,
        updatedAt: reviewedAt,
      });

      let dispute: Dispute | undefined;
      if (input.openDispute !== false) {
        dispute = {
          disputeId: randomUUID(),
          orderId: task.orderId,
          initiatorActorId: task.creatorActorId,
          respondentActorId: bid.bidderActorId,
          arbitratorType: "platform",
          reason: reviewNote || "task result rejected",
          status: "dispute_opened",
          evidence: [],
          disputeHash: hashCanonical({
            taskId: task.taskId,
            resultId: result.resultId,
            reason: reviewNote || "task result rejected",
          }),
          openedAt: reviewedAt,
          updatedAt: reviewedAt,
          resolution: undefined,
        };
        store.saveDispute(dispute);
        receipt.disputeId = dispute.disputeId;
        assertTaskReceiptTransition(receipt.status, "receipt_disputed");
        store.saveTaskReceipt(receipt);
      }

      await recordAuditWithAnchor({
        store,
        config,
        kind: "task_result_reviewed",
        refId: result.resultId,
        hash: receipt.receiptHash,
        anchorId: `task-result:${result.resultId}:reject`,
        actor: actorId,
        details: {
          decision,
          disputeId: dispute?.disputeId,
          receiptId: receipt.receiptId,
        },
      });
      respond(true, {
        taskId: task.taskId,
        resultId: result.resultId,
        receiptId: receipt.receiptId,
        disputeId: dispute?.disputeId,
        status: result.status,
        receiptStatus: receipt.status,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createTaskReceiptGetHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const receipt = store.getTaskReceipt(requireString(input.receiptId, "receiptId"));
      if (!receipt) {
        throw new Error("E_NOT_FOUND: receipt not found");
      }
      respond(true, { receipt });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createTaskReceiptListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const status = requireOptionalEnum(input, "status", [
        "receipt_pending",
        "receipt_settled",
        "receipt_refunded",
        "receipt_disputed",
      ] as const);
      const limit = requireLimit(input, "limit", 50, 200);
      const receipts = store
        .listTaskReceipts()
        .filter((entry) => {
          if (typeof input.taskId === "string" && entry.taskId !== input.taskId) return false;
          if (typeof input.bidId === "string" && entry.bidId !== input.bidId) return false;
          if (typeof input.settlementId === "string" && entry.settlementId !== input.settlementId)
            return false;
          if (status && entry.status !== status) return false;
          return true;
        })
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, limit);
      respond(true, { count: receipts.length, receipts });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
