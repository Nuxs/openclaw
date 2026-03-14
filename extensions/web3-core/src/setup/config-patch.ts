import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";
import type { ResourceModelOffer } from "../config.js";
import type {
  MarketDeploymentIntent,
  MarketDeploymentMode,
  MarketDeploymentOperation,
} from "./deployment-types.js";

export function buildDeploymentOperations(params: {
  currentConfig?: OpenClawConfig | Record<string, unknown>;
  mode: MarketDeploymentMode;
  intent: MarketDeploymentIntent;
  suggestedOffers: ResourceModelOffer[];
}): MarketDeploymentOperation[] {
  const root = ensureRecord(params.currentConfig);
  const operations: MarketDeploymentOperation[] = [];

  operations.push({
    op: "set",
    path: ["plugins", "enabled"],
    value: true,
    summary: "启用插件系统。",
  });
  operations.push({
    op: "mergeStringSet",
    path: ["plugins", "allow"],
    value: ["web3-core", "market-core", "agent-wallet"],
    summary: "放开 Web3 / Market / Agent Wallet 插件白名单。",
  });
  operations.push({
    op: "set",
    path: ["plugins", "entries", "web3-core", "enabled"],
    value: true,
    summary: "启用 web3-core。",
  });
  operations.push({
    op: "set",
    path: ["plugins", "entries", "market-core", "enabled"],
    value: true,
    summary: "启用 market-core。",
  });
  operations.push({
    op: "set",
    path: ["plugins", "entries", "agent-wallet", "enabled"],
    value: true,
    summary: "启用 agent-wallet，保证自动支付与预算策略链路可用。",
  });
  operations.push({
    op: "set",
    path: ["plugins", "entries", "agent-wallet", "config", "policy", "enabled"],
    value: true,
    summary: "启用 agent-wallet policy。",
  });
  operations.push({
    op: "setIfMissing",
    path: ["plugins", "entries", "agent-wallet", "config", "policy", "inlinePolicy", "version"],
    value: "v1",
    summary: "补齐钱包策略版本。",
  });
  operations.push({
    op: "setIfMissing",
    path: [
      "plugins",
      "entries",
      "agent-wallet",
      "config",
      "policy",
      "inlinePolicy",
      "autoPay",
      "enabled",
    ],
    value: true,
    summary: "默认开启自动支付。",
  });
  operations.push({
    op: "setIfMissing",
    path: [
      "plugins",
      "entries",
      "agent-wallet",
      "config",
      "policy",
      "inlinePolicy",
      "autoPay",
      "maxRetries",
    ],
    value: 1,
    summary: "限制自动支付重试次数。",
  });
  operations.push({
    op: "setIfMissing",
    path: [
      "plugins",
      "entries",
      "agent-wallet",
      "config",
      "policy",
      "inlinePolicy",
      "autoPay",
      "maxAutoPayPerRequest",
    ],
    value: "100000000000000000",
    summary: "补齐单次自动支付上限。",
  });
  operations.push({
    op: "setIfMissing",
    path: [
      "plugins",
      "entries",
      "agent-wallet",
      "config",
      "policy",
      "inlinePolicy",
      "budget",
      "perTxCap",
    ],
    value: "100000000000000000",
    summary: "补齐每笔预算上限。",
  });
  operations.push({
    op: "setIfMissing",
    path: [
      "plugins",
      "entries",
      "agent-wallet",
      "config",
      "policy",
      "inlinePolicy",
      "budget",
      "dailyCap",
    ],
    value: "1000000000000000000",
    summary: "补齐每日预算上限。",
  });
  operations.push({
    op: "setIfMissing",
    path: [
      "plugins",
      "entries",
      "agent-wallet",
      "config",
      "policy",
      "inlinePolicy",
      "budget",
      "currency",
    ],
    value: "NATIVE",
    summary: "补齐预算币种。",
  });

  operations.push({
    op: "set",
    path: ["plugins", "entries", "web3-core", "config", "resources", "enabled"],
    value: true,
    summary: "启用资源共享主开关。",
  });
  operations.push({
    op: "set",
    path: ["plugins", "entries", "web3-core", "config", "monitor", "enabled"],
    value: true,
    summary: "启用监控。",
  });

  const advertise = params.intent !== "consumer";
  const consumerEnabled = params.intent !== "provider";
  const providerEnabled = params.intent !== "consumer";
  const providerBind = params.mode === "single-node" ? "loopback" : "lan";

  operations.push({
    op: "set",
    path: ["plugins", "entries", "web3-core", "config", "resources", "advertiseToMarket"],
    value: advertise,
    summary: advertise ? "启用市场广告，允许发布资源。" : "关闭市场广告，仅保留消费侧。",
  });
  operations.push({
    op: "set",
    path: ["plugins", "entries", "web3-core", "config", "resources", "consumer", "enabled"],
    value: consumerEnabled,
    summary: consumerEnabled ? "启用 consumer 侧租约能力。" : "关闭 consumer 侧租约能力。",
  });
  operations.push({
    op: "set",
    path: [
      "plugins",
      "entries",
      "web3-core",
      "config",
      "resources",
      "provider",
      "listen",
      "enabled",
    ],
    value: providerEnabled,
    summary: providerEnabled ? "启用 provider HTTP 监听。" : "关闭 provider HTTP 监听。",
  });
  operations.push({
    op: "setIfMissing",
    path: ["plugins", "entries", "web3-core", "config", "resources", "provider", "listen", "bind"],
    value: providerBind,
    summary: `默认监听绑定设置为 ${providerBind}。`,
  });
  operations.push({
    op: "setIfMissing",
    path: ["plugins", "entries", "web3-core", "config", "resources", "provider", "listen", "port"],
    value: 18790,
    summary: "默认 provider 端口设置为 18790。",
  });

  if (params.mode === "single-node") {
    operations.push({
      op: "set",
      path: ["plugins", "entries", "web3-core", "config", "discovery", "enabled"],
      value: false,
      summary: "单机模式默认关闭 discovery。",
    });
  } else {
    operations.push({
      op: "set",
      path: ["plugins", "entries", "web3-core", "config", "discovery", "enabled"],
      value: true,
      summary: "启用 discovery，支撑多机可信圈与混合云边发现。",
    });
    operations.push({
      op: "setIfMissing",
      path: ["plugins", "entries", "web3-core", "config", "discovery", "backend"],
      value: "libp2p",
      summary: "默认 discovery backend 设为 libp2p。",
    });
    operations.push({
      op: "setIfMissing",
      path: ["plugins", "entries", "web3-core", "config", "discovery", "rendezvousIntervalMs"],
      value: 30000,
      summary: "补齐 discovery 轮询周期。",
    });
    operations.push({
      op: "setIfMissing",
      path: ["plugins", "entries", "web3-core", "config", "discovery", "dhtKeyPrefix"],
      value: "/openclaw/resource",
      summary: "补齐 DHT key 前缀。",
    });
  }

  const currentOffers = getValue(root, [
    "plugins",
    "entries",
    "web3-core",
    "config",
    "resources",
    "provider",
    "offers",
    "models",
  ]);
  const shouldSeedOffers =
    providerEnabled && params.suggestedOffers.length > 0 && isEffectivelyEmpty(currentOffers);
  if (shouldSeedOffers) {
    operations.push({
      op: "setIfEmpty",
      path: [
        "plugins",
        "entries",
        "web3-core",
        "config",
        "resources",
        "provider",
        "offers",
        "models",
      ],
      value: params.suggestedOffers,
      summary: "根据探测到的运行时生成模型 offer 草案。",
    });
  }

  return operations;
}

