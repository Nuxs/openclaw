import { wrapWebContent } from "../../../../security/external-content.js";
import { resolveTimeoutSeconds, withTimeout } from "../../web-shared.js";
import { resolveSiteName, throwWebSearchApiError } from "../shared.js";
import type { SearxngRerankConfig, WebSearchResultItem } from "../types.js";
import { runSearxngRerank } from "./searxng-rerank.js";

const DEFAULT_SEARXNG_RERANK_MODE = "auto" as const;
const DEFAULT_SEARXNG_RERANK_TIMEOUT_SECONDS = 1;
const DEFAULT_SEARXNG_RERANK_MAX_CANDIDATES = 20;
const DEFAULT_SEARXNG_RERANK_MAX_LENGTH = 256;

type SearxngSearchResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    publishedDate?: string;
    published?: string;
  }>;
};

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

export function serializeSiteWeights(weights?: Record<string, number>): string {
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

function resolveSearxngRerankMode(rerank?: SearxngRerankConfig): "off" | "auto" | "on" {
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

export function serializeSearxngRerankConfig(rerank?: SearxngRerankConfig): string {
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

export async function runSearxngSearch(params: {
  query: string;
  count: number;
  baseUrl: string;
  apiKey?: string;
  timeoutSeconds: number;
  searchLang?: string;
  siteWeights?: Record<string, number>;
  rerank?: SearxngRerankConfig;
}): Promise<{ results: WebSearchResultItem[] }> {
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
    await throwWebSearchApiError(res, "SearxNG");
  }

  const data = (await res.json()) as SearxngSearchResponse;
  const results = Array.isArray(data.results) ? data.results : [];
  const normalized = results.map((entry) => {
    const title = entry.title ?? "";
    const url = entry.url ?? "";
    const description = entry.content ?? "";
    const rawSiteName = resolveSiteName(url);
    return {
      title,
      url,
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
