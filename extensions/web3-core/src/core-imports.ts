/**
 * Centralized core-import adapter for web3-core.
 *
 * ALL cross-boundary imports that reach into `../../../src/` or `../../../dist/`
 * are consolidated here. Consumer modules import from this file instead of using
 * physical paths that couple the extension to the host repo layout.
 *
 * When `openclaw/plugin-sdk` eventually exposes these APIs, only this file needs
 * to be updated — the rest of the extension stays untouched.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";

const HOST_SRC_ROOT = new URL("../../../src/", import.meta.url);
const HOST_DIST_ROOT = new URL("../../../dist/", import.meta.url);

type ConfigValidationIssue = {
  path: string;
  message: string;
};

// ── Types ────────────────────────────────────────────────────────────────────

export type CallGatewayFn = (opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<unknown>;

export type GatewayCallResult = {
  ok?: boolean;
  error?: string;
  result?: unknown;
};

/**
 * Mirrors `SessionEntry` from core without importing the type directly.
 * Kept structurally compatible; update when core's shape changes.
 */
export type SessionEntry = {
  settlement?: {
    orderId?: string;
    payer?: string;
    amount?: string;
    actorId?: string;
  };
  [key: string]: unknown;
};

export type SessionStoreHelpers = {
  resolveSessionStoreKey: (params: { cfg: OpenClawConfig; sessionKey: string }) => string;
  resolveStorePath: (store?: string, opts?: { agentId?: string }) => string;
  updateSessionStoreEntry: (params: {
    storePath: string;
    sessionKey: string;
    update: (entry: SessionEntry) => Promise<Partial<SessionEntry> | null>;
  }) => Promise<SessionEntry | null>;
  resolveSessionAgentId: (params: { sessionKey?: string; config?: OpenClawConfig }) => string;
};

export type ConfigWriteHelpers = {
  resolveChannelConfigWrites: (opts: {
    cfg: OpenClawConfig;
    channelId: string;
    accountId?: string;
  }) => boolean;
  normalizeChannelId: (channel: string) => string;
  getConfigValueAtPath: (root: Record<string, unknown>, path: string[]) => unknown;
  setConfigValueAtPath: (root: Record<string, unknown>, path: string[], value: unknown) => void;
  readConfigFileSnapshot: () => Promise<{
    valid: boolean;
    parsed: unknown;
    raw: string | null;
  }>;
  validateConfigObjectWithPlugins:
    | ((obj: unknown) => {
        ok: true;
        config: OpenClawConfig;
        warnings: ConfigValidationIssue[];
      })
    | ((obj: unknown) => {
        ok: false;
        issues: ConfigValidationIssue[];
        warnings: ConfigValidationIssue[];
      });
  writeConfigFile: (config: OpenClawConfig) => Promise<void>;
};

function hostSrcUrl(path: string): string {
  return new URL(path, HOST_SRC_ROOT).href;
}

function hostDistUrl(path: string): string {
  return new URL(path, HOST_DIST_ROOT).href;
}

// ── Loaders ──────────────────────────────────────────────────────────────────

/**
 * Lazily loads the `callGateway` function from the host's gateway module.
 * Uses dynamic import with a `src/` → `dist/` fallback chain so it works
 * in both development (ts source) and production (built output) modes.
 */
export async function loadCallGateway(): Promise<CallGatewayFn> {
  try {
    const mod = await import(hostSrcUrl("gateway/call.ts"));
    if (typeof mod.callGateway === "function") {
      return mod.callGateway as CallGatewayFn;
    }
  } catch {
    // ignore — expected when running from dist
  }

  const mod = await import(hostDistUrl("gateway/call.js"));
  if (typeof mod.callGateway !== "function") {
    throw new Error("callGateway is not available");
  }
  return mod.callGateway as CallGatewayFn;
}

/**
 * Lazily loads `loadConfig` from the host's config module.
 */
export async function loadCoreConfig(): Promise<OpenClawConfig> {
  try {
    const mod = await import(hostSrcUrl("config/config.ts"));
    if (typeof mod.loadConfig === "function") {
      return await mod.loadConfig();
    }
  } catch {
    // ignore
  }

  const mod = await import(hostDistUrl("config/config.js"));
  if (typeof mod.loadConfig !== "function") {
    throw new Error("loadConfig is not available");
  }
  return await mod.loadConfig();
}

/**
 * Lazily loads session-store helpers from various host modules.
 */
