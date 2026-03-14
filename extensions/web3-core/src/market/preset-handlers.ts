import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { Web3PluginConfig } from "../config.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { buildMarketPresetPreview, verifyMarketPresetBaseline } from "../setup/orchestrator.js";
import type {
  MarketPresetIntent,
  MarketPresetMode,
  MarketPresetRuntimeHint,
} from "../setup/preset-types.js";

export function createMarketPresetPreviewHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      const input = asRecord(params);
      const plan = buildMarketPresetPreview(config, {
        mode: parsePresetMode(input.mode),
        intent: parsePresetIntent(input.intent),
        currentConfig: isRecord(input.currentConfig) ? input.currentConfig : undefined,
        runtimeHints: parseRuntimeHints(input.runtimeHints),
        nodeLabel: typeof input.nodeLabel === "string" ? input.nodeLabel : undefined,
      });
      respond(true, plan as unknown as Record<string, unknown>);
    } catch (error) {
      respond(false, formatWeb3GatewayErrorResponse(error));
    }
  };
}

export function createMarketPresetVerifyHandler(config: Web3PluginConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      const input = asRecord(params);
      const verification = await verifyMarketPresetBaseline({
        config,
        mode: parsePresetMode(input.mode),
      });
      respond(true, verification as unknown as Record<string, unknown>);
    } catch (error) {
      respond(false, formatWeb3GatewayErrorResponse(error));
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function parsePresetMode(value: unknown): MarketPresetMode | undefined {
  return value === "single-node" || value === "trusted-circle" || value === "hybrid-cloud-edge"
    ? value
    : undefined;
}

function parsePresetIntent(value: unknown): MarketPresetIntent | undefined {
  return value === "consumer" || value === "provider" || value === "hybrid" ? value : undefined;
}

function parseRuntimeHints(value: unknown): MarketPresetRuntimeHint[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter(isRecord).map((hint) => ({
    kind:
      hint.kind === "lmstudio" || hint.kind === "openai-compat" || hint.kind === "custom"
        ? hint.kind
        : "ollama",
    label: typeof hint.label === "string" ? hint.label : undefined,
    models: Array.isArray(hint.models)
      ? hint.models.filter((entry: unknown): entry is string => typeof entry === "string")
      : undefined,
    maxConcurrent: typeof hint.maxConcurrent === "number" ? hint.maxConcurrent : undefined,
  }));
}
