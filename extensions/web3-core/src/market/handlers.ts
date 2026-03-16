import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { resolveEnsAddress } from "../identity/ens.js";
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

async function callMarketGateway(
  config: Web3PluginConfig,
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const callGateway = await loadCallGateway();
  const response = await callGateway({
    method,
    params,
    timeoutMs: config.brain.timeoutMs,
  });
  const normalized = normalizeGatewayResult(response);
  if (!normalized.ok) {
    throw new Error(normalized.error ?? `${method} failed`);
  }
  return (normalized.result ?? {}) as Record<string, unknown>;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`E_NOT_FOUND: ${label} not found`);
  }
  return value as Record<string, unknown>;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function buildQuotePayload(resource: Record<string, unknown>, quantity: number, ttlMs?: number) {
  const price = requireRecord(resource.price, "resource.price");
  const amount = toFiniteNumber(price.amount, 0);
  const estimatedTotal = amount * quantity;
  const serviceSchema =
    resource.serviceSchema && typeof resource.serviceSchema === "object"
      ? (resource.serviceSchema as Record<string, unknown>)
      : undefined;
  const proofRequirements = Array.isArray(serviceSchema?.proofRequirements)
    ? serviceSchema.proofRequirements
    : [];
  return {
    resourceId: String(resource.resourceId ?? ""),
    offerId: String(resource.offerId ?? ""),
    providerActorId: String(resource.providerActorId ?? ""),
    kind: String(resource.kind ?? "unknown"),
    label: typeof resource.label === "string" ? resource.label : null,
    price: {
      unit: typeof price.unit === "string" ? price.unit : null,
      amount: typeof price.amount === "string" ? price.amount : String(amount),
      currency: typeof price.currency === "string" ? price.currency : null,
    },
    quantity,
    requestedLeaseTtlMs: ttlMs ?? null,
    estimatedTotal: Number.isFinite(estimatedTotal)
      ? estimatedTotal.toFixed(6).replace(/\.0+$|(?<=\.\d*?)0+$/g, "")
      : null,
    proofRequired: proofRequirements.length > 0,
    proofTypes: proofRequirements
      .map((entry) =>
        entry &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>).type === "string"
          ? (entry as Record<string, unknown>).type
          : null,
      )
      .filter((entry): entry is string => Boolean(entry)),
    serviceSchema: serviceSchema ?? null,
  };
}

function scoreComparableResource(
  resource: Record<string, unknown>,
  query: string | undefined,
  preferredKind: string | undefined,
): number {
  let score = 0;
  const label = typeof resource.label === "string" ? resource.label.toLowerCase() : "";
  const description =
    typeof resource.description === "string" ? resource.description.toLowerCase() : "";
  const tags = Array.isArray(resource.tags)
    ? resource.tags
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.toLowerCase())
    : [];
  const amount = toFiniteNumber((resource.price as Record<string, unknown> | undefined)?.amount, 0);
  const proofRequirements = Array.isArray(
    (resource.serviceSchema as Record<string, unknown> | undefined)?.proofRequirements,
  )
    ? ((resource.serviceSchema as Record<string, unknown>).proofRequirements as unknown[])
    : [];

  if (preferredKind && resource.kind === preferredKind) score += 4;
  if (query) {
    const normalized = query.toLowerCase();
    if (label.includes(normalized)) score += 5;
    if (description.includes(normalized)) score += 2;
    if (tags.some((entry) => entry.includes(normalized))) score += 3;
  }
  if (proofRequirements.length > 0) score += 2;
  score += Math.max(0, 3 - Math.min(amount, 3));
  return Number(score.toFixed(2));
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

export function createMarketOrderListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.order.list", { requireResources: false });
}

