import type { PluginCommandHandler, PluginCommandResult } from "openclaw/plugin-sdk";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { resolveChannelConfigWrites } from "../../../src/channels/plugins/config-writes.js";
import { normalizeChannelId } from "../../../src/channels/registry.js";
import { getConfigValueAtPath, setConfigValueAtPath } from "../../../src/config/config-paths.js";
import {
  readConfigFileSnapshot,
  validateConfigObjectWithPlugins,
  writeConfigFile,
} from "../../../src/config/config.js";
import type { Web3PluginConfig } from "../config.js";
import {
  buildWeb3MarketStatusSummary,
  formatWeb3MarketStatusMessage,
  type Web3MarketStatusProfile,
} from "./market-status.js";

type MarketAction = "status" | "help" | "start" | "enable";

type Parsed = {
  action: MarketAction;
  profile: Web3MarketStatusProfile;
};

function parseArgs(argsRaw: string | undefined): Parsed {
  const tokens = (argsRaw ?? "").trim().split(/\s+/).filter(Boolean);
  const actionToken = tokens[0]?.toLowerCase();

  const action: MarketAction = !actionToken
    ? "status"
    : actionToken === "status"
      ? "status"
      : actionToken === "help"
        ? "help"
        : actionToken === "start"
          ? "start"
          : actionToken === "enable" || actionToken === "on"
            ? "enable"
            : "help";

  const profileToken = tokens[1]?.toLowerCase();
  const profile: Web3MarketStatusProfile = profileToken === "deep" ? "deep" : "fast";

  return { action, profile };
}

function summarizeConfig(cfg: OpenClawConfig | undefined): {
  pluginsEnabled: boolean;
  allow: string[];
  web3Enabled: boolean;
  marketEnabled: boolean;
} {
  const pluginsEnabled = cfg?.plugins?.enabled !== false;
  const allow = Array.isArray(cfg?.plugins?.allow)
    ? (cfg?.plugins?.allow as unknown as string[]).filter((x) => typeof x === "string")
    : [];
  const web3Enabled = cfg?.plugins?.entries?.["web3-core"]?.enabled === true;
  const marketEnabled = cfg?.plugins?.entries?.["market-core"]?.enabled === true;
  return { pluginsEnabled, allow, web3Enabled, marketEnabled };
}

function formatEnableInstructions(cfg: OpenClawConfig | undefined): string {
  const summary = summarizeConfig(cfg);
  const required = ["web3-core", "market-core"];
  const allowSet = new Set(summary.allow);
  for (const pluginId of required) {
    allowSet.add(pluginId);
  }
  const allowMerged = Array.from(allowSet).sort((a, b) => a.localeCompare(b));

  const lines: string[] = [];
  lines.push(
    `⚙️ Web3 市场配置概览：plugins=${summary.pluginsEnabled ? "enabled" : "disabled"}，web3-core=${summary.web3Enabled ? "enabled" : "disabled"}，market-core=${summary.marketEnabled ? "enabled" : "disabled"}`,
  );
  lines.push("");
  lines.push("下一步（按需执行，需 owner/authorized + configWrites）：");

  if (!summary.pluginsEnabled) {
    lines.push("1) /config set plugins.enabled=true");
  }
  if (allowMerged.join(",") !== summary.allow.join(",")) {
    lines.push(`2) /config set plugins.allow=${JSON.stringify(allowMerged)}`);
  }
  if (!summary.web3Enabled) {
    lines.push("3) /config set plugins.entries.web3-core.enabled=true");
  }
  if (!summary.marketEnabled) {
    lines.push("4) /config set plugins.entries.market-core.enabled=true");
  }

  lines.push("");
  lines.push("想直接启用（免复制多条命令）：");
  lines.push("- /web3-market enable ok");
  lines.push("");
  lines.push("想看到“挂售/租用”工具，还需要在 web3-core 配置里开启资源功能：");
  lines.push("- resources.enabled: true");
  lines.push("- resources.advertiseToMarket: true  # 上架/下架工具");
  lines.push("- resources.consumer.enabled: true  # 租约工具");
  lines.push("- resources.provider.offers.models 至少配置 1 个模型");

  lines.push("");
  lines.push("完成后请重启 Gateway（macOS 请通过 OpenClaw Mac app 重启）。");
  return lines.join("\n");
}

function hasOkToken(raw?: string): boolean {
  const tokens = (raw ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  return tokens.includes("ok") || tokens.includes("confirm");
}

function normalizeAllowList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string") as string[];
  }
  return [];
}

function setIfMissing(root: Record<string, unknown>, path: string[], value: unknown): void {
  const current = getConfigValueAtPath(root, path);
  if (current === undefined || current === null) {
    setConfigValueAtPath(root, path, value);
  }
}

