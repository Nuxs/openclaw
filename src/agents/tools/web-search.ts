import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { formatCliCommand } from "../../cli/command-format.js";
import { wrapWebContent } from "../../security/external-content.js";
import { normalizeSecretInput } from "../../utils/normalize-secret-input.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";
import {
  CacheEntry,
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  normalizeCacheKey,
  readCache,
  readResponseText,
  resolveCacheTtlMs,
  resolveTimeoutSeconds,
  withTimeout,
  writeCache,
} from "./web-shared.js";

const SEARCH_PROVIDERS = ["brave", "perplexity", "grok", "searxng"] as const;
const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_PERPLEXITY_BASE_URL = "https://openrouter.ai/api/v1";
const PERPLEXITY_DIRECT_BASE_URL = "https://api.perplexity.ai";
const DEFAULT_PERPLEXITY_MODEL = "perplexity/sonar-pro";
const PERPLEXITY_KEY_PREFIXES = ["pplx-"];
const OPENROUTER_KEY_PREFIXES = ["sk-or-"];

const XAI_API_ENDPOINT = "https://api.x.ai/v1/responses";
const DEFAULT_GROK_MODEL = "grok-4-1-fast";

const DEFAULT_SEARXNG_RERANK_MODE = "auto" as const;
const DEFAULT_SEARXNG_RERANK_TIMEOUT_SECONDS = 1;
const DEFAULT_SEARXNG_RERANK_MAX_CANDIDATES = 20;
const DEFAULT_SEARXNG_RERANK_MAX_LENGTH = 256;

const SEARCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();
const BRAVE_FRESHNESS_SHORTCUTS = new Set(["pd", "pw", "pm", "py"]);
const BRAVE_FRESHNESS_RANGE = /^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/;

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

type BraveSearchResult = {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
};

type BraveSearchResponse = {
  web?: {
    results?: BraveSearchResult[];
  };
};

type PerplexityConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

type PerplexityApiKeySource = "config" | "perplexity_env" | "openrouter_env" | "none";

type GrokConfig = {
  apiKey?: string;
  model?: string;
  inlineCitations?: boolean;
};

type SearxngRerankMode = "off" | "auto" | "on";

type SearxngRerankConfig = {
  mode?: SearxngRerankMode;
  endpoint?: string;
  timeoutSeconds?: number;
  maxCandidates?: number;
  maxLength?: number;
};

type SearxngConfig = {
  baseUrl?: string;
  apiKey?: string;
  siteWeights?: Record<string, number>;
  rerank?: SearxngRerankConfig;
};

type GrokSearchResponse = {
  output?: Array<{
    type?: string;
    role?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
        start_index?: number;
        end_index?: number;
      }>;
    }>;
  }>;
  output_text?: string; // deprecated field - kept for backwards compatibility
  citations?: string[];
  inline_citations?: Array<{
    start_index: number;
    end_index: number;
    url: string;
  }>;
};

type PerplexitySearchResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  citations?: string[];
};

type SearxngSearchResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    publishedDate?: string;
    published?: string;
  }>;
};

type PerplexityBaseUrlHint = "direct" | "openrouter";

function extractGrokContent(data: GrokSearchResponse): {
  text: string | undefined;
  annotationCitations: string[];
} {
  // xAI Responses API format: find the message output with text content
  for (const output of data.output ?? []) {
    if (output.type !== "message") {
      continue;
    }
    for (const block of output.content ?? []) {
      if (block.type === "output_text" && typeof block.text === "string" && block.text) {
        // Extract url_citation annotations from this content block
        const urls = (block.annotations ?? [])
          .filter((a) => a.type === "url_citation" && typeof a.url === "string")
          .map((a) => a.url as string);
        return { text: block.text, annotationCitations: [...new Set(urls)] };
      }
    }
  }
  // Fallback: deprecated output_text field
  const text = typeof data.output_text === "string" ? data.output_text : undefined;
  return { text, annotationCitations: [] };
}

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

