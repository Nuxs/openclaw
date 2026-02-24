import { Type } from "@sinclair/typebox";
import { formatCliCommand } from "../../cli/command-format.js";
import type { OpenClawConfig } from "../../config/config.js";
import { defaultRuntime } from "../../runtime.js";
import { wrapWebContent } from "../../security/external-content.js";
import { normalizeSecretInput } from "../../utils/normalize-secret-input.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";
import { runBraveSearch } from "./web-search/brave.js";
import { normalizeFreshness, freshnessToPerplexityRecency } from "./web-search/freshness.js";
import { runGeminiSearch, DEFAULT_GEMINI_MODEL, type GeminiConfig } from "./web-search/gemini.js";
import { runGrokSearch, DEFAULT_GROK_MODEL, extractGrokContent } from "./web-search/grok.js";
import {
  DEFAULT_KIMI_BASE_URL,
  DEFAULT_KIMI_MODEL,
  extractKimiCitations,
  runKimiSearch,
} from "./web-search/kimi.js";
import {
  DEFAULT_PERPLEXITY_BASE_URL,
  DEFAULT_PERPLEXITY_MODEL,
  inferPerplexityBaseUrlFromApiKey,
  isDirectPerplexityBaseUrl,
  resolvePerplexityBaseUrl,
  resolvePerplexityModel,
  resolvePerplexityRequestModel,
  runPerplexitySearch,
  type PerplexityApiKeySource,
  type PerplexityConfig,
} from "./web-search/perplexity.js";
import {
  runSearxngSearch,
  serializeSearxngRerankConfig,
  serializeSiteWeights,
} from "./web-search/searxng.js";
import {
  type ApiKeyRequiredWebSearchProvider,
  type SearxngConfig,
  type SearxngRerankConfig,
  WEB_SEARCH_PROVIDER_IDS,
} from "./web-search/types.js";
import {
  type CacheEntry,
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  normalizeCacheKey,
  readCache,
  resolveCacheTtlMs,
  resolveTimeoutSeconds,
  writeCache,
} from "./web-shared.js";

const SEARCH_PROVIDERS = WEB_SEARCH_PROVIDER_IDS;
const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;

const SEARCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

const WebSearchSchema = Type.Object({
  query: Type.String({ description: "Search query string." }),
  count: Type.Optional(
    Type.Number({
      description: "Number of results to return (1-10).",
      minimum: 1,
      maximum: MAX_SEARCH_COUNT,
    }),
  ),
  country: Type.Optional(
    Type.String({
      description:
        "2-letter country code for region-specific results (e.g., 'DE', 'US', 'ALL'). Default: 'US'.",
    }),
  ),
  search_lang: Type.Optional(
    Type.String({
      description: "ISO language code for search results (e.g., 'de', 'en', 'fr').",
    }),
  ),
  ui_lang: Type.Optional(
    Type.String({
      description: "ISO language code for UI elements.",
    }),
  ),
  freshness: Type.Optional(
    Type.String({
      description:
        "Filter results by discovery time. Brave supports 'pd', 'pw', 'pm', 'py', and date range 'YYYY-MM-DDtoYYYY-MM-DD'. Perplexity supports 'pd', 'pw', 'pm', and 'py'.",
    }),
  ),
});

type WebSearchConfig = NonNullable<OpenClawConfig["tools"]>["web"] extends infer Web
  ? Web extends { search?: infer Search }
    ? Search
    : undefined
  : undefined;

type GrokConfig = {
  apiKey?: string;
  model?: string;
  inlineCitations?: boolean;
};

type KimiConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

function resolveSearchConfig(cfg?: OpenClawConfig): WebSearchConfig {
  const search = cfg?.tools?.web?.search;
  if (!search || typeof search !== "object") {
    return undefined;
  }
  return search as WebSearchConfig;
}

