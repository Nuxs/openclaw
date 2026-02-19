import type { PluginHookBeforeModelResolveResult } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";

function isAllowlisted(allowlist: string[], modelId: string): boolean {
  if (allowlist.length === 0) {
    return true;
  }
  return allowlist.includes(modelId);
}

export function resolveBrainModelOverride(
  config: Web3PluginConfig,
): PluginHookBeforeModelResolveResult | undefined {
  const brain = config.brain;
  if (!brain.enabled) {
    return undefined;
  }
  if (!brain.providerId || !brain.defaultModel) {
    return undefined;
  }
  if (!isAllowlisted(brain.allowlist, brain.defaultModel)) {
    return undefined;
  }
  if (brain.protocol === "openai-compat") {
    const endpoint = brain.endpoint?.trim();
    if (!endpoint) {
      return undefined;
    }
  }
  return {
    providerOverride: brain.providerId,
    modelOverride: brain.defaultModel,
  };
}