function resolveSearchApiKey(search?: WebSearchConfig): string | undefined {
  const fromConfig =
    search && "apiKey" in search && typeof search.apiKey === "string"
      ? normalizeSecretInput(search.apiKey)
      : "";
  const fromEnv = normalizeSecretInput(process.env.BRAVE_API_KEY);
  return fromConfig || fromEnv || undefined;
}

type ApiKeyRequiredProvider = Exclude<(typeof SEARCH_PROVIDERS)[number], "searxng">;

function missingSearchKeyPayload(provider: ApiKeyRequiredProvider) {
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
  if (raw === "brave") {
    return "brave";
  }
  return "searxng";
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

function normalizeApiKey(key: unknown): string {
  return normalizeSecretInput(key);
}

function inferPerplexityBaseUrlFromApiKey(apiKey?: string): PerplexityBaseUrlHint | undefined {
  if (!apiKey) {
    return undefined;
  }
  const normalized = apiKey.toLowerCase();
  if (PERPLEXITY_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return "direct";
  }
  if (OPENROUTER_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return "openrouter";
  }
  return undefined;
}

function resolvePerplexityBaseUrl(
  perplexity?: PerplexityConfig,
  apiKeySource: PerplexityApiKeySource = "none",
  apiKey?: string,
): string {
  const fromConfig =
    perplexity && "baseUrl" in perplexity && typeof perplexity.baseUrl === "string"
      ? perplexity.baseUrl.trim()
      : "";
  if (fromConfig) {
    return fromConfig;
  }
  if (apiKeySource === "perplexity_env") {
    return PERPLEXITY_DIRECT_BASE_URL;
  }
  if (apiKeySource === "openrouter_env") {
    return DEFAULT_PERPLEXITY_BASE_URL;
  }
  if (apiKeySource === "config") {
    const inferred = inferPerplexityBaseUrlFromApiKey(apiKey);
    if (inferred === "direct") {
      return PERPLEXITY_DIRECT_BASE_URL;
    }
    if (inferred === "openrouter") {
      return DEFAULT_PERPLEXITY_BASE_URL;
    }
  }
  return DEFAULT_PERPLEXITY_BASE_URL;
}

function resolvePerplexityModel(perplexity?: PerplexityConfig): string {
  const fromConfig =
    perplexity && "model" in perplexity && typeof perplexity.model === "string"
      ? perplexity.model.trim()
      : "";
  return fromConfig || DEFAULT_PERPLEXITY_MODEL;
}

function isDirectPerplexityBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return false;
  }
  try {
    return new URL(trimmed).hostname.toLowerCase() === "api.perplexity.ai";
  } catch {
    return false;
  }
}

function resolvePerplexityRequestModel(baseUrl: string, model: string): string {
  if (!isDirectPerplexityBaseUrl(baseUrl)) {
    return model;
  }
  return model.startsWith("perplexity/") ? model.slice("perplexity/".length) : model;
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

function resolveSearxngRerankMode(rerank?: SearxngRerankConfig): SearxngRerankMode {
  const raw =
    rerank && "mode" in rerank && typeof rerank.mode === "string" ? rerank.mode.trim() : "";
  if (raw === "off" || raw === "auto" || raw === "on") {
    return raw;
  }
  return DEFAULT_SEARXNG_RERANK_MODE;
}

function resolveSearxngRerankEndpoint(rerank?: SearxngRerankConfig): string | undefined {
  const fromConfig =
    rerank && "endpoint" in rerank && typeof rerank.endpoint === "string"
      ? rerank.endpoint.trim()
      : "";
  return fromConfig || undefined;
}

function resolveSearxngRerankMaxCandidates(rerank?: SearxngRerankConfig): number {
  const raw =
    rerank && "maxCandidates" in rerank && typeof rerank.maxCandidates === "number"
      ? rerank.maxCandidates
      : DEFAULT_SEARXNG_RERANK_MAX_CANDIDATES;
  const parsed = Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_SEARXNG_RERANK_MAX_CANDIDATES;
  return Math.max(1, parsed);
}

function resolveSearxngRerankMaxLength(rerank?: SearxngRerankConfig): number {
  const raw =
    rerank && "maxLength" in rerank && typeof rerank.maxLength === "number"
      ? rerank.maxLength
      : DEFAULT_SEARXNG_RERANK_MAX_LENGTH;
  const parsed = Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_SEARXNG_RERANK_MAX_LENGTH;
  return Math.max(1, parsed);
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

function resolveSearchCount(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(parsed)));
  return clamped;
}

