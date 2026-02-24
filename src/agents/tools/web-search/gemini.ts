import { fetchWithSsrFGuard } from "../../infra/net/fetch-guard.js";
import { readResponseText, withTimeout } from "../web-shared.js";

export type GeminiConfig = {
  apiKey?: string;
  model?: string;
};

export type GeminiGroundingResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: {
          uri?: string;
          title?: string;
        };
      }>;
      searchEntryPoint?: {
        renderedContent?: string;
      };
      webSearchQueries?: string[];
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const REDIRECT_TIMEOUT_MS = 5000;
const TRUSTED_NETWORK_SSRF_POLICY = { dangerouslyAllowPrivateNetwork: true } as const;

/**
 * Resolve a redirect URL to its final destination using an SSRF-guarded HEAD request.
 * Returns the original URL if resolution fails or times out.
 */
export async function resolveRedirectUrl(url: string): Promise<string> {
  try {
    const { finalUrl, release } = await fetchWithSsrFGuard({
      url,
      init: { method: "HEAD" },
      timeoutMs: REDIRECT_TIMEOUT_MS,
      policy: TRUSTED_NETWORK_SSRF_POLICY,
    });
    try {
      return finalUrl || url;
    } finally {
      await release();
    }
  } catch {
    return url;
  }
}

export async function runGeminiSearch(params: {
  query: string;
  apiKey: string;
  model: string;
  timeoutSeconds: number;
}): Promise<{ content: string; citations: Array<{ url: string; title?: string }> }> {
  const endpoint = `${GEMINI_API_BASE}/models/${params.model}:generateContent`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": params.apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: params.query }],
        },
      ],
      tools: [{ google_search: {} }],
    }),
    signal: withTimeout(undefined, params.timeoutSeconds * 1000),
  });

  if (!res.ok) {
    const detailResult = await readResponseText(res, { maxBytes: 64_000 });
    // Strip API key from any error detail to prevent accidental key leakage in logs
    const safeDetail = (detailResult.text || res.statusText).replace(/key=[^&\s]+/gi, "key=***");
    throw new Error(`Gemini API error (${res.status}): ${safeDetail}`);
  }

  let data: GeminiGroundingResponse;
  try {
    data = (await res.json()) as GeminiGroundingResponse;
  } catch (err) {
    const safeError = String(err).replace(/key=[^&\s]+/gi, "key=***");
    throw new Error(`Gemini API returned invalid JSON: ${safeError}`, { cause: err });
  }

  if (data.error) {
    const rawMsg = data.error.message || data.error.status || "unknown";
    const safeMsg = rawMsg.replace(/key=[^&\s]+/gi, "key=***");
    throw new Error(`Gemini API error (${data.error.code}): ${safeMsg}`);
  }

  const candidate = data.candidates?.[0];
  const content =
    candidate?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("\n") ?? "No response";

  const groundingChunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const rawCitations = groundingChunks
    .filter((chunk) => chunk.web?.uri)
    .map((chunk) => ({
      url: chunk.web!.uri!,
      title: chunk.web?.title || undefined,
    }));

  // Resolve Google grounding redirect URLs to direct URLs with concurrency cap.
  // Gemini typically returns 3-8 citations; cap at 10 concurrent to be safe.
  const MAX_CONCURRENT_REDIRECTS = 10;
  const citations: Array<{ url: string; title?: string }> = [];
  for (let i = 0; i < rawCitations.length; i += MAX_CONCURRENT_REDIRECTS) {
    const batch = rawCitations.slice(i, i + MAX_CONCURRENT_REDIRECTS);
    const resolved = await Promise.all(
      batch.map(async (citation) => {
        const resolvedUrl = await resolveRedirectUrl(citation.url);
        return { ...citation, url: resolvedUrl };
      }),
    );
    citations.push(...resolved);
  }

  return { content, citations };
}
