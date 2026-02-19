import type { StreamFn } from "@mariozechner/pi-agent-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHookRunner } from "./hooks.js";
import { createEmptyPluginRegistry, type PluginRegistry } from "./registry.js";
import type {
  PluginHookAgentContext,
  PluginHookRegistration,
  PluginHookResolveStreamFnEvent,
  PluginHookResolveStreamFnResult,
} from "./types.js";

function addResolveStreamFnHook(
  registry: PluginRegistry,
  pluginId: string,
  handler: (
    event: PluginHookResolveStreamFnEvent,
    ctx: PluginHookAgentContext,
  ) => PluginHookResolveStreamFnResult | Promise<PluginHookResolveStreamFnResult> | void,
  priority?: number,
) {
  registry.typedHooks.push({
    pluginId,
    hookName: "resolve_stream_fn",
    handler,
    priority,
    source: "test",
  } as PluginHookRegistration);
}

const stubCtx: PluginHookAgentContext = {
  agentId: "test-agent",
  sessionKey: "sk",
  sessionId: "sid",
  workspaceDir: "/tmp",
};

const stubEvent: PluginHookResolveStreamFnEvent = {
  provider: "openai",
  modelId: "gpt-4o",
  modelApi: "openai",
  baseUrl: "https://example.com",
};

describe("resolve_stream_fn hook", () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = createEmptyPluginRegistry();
  });

  it("keeps higher-priority streamFn", async () => {
    const lowStreamFn = vi.fn() as unknown as StreamFn;
    const highStreamFn = vi.fn() as unknown as StreamFn;

    addResolveStreamFnHook(registry, "low", () => ({ streamFn: lowStreamFn }), 1);
    addResolveStreamFnHook(registry, "high", () => ({ streamFn: highStreamFn }), 10);

    const runner = createHookRunner(registry);
    const result = await runner.runResolveStreamFn(stubEvent, stubCtx);

    expect(result?.streamFn).toBe(highStreamFn);
  });

  it("does not overwrite with empty result", async () => {
    const highStreamFn = vi.fn() as unknown as StreamFn;

    addResolveStreamFnHook(registry, "high", () => ({ streamFn: highStreamFn }), 10);
    addResolveStreamFnHook(registry, "low", () => ({ streamFn: undefined }), 1);

    const runner = createHookRunner(registry);
    const result = await runner.runResolveStreamFn(stubEvent, stubCtx);

    expect(result?.streamFn).toBe(highStreamFn);
  });

  it("ignores failing handlers when catchErrors is enabled", async () => {
    const okStreamFn = vi.fn() as unknown as StreamFn;

    addResolveStreamFnHook(
      registry,
      "broken",
      () => {
        throw new Error("boom");
      },
      10,
    );
    addResolveStreamFnHook(registry, "safe", () => ({ streamFn: okStreamFn }), 1);

    const runner = createHookRunner(registry, { catchErrors: true });
    const result = await runner.runResolveStreamFn(stubEvent, stubCtx);

    expect(result?.streamFn).toBe(okStreamFn);
  });

  it("returns undefined when no hooks resolve a streamFn", async () => {
    addResolveStreamFnHook(registry, "noop", () => undefined);

    const runner = createHookRunner(registry);
    const result = await runner.runResolveStreamFn(stubEvent, stubCtx);

    expect(result).toBeUndefined();
  });
});