export function applyDeploymentOperations(
  currentConfig: OpenClawConfig | Record<string, unknown> | undefined,
  operations: MarketDeploymentOperation[],
): Record<string, unknown> {
  const next = structuredClone(ensureRecord(currentConfig));
  for (const operation of operations) {
    switch (operation.op) {
      case "set":
        setValue(next, operation.path, operation.value);
        break;
      case "setIfMissing": {
        const current = getValue(next, operation.path);
        if (current === undefined || current === null) {
          setValue(next, operation.path, operation.value);
        }
        break;
      }
      case "setIfEmpty": {
        const current = getValue(next, operation.path);
        if (isEffectivelyEmpty(current)) {
          setValue(next, operation.path, operation.value);
        }
        break;
      }
      case "mergeStringSet": {
        const current = getValue(next, operation.path);
        const merged = new Set<string>();
        if (Array.isArray(current)) {
          for (const entry of current) {
            if (typeof entry === "string") {
              merged.add(entry);
            }
          }
        }
        for (const entry of Array.isArray(operation.value) ? operation.value : []) {
          if (typeof entry === "string") {
            merged.add(entry);
          }
        }
        setValue(next, operation.path, Array.from(merged));
        break;
      }
    }
  }
  return next;
}

function ensureRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? ({ ...(input as Record<string, unknown>) } as Record<string, unknown>)
    : {};
}

function getValue(root: Record<string, unknown>, path: Array<string | number>): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[String(key)];
  }
  return current;
}

function setValue(
  root: Record<string, unknown>,
  path: Array<string | number>,
  value: unknown,
): void {
  let current: Record<string, unknown> = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = String(path[index]);
    const existing = current[key];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[String(path[path.length - 1])] = value;
}

function isEffectivelyEmpty(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  return false;
}