function normalizeFreshness(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();
  if (BRAVE_FRESHNESS_SHORTCUTS.has(lower)) {
    return lower;
  }

  const match = trimmed.match(BRAVE_FRESHNESS_RANGE);
  if (!match) {
    return undefined;
  }

  const [, start, end] = match;
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) {
    return undefined;
  }
  if (start > end) {
    return undefined;
  }

  return `${start}to${end}`;
}

/**
 * Map normalized freshness values (pd/pw/pm/py) to Perplexity's
 * search_recency_filter values (day/week/month/year).
 */
function freshnessToPerplexityRecency(freshness: string | undefined): string | undefined {
  if (!freshness) {
    return undefined;
  }
  const map: Record<string, string> = {
    pd: "day",
    pw: "week",
    pm: "month",
    py: "year",
  };
  return map[freshness] ?? undefined;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function resolveSiteName(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

type SearxngNormalizedResult = {
  title: string;
  url: string;
  description: string;
  published?: string;
  siteName?: string;
};

const SEARXNG_TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "yclid",
  "msclkid",
  "ref",
  "ref_src",
]);

function normalizeUrlForDedupe(rawUrl: string): string | undefined {
  if (!rawUrl) {
    return undefined;
  }
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    const toDelete = [...url.searchParams.keys()].filter((k) => SEARXNG_TRACKING_PARAMS.has(k));
    for (const key of toDelete) {
      url.searchParams.delete(key);
    }
    const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    let pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname) {
      pathname = "/";
    }
    const search = url.searchParams.toString();
    return `${hostname}${pathname}${search ? `?${search}` : ""}`;
  } catch {
    return undefined;
  }
}

function serializeSiteWeights(weights?: Record<string, number>): string {
  if (!weights) {
    return "default";
  }
  const entries = Object.entries(weights).filter(([, value]) => Number.isFinite(value));
  if (entries.length === 0) {
    return "default";
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([key, value]) => `${key}:${value}`).join(",");
}

function serializeSearxngRerankConfig(rerank?: SearxngRerankConfig): string {
  const mode = resolveSearxngRerankMode(rerank);
  if (mode === "off") {
    return "off";
  }
  const endpoint = resolveSearxngRerankEndpoint(rerank) ?? "unset";
  const timeoutSeconds = resolveTimeoutSeconds(
    rerank?.timeoutSeconds,
    DEFAULT_SEARXNG_RERANK_TIMEOUT_SECONDS,
  );
  const maxCandidates = resolveSearxngRerankMaxCandidates(rerank);
  const maxLength = resolveSearxngRerankMaxLength(rerank);
  return [
    `mode:${mode}`,
    `endpoint:${endpoint}`,
    `timeout:${timeoutSeconds}`,
    `maxCandidates:${maxCandidates}`,
    `maxLength:${maxLength}`,
  ].join(",");
}

