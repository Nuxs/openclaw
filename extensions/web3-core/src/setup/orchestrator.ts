import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";
import { resolveConfig, type Web3PluginConfig } from "../config.js";
import { loadCallGateway, normalizeGatewayResult } from "../market/proxy-utils.js";
import { redactString } from "../utils/redact.js";
import { applyPresetOperations, buildPresetOperations } from "./config-patch.js";
import {
  buildPresetLayout,
  modeLabel,
  resolvePresetIntent,
  resolvePresetMode,
} from "./preset-layout.js";
import type {
  MarketPresetCheck,
  MarketPresetMode,
  MarketPresetPreview,
  MarketPresetPreviewParams,
  MarketPresetReadiness,
  MarketPresetVerification,
} from "./preset-types.js";
import { detectPresetProviders } from "./resource-detectors.js";

export function buildMarketPresetPreview(
  runtimeConfig: Web3PluginConfig,
  params: MarketPresetPreviewParams = {},
): MarketPresetPreview {
  const mode = resolvePresetMode(params.mode);
  const intent = resolvePresetIntent(params.intent, mode);
  const currentConfig = ensureRecord(params.currentConfig);
  const resolvedRuntimeConfig = resolveConfig(
    extractWeb3PluginConfig(currentConfig) ?? runtimeConfig,
  );
  const layout = buildPresetLayout({ mode, intent, nodeLabel: params.nodeLabel });
  const detected = detectPresetProviders({
    config: resolvedRuntimeConfig,
    runtimeHints: params.runtimeHints,
  });
  const operations = buildPresetOperations({
    currentConfig,
    mode,
    intent,
    suggestedOffers: detected.suggestedOffers,
  });
  const checks = buildPresetChecks({
    mode,
    intent,
    config: resolvedRuntimeConfig,
    detectedProviders: detected.providers,
    hasSuggestedOffers: detected.suggestedOffers.length > 0,
  });

  return {
    mode,
    intent,
    summary: summarizePreset(mode, intent, detected.providers.length),
    layout,
    detectedProviders: detected.providers,
    operations,
    checks,
    nextSteps: buildNextSteps(mode, intent, checks),
  };
}