function resolveSearchEnabled(params: { search?: WebSearchConfig; sandboxed?: boolean }): boolean {
  if (typeof params.search?.enabled === "boolean") {
    return params.search.enabled;
  }
  if (params.sandboxed) {
    return true;
  }
  return true;
}

function normalizeApiKey(key: unknown): string {
  return normalizeSecretInput(key);
}

function resolveSearchApiKey(search?: WebSearchConfig): string | undefined {
  const fromConfig =
    search && "apiKey" in search && typeof search.apiKey === "string"
      ? normalizeSecretInput(search.apiKey)
      : "";
  const fromEnv = normalizeSecretInput(process.env.BRAVE_API_KEY);
  return fromConfig || fromEnv || undefined;
}

function missingSearchKeyPayload(provider: ApiKeyRequiredWebSearchProvider) {
  if (provider === "perplexity") {
    return {
      error: "missing_perplexity_api_key",
      message:
        "web_search (perplexity) needs an API key. Set PERPLEXITY_API_KEY or OPENROUTER_API_KEY in the Gateway environment, or configure tools.web.search.perplexity.apiKey.",
      docs: "https://docs.openclaw.ai/tools/web",
    };
  }
  if (provider === "grok") {
    return {
      error: "missing_xai_api_key",
      message:
        "web_search (grok) needs an xAI API key. Set XAI_API_KEY in the Gateway environment, or configure tools.web.search.grok.apiKey.",
      docs: "https://docs.openclaw.ai/tools/web",
    };
  }
  if (provider === "gemini") {
    return {
      error: "missing_gemini_api_key",
      message:
        "web_search (gemini) needs an API key. Set GEMINI_API_KEY in the Gateway environment, or configure tools.web.search.gemini.apiKey.",
      docs: "https://docs.openclaw.ai/tools/web",
    };
  }
  if (provider === "kimi") {
    return {
      error: "missing_kimi_api_key",
      message:
        "web_search (kimi) needs a Moonshot API key. Set KIMI_API_KEY or MOONSHOT_API_KEY in the Gateway environment, or configure tools.web.search.kimi.apiKey.",
      docs: "https://docs.openclaw.ai/tools/web",
    };
  }
  return {
    error: "missing_brave_api_key",
    message: `web_search needs a Brave Search API key. Run \`${formatCliCommand("openclaw configure --section web")}\` to store it, or set BRAVE_API_KEY in the Gateway environment.`,
    docs: "https://docs.openclaw.ai/tools/web",
  };
}

function resolveSearchProvider(search?: WebSearchConfig): (typeof SEARCH_PROVIDERS)[number] {
  const raw =
    search && "provider" in search && typeof search.provider === "string"
      ? search.provider.trim().toLowerCase()
      : "";

  if (raw === "perplexity") {
    return "perplexity";
  }
  if (raw === "grok") {
    return "grok";
  }
  if (raw === "searxng") {
    return "searxng";
  }
  if (raw === "gemini") {
    return "gemini";
  }
  if (raw === "kimi") {
    return "kimi";
  }
  if (raw === "brave") {
    return "brave";
  }

  // Auto-detect provider from available config (private providers first) or API keys.
  if (raw === "") {
    // 0. SearxNG (self-hosted) when a base URL is configured.
    const searxngConfig = resolveSearxngConfig(search);
    if (resolveSearxngBaseUrl(searxngConfig)) {
      defaultRuntime.log(
        'web_search: no provider configured, auto-detected "searxng" from configured baseUrl',
      );
      return "searxng";
    }

    // 1. Brave
    if (resolveSearchApiKey(search)) {
      defaultRuntime.log(
        'web_search: no provider configured, auto-detected "brave" from available API keys',
      );
      return "brave";
    }

    // 2. Gemini
    const geminiConfig = resolveGeminiConfig(search);
    if (resolveGeminiApiKey(geminiConfig)) {
      defaultRuntime.log(
        'web_search: no provider configured, auto-detected "gemini" from available API keys',
      );
      return "gemini";
    }

    // 3. Kimi
    const kimiConfig = resolveKimiConfig(search);
    if (resolveKimiApiKey(kimiConfig)) {
      defaultRuntime.log(
        'web_search: no provider configured, auto-detected "kimi" from available API keys',
      );
      return "kimi";
    }

    // 4. Perplexity
    const perplexityConfig = resolvePerplexityConfig(search);
    const { apiKey: perplexityKey } = resolvePerplexityApiKey(perplexityConfig);
    if (perplexityKey) {
      defaultRuntime.log(
        'web_search: no provider configured, auto-detected "perplexity" from available API keys',
      );
      return "perplexity";
    }

    // 5. Grok
    const grokConfig = resolveGrokConfig(search);
    if (resolveGrokApiKey(grokConfig)) {
      defaultRuntime.log(
        'web_search: no provider configured, auto-detected "grok" from available API keys',
      );
      return "grok";
    }
  }

  return "brave";
}

