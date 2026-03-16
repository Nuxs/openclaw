import type {
  FXQuote,
  PaymentChain,
  PaymentConfirmationStatus,
  PaymentIntent,
  PaymentReceipt,
  ReconciliationSummary,
  TreasuryRoute,
} from "@openclaw/market-core";
import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import type { Web3StateStore } from "../state/store.js";
import { redactUnknown } from "../utils/redact.js";
import { countByStatus } from "./market-utils.js";
import { loadCallGateway, normalizeGatewayResult } from "./proxy-utils.js";

type ReconciliationInput = {
  orderId?: string;
  settlementId?: string;
  leaseId?: string;
  chain?: string;
  network?: string;
  includeLedger?: boolean;
  includeDisputes?: boolean;
};

type Sha256ArtifactHash = `sha256:${string}`;

type ServiceProofSummaryInput = {
  status?: string;
  submittedAt?: string;
  proof?: { artifactHash?: string };
};

type StoredPaymentRecord = ReturnType<Web3StateStore["listPaymentRequiredRecords"]>[number];

function summarizeServiceProofs(
  proofs: ServiceProofSummaryInput[],
): ReconciliationSummary["serviceProofs"] | undefined {
  if (proofs.length === 0) return undefined;
  const byStatus = countByStatus(proofs);
  const latestSubmittedAt = proofs.reduce<string | undefined>((latest, entry) => {
    if (typeof entry.submittedAt !== "string") return latest;
    if (!latest || entry.submittedAt > latest) return entry.submittedAt;
    return latest;
  }, undefined);
  const artifactHashes = [
    ...new Set(
      proofs
        .map((entry) =>
          typeof entry.proof?.artifactHash === "string" ? entry.proof.artifactHash : undefined,
        )
        .filter(
          (hash): hash is Sha256ArtifactHash =>
            typeof hash === "string" && /^sha256:[a-f0-9]{64}$/i.test(hash),
        ),
    ),
  ].slice(0, 5);
  return {
    total: proofs.length,
    byStatus,
    latestSubmittedAt,
    artifactHashes,
  };
}

function resolveSettlementChain(input: string | undefined, fallback: PaymentChain): PaymentChain {
  return input === "ton" ? "ton" : fallback;
}