function resolveSearxngSiteWeight(
  hostname: string | undefined,
  siteWeights?: Record<string, number>,
): number {
  if (!hostname) {
    return 1;
  }
  const normalizedHost = hostname.toLowerCase();
  const trimmedHost = normalizedHost.replace(/^www\./i, "");
  const parts = trimmedHost.split(".").filter(Boolean);
  const baseDomain =
    parts.length >= 2 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : "";
  const directWeight = siteWeights?.[trimmedHost] ?? siteWeights?.[normalizedHost];
  const baseWeight = baseDomain ? siteWeights?.[baseDomain] : undefined;
  const resolved = directWeight ?? baseWeight;
  if (typeof resolved === "number" && Number.isFinite(resolved)) {
    return resolved;
  }
  if (trimmedHost.endsWith(".gov")) {
    return 1.2;
  }
  if (trimmedHost.endsWith(".edu")) {
    return 1.15;
  }
  if (trimmedHost.endsWith(".org")) {
    return 1.05;
  }
  return 1;
}

/** Deduplicate SearxNG results and apply optional site weights, preserving original order. */
function dedupeSearxngResults(params: {
  results: SearxngNormalizedResult[];
  count: number;
  siteWeights?: Record<string, number>;
}): SearxngNormalizedResult[] {
  const seen = new Map<string, number>();
  const deduped: (SearxngNormalizedResult & { index: number })[] = [];

  for (let i = 0; i < params.results.length; i += 1) {
    const entry = params.results[i];
    const urlKey = normalizeUrlForDedupe(entry.url);
    const titleKey = entry.title?.toLowerCase().trim();
    const key = urlKey
      ? `url:${urlKey}`
      : titleKey
        ? `title:${titleKey}|${entry.siteName ?? ""}`
        : `index:${i}`;

    if (!seen.has(key)) {
      seen.set(key, deduped.length);
      deduped.push({ ...entry, index: i });
    }
  }

  // Stable sort by site weight (descending), preserving original order for equal weights.
  const sorted = deduped.toSorted((a, b) => {
    const wa = resolveSearxngSiteWeight(a.siteName, params.siteWeights);
    const wb = resolveSearxngSiteWeight(b.siteName, params.siteWeights);
    if (wb !== wa) {
      return wb - wa;
    }
    return a.index - b.index;
  });

  return sorted.slice(0, params.count).map(({ index: _index, ...rest }) => rest);
}

function clampRerankText(value: string, maxLength?: number): string {
  if (!value) {
    return "";
  }
  if (!maxLength || maxLength <= 0) {
    return value;
  }
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

async function runSearxngRerank(params: {
  query: string;
  candidates: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  endpoint: string;
  timeoutSeconds: number;
  maxLength?: number;
}): Promise<number[]> {
  const endpoint = params.endpoint.trim().replace(/\/$/, "");
  const payload = {
    query: params.query,
    candidates: params.candidates.map((entry) => ({
      title: clampRerankText(entry.title, params.maxLength),
      url: entry.url,
      snippet: clampRerankText(entry.snippet, params.maxLength),
    })),
    maxLength: params.maxLength,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    const detail = await readResponseText(res);
    throw new Error(`SearxNG rerank error (${res.status}): ${detail || res.statusText}`);
  }

  const data = (await res.json()) as { scores?: number[] };
  if (!Array.isArray(data.scores)) {
    throw new Error("SearxNG rerank response missing scores.");
  }
  if (data.scores.length !== params.candidates.length) {
    throw new Error("SearxNG rerank response length mismatch.");
  }
  if (data.scores.some((score) => !Number.isFinite(score))) {
    throw new Error("SearxNG rerank response contains invalid scores.");
  }

  return data.scores;
}

async function runPerplexitySearch(params: {
  query: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
  freshness?: string;
}): Promise<{ content: string; citations: string[] }> {
  const baseUrl = params.baseUrl.trim().replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const model = resolvePerplexityRequestModel(baseUrl, params.model);

  const body: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "user",
        content: params.query,
      },
    ],
  };

  const recencyFilter = freshnessToPerplexityRecency(params.freshness);
  if (recencyFilter) {
    body.search_recency_filter = recencyFilter;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
      "HTTP-Referer": "https://openclaw.ai",
      "X-Title": "OpenClaw Web Search",
    },
    body: JSON.stringify(body),
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    const detail = await readResponseText(res);
    throw new Error(`Perplexity API error (${res.status}): ${detail || res.statusText}`);
  }

  const data = (await res.json()) as PerplexitySearchResponse;
  const content = data.choices?.[0]?.message?.content ?? "No response";
  const citations = data.citations ?? [];

  return { content, citations };
}