function resolvePerplexityConfig(search?: WebSearchConfig): PerplexityConfig {
  if (!search || typeof search !== "object") {
    return {};
  }
  const perplexity = "perplexity" in search ? search.perplexity : undefined;
  if (!perplexity || typeof perplexity !== "object") {
    return {};
  }
  return perplexity as PerplexityConfig;
}

function resolvePerplexityApiKey(perplexity?: PerplexityConfig): {
  apiKey?: string;
  source: PerplexityApiKeySource;
} {
  const fromConfig = normalizeApiKey(perplexity?.apiKey);
  if (fromConfig) {
    return { apiKey: fromConfig, source: "config" };
  }

  const fromEnvPerplexity = normalizeApiKey(process.env.PERPLEXITY_API_KEY);
  if (fromEnvPerplexity) {
    return { apiKey: fromEnvPerplexity, source: "perplexity_env" };
  }

  const fromEnvOpenRouter = normalizeApiKey(process.env.OPENROUTER_API_KEY);
  if (fromEnvOpenRouter) {
    return { apiKey: fromEnvOpenRouter, source: "openrouter_env" };
  }

  return { apiKey: undefined, source: "none" };
}

function resolveGrokConfig(search?: WebSearchConfig): GrokConfig {
  if (!search || typeof search !== "object") {
    return {};
  }
  const grok = "grok" in search ? search.grok : undefined;
  if (!grok || typeof grok !== "object") {
    return {};
  }
  return grok as GrokConfig;
}

function resolveGrokApiKey(grok?: GrokConfig): string | undefined {
  const fromConfig = normalizeApiKey(grok?.apiKey);
  if (fromConfig) {
    return fromConfig;
  }
  const fromEnv = normalizeApiKey(process.env.XAI_API_KEY);
  return fromEnv || undefined;
}

function resolveGrokModel(grok?: GrokConfig): string {
  const fromConfig =
    grok && "model" in grok && typeof grok.model === "string" ? grok.model.trim() : "";
  return fromConfig || DEFAULT_GROK_MODEL;
}

function resolveGrokInlineCitations(grok?: GrokConfig): boolean {
  return grok?.inlineCitations === true;
}

function resolveSearxngConfig(search?: WebSearchConfig): SearxngConfig {
  if (!search || typeof search !== "object") {
    return {};
  }
  const searxng = "searxng" in search ? search.searxng : undefined;
  if (!searxng || typeof searxng !== "object") {
    return {};
  }
  return searxng as SearxngConfig;
}

function resolveSearxngRerankConfig(searxng?: SearxngConfig): SearxngRerankConfig | undefined {
  if (!searxng || typeof searxng !== "object") {
    return undefined;
  }
  const rerank = "rerank" in searxng ? searxng.rerank : undefined;
  if (!rerank || typeof rerank !== "object") {
    return undefined;
  }
  return rerank;
}

