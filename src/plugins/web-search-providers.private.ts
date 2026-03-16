import { Type } from "@sinclair/typebox";
import {
  executePrivateWebSearch,
  resolvePrivateWebSearchProvider,
} from "../agents/tools/web-search/private-hooks.js";
import type { CacheEntry } from "../agents/tools/web-shared.js";
import {
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  resolveCacheTtlMs,
  resolveTimeoutSeconds,
} from "../agents/tools/web-shared.js";
import type { PluginWebSearchProviderEntry, WebSearchProviderPlugin } from "./types.js";

const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;
const SEARXNG_SEARCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

const SearxngSearchSchema = Type.Object(
  {
    query: Type.String({ description: "Search query string." }),
    count: Type.Optional(
      Type.Number({
        description: "Number of results to return (1-10).",
        minimum: 1,
        maximum: MAX_SEARCH_COUNT,
      }),
    ),
    language: Type.Optional(
      Type.String({
        description: "ISO 639-1 language code for results (for example 'en', 'de', 'fr').",
      }),
    ),
  },
  { additionalProperties: false },
);

function getSearxngCredentialValue(searchConfig?: Record<string, unknown>): unknown {
  const scoped = searchConfig?.searxng;
  if (!scoped || typeof scoped !== "object" || Array.isArray(scoped)) {
    return undefined;
  }
  return (scoped as Record<string, unknown>).apiKey;
}

function setSearxngCredentialValue(
  searchConfigTarget: Record<string, unknown>,
  value: unknown,
): void {
  const current = searchConfigTarget.searxng;
  const next =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  if (typeof value === "string") {
    next.apiKey = value;
  }
  searchConfigTarget.searxng = next;
}

function readSearchConfigNumber(
  searchConfig: Record<string, unknown> | undefined,
  key: "maxResults" | "timeoutSeconds" | "cacheTtlMinutes",
): number | undefined {
  const value = searchConfig?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resolveSearchCount(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(parsed)));
}

function createSearxngWebSearchProvider(): WebSearchProviderPlugin {
  return {
    id: "searxng",
    label: "SearxNG",
    hint: "Self-hosted metasearch · base URL required",
    envVars: ["SEARXNG_API_KEY"],
    placeholder: "Optional API key",
    signupUrl: "https://docs.openclaw.ai/tools/web",
    docsUrl: "https://docs.openclaw.ai/tools/web",
    autoDetectOrder: 70,
    getCredentialValue: getSearxngCredentialValue,
    setCredentialValue: setSearxngCredentialValue,
    createTool: (ctx) => ({
      description:
        "Search the web using SearxNG (self-hosted). Returns titles, URLs, and snippets from your configured SearxNG instance.",
      parameters: SearxngSearchSchema,
      execute: async (args) => {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (!query) {
          return {
            error: "missing_query",
            message: "query is required for web_search.",
            docs: "https://docs.openclaw.ai/tools/web",
          };
        }

        const searchConfig = ctx.searchConfig;
        const fallbackCount =
          readSearchConfigNumber(searchConfig, "maxResults") ?? DEFAULT_SEARCH_COUNT;
        const timeoutSeconds = resolveTimeoutSeconds(
          readSearchConfigNumber(searchConfig, "timeoutSeconds"),
          DEFAULT_TIMEOUT_SECONDS,
        );
        const cacheTtlMs = resolveCacheTtlMs(
          readSearchConfigNumber(searchConfig, "cacheTtlMinutes"),
          DEFAULT_CACHE_TTL_MINUTES,
        );
        const language =
          typeof args.language === "string" && args.language.trim()
            ? args.language.trim()
            : undefined;

        return await executePrivateWebSearch({
          provider: "searxng",
          searchConfig,
          query,
          count: resolveSearchCount(args.count, fallbackCount),
          searchLang: language,
          timeoutSeconds,
          cacheTtlMs,
          cache: SEARXNG_SEARCH_CACHE,
        });
      },
    }),
  };
}

export const PRIVATE_BUNDLED_WEB_SEARCH_ALLOWLIST_COMPAT_PLUGIN_IDS = ["searxng"] as const;

export const PRIVATE_BUNDLED_WEB_SEARCH_PROVIDER_REGISTRY = [
  {
    pluginId: "searxng",
    provider: createSearxngWebSearchProvider(),
  },
] as const satisfies ReadonlyArray<{
  pluginId: string;
  provider: WebSearchProviderPlugin;
}>;

export function resolveConfiguredPrivateWebSearchProvider(params: {
  rawProvider: string;
  searchConfig: unknown;
}): PluginWebSearchProviderEntry["id"] | undefined {
  return resolvePrivateWebSearchProvider(params);
}
