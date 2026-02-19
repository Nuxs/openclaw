import type { StreamFn } from "@mariozechner/pi-agent-core";
import { streamSimple } from "@mariozechner/pi-ai";
import type { Web3PluginConfig } from "../config.js";
import { getConsumerLeaseAccess } from "../resources/leases.js";

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

function resolveTimeoutSignal(timeoutMs: number, existing?: AbortSignal): AbortSignal | undefined {
  if (existing) {
    return existing;
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return undefined;
  }
  // Use built-in AbortSignal.timeout to avoid timer leaks —
  // the runtime cleans up the internal timer when the signal is GC'd.
  return AbortSignal.timeout(timeoutMs);
}

export function createWeb3StreamFn(config: Web3PluginConfig): StreamFn | undefined {
  const brain = config.brain;
  if (!brain.enabled) {
    return undefined;
  }
  if (brain.protocol !== "openai-compat") {
    return undefined;
  }

  const canUseLease = config.resources.enabled && config.resources.consumer.enabled;
  const hasEndpoint = Boolean(brain.endpoint?.trim());
  if (!hasEndpoint && !canUseLease) {
    return undefined;
  }

  return (model, context, options) => {
    const lease = canUseLease ? getConsumerLeaseAccess(model.id) : null;
    const endpoint = lease?.providerEndpoint?.trim() || brain.endpoint?.trim() || "";
    const baseUrl = normalizeBaseUrl(endpoint);
    if (!baseUrl) {
      return streamSimple(model, context, options);
    }

    const signal = resolveTimeoutSignal(brain.timeoutMs, options?.signal);
    const mergedOptions = signal && signal !== options?.signal ? { ...options, signal } : options;

    let headers = mergedOptions?.headers;
    if (lease) {
      headers = {
        ...headers,
        Authorization: `Bearer ${lease.accessToken}`,
        "X-OpenClaw-Lease": lease.leaseId,
      };
    }
    const finalOptions = headers ? { ...mergedOptions, headers } : mergedOptions;

    const overrideModel = {
      ...model,
      baseUrl,
      provider: brain.providerId || model.provider,
    };
    return streamSimple(overrideModel, context, finalOptions);
  };
}