function resolveSearxngBaseUrl(searxng?: SearxngConfig): string | undefined {
  const fromConfig =
    searxng && "baseUrl" in searxng && typeof searxng.baseUrl === "string"
      ? searxng.baseUrl.trim()
      : "";
  return fromConfig || undefined;
}

function resolveSearxngApiKey(searxng?: SearxngConfig): string | undefined {
  const fromConfig = normalizeApiKey(searxng?.apiKey);
  if (fromConfig) {
    return fromConfig;
  }
  const fromEnv = normalizeApiKey(process.env.SEARXNG_API_KEY);
  return fromEnv || undefined;
}

function resolveKimiConfig(search?: WebSearchConfig): KimiConfig {
  if (!search || typeof search !== "object") {
    return {};
  }
  const kimi = "kimi" in search ? search.kimi : undefined;
  if (!kimi || typeof kimi !== "object") {
    return {};
  }
  return kimi as KimiConfig;
}

function resolveKimiApiKey(kimi?: KimiConfig): string | undefined {
  const fromConfig = normalizeApiKey(kimi?.apiKey);
  if (fromConfig) {
    return fromConfig;
  }
  const fromEnvKimi = normalizeApiKey(process.env.KIMI_API_KEY);
  if (fromEnvKimi) {
    return fromEnvKimi;
  }
  const fromEnvMoonshot = normalizeApiKey(process.env.MOONSHOT_API_KEY);
  return fromEnvMoonshot || undefined;
}

function resolveKimiModel(kimi?: KimiConfig): string {
  const fromConfig =
    kimi && "model" in kimi && typeof kimi.model === "string" ? kimi.model.trim() : "";
  return fromConfig || DEFAULT_KIMI_MODEL;
}

function resolveKimiBaseUrl(kimi?: KimiConfig): string {
  const fromConfig =
    kimi && "baseUrl" in kimi && typeof kimi.baseUrl === "string" ? kimi.baseUrl.trim() : "";
  return fromConfig || DEFAULT_KIMI_BASE_URL;
}

function resolveGeminiConfig(search?: WebSearchConfig): GeminiConfig {
  if (!search || typeof search !== "object") {
    return {};
  }
  const gemini = "gemini" in search ? search.gemini : undefined;
  if (!gemini || typeof gemini !== "object") {
    return {};
  }
  return gemini as GeminiConfig;
}

function resolveGeminiApiKey(gemini?: GeminiConfig): string | undefined {
  const fromConfig = normalizeApiKey(gemini?.apiKey);
  if (fromConfig) {
    return fromConfig;
  }
  const fromEnv = normalizeApiKey(process.env.GEMINI_API_KEY);
  return fromEnv || undefined;
}

function resolveGeminiModel(gemini?: GeminiConfig): string {
  const fromConfig =
    gemini && "model" in gemini && typeof gemini.model === "string" ? gemini.model.trim() : "";
  return fromConfig || DEFAULT_GEMINI_MODEL;
}

function resolveSearchCount(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(parsed)));
  return clamped;
}