async function enableWeb3MarketConfig(ctx: {
  config: OpenClawConfig;
  channel: string;
  channelId?: string;
  accountId?: string;
  isAuthorizedSender: boolean;
  args?: string;
}): Promise<PluginCommandResult> {
  if (!ctx.isAuthorizedSender) {
    return { text: "当前账号没有执行配置变更的权限。" };
  }

  const channelId = ctx.channelId ?? normalizeChannelId(ctx.channel);
  const allowWrites = resolveChannelConfigWrites({
    cfg: ctx.config,
    channelId,
    accountId: ctx.accountId,
  });
  if (!allowWrites) {
    const hint = channelId
      ? `channels.${channelId}.configWrites=true`
      : "channels.<channel>.configWrites=true";
    return { text: `当前渠道未开放配置写入，请先设置 ${hint}` };
  }

  if (!hasOkToken(ctx.args)) {
    return {
      text: [
        "即将执行一键启用，包含：",
        "- 启用 web3-core / market-core",
        "- 放开 plugins.allow 白名单",
        "- 开启资源功能与市场广告",
        "- 默认开启 consumer 侧租约能力",
        "回复：/web3-market enable ok",
      ].join("\n"),
    };
  }

  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid || !snapshot.parsed || typeof snapshot.parsed !== "object") {
    return { text: "配置文件无效，请先修复后再启用。" };
  }

  const next = structuredClone(snapshot.parsed as Record<string, unknown>);
  const allow = normalizeAllowList(getConfigValueAtPath(next, ["plugins", "allow"]));
  const allowSet = new Set(allow);
  allowSet.add("web3-core");
  allowSet.add("market-core");
  setConfigValueAtPath(next, ["plugins", "enabled"], true);
  setConfigValueAtPath(next, ["plugins", "allow"], Array.from(allowSet));
  setConfigValueAtPath(next, ["plugins", "entries", "web3-core", "enabled"], true);
  setConfigValueAtPath(next, ["plugins", "entries", "market-core", "enabled"], true);

  setConfigValueAtPath(
    next,
    ["plugins", "entries", "web3-core", "config", "resources", "enabled"],
    true,
  );
  setConfigValueAtPath(
    next,
    ["plugins", "entries", "web3-core", "config", "resources", "advertiseToMarket"],
    true,
  );
  setIfMissing(
    next,
    ["plugins", "entries", "web3-core", "config", "resources", "consumer", "enabled"],
    true,
  );
  setIfMissing(
    next,
    ["plugins", "entries", "web3-core", "config", "resources", "provider", "listen", "enabled"],
    true,
  );
  setIfMissing(
    next,
    ["plugins", "entries", "web3-core", "config", "resources", "provider", "listen", "bind"],
    "loopback",
  );
  const listenPort = getConfigValueAtPath(next, [
    "plugins",
    "entries",
    "web3-core",
    "config",
    "resources",
    "provider",
    "listen",
    "port",
  ]);
  if (listenPort === undefined || listenPort === null || listenPort === 0) {
    setConfigValueAtPath(
      next,
      ["plugins", "entries", "web3-core", "config", "resources", "provider", "listen", "port"],
      18790,
    );
  }

  const validated = validateConfigObjectWithPlugins(next);
  if (!validated.ok) {
    const issue = validated.issues[0];
    return {
      text: `配置校验失败（${issue.path}: ${issue.message}）。请检查配置后重试。`,
    };
  }

  await writeConfigFile(validated.config);
  return {
    text: [
      "已提交 Web3 市场启用配置。",
      "下一步：请在 web3-core 配置里补齐模型 offer，然后重启 Gateway。",
    ].join("\n"),
  };
}

export function createWeb3MarketCommand(config: Web3PluginConfig): PluginCommandHandler {
  return async (ctx): Promise<PluginCommandResult> => {
    const parsed = parseArgs(ctx.args);

    if (parsed.action === "help") {
      return {
        text: [
          "⚙️ Usage:",
          "- /web3-market status [deep]",
          "- /web3-market start   (prints config steps; does not edit config)",
          "- /web3-market enable ok (one-step enable)",
        ].join("\n"),
      };
    }

    if (parsed.action === "start") {
      return { text: formatEnableInstructions(ctx.config) };
    }

    if (parsed.action === "enable") {
      return enableWeb3MarketConfig({
        config: ctx.config,
        channel: ctx.channel,
        channelId: ctx.channelId,
        accountId: ctx.accountId,
        isAuthorizedSender: ctx.isAuthorizedSender,
        args: ctx.args,
      });
    }

    try {
      const summary = await buildWeb3MarketStatusSummary({
        config,
        profile: parsed.profile,
      });
      return {
        text: ["⚙️ Web3 Market status (plugin):", formatWeb3MarketStatusMessage(summary)].join(
          "\n",
        ),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        text: `⚠️ Web3 Market status failed: ${msg}`,
      };
    }
  };
}
