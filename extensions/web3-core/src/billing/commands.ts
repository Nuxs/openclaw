/**
 * Billing plugin commands: /credits, /pay_status
 */

import type { PluginCommandHandler } from "openclaw/plugin-sdk";
import { hashString } from "../audit/canonicalize.js";
import type { Web3StateStore } from "../state/store.js";

export function createCreditsCommand(store: Web3StateStore): PluginCommandHandler {
  return async (ctx) => {
    const sessionHash = resolveSessionHash({
      sessionKey: ctx.sessionKey,
      sessionId: ctx.sessionId,
      senderId: ctx.senderId,
    });
    const usage = store.getUsage(sessionHash);
    if (!usage) {
      return { text: "No usage recorded yet for this session." };
    }
    const remaining = usage.creditsQuota - usage.creditsUsed;
    return {
      text: [
        `Credits: ${usage.creditsUsed} / ${usage.creditsQuota} (${remaining} remaining)`,
        `LLM calls: ${usage.llmCalls}`,
        `Tool calls: ${usage.toolCalls}`,
        `Last activity: ${usage.lastActivity}`,
      ].join("\n"),
    };
  };
}

function resolveSessionHash(input: { sessionKey?: string; sessionId?: string; senderId?: string }) {
  return hashString(input.sessionKey ?? input.sessionId ?? input.senderId ?? "unknown");
}

export function createPayStatusCommand(_store: Web3StateStore): PluginCommandHandler {
  return async () => {
    // Placeholder: will integrate with chain adapter for on-chain payment verification
    return { text: "Payment status: feature coming soon. Use /credits to check usage." };
  };
}