async function runWebSearch(params: {
  query: string;
  count: number;
  apiKey?: string;
  timeoutSeconds: number;
  cacheTtlMs: number;
  provider: (typeof SEARCH_PROVIDERS)[number];
  country?: string;
  search_lang?: string;
  ui_lang?: string;
  freshness?: string;
  perplexityBaseUrl?: string;
  perplexityModel?: string;
  grokModel?: string;
  grokInlineCitations?: boolean;
  geminiModel?: string;
  kimiBaseUrl?: string;
  kimiModel?: string;
  searxngBaseUrl?: string;
  searxngApiKey?: string;
  searxngSiteWeights?: Record<string, number>;
  searxngRerank?: SearxngRerankConfig;
}): Promise<Record<string, unknown>> {
  const cacheKey = normalizeCacheKey(
    params.provider === "brave"
      ? `${params.provider}:${params.query}:${params.count}:${params.country || "default"}:${params.search_lang || "default"}:${params.ui_lang || "default"}:${params.freshness || "default"}`
      : params.provider === "perplexity"
        ? `${params.provider}:${params.query}:${params.perplexityBaseUrl ?? DEFAULT_PERPLEXITY_BASE_URL}:${params.perplexityModel ?? DEFAULT_PERPLEXITY_MODEL}:${params.freshness || "default"}`
        : params.provider === "searxng"
          ? `${params.provider}:${params.query}:${params.searxngBaseUrl ?? "default"}:${params.count}:${params.search_lang || "default"}:${serializeSiteWeights(params.searxngSiteWeights)}:${serializeSearxngRerankConfig(params.searxngRerank)}`
          : params.provider === "kimi"
            ? `${params.provider}:${params.query}:${params.kimiBaseUrl ?? DEFAULT_KIMI_BASE_URL}:${params.kimiModel ?? DEFAULT_KIMI_MODEL}`
            : params.provider === "gemini"
              ? `${params.provider}:${params.query}:${params.geminiModel ?? DEFAULT_GEMINI_MODEL}`
              : `${params.provider}:${params.query}:${params.grokModel ?? DEFAULT_GROK_MODEL}:${String(params.grokInlineCitations ?? false)}`,
  );
  const cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  const start = Date.now();

  if (params.provider === "perplexity") {
    const { content, citations } = await runPerplexitySearch({
      query: params.query,
      apiKey: params.apiKey ?? "",
      baseUrl: params.perplexityBaseUrl ?? DEFAULT_PERPLEXITY_BASE_URL,
      model: params.perplexityModel ?? DEFAULT_PERPLEXITY_MODEL,
      timeoutSeconds: params.timeoutSeconds,
      freshness: params.freshness,
    });

    const payload = {
      query: params.query,
      provider: params.provider,
      model: params.perplexityModel ?? DEFAULT_PERPLEXITY_MODEL,
      tookMs: Date.now() - start,
      externalContent: {
        untrusted: true,
        source: "web_search",
        provider: params.provider,
        wrapped: true,
      },
      content: wrapWebContent(content),
      citations,
    };
    writeCache(SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);
    return payload;
  }

  if (params.provider === "grok") {
    const { content, citations, inlineCitations } = await runGrokSearch({
      query: params.query,
      apiKey: params.apiKey ?? "",
      model: params.grokModel ?? DEFAULT_GROK_MODEL,
      timeoutSeconds: params.timeoutSeconds,
      inlineCitations: params.grokInlineCitations ?? false,
    });

    const payload = {
      query: params.query,
      provider: params.provider,
      model: params.grokModel ?? DEFAULT_GROK_MODEL,
      tookMs: Date.now() - start,
      externalContent: {
        untrusted: true,
        source: "web_search",
        provider: params.provider,
        wrapped: true,
      },
      content: wrapWebContent(content),
      citations,
      inlineCitations,
    };
    writeCache(SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);
    return payload;
  }

  if (params.provider === "searxng") {
    const { results } = await runSearxngSearch({
      query: params.query,
      count: params.count,
      baseUrl: params.searxngBaseUrl ?? "",
      apiKey: params.searxngApiKey,
      timeoutSeconds: params.timeoutSeconds,
      searchLang: params.search_lang,
      siteWeights: params.searxngSiteWeights,
      rerank: params.searxngRerank,
    });

    const payload = {
      query: params.query,
      provider: params.provider,
      count: results.length,
      tookMs: Date.now() - start,
      externalContent: {
        untrusted: true,
        source: "web_search",
        provider: params.provider,
        wrapped: true,
      },
      results,
    };
    writeCache(SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);
    return payload;
  }

  if (params.provider === "kimi") {
    const { content, citations } = await runKimiSearch({
      query: params.query,
      apiKey: params.apiKey ?? "",
      baseUrl: params.kimiBaseUrl ?? DEFAULT_KIMI_BASE_URL,
      model: params.kimiModel ?? DEFAULT_KIMI_MODEL,
      timeoutSeconds: params.timeoutSeconds,
    });

    const payload = {
      query: params.query,
      provider: params.provider,
      model: params.kimiModel ?? DEFAULT_KIMI_MODEL,
      tookMs: Date.now() - start,
      externalContent: {
        untrusted: true,
        source: "web_search",
        provider: params.provider,
        wrapped: true,
      },
      content: wrapWebContent(content),
      citations,
    };
    writeCache(SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);
    return payload;
  }

  if (params.provider === "gemini") {
    const geminiResult = await runGeminiSearch({
      query: params.query,
      apiKey: params.apiKey ?? "",
      model: params.geminiModel ?? DEFAULT_GEMINI_MODEL,
      timeoutSeconds: params.timeoutSeconds,
    });

    const payload = {
      query: params.query,
      provider: params.provider,
      model: params.geminiModel ?? DEFAULT_GEMINI_MODEL,
      tookMs: Date.now() - start, // Includes redirect URL resolution time
      externalContent: {
        untrusted: true,
        source: "web_search",
        provider: params.provider,
        wrapped: true,
      },
      content: wrapWebContent(geminiResult.content),
      citations: geminiResult.citations,
    };
    writeCache(SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);
    return payload;
  }

  if (params.provider !== "brave") {
    throw new Error("Unsupported web search provider.");
  }

  const { results } = await runBraveSearch({
    query: params.query,
    count: params.count,
    apiKey: params.apiKey ?? "",
    timeoutSeconds: params.timeoutSeconds,
    country: params.country,
    search_lang: params.search_lang,
    ui_lang: params.ui_lang,
    freshness: params.freshness,
  });

  const payload = {
    query: params.query,
    provider: params.provider,
    count: results.length,
    tookMs: Date.now() - start,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: params.provider,
      wrapped: true,
    },
    results,
  };
  writeCache(SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);
  return payload;
}

