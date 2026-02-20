import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";

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

type MarketProxyOptions = {
  requireResources?: boolean;
  requireConsumer?: boolean;
  requireAdvertise?: boolean;
};

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
        respond(false, { error: normalized.error });
        return;
      }
      respond(true, normalized.result ?? {});
    } catch (err) {
      respond(false, { error: err instanceof Error ? err.message : String(err) });
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
  return createMarketProxyHandler(config, "market.resource.get");
}

export function createMarketResourceListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.resource.list");
}

export function createMarketLeaseIssueHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.lease.issue", { requireConsumer: true });
}

export function createMarketLeaseRevokeHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.lease.revoke");
}

export function createMarketLeaseGetHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.lease.get");
}

export function createMarketLeaseListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.lease.list");
}

export function createMarketLeaseExpireSweepHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.lease.expireSweep");
}

export function createMarketLedgerListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.ledger.list");
}

export function createMarketLedgerSummaryHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createMarketProxyHandler(config, "market.ledger.summary");
}
