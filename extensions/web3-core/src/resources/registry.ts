import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { clearConsumerLeaseById, saveConsumerLeaseAccess } from "./leases.js";

type GatewayCallResult = {
  ok?: boolean;
  error?: string;
  result?: unknown;
};

type CallGatewayFn = (opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<unknown>;

async function loadCallGateway(): Promise<CallGatewayFn> {
  try {
    const mod = await import("../../../../src/gateway/call.ts");
    if (typeof mod.callGateway === "function") {
      return mod.callGateway as CallGatewayFn;
    }
  } catch {
    // ignore
  }

  // @ts-expect-error — dist fallback only exists after build; unreachable when src import succeeds
  const mod = await import("../../../../dist/gateway/call.js");
  if (typeof mod.callGateway !== "function") {
    throw new Error("callGateway is not available");
  }
  return mod.callGateway as CallGatewayFn;
}

function normalizeGatewayResult(payload: unknown): {
  ok: boolean;
  result?: unknown;
  error?: string;
} {
  if (payload && typeof payload === "object") {
    const record = payload as GatewayCallResult;
    if (record.ok === false) {
      return { ok: false, error: record.error ?? "gateway call failed" };
    }
    const result = "result" in record ? record.result : payload;
    return { ok: true, result };
  }
  return { ok: true, result: payload };
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
        respond(false, { error: normalized.error });
        return;
      }
      respond(true, normalized.result ?? {});
    } catch (err) {
      respond(false, { error: err instanceof Error ? err.message : String(err) });
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
        respond(false, { error: "resourceId is required" });
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
        respond(false, { error: normalized.error });
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

      respond(true, {
        leaseId: leaseId ?? null,
        orderId: typeof result.orderId === "string" ? result.orderId : null,
        consentId: typeof result.consentId === "string" ? result.consentId : null,
        deliveryId: typeof result.deliveryId === "string" ? result.deliveryId : null,
        expiresAt: expiresAt ?? null,
        stored: Boolean(leaseId && accessToken && expiresAt),
      });
    } catch (err) {
      respond(false, { error: err instanceof Error ? err.message : String(err) });
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
        respond(false, { error: normalized.error });
        return;
      }

      if (leaseId) {
        clearConsumerLeaseById(leaseId);
      }
      respond(true, normalized.result ?? {});
    } catch (err) {
      respond(false, { error: err instanceof Error ? err.message : String(err) });
    }
  };
}

export function createResourceStatusHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);
      const input = (params ?? {}) as { resourceId?: string; leaseId?: string };
      if (!input.resourceId && !input.leaseId) {
        respond(false, { error: "resourceId or leaseId is required" });
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
        respond(false, { error: normalized.error });
        return;
      }
      respond(true, normalized.result ?? {});
    } catch (err) {
      respond(false, { error: err instanceof Error ? err.message : String(err) });
    }
  };
}