export async function verifyMarketPresetBaseline(params: {
  config: Web3PluginConfig;
  mode?: MarketPresetMode;
}): Promise<MarketPresetVerification> {
  const mode = resolvePresetMode(params.mode);
  const checks: MarketPresetCheck[] = [];
  const runtimeConfig = params.config;
  const metrics = {
    publishedResources: 0,
    activeLeases: 0,
    activeAlerts: 0,
    discoveryEnabled: runtimeConfig.discovery.enabled,
    consumerEnabled: runtimeConfig.resources.consumer.enabled,
    advertiseToMarket: runtimeConfig.resources.advertiseToMarket,
    providerListenEnabled: runtimeConfig.resources.provider.listen.enabled,
    providerBind: runtimeConfig.resources.provider.listen.bind,
  };

  checks.push(
    checkFromBoolean(
      "resources.enabled",
      runtimeConfig.resources.enabled,
      "资源共享已启用。",
      "请先启用 resources.enabled。",
    ),
  );
  checks.push(
    checkFromBoolean(
      "consumer.enabled",
      runtimeConfig.resources.consumer.enabled,
      "consumer 侧租约能力已启用。",
      "consumer 侧尚未启用，租约签发不可用。",
    ),
  );
  checks.push(
    checkFromBoolean(
      "provider.listen.enabled",
      runtimeConfig.resources.provider.listen.enabled,
      `provider HTTP 已开启（${runtimeConfig.resources.provider.listen.bind}:${runtimeConfig.resources.provider.listen.port}）。`,
      "provider HTTP 未启用，远端消费无法命中本节点。",
    ),
  );

  if (mode === "single-node") {
    checks.push({
      name: "discovery.mode",
      status: runtimeConfig.discovery.enabled ? "warn" : "pass",
      detail: runtimeConfig.discovery.enabled
        ? "单机模式无需 discovery，可保留但建议在纯本机场景关闭。"
        : "单机模式已关闭 discovery。",
    });
  } else {
    checks.push(
      checkFromBoolean(
        "discovery.enabled",
        runtimeConfig.discovery.enabled,
        `discovery 已启用（backend=${runtimeConfig.discovery.backend}）。`,
        "多机模式建议启用 discovery。",
        "warn",
      ),
    );
  }

  const [statusSummary, monitorHealth, indexStats, resources, leases] = await Promise.all([
    safeGatewayCall("market.status.summary", {}),
    safeGatewayCall("web3.monitor.health", {}),
    safeGatewayCall("web3.index.stats", {}),
    safeGatewayCall("market.resource.list", { limit: 200 }),
    safeGatewayCall("market.lease.list", { limit: 200 }),
  ]);

  if (statusSummary.ok) {
    checks.push({
      name: "market.status.summary",
      status: "pass",
      detail: "market-core 权威状态接口可用。",
    });
  } else {
    checks.push({
      name: "market.status.summary",
      status: "fail",
      detail: statusSummary.error,
      action: "确认 market-core 已启用并完成重启。",
    });
  }

  if (monitorHealth.ok) {
    const payload = ensureRecord(monitorHealth.result);
    metrics.activeAlerts = toFiniteNumber(payload.criticalAlerts);
    const status = normalizeHealthStatus(payload.status, payload.healthy);
    checks.push({
      name: "monitor.health",
      status: status === "healthy" ? "pass" : status === "degraded" ? "warn" : "fail",
      detail:
        status === "healthy"
          ? "监控健康。"
          : status === "degraded"
            ? "监控已退化，请检查 active alerts。"
            : "监控不可用。",
    });
  } else {
    checks.push({
      name: "monitor.health",
      status: "warn",
      detail: monitorHealth.error,
      action: "确认 web3.monitor.health 已注册并可访问。",
    });
  }

  if (indexStats.ok) {
    const payload = ensureRecord(indexStats.result);
    const providers = toFiniteNumber(payload.providers);
    checks.push({
      name: "index.providers",
      status:
        mode === "single-node"
          ? "pass"
          : providers > 0
            ? "pass"
            : runtimeConfig.discovery.enabled
              ? "warn"
              : "warn",
      detail:
        mode === "single-node"
          ? `index providers=${providers}。`
          : providers > 0
            ? `已发现 ${providers} 个 provider。`
            : "尚未发现 provider，需检查 bootstrap / 心跳 / 可信圈白名单。",
      action:
        providers > 0 ? undefined : "确认 discovery 节点可达并至少有一个 Provider 已发布资源。",
    });
  } else {
    checks.push({
      name: "index.providers",
      status: mode === "single-node" ? "warn" : "fail",
      detail: indexStats.error,
      action: "检查 web3.index.stats 与 discovery/index 服务。",
    });
  }

  if (resources.ok) {
    const payload = ensureRecord(resources.result);
    const list = Array.isArray(payload.resources) ? payload.resources : [];
    metrics.publishedResources = list.length;
    checks.push({
      name: "resource.publish",
      status:
        runtimeConfig.resources.advertiseToMarket && list.length === 0
          ? "warn"
          : list.length > 0 || !runtimeConfig.resources.advertiseToMarket
            ? "pass"
            : "warn",
      detail:
        list.length > 0
          ? `已发布 ${list.length} 个资源。`
          : runtimeConfig.resources.advertiseToMarket
            ? "尚未发布资源。"
            : "当前是消费优先模式，不要求发布资源。",
      action:
        list.length > 0 || !runtimeConfig.resources.advertiseToMarket
          ? undefined
          : "补齐 provider offers 后执行发布资源。",
    });
  } else {
    checks.push({
      name: "resource.publish",
      status: "warn",
      detail: resources.error,
      action: "确认 market.resource.list 可用。",
    });
  }

  if (leases.ok) {
    const payload = ensureRecord(leases.result);
    const list = Array.isArray(payload.leases) ? payload.leases : [];
    metrics.activeLeases = list.filter(
      (entry) => ensureRecord(entry).status === "lease_active",
    ).length;
    checks.push({
      name: "lease.flow",
      status: metrics.activeLeases > 0 ? "pass" : "warn",
      detail:
        metrics.activeLeases > 0
          ? `存在 ${metrics.activeLeases} 个活跃租约。`
          : "暂未观测到活跃租约，请执行一次消费链路验证。",
      action: metrics.activeLeases > 0 ? undefined : "从 consumer 发起一次租约并完成调用。",
    });
  } else {
    checks.push({
      name: "lease.flow",
      status: "warn",
      detail: leases.error,
      action: "检查 market.lease.list 与消费链路。",
    });
  }

  const readiness = summarizeReadiness(checks);
  return {
    mode,
    healthy: readiness.ready,
    summary: `${modeLabel(mode)}：${readiness.passCount} 项通过 / ${readiness.warnCount} 项告警 / ${readiness.failCount} 项失败。`,
    readiness,
    metrics,
    recommendedActions: checks
      .filter((check) => check.status !== "pass" && check.action)
      .map((check) => check.action as string),
  };
}

