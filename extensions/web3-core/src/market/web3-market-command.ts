import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";
import type { PluginCommandHandler, PluginCommandResult } from "openclaw/plugin-sdk/plugin-command";
import type { Web3PluginConfig } from "../config.js";
import { loadConfigWriteHelpers } from "../core-imports.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import type { MarketDeploymentMode } from "../setup/deployment-types.js";
import {
  applyPlanToConfig,
  buildMarketDeploymentPlan,
  formatMarketDeploymentPlan,
  formatMarketDeploymentVerification,
  verifyMarketDeployment,
} from "../setup/orchestrator.js";
import { modeLabel, resolveDeploymentMode } from "../setup/topology-planner.js";
import {
  buildWeb3MarketStatusSummary,
  formatWeb3MarketStatusMessage,
  type Web3MarketStatusProfile,
} from "./market-status.js";

type MarketAction = "status" | "help" | "start" | "enable" | "plan" | "verify";

type Parsed = {
  action: MarketAction;
  profile: Web3MarketStatusProfile;
  mode: MarketDeploymentMode;
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
            : actionToken === "plan"
              ? "plan"
              : actionToken === "verify"
                ? "verify"
                : "help";

  const profile: Web3MarketStatusProfile = tokens.some((token) => token.toLowerCase() === "deep")
    ? "deep"
    : "fast";
  const mode = resolveDeploymentMode(
    tokens.find(
      (token) =>
        token === "single-node" || token === "trusted-circle" || token === "hybrid-cloud-edge",
    ),
  );

  return { action, profile, mode };
}

function summarizeConfig(cfg: OpenClawConfig | undefined): {
  pluginsEnabled: boolean;
  allow: string[];
  web3Enabled: boolean;
  marketEnabled: boolean;
  agentWalletEnabled: boolean;
  agentWalletPolicyEnabled: boolean;
} {
  const pluginsEnabled = cfg?.plugins?.enabled !== false;
  const allow = Array.isArray(cfg?.plugins?.allow)
    ? (cfg?.plugins?.allow as unknown as string[]).filter((x) => typeof x === "string")
    : [];
  const web3Enabled = cfg?.plugins?.entries?.["web3-core"]?.enabled === true;
  const marketEnabled = cfg?.plugins?.entries?.["market-core"]?.enabled === true;
  const agentWalletEnabled = cfg?.plugins?.entries?.["agent-wallet"]?.enabled === true;
  const policyRaw = cfg?.plugins?.entries?.["agent-wallet"]?.config?.policy;
  const agentWalletPolicyEnabled =
    Boolean(policyRaw) &&
    typeof policyRaw === "object" &&
    (policyRaw as Record<string, unknown>).enabled === true;
  return {
    pluginsEnabled,
    allow,
    web3Enabled,
    marketEnabled,
    agentWalletEnabled,
    agentWalletPolicyEnabled,
  };
}

function formatPresetInstructions(
  fullConfig: OpenClawConfig | undefined,
  runtimeConfig: Web3PluginConfig,
  mode: MarketDeploymentMode,
): string {
  const summary = summarizeConfig(fullConfig);
  const plan = buildMarketDeploymentPlan(runtimeConfig, {
    mode,
    currentConfig: fullConfig,
  });
  const lines: string[] = [];
  lines.push(
    `⚙️ Web3 市场兼容预设概览：plugins=${summary.pluginsEnabled ? "enabled" : "disabled"}，web3-core=${summary.web3Enabled ? "enabled" : "disabled"}，market-core=${summary.marketEnabled ? "enabled" : "disabled"}，agent-wallet=${summary.agentWalletEnabled ? "enabled" : "disabled"}，policy=${summary.agentWalletPolicyEnabled ? "enabled" : "disabled"}`,
  );
  lines.push("说明：该命令只提供兼容预设预览/应用；多机拓扑决策应交给主脑 + skill。");
  lines.push("");
  lines.push(formatMarketDeploymentPlan(plan));
  lines.push("");
  lines.push(`若仍需直接应用该兼容预设：/web3-market enable ${mode} ok`);
  lines.push(`若要验证该预设基线：/web3-market verify ${mode}`);
  lines.push("完成后请重启 Gateway（macOS 请通过 OpenClaw Mac app 重启）。");
  return lines.join("\n");
}

