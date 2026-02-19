import type { StreamFn } from "@mariozechner/pi-agent-core";
import { streamSimple } from "@mariozechner/pi-ai";
import type { Web3PluginConfig } from "../config.js";

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
    },
    { once: true },
  );
  return controller.signal;
}

export function createWeb3StreamFn(config: Web3PluginConfig): StreamFn | undefined {
  const brain = config.brain;
  if (!brain.enabled) {
    return undefined;
  }
  if (brain.protocol !== "openai-compat") {
    return undefined;
  }
  const endpoint = brain.endpoint?.trim();
  if (!endpoint) {
    return undefined;
  }
  const baseUrl = normalizeBaseUrl(endpoint);
  if (!baseUrl) {
    return undefined;
  }

  return (model, context, options) => {
    const signal = resolveTimeoutSignal(brain.timeoutMs, options?.signal);
    const mergedOptions = signal && signal !== options?.signal ? { ...options, signal } : options;
    const overrideModel = {
      ...model,
      baseUrl,
      provider: brain.providerId || model.provider,
    };
    return streamSimple(overrideModel, context, mergedOptions);
  };
}
