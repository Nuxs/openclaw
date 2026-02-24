import { readResponseText, withTimeout } from "../../web-shared.js";

function clampRerankText(value: string, maxLength?: number): string {
  if (!value) {
    return "";
  }
  if (!maxLength || maxLength <= 0) {
    return value;
  }
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export async function runSearxngRerank(params: {
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
    const detailResult = await readResponseText(res, { maxBytes: 64_000 });
    const errorMsg = detailResult.text || res.statusText;
    throw new Error(`SearxNG rerank error (${res.status}): ${errorMsg}`);
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