function hasOkToken(raw?: string): boolean {
  const tokens = (raw ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
  return tokens.includes("ok") || tokens.includes("confirm");
}

async function enableWeb3MarketConfig(ctx: {
  config: OpenClawConfig;
  runtimeConfig: Web3PluginConfig;
  channel: string;
  channelId?: string;
  accountId?: string;
  isAuthorizedSender: boolean;
  args?: string;
  mode: MarketDeploymentMode;
}): Promise<PluginCommandResult> {
  if (!ctx.isAuthorizedSender) {
    return { text: "当前账号没有执行配置变更的权限。" };
  }

  const helpers = await loadConfigWriteHelpers();
  const channelId = ctx.channelId ?? helpers.normalizeChannelId(ctx.channel);
  const allowWrites = helpers.resolveChannelConfigWrites({
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
        `即将应用 ${modeLabel(ctx.mode)} 兼容预设，包含：`,
        "- 启用 web3-core / market-core / agent-wallet",
        "- 放开 plugins.allow 白名单与钱包策略",
        "- 打开 resources / consumer / provider 基线",
        ctx.mode === "single-node"
          ? "- 单机预设默认关闭 discovery"
          : "- 多机预设默认开启 libp2p discovery 基线",
        `回复：/web3-market enable ${ctx.mode} ok`,
      ].join("\n"),
    };
  }

  const snapshot = await helpers.readConfigFileSnapshot();
  if (!snapshot.valid || !snapshot.parsed || typeof snapshot.parsed !== "object") {
    return { text: "配置文件无效，请先修复后再启用。" };
  }

  const { plan, nextConfig } = applyPlanToConfig({
    currentConfig: snapshot.parsed as Record<string, unknown>,
    runtimeConfig: ctx.runtimeConfig,
    planParams: {
      mode: ctx.mode,
      currentConfig: snapshot.parsed as Record<string, unknown>,
    },
  });
  const validated = helpers.validateConfigObjectWithPlugins(nextConfig);
  if (!validated.ok) {
    const issue = validated.issues[0];
    return {
      text: `配置校验失败（${issue.path}: ${issue.message}）。请检查配置后重试。`,
    };
  }

  await helpers.writeConfigFile(validated.config);
  return {
    text: [
      `已提交 ${modeLabel(ctx.mode)} 兼容预设配置。`,
      plan.summary,
      "已补齐 agent-wallet policy 与资源共享基线。",
      "下一步：重启 Gateway，然后执行 /web3-market verify 查看预设基线状态。",
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
          "- /web3-market plan [single-node|trusted-circle|hybrid-cloud-edge]",
          "- /web3-market start [mode]   (alias of plan; prints compatibility preset preview)",
          "- /web3-market enable [mode] ok   (apply compatibility preset patch)",
          "- /web3-market verify [mode]      (verify preset baseline)",
        ].join("\n"),
      };
    }

    if (parsed.action === "start" || parsed.action === "plan") {
      return { text: formatPresetInstructions(ctx.config, config, parsed.mode) };
    }

    if (parsed.action === "enable") {
      return enableWeb3MarketConfig({
        config: ctx.config,
        runtimeConfig: config,
        channel: ctx.channel,
        channelId: ctx.channelId,
        accountId: ctx.accountId,
        isAuthorizedSender: ctx.isAuthorizedSender,
        args: ctx.args,
        mode: parsed.mode,
      });
    }

    if (parsed.action === "verify") {
      try {
        const verification = await verifyMarketDeployment({
          config,
          mode: parsed.mode,
        });
        return { text: formatMarketDeploymentVerification(verification) };
      } catch (error) {
        const normalized = formatWeb3GatewayErrorResponse(error);
        return {
          text: `⚠️ Web3 Market verify failed: ${normalized.error} (${normalized.message})`,
        };
      }
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
    } catch (error) {
      const normalized = formatWeb3GatewayErrorResponse(error);
      return {
        text: `⚠️ Web3 Market status failed: ${normalized.error} (${normalized.message})`,
      };
    }
  };
}