export function formatMarketPresetPreview(plan: MarketPresetPreview): string {
  const lines: string[] = [];
  lines.push(`🧭 兼容预设预览：${modeLabel(plan.mode)} / ${plan.intent}`);
  lines.push(plan.summary);
  lines.push("");
  lines.push(`布局摘要：${plan.layout.pattern}`);
  lines.push(`信任边界：${plan.layout.trustDomain}`);
  if (plan.detectedProviders.length > 0) {
    lines.push("");
    lines.push("探测到的 Provider / 运行时：");
    for (const provider of plan.detectedProviders.slice(0, 5)) {
      const models = provider.models.length > 0 ? provider.models.join(", ") : "待补模型名";
      lines.push(`- ${provider.label} [${provider.source}] · ${provider.offerBackend} · ${models}`);
    }
  }
  const blockers = plan.checks.filter((check) => check.status !== "pass");
  if (blockers.length > 0) {
    lines.push("");
    lines.push("需注意：");
    for (const item of blockers) {
      lines.push(`- ${item.name}: ${item.detail ?? item.status}`);
    }
  }
  if (plan.nextSteps.length > 0) {
    lines.push("");
    lines.push("兼容路径下一步：");
    for (const step of plan.nextSteps) {
      lines.push(`- ${step}`);
    }
  }
  return lines.join("\n");
}

export function formatMarketPresetVerification(verification: MarketPresetVerification): string {
  const lines: string[] = [];
  lines.push(`🩺 预设基线验证：${modeLabel(verification.mode)}`);
  lines.push(verification.summary);
  lines.push(
    `资源=${verification.metrics.publishedResources} · 活跃租约=${verification.metrics.activeLeases} · 活跃告警=${verification.metrics.activeAlerts}`,
  );
  lines.push("");
  for (const check of verification.readiness.checks) {
    const status = check.status.toUpperCase();
    lines.push(`- [${status}] ${check.name}${check.detail ? ` · ${check.detail}` : ""}`);
  }
  if (verification.recommendedActions.length > 0) {
    lines.push("");
    lines.push("建议动作：");
    for (const action of verification.recommendedActions.slice(0, 5)) {
      lines.push(`- ${action}`);
    }
  }
  return lines.join("\n");
}

export function applyPresetToConfig(params: {
  currentConfig?: OpenClawConfig | Record<string, unknown>;
  runtimeConfig: Web3PluginConfig;
  planParams?: MarketPresetPreviewParams;
}): { preset: MarketPresetPreview; nextConfig: Record<string, unknown> } {
  const preset = buildMarketPresetPreview(params.runtimeConfig, params.planParams);
  return {
    preset,
    nextConfig: applyPresetOperations(params.currentConfig, preset.operations),
  };
}

