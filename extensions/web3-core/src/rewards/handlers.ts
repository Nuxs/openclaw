/**
 * web3.reward.* proxy handlers — delegate to market.reward.* via gateway call.
 *
 * Uses the shared proxy infrastructure from `../market/handlers.ts` to avoid
 * duplicating loadCallGateway / normalizeGatewayResult.
 */

import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { loadCallGateway, normalizeGatewayResult } from "../market/proxy-utils.js";

function createRewardProxyHandler(config: Web3PluginConfig, method: string): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
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

export function createWeb3RewardGetHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createRewardProxyHandler(config, "market.reward.get");
}

export function createWeb3RewardListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createRewardProxyHandler(config, "market.reward.list");
}

export function createWeb3RewardClaimHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createRewardProxyHandler(config, "market.reward.issueClaim");
}

export function createWeb3RewardUpdateStatusHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createRewardProxyHandler(config, "market.reward.updateStatus");
}
