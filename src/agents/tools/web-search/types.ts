export const WEB_SEARCH_PROVIDER_IDS = [
  "brave",
  "perplexity",
  "grok",
  "gemini",
  "kimi",
  "searxng",
] as const;

export type WebSearchProviderId = (typeof WEB_SEARCH_PROVIDER_IDS)[number];

export type ApiKeyRequiredWebSearchProvider = Exclude<WebSearchProviderId, "searxng">;

export type WebSearchExternalContent = {
  untrusted: true;
  source: "web_search";
  provider: WebSearchProviderId;
  wrapped: true;
};

export type WebSearchResultItem = {
  title: string;
  url: string;
  description: string;
  published?: string;
  siteName?: string;
};

export type WebSearchCitations =
  | string[]
  | Array<{
      url: string;
      title?: string;
    }>;

export type WebSearchListPayload = {
  query: string;
  provider: "brave" | "searxng";
  count: number;
  tookMs: number;
  externalContent: WebSearchExternalContent;
  results: WebSearchResultItem[];
  cached?: true;
};

export type WebSearchContentPayload = {
  query: string;
  provider: "perplexity" | "grok" | "gemini" | "kimi";
  model: string;
  tookMs: number;
  externalContent: WebSearchExternalContent;
  content: string;
  citations: WebSearchCitations;
  inlineCitations?: Array<{ start_index: number; end_index: number; url: string }>;
  cached?: true;
};

export type WebSearchPayload =
  | WebSearchListPayload
  | WebSearchContentPayload
  | Record<string, unknown>;

export type SearxngRerankMode = "off" | "auto" | "on";

export type SearxngRerankConfig = {
  mode?: SearxngRerankMode;
  endpoint?: string;
  timeoutSeconds?: number;
  maxCandidates?: number;
  maxLength?: number;
};

export type SearxngConfig = {
  baseUrl?: string;
  apiKey?: string;
  siteWeights?: Record<string, number>;
  rerank?: SearxngRerankConfig;
};
