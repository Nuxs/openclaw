import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";

export type ConfigValidationIssue = {
  path: string;
  message: string;
};

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
  steward?: {
    actorId?: string;
    consumerActorId?: string;
    budgetPolicy?: Record<string, unknown>;
    riskPolicy?: Record<string, unknown>;
    approval?: Record<string, unknown>;
    lastStatus?: string;
    lastOrderId?: string;
    lastResourceId?: string;
    lastLeaseId?: string;
    lastConsentId?: string;
    lastProofId?: string;
    lastDisputeId?: string;
    lastSettlementId?: string;
    growthSummary?: string;
    reflectionBacklog?: string[];
    researchBacklog?: string[];
    heartbeatBacklog?: string[];
    autonomyPosture?: "active" | "conservative" | "guarded" | "tripped";
    cadence?: {
      everyMs?: number;
      label?: string;
      reason?: string;
    };
    growthJob?: {
      jobId?: string;
      enabled?: boolean;
      target?: string;
      nextWakeAt?: string;
    };
    lastHeartbeatedAt?: string;
    lastReflectedAt?: string;
    lastResearchedAt?: string;
    updatedAt?: number;
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

export type StewardGrowthRuntimeHelpers = {
  syncStewardGrowthLoop: (params: {
    sessionKey: string;
  }) => Promise<Record<string, unknown> | null>;
};

type HostBridgeModule = {
  callGateway?: unknown;
  loadConfig?: unknown;
  resolveSessionStoreKey?: unknown;
  resolveStorePath?: unknown;
  updateSessionStoreEntry?: unknown;
  resolveSessionAgentId?: unknown;
  resolveChannelConfigWrites?: unknown;
  normalizeChannelId?: unknown;
  getConfigValueAtPath?: unknown;
  setConfigValueAtPath?: unknown;
  readConfigFileSnapshot?: unknown;
  validateConfigObjectWithPlugins?: unknown;
  writeConfigFile?: unknown;
  syncStewardGrowthLoop?: unknown;
};

async function loadHostBridge(): Promise<HostBridgeModule> {
  return (await import("openclaw/plugin-sdk/web3-host")) as HostBridgeModule;
}

export async function loadCallGateway(): Promise<CallGatewayFn> {
  const mod = await loadHostBridge();
  if (typeof mod.callGateway !== "function") {
    throw new Error("callGateway is not available");
  }
  return mod.callGateway as CallGatewayFn;
}

export async function loadCoreConfig(): Promise<OpenClawConfig> {
  const mod = await loadHostBridge();
  if (typeof mod.loadConfig !== "function") {
    throw new Error("loadConfig is not available");
  }
  return await (mod.loadConfig as () => OpenClawConfig | Promise<OpenClawConfig>)();
}

export async function loadSessionStoreHelpers(): Promise<SessionStoreHelpers> {
  const mod = await loadHostBridge();
  if (
    typeof mod.resolveSessionStoreKey !== "function" ||
    typeof mod.resolveStorePath !== "function" ||
    typeof mod.updateSessionStoreEntry !== "function" ||
    typeof mod.resolveSessionAgentId !== "function"
  ) {
    throw new Error("session store helpers are unavailable");
  }
  return {
    resolveSessionStoreKey:
      mod.resolveSessionStoreKey as SessionStoreHelpers["resolveSessionStoreKey"],
    resolveStorePath: mod.resolveStorePath as SessionStoreHelpers["resolveStorePath"],
    updateSessionStoreEntry:
      mod.updateSessionStoreEntry as SessionStoreHelpers["updateSessionStoreEntry"],
    resolveSessionAgentId:
      mod.resolveSessionAgentId as SessionStoreHelpers["resolveSessionAgentId"],
  };
}

export async function loadConfigWriteHelpers(): Promise<ConfigWriteHelpers> {
  const mod = await loadHostBridge();
  if (
    typeof mod.resolveChannelConfigWrites !== "function" ||
    typeof mod.normalizeChannelId !== "function" ||
    typeof mod.getConfigValueAtPath !== "function" ||
    typeof mod.setConfigValueAtPath !== "function" ||
    typeof mod.readConfigFileSnapshot !== "function" ||
    typeof mod.validateConfigObjectWithPlugins !== "function" ||
    typeof mod.writeConfigFile !== "function"
  ) {
    throw new Error("config write helpers are unavailable");
  }
  return {
    resolveChannelConfigWrites:
      mod.resolveChannelConfigWrites as ConfigWriteHelpers["resolveChannelConfigWrites"],
    normalizeChannelId: mod.normalizeChannelId as ConfigWriteHelpers["normalizeChannelId"],
    getConfigValueAtPath: mod.getConfigValueAtPath as ConfigWriteHelpers["getConfigValueAtPath"],
    setConfigValueAtPath: mod.setConfigValueAtPath as ConfigWriteHelpers["setConfigValueAtPath"],
    readConfigFileSnapshot:
      mod.readConfigFileSnapshot as ConfigWriteHelpers["readConfigFileSnapshot"],
    validateConfigObjectWithPlugins:
      mod.validateConfigObjectWithPlugins as ConfigWriteHelpers["validateConfigObjectWithPlugins"],
    writeConfigFile: mod.writeConfigFile as ConfigWriteHelpers["writeConfigFile"],
  };
}

export async function loadStewardGrowthRuntimeHelpers(): Promise<StewardGrowthRuntimeHelpers> {
  const mod = await loadHostBridge();
  if (typeof mod.syncStewardGrowthLoop !== "function") {
    throw new Error("syncStewardGrowthLoop is not available");
  }
  return {
    syncStewardGrowthLoop:
      mod.syncStewardGrowthLoop as StewardGrowthRuntimeHelpers["syncStewardGrowthLoop"],
  };
}

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
