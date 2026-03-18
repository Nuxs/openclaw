import { resolveDefaultAgentId, resolveSessionAgentId } from "../agents/agent-scope.js";
import { syncStewardGrowthLoop } from "../agents/steward/cron-jobs.js";
import { resolveChannelConfigWrites } from "../channels/plugins/config-writes.js";
import { normalizeChannelId } from "../channels/registry.js";
import { getConfigValueAtPath, setConfigValueAtPath } from "../config/config-paths.js";
import {
  loadConfig,
  readConfigFileSnapshot,
  validateConfigObjectWithPlugins,
  writeConfigFile,
  type OpenClawConfig,
} from "../config/config.js";
import { resolveStorePath, updateSessionStoreEntry } from "../config/sessions.js";
import { callGateway } from "../gateway/call.js";
import { toAgentStoreSessionKey } from "../routing/session-key.js";

export type ResolveChannelConfigWritesOptions = Parameters<typeof resolveChannelConfigWrites>[0];

export function resolveSessionStoreKey(params: {
  cfg: OpenClawConfig;
  sessionKey: string;
}): string {
  return toAgentStoreSessionKey({
    agentId: resolveDefaultAgentId(params.cfg),
    requestKey: params.sessionKey,
  });
}

export type { OpenClawConfig };
export {
  callGateway,
  getConfigValueAtPath,
  loadConfig,
  normalizeChannelId,
  readConfigFileSnapshot,
  resolveChannelConfigWrites,
  resolveSessionAgentId,
  resolveStorePath,
  setConfigValueAtPath,
  syncStewardGrowthLoop,
  updateSessionStoreEntry,
  validateConfigObjectWithPlugins,
  writeConfigFile,
};