export function createMarketOfferQuoteHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const resourceId =
        typeof input.resourceId === "string" && input.resourceId.trim().length > 0
          ? input.resourceId.trim()
          : null;
      if (!resourceId) {
        throw new Error("E_INVALID_ARGUMENT: resourceId is required");
      }
      const quantity = Math.max(1, Math.floor(toFiniteNumber(input.quantity, 1)));
      const ttlMs =
        typeof input.ttlMs === "number" && Number.isFinite(input.ttlMs)
          ? Math.max(1, input.ttlMs)
          : undefined;
      const payload = await callMarketGateway(config, "market.resource.get", { resourceId });
      const resource = requireRecord(payload.resource, "resource");
      respond(
        true,
        redactUnknown({
          quote: buildQuotePayload(resource, quantity, ttlMs),
        }) as Record<string, unknown>,
      );
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

export function createMarketOfferCompareHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const kind =
        typeof input.kind === "string" && input.kind.trim().length > 0
          ? input.kind.trim()
          : undefined;
      const tag =
        typeof input.tag === "string" && input.tag.trim().length > 0 ? input.tag.trim() : undefined;
      const query =
        typeof input.query === "string" && input.query.trim().length > 0
          ? input.query.trim()
          : undefined;
      const quantity = Math.max(1, Math.floor(toFiniteNumber(input.quantity, 1)));
      const limit = Math.max(1, Math.min(20, Math.floor(toFiniteNumber(input.limit, 5))));
      const payload = await callMarketGateway(config, "market.resource.list", {
        kind,
        tag,
        status: "resource_published",
        limit: Math.max(limit * 5, 20),
      });
      const resources = Array.isArray(payload.resources) ? payload.resources : [];
      const candidates = resources
        .filter(
          (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
        )
        .map((resource) => ({
          score: scoreComparableResource(resource, query, kind),
          quote: buildQuotePayload(resource, quantity),
        }))
        .filter((entry) => entry.score > 0 || !query)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);

      respond(
        true,
        redactUnknown({
          count: candidates.length,
          candidates,
        }) as Record<string, unknown>,
      );
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

export function createMarketSettlementQueryHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.settlement.query", { requireResources: false });
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

export function createMarketServiceProofSubmitHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.service.proof.submit");
}

export function createMarketServiceProofGetHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.service.proof.get", { requireResources: false });
}

export function createMarketServiceProofListHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.service.proof.list", { requireResources: false });
}

export function createMarketProofSubmitHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.proof.submit");
}

export function createMarketProofVerifyHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.proof.verify", { requireResources: false });
}

export function createMarketAcceptanceSignHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.acceptance.sign");
}

export function createMarketAcceptanceRejectHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.acceptance.reject");
}

export function createMarketExecutionStatusHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.execution.get", { requireResources: false });
}

export function createMarketLedgerListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.ledger.list", { requireResources: false });
}

export function createMarketLedgerSummaryHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.ledger.summary", { requireResources: false });
}

export function createMarketReputationSummaryHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      const callGateway = await loadCallGateway();
      const response = await callGateway({
        method: "market.reputation.summary",
        params,
        timeoutMs: config.brain.timeoutMs,
      });
      const normalized = normalizeGatewayResult(response);
      if (!normalized.ok) {
        respond(false, formatWeb3GatewayErrorResponse(normalized.error));
        return;
      }

      const summary = (normalized.result ?? {}) as Record<string, unknown>;
      const providerActorId =
        typeof summary.providerActorId === "string" ? summary.providerActorId : undefined;

      let ensName: string | null = null;
      let ensSource: "binding" | "reverse" | "none" = "none";
      let ensStatus: "ok" | "degraded" | "none" = "none";

      if (providerActorId) {
        const binding = store
          .getBindings()
          .find((entry) => entry.address.toLowerCase() === providerActorId.toLowerCase());
        if (binding?.ensName) {
          ensName = binding.ensName;
          ensSource = "binding";
          ensStatus = "ok";
        } else {
          const reverse = await resolveEnsAddress(providerActorId, config.chain.rpcUrl);
          if (reverse?.name) {
            ensName = reverse.name;
            ensSource = "reverse";
            ensStatus = "ok";
          } else {
            ensStatus = "degraded";
          }
        }
      }

      respond(true, {
        ...summary,
        identity: {
          providerActorId: providerActorId ?? null,
          ensName,
          ensSource,
          ensStatus,
        },
      });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
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

export { createMarketReconciliationSummaryHandler } from "./reconciliation.js";

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