function buildPresetChecks(params: {
  mode: MarketPresetMode;
  intent: string;
  config: Web3PluginConfig;
  detectedProviders: ReturnType<typeof detectPresetProviders>["providers"];
  hasSuggestedOffers: boolean;
}): MarketPresetCheck[] {
  const checks: MarketPresetCheck[] = [];
  checks.push(
    checkFromBoolean(
      "resources.enabled",
      params.config.resources.enabled,
      "资源共享已启用。",
      "资源共享尚未启用。",
    ),
  );
  checks.push(
    checkFromBoolean(
      "agent-wallet.policy",
      true,
      "agent-wallet 会被纳入兼容预设。",
      "agent-wallet policy 缺失。",
    ),
  );
  if (params.intent !== "consumer") {
    const providerReady =
      params.config.resources.provider.offers.models.length > 0 || params.hasSuggestedOffers;
    checks.push({
      name: "provider.offers",
      status: providerReady ? "pass" : "warn",
      detail: providerReady ? "已存在 model offers 或可生成草案。" : "供给模式仍缺少模型 offer。",
      action: providerReady ? undefined : "补充运行时提示或手动配置 provider.offers.models。",
    });
  }
  if (params.mode !== "single-node") {
    checks.push({
      name: "discovery.strategy",
      status: params.config.discovery.enabled ? "pass" : "warn",
      detail: params.config.discovery.enabled
        ? `discovery backend=${params.config.discovery.backend}。`
        : "多机模式建议启用 discovery。",
      action: params.config.discovery.enabled
        ? undefined
        : "使用 libp2p + bootstrap peers 建立可信圈发现。",
    });
  }
  checks.push({
    name: "provider.detection",
    status: params.detectedProviders.length > 0 ? "pass" : "warn",
    detail:
      params.detectedProviders.length > 0
        ? `识别到 ${params.detectedProviders.length} 个潜在 Provider。`
        : "尚未识别到可发布运行时。",
    action:
      params.detectedProviders.length > 0
        ? undefined
        : "补充 runtimeHints 或手动配置 provider.offers。",
  });
  return checks;
}

function summarizePreset(mode: MarketPresetMode, intent: string, detectedCount: number): string {
  return `${modeLabel(mode)} 兼容预设会按 ${intent} 角色补齐 Web3 Market 基线，并${detectedCount > 0 ? `复用 ${detectedCount} 个已识别运行时/offer 线索` : "保持现有 offer 配置"}。`;
}

function buildNextSteps(
  mode: MarketPresetMode,
  intent: string,
  checks: MarketPresetCheck[],
): string[] {
  const steps = [
    `应用 ${modeLabel(mode)} 兼容预设配置。`,
    "重启 Gateway 并等待插件重新注册。",
    "执行预设基线验证，确认租约 / 账本 / 结算闭环。",
  ];
  if (
    intent !== "consumer" &&
    checks.some((check) => check.name === "provider.offers" && check.status !== "pass")
  ) {
    steps.splice(1, 0, "补齐 provider offers 或提供运行时提示，再执行资源发布。");
  }
  return steps;
}

function summarizeReadiness(checks: MarketPresetCheck[]): MarketPresetReadiness {
  const passCount = checks.filter((check) => check.status === "pass").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const failCount = checks.filter((check) => check.status === "fail").length;
  return {
    ready: failCount === 0,
    passCount,
    warnCount,
    failCount,
    checks,
  };
}

function checkFromBoolean(
  name: string,
  value: boolean,
  passDetail: string,
  failDetail: string,
  failStatus: "warn" | "fail" = "fail",
): MarketPresetCheck {
  return {
    name,
    status: value ? "pass" : failStatus,
    detail: value ? passDetail : failDetail,
  };
}

async function safeGatewayCall(method: string, params: Record<string, unknown>) {
  try {
    const callGateway = await loadCallGateway();
    const raw = await callGateway({ method, params });
    const normalized = normalizeGatewayResult(raw);
    if (!normalized.ok) {
      return { ok: false as const, error: redactString(normalized.error ?? "gateway call failed") };
    }
    return { ok: true as const, result: normalized.result };
  } catch (error) {
    return {
      ok: false as const,
      error: redactString(error instanceof Error ? error.message : String(error)),
    };
  }
}

function extractWeb3PluginConfig(
  currentConfig: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const plugins = ensureRecord(currentConfig.plugins);
  const entries = ensureRecord(plugins.entries);
  const web3Entry = ensureRecord(entries["web3-core"]);
  const config = web3Entry.config;
  return config && typeof config === "object" ? (config as Record<string, unknown>) : undefined;
}

function ensureRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function toFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeHealthStatus(status: unknown, healthy: unknown): "healthy" | "degraded" | "down" {
  if (status === "healthy" || status === "degraded" || status === "down") {
    return status;
  }
  if (healthy === true) {
    return "healthy";
  }
  if (healthy === false) {
    return "degraded";
  }
  return "healthy";
}