function resolvePaymentTraceRecord(params: {
  store: Web3StateStore;
  orderId?: string;
  settlementId?: string;
}): StoredPaymentRecord | undefined {
  const { orderId, settlementId, store } = params;
  const matches = store.listPaymentRequiredRecords().filter((record) => {
    if (orderId && record.settlement?.orderId === orderId) {
      return true;
    }
    if (settlementId && record.settlement?.settlementId === settlementId) {
      return true;
    }
    return false;
  });
  return matches.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function buildPaymentIntent(record: StoredPaymentRecord | undefined): PaymentIntent | undefined {
  if (!record?.paymentIntent) {
    return undefined;
  }
  return record.paymentIntent;
}

function buildStoredPaymentReceipt(
  record: StoredPaymentRecord | undefined,
): PaymentReceipt | undefined {
  if (!record) {
    return undefined;
  }
  const amount = record.amount;
  const txHash = record.resumeToken.txHash;
  if (!amount && !txHash) {
    return undefined;
  }
  return {
    receiptId: record.resumeToken.paymentReceiptId,
    chain: record.resumeToken.chain,
    network: record.network ?? record.resumeToken.network,
    txHash,
    amount,
    tokenAddress: record.resumeToken.asset,
    confirmedAt: record.consumedAt ?? record.createdAt,
    mode: txHash ? "live" : "simulated",
    confirmationStatus: record.status === "failed" ? "failed" : record.confirmationStatus,
    rail: "x402",
    payer: record.resumeToken.payer,
    payTo: record.resumeToken.payTo,
    orderId: record.settlement?.orderId,
    settlementId: record.settlement?.settlementId,
    intentId: record.resumeToken.intentId,
    treasuryRouteId: record.treasuryRoute?.routeId,
  };
}

function resolvePaymentReceiptFromSettlement(params: {
  chain: PaymentChain;
  network?: string;
  amount?: string;
  tokenAddress?: string;
  receiptId?: string;
  intentId?: string;
  treasuryRouteId?: string;
  paymentTxHash?: string;
  paymentConfirmedAt?: string;
  lockTxHash?: string;
  lockedAt?: string;
  releaseTxHash?: string;
  releasedAt?: string;
  refundTxHash?: string;
  refundedAt?: string;
  confirmationStatus?: PaymentConfirmationStatus;
}): PaymentReceipt | undefined {
  const {
    chain,
    network,
    amount,
    tokenAddress,
    receiptId,
    intentId,
    treasuryRouteId,
    paymentTxHash,
    paymentConfirmedAt,
    lockTxHash,
    lockedAt,
    releaseTxHash,
    releasedAt,
    refundTxHash,
    refundedAt,
    confirmationStatus,
  } = params;
  const txHash = paymentTxHash ?? lockTxHash ?? releaseTxHash ?? refundTxHash;
  const confirmedAt = paymentConfirmedAt ?? lockedAt ?? releasedAt ?? refundedAt;
  if (!txHash && !amount && !receiptId) return undefined;
  return {
    receiptId,
    chain,
    network,
    txHash,
    amount,
    tokenAddress,
    confirmedAt,
    confirmationStatus,
    mode: txHash ? "live" : "simulated",
    intentId,
    treasuryRouteId,
  };
}

function resolveFxQuote(record: StoredPaymentRecord | undefined): FXQuote | undefined {
  return record?.fxQuote;
}

function resolveTreasuryRoute(record: StoredPaymentRecord | undefined): TreasuryRoute | undefined {
  return record?.treasuryRoute;
}

export function createMarketReconciliationSummaryHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      const input = (params ?? {}) as ReconciliationInput;
      const orderId = typeof input.orderId === "string" ? input.orderId.trim() : undefined;
      const settlementId =
        typeof input.settlementId === "string" ? input.settlementId.trim() : undefined;
      const leaseId = typeof input.leaseId === "string" ? input.leaseId.trim() : undefined;
      const includeLedger = input.includeLedger !== false && Boolean(leaseId);
      const includeDisputes = input.includeDisputes !== false;
      const requestedChain = input.chain === "ton" ? "ton" : "evm";
      const network = typeof input.network === "string" ? input.network : config.chain.network;

      if (!orderId && !settlementId) {
        throw new Error("orderId or settlementId is required");
      }

      const callGateway = await loadCallGateway();
      const settlementResponse = await callGateway({
        method: "market.settlement.status",
        params: orderId ? { orderId } : { settlementId },
        timeoutMs: config.brain.timeoutMs,
      });
      const settlementResult = normalizeGatewayResult(settlementResponse);
      if (!settlementResult.ok) {
        throw new Error(settlementResult.error ?? "market.settlement.status failed");
      }

      const settlementPayload = (settlementResult.result ?? {}) as Record<string, unknown>;
      const resolvedOrderId =
        typeof settlementPayload.orderId === "string" ? settlementPayload.orderId : orderId;
      const resolvedSettlementId =
        typeof settlementPayload.settlementId === "string"
          ? settlementPayload.settlementId
          : settlementId;

      if (!resolvedOrderId || !resolvedSettlementId) {
        throw new Error("settlement response missing orderId or settlementId");
      }

      let disputeSummary: ReconciliationSummary["disputes"];
      if (includeDisputes) {
        const disputeResponse = await callGateway({
          method: "market.dispute.list",
          params: { orderId: resolvedOrderId, limit: 200 },
          timeoutMs: config.brain.timeoutMs,
        });
        const disputeResult = normalizeGatewayResult(disputeResponse);
        if (disputeResult.ok) {
          const payload = (disputeResult.result ?? {}) as { disputes?: Array<{ status?: string }> };
          const disputes = Array.isArray(payload.disputes) ? payload.disputes : [];
          disputeSummary = {
            total: disputes.length,
            byStatus: countByStatus(disputes),
          };
        }
      }

      let serviceProofSummary: ReconciliationSummary["serviceProofs"];
      const serviceProofResponse = await callGateway({
        method: "market.service.proof.list",
        params: { orderId: resolvedOrderId, limit: 200 },
        timeoutMs: config.brain.timeoutMs,
      });
      const serviceProofResult = normalizeGatewayResult(serviceProofResponse);
      if (serviceProofResult.ok) {
        const payload = (serviceProofResult.result ?? {}) as {
          proofs?: ServiceProofSummaryInput[];
        };
        const proofs = Array.isArray(payload.proofs) ? payload.proofs : [];
        serviceProofSummary = summarizeServiceProofs(proofs);
      }

      let ledgerSummary: ReconciliationSummary["ledgerSummary"];
      if (includeLedger && leaseId) {
        const ledgerResponse = await callGateway({
          method: "market.ledger.summary",
          params: { leaseId },
          timeoutMs: config.brain.timeoutMs,
        });
        const ledgerResult = normalizeGatewayResult(ledgerResponse);
        if (ledgerResult.ok) {
          const payload = (ledgerResult.result ?? {}) as { summary?: unknown };
          ledgerSummary = redactUnknown(
            payload.summary ?? payload,
          ) as ReconciliationSummary["ledgerSummary"];
        }
      }

      const paymentRecord = resolvePaymentTraceRecord({
        store,
        orderId: resolvedOrderId,
        settlementId: resolvedSettlementId,
      });
      const paymentIntent = buildPaymentIntent(paymentRecord);
      const paymentReceipt =
        buildStoredPaymentReceipt(paymentRecord) ??
        resolvePaymentReceiptFromSettlement({
          chain: resolveSettlementChain(
            typeof settlementPayload.paymentChain === "string"
              ? settlementPayload.paymentChain
              : undefined,
            requestedChain,
          ),
          network:
            typeof settlementPayload.paymentNetwork === "string"
              ? settlementPayload.paymentNetwork
              : network,
          amount:
            typeof settlementPayload.amount === "string" ? settlementPayload.amount : undefined,
          tokenAddress:
            typeof settlementPayload.tokenAddress === "string"
              ? settlementPayload.tokenAddress
              : undefined,
          receiptId:
            typeof settlementPayload.paymentReceiptId === "string"
              ? settlementPayload.paymentReceiptId
              : undefined,
          intentId:
            typeof settlementPayload.paymentIntentId === "string"
              ? settlementPayload.paymentIntentId
              : undefined,
          treasuryRouteId:
            typeof settlementPayload.treasuryRouteId === "string"
              ? settlementPayload.treasuryRouteId
              : undefined,
          paymentTxHash:
            typeof settlementPayload.paymentTxHash === "string"
              ? settlementPayload.paymentTxHash
              : undefined,
          paymentConfirmedAt:
            typeof settlementPayload.paymentConfirmedAt === "string"
              ? settlementPayload.paymentConfirmedAt
              : undefined,
          lockTxHash:
            typeof settlementPayload.lockTxHash === "string"
              ? settlementPayload.lockTxHash
              : undefined,
          lockedAt:
            typeof settlementPayload.lockedAt === "string" ? settlementPayload.lockedAt : undefined,
          releaseTxHash:
            typeof settlementPayload.releaseTxHash === "string"
              ? settlementPayload.releaseTxHash
              : undefined,
          releasedAt:
            typeof settlementPayload.releasedAt === "string"
              ? settlementPayload.releasedAt
              : undefined,
          refundTxHash:
            typeof settlementPayload.refundTxHash === "string"
              ? settlementPayload.refundTxHash
              : undefined,
          refundedAt:
            typeof settlementPayload.refundedAt === "string"
              ? settlementPayload.refundedAt
              : undefined,
          confirmationStatus:
            typeof settlementPayload.confirmationStatus === "string"
              ? (settlementPayload.confirmationStatus as PaymentConfirmationStatus)
              : undefined,
        });

      const archiveReceipt = store.getArchiveReceipt();
      const anchorReceipt = store.getLastAnchorReceipt();
      const summary: ReconciliationSummary = {
        orderId: resolvedOrderId,
        settlementId: resolvedSettlementId,
        leaseId,
        paymentIntent,
        paymentReceipt,
        fxQuote: resolveFxQuote(paymentRecord),
        treasuryRoute: resolveTreasuryRoute(paymentRecord),
        paymentTrace: paymentRecord
          ? {
              requestId: paymentRecord.requestId,
              idempotencyKey: paymentRecord.idempotencyKey,
              invoiceId: paymentRecord.resumeToken.invoiceId,
              paymentReceiptId: paymentRecord.resumeToken.paymentReceiptId,
              txHash: paymentRecord.resumeToken.txHash,
              toolName: paymentRecord.toolName,
              chain: paymentRecord.resumeToken.chain,
              network: paymentRecord.network ?? paymentRecord.resumeToken.network,
              amount: paymentRecord.amount,
              status: paymentRecord.status,
              reused: paymentRecord.reused,
              confirmationStatus: paymentRecord.confirmationStatus,
              intentId: paymentRecord.resumeToken.intentId,
              fxQuoteId: paymentRecord.fxQuote?.quoteId,
              treasuryRouteId: paymentRecord.treasuryRoute?.routeId,
              createdAt: paymentRecord.createdAt,
              updatedAt: paymentRecord.updatedAt,
            }
          : undefined,
        settlement: {
          status:
            typeof settlementPayload.status === "string" ? settlementPayload.status : undefined,
          amount:
            typeof settlementPayload.amount === "string" ? settlementPayload.amount : undefined,
          releasedAmount:
            typeof settlementPayload.releasedAmount === "string"
              ? settlementPayload.releasedAmount
              : undefined,
          strategy:
            settlementPayload.strategy === "metered" || settlementPayload.strategy === "one-shot"
              ? settlementPayload.strategy
              : undefined,
          tokenAddress:
            typeof settlementPayload.tokenAddress === "string"
              ? settlementPayload.tokenAddress
              : undefined,
          lockedAt:
            typeof settlementPayload.lockedAt === "string" ? settlementPayload.lockedAt : undefined,
          releasedAt:
            typeof settlementPayload.releasedAt === "string"
              ? settlementPayload.releasedAt
              : undefined,
          refundedAt:
            typeof settlementPayload.refundedAt === "string"
              ? settlementPayload.refundedAt
              : undefined,
          paymentChain:
            typeof settlementPayload.paymentChain === "string"
              ? resolveSettlementChain(settlementPayload.paymentChain, requestedChain)
              : paymentReceipt?.chain,
          paymentNetwork:
            typeof settlementPayload.paymentNetwork === "string"
              ? settlementPayload.paymentNetwork
              : paymentReceipt?.network,
          confirmationStatus:
            typeof settlementPayload.confirmationStatus === "string"
              ? (settlementPayload.confirmationStatus as PaymentConfirmationStatus)
              : paymentReceipt?.confirmationStatus,
        },
        ledgerSummary,
        disputes: disputeSummary,
        serviceProofs: serviceProofSummary,
        archiveReceipt: archiveReceipt
          ? {
              cid: archiveReceipt.cid,
              uri: archiveReceipt.uri,
              updatedAt: archiveReceipt.updatedAt,
            }
          : undefined,
        anchorReceipt: anchorReceipt
          ? {
              tx: anchorReceipt.tx,
              network: anchorReceipt.network,
              block: anchorReceipt.block,
              updatedAt: anchorReceipt.updatedAt,
            }
          : undefined,
      };

      respond(true, summary);
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}
