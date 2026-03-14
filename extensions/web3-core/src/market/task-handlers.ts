/**
 * Task Market & Privacy public proxy handlers for web3.market.task.* and web3.market.privacy.*
 *
 * Thin proxy layer — delegates to market-core authority handlers via callGateway.
 */
import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { loadCallGateway, normalizeGatewayResult } from "./proxy-utils.js";

function createTaskProxyHandler(config: Web3PluginConfig, method: string): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      if (!config.resources.enabled) {
        throw new Error("resources is disabled");
      }
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

// ── Task Order ──

export function createMarketTaskPublishHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.publish");
}

export function createMarketTaskGetHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.get");
}

export function createMarketTaskListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.list");
}

export function createMarketTaskCancelHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.cancel");
}

export function createMarketTaskExpireSweepHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.expireSweep");
}

// ── Task Bid ──

export function createMarketTaskBidPlaceHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.bid.place");
}

export function createMarketTaskBidListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.bid.list");
}

export function createMarketTaskBidAwardHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.bid.award");
}

// ── Task Result & Receipt ──

export function createMarketTaskResultSubmitHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.result.submit");
}

export function createMarketTaskResultListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.result.list");
}

export function createMarketTaskResultReviewHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.result.review");
}

export function createMarketTaskReceiptGetHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.receipt.get");
}

export function createMarketTaskReceiptListHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.task.receipt.list");
}

// ── Privacy / Consent Replay ──

export function createMarketConsentListHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.consent.list");
}

export function createMarketConsentGetHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.consent.get");
}

export function createMarketPrivacyAssetsHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.privacy.assets");
}

export function createMarketPrivacyReplayGenerateHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.privacy.replay.generate");
}

export function createMarketPrivacyReplayListHandler(
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.privacy.replay.list");
}

export function createMarketPrivacyEraseHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return createTaskProxyHandler(config, "market.privacy.erase");
}
