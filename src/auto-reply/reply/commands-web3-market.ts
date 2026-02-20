import { resolveChannelConfigWrites } from "../../channels/plugins/config-writes.js";
import { normalizeChannelId } from "../../channels/registry.js";
import { formatCliCommand } from "../../cli/command-format.js";
import { isRestartEnabled } from "../../config/commands.js";
import {
  readConfigFileSnapshot,
  validateConfigObjectWithPlugins,
  writeConfigFile,
} from "../../config/config.js";
import { ensurePluginAllowlisted } from "../../config/plugins-allowlist.js";
import { logVerbose } from "../../globals.js";
import { scheduleGatewaySigusr1Restart } from "../../infra/restart.js";
import type { CommandHandler } from "./commands-types.js";

type MarketCommandAction = "start" | "status" | "help";

type ParsedMarketCommand = {
  action: MarketCommandAction;
  args: string;
};

const MARKET_COMMAND_REGEX = /^\/(?:web3-market|web3market|market)(?:\s+([\s\S]+))?$/i;

function parseMarketCommand(commandBody: string): ParsedMarketCommand | null {
  const match = commandBody.match(MARKET_COMMAND_REGEX);
  if (!match) {
    return null;
  }
  const rawArgs = (match[1] ?? "").trim();
  const token = rawArgs.split(/\s+/).filter(Boolean)[0]?.toLowerCase();
  if (!token) {
    return { action: "start", args: rawArgs };
  }
  if (token === "start" || token === "enable" || token === "on") {
    return { action: "start", args: rawArgs };
  }
  if (token === "status") {
    return { action: "status", args: rawArgs };
  }
  if (token === "help") {
    return { action: "help", args: rawArgs };
  }
  return { action: "help", args: rawArgs };
}

function summarizeWeb3MarketConfig(config: Record<string, unknown>) {
  const plugins = (config.plugins ?? {}) as Record<string, unknown>;
  const entries = (plugins.entries ?? {}) as Record<string, unknown>;
  const web3 = entries["web3-core"] as Record<string, unknown> | undefined;
  const market = entries["market-core"] as Record<string, unknown> | undefined;
  const web3Enabled = web3?.enabled === true;
  const marketEnabled = market?.enabled === true;
  const pluginsEnabled = plugins.enabled !== false;
  return { web3Enabled, marketEnabled, pluginsEnabled };
}

function applyWeb3MarketConfig(rawConfig: Record<string, unknown>): {
  next: Record<string, unknown>;
  changed: boolean;
} {
  let next = structuredClone(rawConfig);
  const plugins = (next.plugins ?? {}) as Record<string, unknown>;
  const entries = (plugins.entries ?? {}) as Record<string, unknown>;
  const web3Entry = (entries["web3-core"] ?? {}) as Record<string, unknown>;
  const marketEntry = (entries["market-core"] ?? {}) as Record<string, unknown>;
  const web3Enabled = web3Entry.enabled === true;
  const marketEnabled = marketEntry.enabled === true;
  const pluginsEnabled = plugins.enabled !== false;

  const nextEntries = {
    ...entries,
    "web3-core": {
      ...web3Entry,
      enabled: true,
      config: web3Entry.config ?? {},
    },
    "market-core": {
      ...marketEntry,
      enabled: true,
      config: marketEntry.config ?? {},
    },
  };

  next = {
    ...next,
    plugins: {
      ...plugins,
      enabled: true,
      entries: nextEntries,
    },
  };

  next = ensurePluginAllowlisted(next, "web3-core");
  next = ensurePluginAllowlisted(next, "market-core");

  const summary = summarizeWeb3MarketConfig(next);
  const changed =
    !web3Enabled ||
    !marketEnabled ||
    !pluginsEnabled ||
    summary.web3Enabled !== web3Enabled ||
    summary.marketEnabled !== marketEnabled;

  return { next, changed };
}

function formatStatusLine(config: Record<string, unknown>) {
  const summary = summarizeWeb3MarketConfig(config);
  return `web3-core: ${summary.web3Enabled ? "enabled" : "disabled"}, market-core: ${summary.marketEnabled ? "enabled" : "disabled"}, plugins: ${summary.pluginsEnabled ? "enabled" : "disabled"}`;
}

export const handleWeb3MarketCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const parsed = parseMarketCommand(params.command.commandBodyNormalized);
  if (!parsed) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /web3-market from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid || !snapshot.parsed || typeof snapshot.parsed !== "object") {
    return {
      shouldContinue: false,
      reply: {
        text: "⚠️ Config file is invalid; run /config show or open config UI to repair, then retry.",
      },
    };
  }

  if (parsed.action === "help") {
    return {
      shouldContinue: false,
      reply: {
        text: "⚙️ Usage: /web3-market start | /web3-market status",
      },
    };
  }

  const configBase = snapshot.parsed as Record<string, unknown>;

  if (parsed.action === "status") {
    return {
      shouldContinue: false,
      reply: {
        text: `⚙️ Web3 Market status: ${formatStatusLine(configBase)}`,
      },
    };
  }

  const channelId = params.command.channelId ?? normalizeChannelId(params.command.channel);
  const allowWrites = resolveChannelConfigWrites({
    cfg: params.cfg,
    channelId,
    accountId: params.ctx.AccountId,
  });
  if (!allowWrites) {
    const channelLabel = channelId ?? "this channel";
    const hint = channelId
      ? `channels.${channelId}.configWrites=true`
      : "channels.<channel>.configWrites=true";
    return {
      shouldContinue: false,
      reply: {
        text: `⚠️ Config writes are disabled for ${channelLabel}. Set ${hint} to enable.`,
      },
    };
  }

  const denied = Array.isArray((configBase.plugins as Record<string, unknown> | undefined)?.deny)
    ? ((configBase.plugins as Record<string, unknown>).deny as string[])
    : [];
  if (denied.includes("web3-core") || denied.includes("market-core")) {
    return {
      shouldContinue: false,
      reply: {
        text: "⚠️ Web3 Market plugins are denied by config (plugins.deny). Remove the deny entry to proceed.",
      },
    };
  }

  const { next, changed } = applyWeb3MarketConfig(configBase);
  if (!changed) {
    return {
      shouldContinue: false,
      reply: {
        text: `⚙️ Web3 Market already enabled. ${formatStatusLine(configBase)}`,
      },
    };
  }

  const validated = validateConfigObjectWithPlugins(next);
  if (!validated.ok) {
    const issue = validated.issues[0];
    return {
      shouldContinue: false,
      reply: {
        text: `⚠️ Config invalid after enabling Web3 Market (${issue.path}: ${issue.message}).`,
      },
    };
  }

  await writeConfigFile(validated.config);

  if (isRestartEnabled(params.cfg)) {
    scheduleGatewaySigusr1Restart({
      reason: "web3-market enabled",
      requestedBy: params.command.senderId ?? "chat",
    });
    return {
      shouldContinue: false,
      reply: {
        text: `✅ Web3 Market enabled. Gateway restart scheduled. You can also run ${formatCliCommand("openclaw restart")} if needed.`,
      },
    };
  }

  return {
    shouldContinue: false,
    reply: {
      text: "✅ Web3 Market enabled. Restart is disabled by config; please restart the Gateway manually.",
    },
  };
};
