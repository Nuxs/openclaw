import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";
import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { Web3PluginConfig } from "../config.js";
import type { SessionEntry } from "../core-imports.js";
import {
  loadCallGateway,
  loadCoreConfig,
  loadSessionStoreHelpers,
  normalizeGatewayResult,
  type GatewayCallResult,
} from "../core-imports.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { clearConsumerLeaseById, saveConsumerLeaseAccess } from "./leases.js";

type SessionSettlement = {
  orderId: string;
  payer: string;
  amount?: string;
  actorId?: string;
};

async function recordLeaseSettlement(params: {
  sessionKey?: string;
  settlement: SessionSettlement;
}): Promise<void> {
  const sessionKey = params.sessionKey?.trim();
  if (!sessionKey) {
    return;
  }
  const orderId = params.settlement.orderId.trim();
  const payer = params.settlement.payer.trim();
  if (!orderId || !payer) {
    return;
  }
  try {
    const cfg = await loadCoreConfig();
    const helpers = await loadSessionStoreHelpers();
    const canonicalKey = helpers.resolveSessionStoreKey({ cfg, sessionKey });
    const agentId = helpers.resolveSessionAgentId({ sessionKey: canonicalKey, config: cfg });
    const storePath = helpers.resolveStorePath(cfg.session?.store, { agentId });
    await helpers.updateSessionStoreEntry({
      storePath,
      sessionKey: canonicalKey,
      update: async (entry) => ({
        settlement: {
          orderId,
          payer,
          amount: params.settlement.amount ?? entry.settlement?.amount,
          actorId: params.settlement.actorId ?? payer,
        },
      }),
    });
  } catch {
    // ignore settlement metadata failures
  }
}

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
  opts: {
    requireAdvertise?: boolean;
    requireConsumer?: boolean;
  } = {},
): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);
      if (opts.requireAdvertise) requireAdvertiseEnabled(config);
      if (opts.requireConsumer) requireConsumerEnabled(config);

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

export function createResourcePublishHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.resource.publish", { requireAdvertise: true });
}

export function createResourceUnpublishHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.resource.unpublish", { requireAdvertise: true });
}

export function createResourceListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.resource.list");
}

export function createResourceLeaseHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);
      requireConsumerEnabled(config);

      const input = (params ?? {}) as Record<string, unknown>;
      const resourceId = typeof input.resourceId === "string" ? input.resourceId.trim() : "";
      if (!resourceId) {
        respond(false, formatWeb3GatewayErrorResponse("resourceId is required"));
        return;
      }

      const callGateway = await loadCallGateway();
      const response = await callGateway({
        method: "market.lease.issue",
        params: input,
        timeoutMs: config.brain.timeoutMs,
      });
      const normalized = normalizeGatewayResult(response);
      if (!normalized.ok) {
        respond(false, formatWeb3GatewayErrorResponse(normalized.error));
        return;
      }

      const result = (normalized.result ?? {}) as Record<string, unknown>;
      const leaseId = typeof result.leaseId === "string" ? result.leaseId : undefined;
      const accessToken = typeof result.accessToken === "string" ? result.accessToken : undefined;
      const expiresAt = typeof result.expiresAt === "string" ? result.expiresAt : undefined;
      if (leaseId && accessToken && expiresAt) {
        const providerEndpointRaw =
          typeof input.providerEndpoint === "string" ? input.providerEndpoint.trim() : "";
        const providerEndpoint = providerEndpointRaw || config.brain.endpoint?.trim() || undefined;
        saveConsumerLeaseAccess({
          leaseId,
          resourceId,
          accessToken,
          expiresAt,
          providerEndpoint,
        });
      }

      const orderId = typeof result.orderId === "string" ? result.orderId : undefined;
      const sessionKey = typeof input.sessionKey === "string" ? input.sessionKey.trim() : "";
      const consumerActorId =
        typeof input.consumerActorId === "string" ? input.consumerActorId.trim() : "";
      const actorId = typeof input.actorId === "string" ? input.actorId.trim() : consumerActorId;
      if (sessionKey && orderId && consumerActorId) {
        void recordLeaseSettlement({
          sessionKey,
          settlement: {
            orderId,
            payer: consumerActorId,
            actorId,
          },
        });
      }

      respond(true, {
        leaseId: leaseId ?? null,
        orderId: orderId ?? null,
        consentId: typeof result.consentId === "string" ? result.consentId : null,
        deliveryId: typeof result.deliveryId === "string" ? result.deliveryId : null,
        expiresAt: expiresAt ?? null,
        stored: Boolean(leaseId && accessToken && expiresAt),
      });
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

export function createResourceRevokeLeaseHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const leaseId = typeof input.leaseId === "string" ? input.leaseId.trim() : "";

      const callGateway = await loadCallGateway();
      const response = await callGateway({
        method: "market.lease.revoke",
        params: input,
        timeoutMs: config.brain.timeoutMs,
      });
      const normalized = normalizeGatewayResult(response);
      if (!normalized.ok) {
        respond(false, formatWeb3GatewayErrorResponse(normalized.error));
        return;
      }

      if (leaseId) {
        clearConsumerLeaseById(leaseId);
      }
      respond(true, normalized.result ?? {});
    } catch (err) {
      respond(false, formatWeb3GatewayErrorResponse(err));
    }
  };
}

export function createResourceStatusHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);
      const input = (params ?? {}) as { resourceId?: string; leaseId?: string };
      if (!input.resourceId && !input.leaseId) {
        respond(false, formatWeb3GatewayErrorResponse("resourceId or leaseId is required"));
        return;
      }
      const method = input.leaseId ? "market.lease.get" : "market.resource.get";
      const callGateway = await loadCallGateway();
      const response = await callGateway({
        method,
        params: input,
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
