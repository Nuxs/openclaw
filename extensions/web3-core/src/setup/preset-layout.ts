import type { MarketPresetIntent, MarketPresetLayout, MarketPresetMode } from "./preset-types.js";

/**
 * Preset layout helpers for the Web3 Market compatibility layer.
 *
 * This module only resolves preset labels and layout summaries used by
 * `web3.market.preset.*` and `/web3-market`. Multi-node topology policy
 * and rebalance decisions belong to the steward brain + skill layer.
 */
const MODE_LABELS: Record<MarketPresetMode, string> = {
  "single-node": "单机自用",
  "trusted-circle": "可信圈组网",
  "hybrid-cloud-edge": "混合云边",
};

export function resolvePresetMode(value: unknown): MarketPresetMode {
  return value === "trusted-circle" || value === "hybrid-cloud-edge" ? value : "single-node";
}

export function resolvePresetIntent(intent: unknown, _mode: MarketPresetMode): MarketPresetIntent {
  if (intent === "consumer" || intent === "provider" || intent === "hybrid") {
    return intent;
  }
  return "hybrid";
}

export function presetModeLabel(mode: MarketPresetMode): string {
  return MODE_LABELS[mode];
}

export function modeLabel(mode: MarketPresetMode): string {
  return presetModeLabel(mode);
}

export function buildPresetLayoutSummary(params: {
  mode: MarketPresetMode;
  intent: MarketPresetIntent;
  nodeLabel?: string;
}): MarketPresetLayout {
  const nodeLabel = params.nodeLabel?.trim() || "当前节点";

  if (params.mode === "trusted-circle") {
    return {
      pattern: `${presetModeLabel(params.mode)} · ${intentLabel(params.intent)}`,
      trustDomain: "局域网 / 私网可信成员 + 白名单消费侧",
      roles: [
        {
          id: "control-plane",
          label: `${nodeLabel} 控制面`,
          responsibility: "承载用户入口、状态查看与兼容配置入口；策略编排应由主脑 / skill 决定。",
        },
        {
          id: "market-authority",
          label: "权威市场节点",
          responsibility: "承接 market-core 状态机、租约、账本与结算基线。",
        },
        {
          id: "trusted-providers",
          label: "可信圈 Provider",
          responsibility: "暴露模型、搜索或存储能力，优先服务可信成员。",
        },
        {
          id: "bootstrap-discovery",
          label: "发现与索引",
          responsibility: "提供 bootstrap、rendezvous 与 index 基线，保证节点互见。",
        },
      ],
      validationScenarios: [
        "局域网节点发现与索引列表正常返回。",
        "内部节点可成功发布资源并完成租约签发。",
        "可信圈内的消费请求可写入账本并进入结算链路。",
      ],
    };
  }

  if (params.mode === "hybrid-cloud-edge") {
    return {
      pattern: `${presetModeLabel(params.mode)} · ${intentLabel(params.intent)}`,
      trustDomain: "本地强节点 + 云端 authority / fallback provider",
      roles: [
        {
          id: "control-plane",
          label: `${nodeLabel} 控制面 / Consumer`,
          responsibility: "承载用户入口、预算约束与默认消费基线。",
        },
        {
          id: "cloud-authority",
          label: "云端权威层",
          responsibility: "托管 authority、索引与兜底监控基线。",
        },
        {
          id: "edge-provider",
          label: "边缘执行节点",
          responsibility: "承接主要执行容量与本地高性能资源供给。",
        },
        {
          id: "fallback-provider",
          label: "云端兜底 Provider",
          responsibility: "在边缘节点离线或满载时提供回退容量。",
        },
      ],
      validationScenarios: [
        "本地 Provider 优先被发现并被消费侧选中。",
        "authority 节点持续提供索引、账本与结算能力。",
        "边缘节点失效后可自动回退到云端容量。",
      ],
    };
  }

  return {
    pattern: `${presetModeLabel(params.mode)} · ${intentLabel(params.intent)}`,
    trustDomain: "单设备 / 单主机",
    roles: [
      {
        id: "control-plane",
        label: `${nodeLabel} 一体化节点`,
        responsibility: "同机承载入口、consumer、provider 与本地 authority 基线。",
      },
      {
        id: "market-authority",
        label: "本地权威层",
        responsibility: "单机保存租约、账本与结算状态，适合测试与自用。",
      },
    ],
    validationScenarios: [
      "本机资源可被成功发布到市场。",
      "本机 consumer 可签发租约并访问 provider HTTP。",
      "调用、计量、账本与结算闭环可在单机完成。",
    ],
  };
}

export function buildPresetLayout(params: {
  mode: MarketPresetMode;
  intent: MarketPresetIntent;
  nodeLabel?: string;
}): MarketPresetLayout {
  return buildPresetLayoutSummary(params);
}

function intentLabel(intent: MarketPresetIntent): string {
  switch (intent) {
    case "consumer":
      return "消费优先";
    case "provider":
      return "供给优先";
    default:
      return "混合角色";
  }
}
