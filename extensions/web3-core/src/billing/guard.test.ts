import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  PluginHookAgentContext,
  PluginHookBeforeToolCallEvent,
  PluginHookLlmOutputEvent,
  PluginHookToolContext,
} from "openclaw/plugin-sdk";
import { describe, expect, it } from "vitest";
import { hashString } from "../audit/canonicalize.js";
import { resolveConfig } from "../config.js";
import { Web3StateStore } from "../state/store.js";
import { createBillingGuard, createBillingLlmUsageHook } from "./guard.js";

function createTestStore() {
  const dir = mkdtempSync(join(tmpdir(), "openclaw-web3-test-"));
  return new Web3StateStore(dir);
}

describe("web3-core billing", () => {
  it("blocks tool calls when quota is exhausted", () => {
    const store = createTestStore();
    const config = resolveConfig({
      billing: { enabled: true, quotaPerSession: 1, costPerToolCall: 1, costPerLlmCall: 1 },
    });

    const sessionHash = hashString("session-1");
    store.saveUsage({
      sessionIdHash: sessionHash,
      creditsUsed: 1,
      creditsQuota: 1,
      llmCalls: 0,
      toolCalls: 0,
      lastActivity: new Date().toISOString(),
    });

    const guard = createBillingGuard(store, config);
    const result = guard(
      {} as PluginHookBeforeToolCallEvent,
      {
        sessionKey: "session-1",
      } as PluginHookToolContext,
    );

    expect(result?.block).toBe(true);
  });

  it("increments LLM usage on output", () => {
    const store = createTestStore();
    const config = resolveConfig({
      billing: { enabled: true, quotaPerSession: 10, costPerToolCall: 1, costPerLlmCall: 2 },
    });

    const hook = createBillingLlmUsageHook(store, config);
    hook({} as PluginHookLlmOutputEvent, { sessionKey: "session-2" } as PluginHookAgentContext);

    const usage = store.getUsage(hashString("session-2"));
    expect(usage?.llmCalls).toBe(1);
    expect(usage?.creditsUsed).toBe(2);
  });

  it("prefers sessionKey when both ids are present", () => {
    const store = createTestStore();
    const config = resolveConfig({
      billing: { enabled: true, quotaPerSession: 10, costPerToolCall: 1, costPerLlmCall: 1 },
    });

    const hook = createBillingLlmUsageHook(store, config);
    hook(
      {} as PluginHookLlmOutputEvent,
      { sessionKey: "session-preferred", sessionId: "session-fallback" } as PluginHookAgentContext,
    );

    const preferred = store.getUsage(hashString("session-preferred"));
    const fallback = store.getUsage(hashString("session-fallback"));
    expect(preferred?.llmCalls).toBe(1);
    expect(fallback).toBeUndefined();
  });
});
