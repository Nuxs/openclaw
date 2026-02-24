import { normalizeSecretInput } from "../../../utils/normalize-secret-input.js";
import type { CacheEntry } from "../web-shared.js";
import { normalizeCacheKey, readCache, writeCache } from "../web-shared.js";
import { runSearxngSearch, serializeSearxngRerankConfig, serializeSiteWeights } from "./searxng.js";

export type PrivateWebSearchProviderId = "searxng";

type SearxngConfig = {
  baseUrl?: string;
  apiKey?: string;
  siteWeights?: Record<string, number>;
  rerank?: {
    mode?: "off" | "auto" | "on";
    endpoint?: string;
    timeoutSeconds?: number;
    maxCandidates?: number;
    maxLength?: number;
  };
};

type WebSearchConfigLike = {
  provider?: string;
  searxng?: SearxngConfig;
} | null;

function asWebSearchConfig(value: unknown): WebSearchConfigLike {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as WebSearchConfigLike;
}

function resolveSearxngConfig(search: unknown): SearxngConfig | undefined {
  const cfg = asWebSearchConfig(search);
  const searxng = cfg?.searxng;
  if (!searxng || typeof searxng !== "object") {
    return undefined;
  }
  return searxng;
}

export function resolveSearxngBaseUrl(search: unknown): string | undefined {
  const searxng = resolveSearxngConfig(search);
  const fromConfig =
    searxng?.baseUrl && typeof searxng.baseUrl === "string" ? searxng.baseUrl.trim() : "";
  return fromConfig || undefined;
}

export function resolveSearxngApiKey(search: unknown): string | undefined {
  const searxng = resolveSearxngConfig(search);
  const fromConfig = normalizeSecretInput(searxng?.apiKey);
  if (fromConfig) {
    return fromConfig;
  }
  const fromEnv = normalizeSecretInput(process.env.SEARXNG_API_KEY);
  return fromEnv || undefined;
}

export function resolvePrivateWebSearchProvider(params: {
  rawProvider: string;
  searchConfig: unknown;
}): PrivateWebSearchProviderId | undefined {
  const raw = params.rawProvider;
  if (raw === "searxng") {
    return "searxng";
  }

  // Auto-detect: if a baseUrl is configured, prefer searxng.
  if (!raw) {
    const baseUrl = resolveSearxngBaseUrl(params.searchConfig);
    if (baseUrl) {
      return "searxng";
    }
  }

  return undefined;
}

export function describePrivateWebSearchProvider(provider: unknown): string | undefined {
  if (provider === "searxng") {
    return "Search the web using SearxNG (self-hosted). Returns titles, URLs, and snippets from your SearxNG instance.";
  }
  return undefined;
}

export function missingPrivateWebSearchConfigPayload(provider: PrivateWebSearchProviderId) {
  if (provider === "searxng") {
    return {
      error: "missing_searxng_base_url",
      message:
        "web_search (searxng) needs a base URL. Configure tools.web.search.searxng.baseUrl to point at your SearxNG instance.",
      docs: "https://docs.openclaw.ai/tools/web",
    };
  }
  return {
    error: "missing_private_web_search_config",
    message: "web_search: missing private provider configuration.",
    docs: "https://docs.openclaw.ai/tools/web",
  };
}

export async function executePrivateWebSearch(params: {
  provider: PrivateWebSearchProviderId;
  searchConfig: unknown;
  query: string;
  count: number;
  searchLang?: string;
  timeoutSeconds: number;
  cacheTtlMs: number;
  cache: Map<string, CacheEntry<Record<string, unknown>>>;
}): Promise<Record<string, unknown>> {
  if (params.provider !== "searxng") {
    throw new Error("Unsupported private web search provider.");
  }

  const baseUrl = resolveSearxngBaseUrl(params.searchConfig);
  if (!baseUrl) {
    return missingPrivateWebSearchConfigPayload("searxng");
  }

  const searxng = resolveSearxngConfig(params.searchConfig);
  const apiKey = resolveSearxngApiKey(params.searchConfig);

  const cacheKey = normalizeCacheKey(
    `searxng:${params.query}:${baseUrl}:${params.count}:${params.searchLang || "default"}:${serializeSiteWeights(searxng?.siteWeights)}:${serializeSearxngRerankConfig(searxng?.rerank)}`,
  );
  const cached = readCache(params.cache, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  const start = Date.now();
  const { results } = await runSearxngSearch({
    query: params.query,
    count: params.count,
    baseUrl,
    apiKey,
    timeoutSeconds: params.timeoutSeconds,
    searchLang: params.searchLang,
    siteWeights: searxng?.siteWeights,
    rerank: searxng?.rerank,
  });

  const payload = {
    query: params.query,
    provider: "searxng",
    count: results.length,
    tookMs: Date.now() - start,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: "searxng",
      wrapped: true,
    },
    results,
  };

  writeCache(params.cache, cacheKey, payload, params.cacheTtlMs);
  return payload;
}
