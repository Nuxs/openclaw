import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
  OpenClawConfig,
} from "openclaw/plugin-sdk";
import type { SessionEntry } from "../../../../src/config/sessions/types.ts";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
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

type SessionSettlement = {
  orderId: string;
  payer: string;
  amount?: string;
  actorId?: string;
};

type SessionStoreHelpers = {
  resolveSessionStoreKey: (params: { cfg: OpenClawConfig; sessionKey: string }) => string;
  resolveStorePath: (store?: string, opts?: { agentId?: string }) => string;
  updateSessionStoreEntry: (params: {
    storePath: string;
    sessionKey: string;
    update: (entry: SessionEntry) => Promise<Partial<SessionEntry> | null>;
  }) => Promise<SessionEntry | null>;
  resolveSessionAgentId: (params: { sessionKey?: string; config?: OpenClawConfig }) => string;
};

async function loadCoreConfig(): Promise<OpenClawConfig> {
  try {
    const mod = await import("../../../../src/config/config.ts");
    if (typeof mod.loadConfig === "function") {
      return await mod.loadConfig();
    }
  } catch {
    // ignore
  }

  const distUrl = new URL("../../../../dist/config/config.js", import.meta.url);
  const mod = await import(distUrl.href);
  if (typeof mod.loadConfig !== "function") {
    throw new Error("loadConfig is not available");
  }
  return await mod.loadConfig();
}

async function loadSessionStoreHelpers(): Promise<SessionStoreHelpers> {
  try {
    const [sessionUtils, sessionPaths, sessionStore, agentScope] = await Promise.all([
      import("../../../../src/gateway/session-utils.ts"),
      import("../../../../src/config/sessions/paths.ts"),
      import("../../../../src/config/sessions/store.ts"),
      import("../../../../src/agents/agent-scope.ts"),
    ]);
    if (
      typeof sessionUtils.resolveSessionStoreKey !== "function" ||
      typeof sessionPaths.resolveStorePath !== "function" ||
      typeof sessionStore.updateSessionStoreEntry !== "function" ||
      typeof agentScope.resolveSessionAgentId !== "function"
    ) {
      throw new Error("session store helpers are unavailable");
    }
    return {
      resolveSessionStoreKey: sessionUtils.resolveSessionStoreKey,
      resolveStorePath: sessionPaths.resolveStorePath,
      updateSessionStoreEntry: sessionStore.updateSessionStoreEntry,
      resolveSessionAgentId: agentScope.resolveSessionAgentId,
    };
  } catch {
    const distUrls = {
      sessionUtils: new URL("../../../../dist/gateway/session-utils.js", import.meta.url).href,
      sessionPaths: new URL("../../../../dist/config/sessions/paths.js", import.meta.url).href,
      sessionStore: new URL("../../../../dist/config/sessions/store.js", import.meta.url).href,
      agentScope: new URL("../../../../dist/agents/agent-scope.js", import.meta.url).href,
    };
    const [sessionUtils, sessionPaths, sessionStore, agentScope] = await Promise.all([
      import(distUrls.sessionUtils),
      import(distUrls.sessionPaths),
      import(distUrls.sessionStore),
      import(distUrls.agentScope),
    ]);
    if (
      typeof sessionUtils.resolveSessionStoreKey !== "function" ||
      typeof sessionPaths.resolveStorePath !== "function" ||
      typeof sessionStore.updateSessionStoreEntry !== "function" ||
      typeof agentScope.resolveSessionAgentId !== "function"
    ) {
      throw new Error("session store helpers are unavailable");
    }
    return {
      resolveSessionStoreKey: sessionUtils.resolveSessionStoreKey,
      resolveStorePath: sessionPaths.resolveStorePath,
      updateSessionStoreEntry: sessionStore.updateSessionStoreEntry,
      resolveSessionAgentId: agentScope.resolveSessionAgentId,
    };
  }
}

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
