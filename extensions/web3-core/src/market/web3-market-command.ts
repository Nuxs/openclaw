import type { PluginCommandHandler, PluginCommandResult } from "openclaw/plugin-sdk";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import {
  buildWeb3MarketStatusSummary,
  formatWeb3MarketStatusMessage,
  type Web3MarketStatusProfile,
} from "./market-status.js";

type MarketAction = "status" | "help" | "start";

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
        : actionToken === "start" || actionToken === "enable" || actionToken === "on"
          ? "start"
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
    `⚙️ Web3 Market config: plugins=${summary.pluginsEnabled ? "enabled" : "disabled"}, web3-core=${summary.web3Enabled ? "enabled" : "disabled"}, market-core=${summary.marketEnabled ? "enabled" : "disabled"}`,
  );
  lines.push("");
  lines.push(
    "To enable Web3 Market, run these commands (owner/authorized + configWrites required):",
  );

  if (!summary.pluginsEnabled) {
    lines.push("- /config set plugins.enabled=true");
  }
  if (allowMerged.join(",") !== summary.allow.join(",")) {
    lines.push(`- /config set plugins.allow=${JSON.stringify(allowMerged)}`);
  }
  if (!summary.web3Enabled) {
    lines.push("- /config set plugins.entries.web3-core.enabled=true");
  }
  if (!summary.marketEnabled) {
    lines.push("- /config set plugins.entries.market-core.enabled=true");
  }

  lines.push("");
  lines.push("Then restart the Gateway if needed (or wait for your normal restart flow).");
  return lines.join("\n");
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
        ].join("\n"),
      };
    }

    if (parsed.action === "start") {
      return { text: formatEnableInstructions(ctx.config) };
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