export async function loadSessionStoreHelpers(): Promise<SessionStoreHelpers> {
  try {
    const [sessionUtils, sessionPaths, sessionStore, agentScope] = await Promise.all([
      import(hostSrcUrl("gateway/session-utils.ts")),
      import(hostSrcUrl("config/sessions/paths.ts")),
      import(hostSrcUrl("config/sessions/store.ts")),
      import(hostSrcUrl("agents/agent-scope.ts")),
    ]);
    if (
      typeof sessionUtils.resolveSessionStoreKey !== "function" ||
      typeof sessionPaths.resolveStorePath !== "function" ||
      typeof sessionStore.updateSessionStoreEntry !== "function" ||
      typeof agentScope.resolveSessionAgentId !== "function"
    ) {
      throw new Error("session store helpers are unavailable");
    }
    return {
      resolveSessionStoreKey: sessionUtils.resolveSessionStoreKey,
      resolveStorePath: sessionPaths.resolveStorePath,
      updateSessionStoreEntry: sessionStore.updateSessionStoreEntry,
      resolveSessionAgentId: agentScope.resolveSessionAgentId,
    };
  } catch {
    const [sessionUtils, sessionPaths, sessionStore, agentScope] = await Promise.all([
      import(hostDistUrl("gateway/session-utils.js")),
      import(hostDistUrl("config/sessions/paths.js")),
      import(hostDistUrl("config/sessions/store.js")),
      import(hostDistUrl("agents/agent-scope.js")),
    ]);
    if (
      typeof sessionUtils.resolveSessionStoreKey !== "function" ||
      typeof sessionPaths.resolveStorePath !== "function" ||
      typeof sessionStore.updateSessionStoreEntry !== "function" ||
      typeof agentScope.resolveSessionAgentId !== "function"
    ) {
      throw new Error("session store helpers are unavailable");
    }
    return {
      resolveSessionStoreKey: sessionUtils.resolveSessionStoreKey,
      resolveStorePath: sessionPaths.resolveStorePath,
      updateSessionStoreEntry: sessionStore.updateSessionStoreEntry,
      resolveSessionAgentId: agentScope.resolveSessionAgentId,
    };
  }
}

/**
 * Lazily loads config-write helpers used by `web3-market-command.ts` for
 * one-click market enablement.
 */
export async function loadConfigWriteHelpers(): Promise<ConfigWriteHelpers> {
  try {
    const [configWrites, channelRegistry, configPaths, config] = await Promise.all([
      import(hostSrcUrl("channels/plugins/config-writes.ts")),
      import(hostSrcUrl("channels/registry.ts")),
      import(hostSrcUrl("config/config-paths.ts")),
      import(hostSrcUrl("config/config.ts")),
    ]);
    return {
      resolveChannelConfigWrites: configWrites.resolveChannelConfigWrites,
      normalizeChannelId: channelRegistry.normalizeChannelId,
      getConfigValueAtPath: configPaths.getConfigValueAtPath,
      setConfigValueAtPath: configPaths.setConfigValueAtPath,
      readConfigFileSnapshot: config.readConfigFileSnapshot,
      validateConfigObjectWithPlugins: config.validateConfigObjectWithPlugins,
      writeConfigFile: config.writeConfigFile,
    };
  } catch {
    const [configWrites, channelRegistry, configPaths, config] = await Promise.all([
      import(hostDistUrl("channels/plugins/config-writes.js")),
      import(hostDistUrl("channels/registry.js")),
      import(hostDistUrl("config/config-paths.js")),
      import(hostDistUrl("config/config.js")),
    ]);
    return {
      resolveChannelConfigWrites: configWrites.resolveChannelConfigWrites,
      normalizeChannelId: channelRegistry.normalizeChannelId,
      getConfigValueAtPath: configPaths.getConfigValueAtPath,
      setConfigValueAtPath: configPaths.setConfigValueAtPath,
      readConfigFileSnapshot: config.readConfigFileSnapshot,
      validateConfigObjectWithPlugins: config.validateConfigObjectWithPlugins,
      writeConfigFile: config.writeConfigFile,
    };
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────

/**
 * Normalizes a raw gateway response into a predictable `{ ok, result?, error? }` shape.
 * Extracted here to eliminate duplication across proxy handler files.
 */
export function normalizeGatewayResult(payload: unknown): {
  ok: boolean;
  result?: unknown;
  error?: string;
} {
  if (payload && typeof payload === "object") {
    const record = payload as GatewayCallResult;
    if (record.ok === false) {
      return { ok: false, error: record.error ?? "gateway call failed" };
    }
    const result = "result" in record ? record.result : payload;
    return { ok: true, result };
  }
  return { ok: true, result: payload };
}