export function createWebSearchTool(options?: {
  config?: OpenClawConfig;
  sandboxed?: boolean;
}): AnyAgentTool | null {
  const search = resolveSearchConfig(options?.config);
  if (!resolveSearchEnabled({ search, sandboxed: options?.sandboxed })) {
    return null;
  }

  const provider = resolveSearchProvider(search);
  const perplexityConfig = resolvePerplexityConfig(search);
  const grokConfig = resolveGrokConfig(search);
  const searxngConfig = resolveSearxngConfig(search);
  const searxngRerankConfig = resolveSearxngRerankConfig(searxngConfig);
  const geminiConfig = resolveGeminiConfig(search);
  const kimiConfig = resolveKimiConfig(search);

  const description =
    provider === "perplexity"
      ? "Search the web using Perplexity Sonar (direct or via OpenRouter). Returns AI-synthesized answers with citations from real-time web search."
      : provider === "grok"
        ? "Search the web using xAI Grok. Returns AI-synthesized answers with citations from real-time web search."
        : provider === "kimi"
          ? "Search the web using Kimi by Moonshot. Returns AI-synthesized answers with citations from native $web_search."
          : provider === "gemini"
            ? "Search the web using Gemini with Google Search grounding. Returns AI-synthesized answers with citations from Google Search."
            : provider === "searxng"
              ? "Search the web using SearxNG (self-hosted). Returns titles, URLs, and snippets from your SearxNG instance."
              : "Search the web using Brave Search API. Supports region-specific and localized search via country and language parameters. Returns titles, URLs, and snippets for fast research.";

  return {
    label: "Web Search",
    name: "web_search",
    description,
    parameters: WebSearchSchema,
    execute: async (_toolCallId, args) => {
      const perplexityAuth =
        provider === "perplexity" ? resolvePerplexityApiKey(perplexityConfig) : undefined;
      const searxngBaseUrl = resolveSearxngBaseUrl(searxngConfig);
      const apiKey =
        provider === "perplexity"
          ? perplexityAuth?.apiKey
          : provider === "grok"
            ? resolveGrokApiKey(grokConfig)
            : provider === "searxng"
              ? resolveSearxngApiKey(searxngConfig)
              : provider === "kimi"
                ? resolveKimiApiKey(kimiConfig)
                : provider === "gemini"
                  ? resolveGeminiApiKey(geminiConfig)
                  : resolveSearchApiKey(search);

      if (provider !== "searxng" && !apiKey) {
        return jsonResult(missingSearchKeyPayload(provider as ApiKeyRequiredWebSearchProvider));
      }

      if (provider === "searxng" && !searxngBaseUrl) {
        return jsonResult({
          error: "missing_searxng_base_url",
          message:
            "web_search (searxng) needs a base URL. Configure tools.web.search.searxng.baseUrl to point at your SearxNG instance.",
          docs: "https://docs.openclaw.ai/tools/web",
        });
      }
      const params = args as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true });
      const count =
        readNumberParam(params, "count", { integer: true }) ?? search?.maxResults ?? undefined;
      const country = readStringParam(params, "country");
      const search_lang = readStringParam(params, "search_lang");
      const ui_lang = readStringParam(params, "ui_lang");
      const rawFreshness = readStringParam(params, "freshness");
      if (rawFreshness && provider !== "brave" && provider !== "perplexity") {
        return jsonResult({
          error: "unsupported_freshness",
          message: "freshness is only supported by the Brave and Perplexity web_search providers.",
          docs: "https://docs.openclaw.ai/tools/web",
        });
      }
      const freshness = rawFreshness ? normalizeFreshness(rawFreshness) : undefined;
      if (rawFreshness && !freshness) {
        return jsonResult({
          error: "invalid_freshness",
          message:
            "freshness must be one of pd, pw, pm, py, or a range like YYYY-MM-DDtoYYYY-MM-DD.",
          docs: "https://docs.openclaw.ai/tools/web",
        });
      }
      const result = await runWebSearch({
        query,
        count: resolveSearchCount(count, DEFAULT_SEARCH_COUNT),
        apiKey,
        timeoutSeconds: resolveTimeoutSeconds(search?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
        cacheTtlMs: resolveCacheTtlMs(search?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
        provider,
        country,
        search_lang,
        ui_lang,
        freshness,
        perplexityBaseUrl: resolvePerplexityBaseUrl(
          perplexityConfig,
          perplexityAuth?.source,
          perplexityAuth?.apiKey,
        ),
        perplexityModel: resolvePerplexityModel(perplexityConfig),
        grokModel: resolveGrokModel(grokConfig),
        grokInlineCitations: resolveGrokInlineCitations(grokConfig),
        searxngBaseUrl,
        searxngApiKey: resolveSearxngApiKey(searxngConfig),
        searxngSiteWeights: searxngConfig?.siteWeights,
        searxngRerank: searxngRerankConfig,
        geminiModel: resolveGeminiModel(geminiConfig),
        kimiBaseUrl: resolveKimiBaseUrl(kimiConfig),
        kimiModel: resolveKimiModel(kimiConfig),
      });
      return jsonResult(result);
    },
  };
}

export const __testing = {
  resolveSearchProvider,
  inferPerplexityBaseUrlFromApiKey,
  resolvePerplexityBaseUrl,
  isDirectPerplexityBaseUrl,
  resolvePerplexityRequestModel,
  normalizeFreshness,
  freshnessToPerplexityRecency,
  resolveGrokApiKey,
  resolveGrokModel,
  resolveGrokInlineCitations,
  extractGrokContent,
  resolveSearxngBaseUrl,
  resolveSearxngApiKey,
  resolveKimiApiKey,
  resolveKimiModel,
  resolveKimiBaseUrl,
  extractKimiCitations,
} as const;
