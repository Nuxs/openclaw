import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { loadCallGateway, normalizeGatewayResult } from "./proxy-utils.js";

type CommerceProxyOptions = {
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

function createCommerceProxyHandler(
  config: Web3PluginConfig,
  method: string,
  opts: CommerceProxyOptions = {},
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

export function createMarketOfferCreateHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createCommerceProxyHandler(config, "market.offer.create", { requireAdvertise: true });
}

export function createMarketOfferPublishHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createCommerceProxyHandler(config, "market.offer.publish", { requireAdvertise: true });
}

export function createMarketOfferUpdateHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createCommerceProxyHandler(config, "market.offer.update", { requireAdvertise: true });
}

export function createMarketOfferCloseHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createCommerceProxyHandler(config, "market.offer.close", { requireAdvertise: true });
}

export function createMarketOrderCreateHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createCommerceProxyHandler(config, "market.order.create", { requireConsumer: true });
}

export function createMarketOrderCancelHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createCommerceProxyHandler(config, "market.order.cancel", { requireConsumer: true });
}

export function createMarketConsentGrantHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createCommerceProxyHandler(config, "market.consent.grant", { requireConsumer: true });
}

export function createMarketConsentRevokeHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createCommerceProxyHandler(config, "market.consent.revoke", { requireConsumer: true });
}

export function createMarketDeliveryIssueHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createCommerceProxyHandler(config, "market.delivery.issue", { requireAdvertise: true });
}

export function createMarketDeliveryRevokeHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createCommerceProxyHandler(config, "market.delivery.revoke", { requireAdvertise: true });
}

export function createMarketDeliveryCompleteHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createCommerceProxyHandler(config, "market.delivery.complete", {
    requireAdvertise: true,
  });
}
