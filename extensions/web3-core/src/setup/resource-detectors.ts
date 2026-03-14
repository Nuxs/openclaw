import type { ResourceModelOffer, Web3PluginConfig } from "../config.js";
import type { MarketPresetRuntimeHint, MarketDetectedProvider } from "./preset-types.js";

export function detectPresetProviders(params: {
  config: Web3PluginConfig;
  runtimeHints?: MarketPresetRuntimeHint[];
}): {
  providers: MarketDetectedProvider[];
  suggestedOffers: ResourceModelOffer[];
} {
  const configuredProviders: MarketDetectedProvider[] =
    params.config.resources.provider.offers.models.map((offer) => ({
      label: offer.label,
      source: "configured",
      runtime: normalizeRuntimeKind(offer.backend),
      offerBackend: offer.backend === "custom" ? "custom" : "openai-compat",
      models: [pickModelName(offer)].filter((value): value is string => Boolean(value)),
      publishable: true,
      note: "已存在于 web3-core 配置中。",
    }));

  const providersFromHints: MarketDetectedProvider[] = [];
  const suggestedOffers: ResourceModelOffer[] = [];

  for (const hint of params.runtimeHints ?? []) {
    const models = Array.isArray(hint.models)
      ? hint.models.map((entry) => entry.trim()).filter(Boolean)
      : [];
    const publishable = models.length > 0;
    providersFromHints.push({
      label: hint.label?.trim() || defaultHintLabel(hint.kind),
      source: "hint",
      runtime: hint.kind,
      offerBackend: hint.kind === "custom" ? "custom" : "openai-compat",
      models,
      publishable,
      note: publishable
        ? `检测到 ${hint.kind} 运行时，可生成 openai-compat offer 草案。`
        : `检测到 ${hint.kind} 运行时，但仍缺少模型名，暂不自动写入 offer。`,
    });

    if (!publishable) {
      continue;
    }

    for (const model of models) {
      suggestedOffers.push({
        id: suggestOfferId(model),
        label: `${hint.label?.trim() || defaultHintLabel(hint.kind)} · ${model}`,
        backend: hint.kind === "custom" ? "custom" : "openai-compat",
        backendConfig: {
          baseUrl: defaultBaseUrlForHint(hint.kind),
          model,
        },
        price: { unit: "token", amount: 1, currency: "USDC" },
        policy: {
          maxConcurrent: clampConcurrent(hint.maxConcurrent),
          maxTokens: 8192,
          allowTools: false,
        },
      });
    }
  }

  return {
    providers: dedupeProviders([...configuredProviders, ...providersFromHints]),
    suggestedOffers,
  };
}

function normalizeRuntimeKind(backend: string): MarketDetectedProvider["runtime"] {
  switch (backend) {
    case "custom":
      return "custom";
    case "openai-compat":
      return "openai-compat";
    case "lmstudio":
      return "lmstudio";
    default:
      return "ollama";
  }
}

function defaultHintLabel(kind: MarketPresetRuntimeHint["kind"]): string {
  switch (kind) {
    case "lmstudio":
      return "LM Studio";
    case "openai-compat":
      return "OpenAI Compatible Runtime";
    case "custom":
      return "Custom Runtime";
    default:
      return "Ollama Runtime";
  }
}

function defaultBaseUrlForHint(kind: MarketPresetRuntimeHint["kind"]): string {
  switch (kind) {
    case "lmstudio":
      return "http://127.0.0.1:1234";
    case "custom":
      return "http://127.0.0.1:8080";
    case "openai-compat":
      return "http://127.0.0.1:11434";
    default:
      return "http://127.0.0.1:11434";
  }
}

function pickModelName(offer: ResourceModelOffer): string | undefined {
  const model = offer.backendConfig.model;
  return typeof model === "string" && model.trim().length > 0 ? model.trim() : undefined;
}

function suggestOfferId(model: string): string {
  return `res_model_${model.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function clampConcurrent(value: number | undefined): number {
  if (!Number.isFinite(value) || !value) {
    return 1;
  }
  return Math.max(1, Math.min(8, Math.floor(value)));
}

function dedupeProviders(input: MarketDetectedProvider[]): MarketDetectedProvider[] {
  const seen = new Set<string>();
  const output: MarketDetectedProvider[] = [];
  for (const provider of input) {
    const key = `${provider.source}:${provider.label}:${provider.models.join(",")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(provider);
  }
  return output;
}