async function runGrokSearch(params: {
  query: string;
  apiKey: string;
  model: string;
  timeoutSeconds: number;
  inlineCitations: boolean;
}): Promise<{
  content: string;
  citations: string[];
  inlineCitations?: GrokSearchResponse["inline_citations"];
}> {
  const body: Record<string, unknown> = {
    model: params.model,
    input: [
      {
        role: "user",
        content: params.query,
      },
    ],
    tools: [{ type: "web_search" }],
  };

  // Note: xAI's /v1/responses endpoint does not support the `include`
  // parameter (returns 400 "Argument not supported: include"). Inline
  // citations are returned automatically when available — we just parse
  // them from the response without requesting them explicitly (#12910).

  const res = await fetch(XAI_API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    const detail = await readResponseText(res);
    throw new Error(`xAI API error (${res.status}): ${detail || res.statusText}`);
  }

  const data = (await res.json()) as GrokSearchResponse;
  const { text: extractedText, annotationCitations } = extractGrokContent(data);
  const content = extractedText ?? "No response";
  // Prefer top-level citations; fall back to annotation-derived ones
  const citations = (data.citations ?? []).length > 0 ? data.citations! : annotationCitations;
  const inlineCitations = data.inline_citations;

  return { content, citations, inlineCitations };
}

