import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import type { Web3StateStore } from "../state/store.js";
import { redactUnknown } from "../utils/redact.js";
import { loadCallGateway, normalizeGatewayResult } from "./proxy-utils.js";

type MarketProxyOptions = {
  requireResources?: boolean;
  requireConsumer?: boolean;
  requireAdvertise?: boolean;
};

function requireResourcesEnabled(config: Web3PluginConfig) {
  if (!config.resources.enabled) {
    throw new Error("resources is disabled");
  }
}

function requireConsumerEnabled(config: Web3PluginConfig) {
  if (!config.resources.consumer.enabled) {
    throw new Error("resources consumer is disabled");
  }
}

function requireAdvertiseEnabled(config: Web3PluginConfig) {
  if (!config.resources.advertiseToMarket) {
    throw new Error("resources advertiseToMarket is disabled");
  }
}

function createMarketProxyHandler(
  config: Web3PluginConfig,
  method: string,
  opts: MarketProxyOptions = {},
): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      if (opts.requireResources ?? true) requireResourcesEnabled(config);
      if (opts.requireConsumer) requireConsumerEnabled(config);
      if (opts.requireAdvertise) requireAdvertiseEnabled(config);

      const callGateway = await loadCallGateway();
      const response = await callGateway({
        method,
        params,
        timeoutMs: config.brain.timeoutMs,
      });
      const normalized = normalizeGatewayResult(response);
      if (!normalized.ok) {
        respond(false, formatWeb3GatewayErrorResponse(normalized.error));
        return;
      }
      respond(true, normalized.result ?? {});
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

export function createMarketResourcePublishHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.resource.publish", { requireAdvertise: true });
}

export function createMarketResourceUnpublishHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.resource.unpublish", { requireAdvertise: true });
}

export function createMarketResourceGetHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.resource.get", { requireResources: false });
}

export function createMarketResourceListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.resource.list", { requireResources: false });
}

export function createMarketLeaseIssueHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.lease.issue", { requireConsumer: true });
}

export function createMarketLeaseRevokeHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.lease.revoke");
}

export function createMarketLeaseGetHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.lease.get", { requireResources: false });
}

export function createMarketLeaseListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.lease.list", { requireResources: false });
}

export function createMarketLeaseExpireSweepHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.lease.expireSweep");
}

export function createMarketLedgerListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.ledger.list", { requireResources: false });
}

export function createMarketLedgerSummaryHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.ledger.summary", { requireResources: false });
}

export function createMarketReputationSummaryHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.reputation.summary", { requireResources: false });
}

export function createMarketTokenEconomySummaryHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.tokenEconomy.summary", {
    requireResources: false,
  });
}

export function createMarketTokenEconomyConfigureHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.tokenEconomy.configure", {
    requireResources: false,
  });
}

export function createMarketTokenEconomyMintHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.tokenEconomy.mint", { requireResources: false });
}

export function createMarketTokenEconomyBurnHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.tokenEconomy.burn", { requireResources: false });
}

export function createMarketTokenEconomyGovernanceUpdateHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.tokenEconomy.governance.update", {
    requireResources: false,
  });
}

export function createMarketBridgeRoutesHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.bridge.routes", { requireResources: false });
}

export function createMarketBridgeRequestHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.bridge.request", { requireResources: false });
}

export function createMarketBridgeUpdateHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.bridge.update", { requireResources: false });
}

export function createMarketBridgeStatusHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.bridge.status", { requireResources: false });
}

export function createMarketBridgeListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.bridge.list", { requireResources: false });
}

export function createMarketStatusSummaryHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.status.summary", { requireResources: false });
}

export function createMarketMetricsSnapshotHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.metrics.snapshot", { requireResources: false });
}

import type { PaymentChain, PaymentReceipt, ReconciliationSummary } from "@openclaw/market-core";

type ReconciliationInput = {
  orderId?: string;
  settlementId?: string;
  leaseId?: string;
  chain?: string;
  network?: string;
  includeLedger?: boolean;
  includeDisputes?: boolean;
};

function countByStatus(items: Array<{ status?: string }>): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.status ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function resolvePaymentReceipt(params: {
  chain: PaymentChain;
  network?: string;
  amount?: string;
  tokenAddress?: string;
  lockTxHash?: string;
  lockedAt?: string;
  releaseTxHash?: string;
  releasedAt?: string;
  refundTxHash?: string;
  refundedAt?: string;
}): PaymentReceipt | undefined {
  const {
    chain,
    network,
    amount,
    tokenAddress,
    lockTxHash,
    lockedAt,
    releaseTxHash,
    releasedAt,
    refundTxHash,
    refundedAt,
  } = params;
  const txHash = lockTxHash ?? releaseTxHash ?? refundTxHash;
  const confirmedAt = lockedAt ?? releasedAt ?? refundedAt;
  if (!txHash && !amount) return undefined;
  return {
    chain,
    network,
    txHash,
    amount,
    tokenAddress,
    confirmedAt,
    mode: txHash ? "live" : "simulated",
  };
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
      const chain = input.chain === "ton" ? "ton" : "evm";
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

      const paymentReceipt = resolvePaymentReceipt({
        chain,
        network,
        amount: typeof settlementPayload.amount === "string" ? settlementPayload.amount : undefined,
        tokenAddress:
          typeof settlementPayload.tokenAddress === "string"
            ? settlementPayload.tokenAddress
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
      });

      const archiveReceipt = store.getArchiveReceipt();
      const anchorReceipt = store.getLastAnchorReceipt();

      const summary: ReconciliationSummary = {
        orderId: resolvedOrderId,
        settlementId: resolvedSettlementId,
        leaseId,
        paymentReceipt,
        settlement: {
          status:
            typeof settlementPayload.status === "string" ? settlementPayload.status : undefined,
          amount:
            typeof settlementPayload.amount === "string" ? settlementPayload.amount : undefined,
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
        },
        ledgerSummary,
        disputes: disputeSummary,
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

export function createMarketDisputeGetHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.dispute.get", { requireResources: false });
}

export function createMarketDisputeListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.dispute.list", { requireResources: false });
}

export function createMarketDisputeOpenHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.dispute.open", { requireResources: false });
}

export function createMarketDisputeSubmitEvidenceHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.dispute.submitEvidence", {
    requireResources: false,
  });
}

export function createMarketDisputeResolveHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.dispute.resolve", { requireResources: false });
}

export function createMarketDisputeRejectHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.dispute.reject", { requireResources: false });
}
