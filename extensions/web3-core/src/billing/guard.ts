/**
 * before_tool_call guard: check quota before allowing tool execution.
 * If billing is disabled, always allows.
 */

import type {
  PluginHookBeforeToolCallEvent,
  PluginHookBeforeToolCallResult,
  PluginHookToolContext,
  PluginHookLlmOutputEvent,
  PluginHookAgentContext,
} from "openclaw/plugin-sdk";
import { hashString } from "../audit/canonicalize.js";
import type { Web3PluginConfig } from "../config.js";
import type { Web3StateStore } from "../state/store.js";
import type { UsageRecord } from "./types.js";

export function createBillingGuard(store: Web3StateStore, config: Web3PluginConfig) {
  return (
    _event: PluginHookBeforeToolCallEvent,
    ctx: PluginHookToolContext,
  ): PluginHookBeforeToolCallResult | void => {
    if (!config.billing.enabled) return;

    const sessionHash = resolveSessionHash({ sessionKey: ctx.sessionKey });
    const usage = getOrCreateUsage(store, sessionHash, config);

    if (usage.creditsUsed >= usage.creditsQuota) {
      return {
        block: true,
        blockReason: `Quota exhausted (${usage.creditsUsed}/${usage.creditsQuota} credits). Use /credits for details.`,
      };
    }

    // Deduct cost
    usage.creditsUsed += config.billing.costPerToolCall;
    usage.toolCalls += 1;
    usage.lastActivity = new Date().toISOString();
    store.saveUsage(usage);
  };
}

export function createBillingLlmUsageHook(store: Web3StateStore, config: Web3PluginConfig) {
  return (event: PluginHookLlmOutputEvent, ctx: PluginHookAgentContext) => {
    if (!config.billing.enabled) return;

    const sessionHash = resolveSessionHash({
      sessionKey: ctx.sessionKey,
      sessionId: ctx.sessionId,
    });
    const usage = getOrCreateUsage(store, sessionHash, config);

    usage.creditsUsed += config.billing.costPerLlmCall;
    usage.llmCalls += 1;
    usage.lastActivity = new Date().toISOString();
    store.saveUsage(usage);
  };
}

export function resolveSessionHash(input: {
  sessionKey?: string;
  sessionId?: string;
  senderId?: string;
}) {
  return hashString(input.sessionKey ?? input.sessionId ?? input.senderId ?? "unknown");
}

function getOrCreateUsage(
  store: Web3StateStore,
  sessionIdHash: string,
  config: Web3PluginConfig,
): UsageRecord {
  return store.getUsage(sessionIdHash) ?? createDefaultUsage(sessionIdHash, config);
}

function createDefaultUsage(sessionIdHash: string, config: Web3PluginConfig): UsageRecord {
  return {
    sessionIdHash,
    creditsUsed: 0,
    creditsQuota: config.billing.quotaPerSession,
    llmCalls: 0,
    toolCalls: 0,
    lastActivity: new Date().toISOString(),
  };
}