async function runSearxngSearch(params: {
  query: string;
  count: number;
  baseUrl: string;
  apiKey?: string;
  timeoutSeconds: number;
  searchLang?: string;
  siteWeights?: Record<string, number>;
  rerank?: SearxngRerankConfig;
}): Promise<{
  results: Array<{
    title: string;
    url: string;
    description: string;
    published?: string;
    siteName?: string;
  }>;
}> {
  const baseUrl = params.baseUrl.trim().replace(/\/$/, "");
  const url = new URL(`${baseUrl}/search`);
  url.searchParams.set("q", params.query);
  url.searchParams.set("format", "json");
  if (params.searchLang) {
    url.searchParams.set("language", params.searchLang);
  }
  if (params.apiKey) {
    url.searchParams.set("apikey", params.apiKey);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    const detail = await readResponseText(res);
    throw new Error(`SearxNG API error (${res.status}): ${detail || res.statusText}`);
  }

  const data = (await res.json()) as SearxngSearchResponse;
  const results = Array.isArray(data.results) ? data.results : [];
  const normalized = results.map((entry) => {
    const title = entry.title ?? "";
    const resultUrl = entry.url ?? "";
    const description = entry.content ?? "";
    const rawSiteName = resolveSiteName(resultUrl);
    return {
      title,
      url: resultUrl,
      description,
      published: entry.publishedDate || entry.published || undefined,
      siteName: rawSiteName || undefined,
    } satisfies SearxngNormalizedResult;
  });

  const rerankMode = resolveSearxngRerankMode(params.rerank);
  const rerankEndpoint = resolveSearxngRerankEndpoint(params.rerank);
  const rerankTimeoutSeconds = resolveTimeoutSeconds(
    params.rerank?.timeoutSeconds,
    DEFAULT_SEARXNG_RERANK_TIMEOUT_SECONDS,
  );
  const rerankMaxCandidates = resolveSearxngRerankMaxCandidates(params.rerank);
  const rerankMaxLength = resolveSearxngRerankMaxLength(params.rerank);

  const dedupeCount = Math.max(params.count, rerankMaxCandidates);
  const deduped = dedupeSearxngResults({
    results: normalized,
    count: dedupeCount,
    siteWeights: params.siteWeights,
  });

  let ranked = deduped;
  if (rerankMode !== "off") {
    if (!rerankEndpoint) {
      if (rerankMode === "on") {
        throw new Error("SearxNG rerank endpoint is required when mode=on.");
      }
    } else {
      const candidates = deduped.slice(0, rerankMaxCandidates).map((entry) => ({
        title: entry.title,
        url: entry.url,
        snippet: entry.description,
      }));
      if (candidates.length > 0) {
        try {
          const scores = await runSearxngRerank({
            query: params.query,
            candidates,
            endpoint: rerankEndpoint,
            timeoutSeconds: rerankTimeoutSeconds,
            maxLength: rerankMaxLength,
          });
          const scored = candidates.map((_, index) => ({
            entry: deduped[index],
            score: scores[index],
            index,
          }));
          ranked = scored
            .toSorted((a, b) => {
              if (b.score !== a.score) {
                return b.score - a.score;
              }
              return a.index - b.index;
            })
            .map((entry) => entry.entry);
        } catch (error) {
          if (rerankMode === "on") {
            throw error;
          }
        }
      }
    }
  }

  const mapped = ranked.slice(0, params.count).map((entry) => ({
    title: entry.title ? wrapWebContent(entry.title, "web_search") : "",
    url: entry.url,
    description: entry.description ? wrapWebContent(entry.description, "web_search") : "",
    published: entry.published,
    siteName: entry.siteName,
  }));

  return { results: mapped };
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

  if (params.provider !== "brave") {
    throw new Error("Unsupported web search provider.");
  }

  const url = new URL(BRAVE_SEARCH_ENDPOINT);
  url.searchParams.set("q", params.query);
  url.searchParams.set("count", String(params.count));
  if (params.country) {
    url.searchParams.set("country", params.country);
  }
  if (params.search_lang) {
    url.searchParams.set("search_lang", params.search_lang);
  }
  if (params.ui_lang) {
    url.searchParams.set("ui_lang", params.ui_lang);
  }
  if (params.freshness) {
    url.searchParams.set("freshness", params.freshness);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": params.apiKey ?? "",
    },
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    const detail = await readResponseText(res);
    throw new Error(`Brave Search API error (${res.status}): ${detail || res.statusText}`);
  }

  const data = (await res.json()) as BraveSearchResponse;
  const results = Array.isArray(data.web?.results) ? (data.web?.results ?? []) : [];
  const mapped = results.map((entry) => {
    const description = entry.description ?? "";
    const title = entry.title ?? "";
    const resultUrl = entry.url ?? "";
    const rawSiteName = resolveSiteName(resultUrl);
    return {
      title: title ? wrapWebContent(title, "web_search") : "",
      url: resultUrl, // Keep raw for tool chaining
      description: description ? wrapWebContent(description, "web_search") : "",
      published: entry.age || undefined,
      siteName: rawSiteName || undefined,
    };
  });

  const payload = {
    query: params.query,
    provider: params.provider,
    count: mapped.length,
    tookMs: Date.now() - start,
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: params.provider,
      wrapped: true,
    },
    results: mapped,
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

  const description =
    provider === "perplexity"
      ? "Search the web using Perplexity Sonar (direct or via OpenRouter). Returns AI-synthesized answers with citations from real-time web search."
      : provider === "grok"
        ? "Search the web using xAI Grok. Returns AI-synthesized answers with citations from real-time web search."
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
              : resolveSearchApiKey(search);

      if (provider !== "searxng" && !apiKey) {
        return jsonResult(missingSearchKeyPayload(provider as ApiKeyRequiredProvider));
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
        searxngApiKey: apiKey,
        searxngSiteWeights: searxngConfig?.siteWeights,
        searxngRerank: searxngRerankConfig,
      });
      return jsonResult(result);
    },
  };
}

export const __testing = {
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
  resolveSearchProvider,
} as const;
