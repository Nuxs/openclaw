import { withTimeout } from "../web-shared.js";
import { throwWebSearchApiError } from "./shared.js";

export const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.ai/v1";
export const DEFAULT_KIMI_MODEL = "moonshot-v1-128k";

export const KIMI_WEB_SEARCH_TOOL = {
  type: "builtin_function",
  function: { name: "$web_search" },
} as const;

type KimiToolCall = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type KimiMessage = {
  role?: string;
  content?: string;
  reasoning_content?: string;
  tool_calls?: KimiToolCall[];
};

type KimiSearchResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: KimiMessage;
  }>;
  search_results?: Array<{
    title?: string;
    url?: string;
    content?: string;
  }>;
};

function extractKimiMessageText(message: KimiMessage | undefined): string | undefined {
  const content = message?.content?.trim();
  if (content) {
    return content;
  }
  const reasoning = message?.reasoning_content?.trim();
  return reasoning || undefined;
}

export function extractKimiCitations(data: KimiSearchResponse): string[] {
  const citations = (data.search_results ?? [])
    .map((entry) => entry.url?.trim())
    .filter((url): url is string => Boolean(url));

  for (const toolCall of data.choices?.[0]?.message?.tool_calls ?? []) {
    const rawArguments = toolCall.function?.arguments;
    if (!rawArguments) {
      continue;
    }
    try {
      const parsed = JSON.parse(rawArguments) as {
        search_results?: Array<{ url?: string }>;
        url?: string;
      };
      if (typeof parsed.url === "string" && parsed.url.trim()) {
        citations.push(parsed.url.trim());
      }
      for (const result of parsed.search_results ?? []) {
        if (typeof result.url === "string" && result.url.trim()) {
          citations.push(result.url.trim());
        }
      }
    } catch {
      // ignore malformed tool arguments
    }
  }

  return [...new Set(citations)];
}

function buildKimiToolResultContent(data: KimiSearchResponse): string {
  return JSON.stringify({
    search_results: (data.search_results ?? []).map((entry) => ({
      title: entry.title ?? "",
      url: entry.url ?? "",
      content: entry.content ?? "",
    })),
  });
}

export async function runKimiSearch(params: {
  query: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
}): Promise<{ content: string; citations: string[] }> {
  const baseUrl = params.baseUrl.trim().replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const messages: Array<Record<string, unknown>> = [
    {
      role: "user",
      content: params.query,
    },
  ];
  const collectedCitations = new Set<string>();
  const MAX_ROUNDS = 3;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages,
        tools: [KIMI_WEB_SEARCH_TOOL],
      }),
      signal: withTimeout(undefined, params.timeoutSeconds * 1000),
    });

    if (!res.ok) {
      return throwWebSearchApiError(res, "Kimi");
    }

    const data = (await res.json()) as KimiSearchResponse;
    for (const citation of extractKimiCitations(data)) {
      collectedCitations.add(citation);
    }
    const choice = data.choices?.[0];
    const message = choice?.message;
    const text = extractKimiMessageText(message);
    const toolCalls = message?.tool_calls ?? [];

    if (choice?.finish_reason !== "tool_calls" || toolCalls.length === 0) {
      return { content: text ?? "No response", citations: [...collectedCitations] };
    }

    messages.push({
      role: "assistant",
      content: message?.content ?? "",
      ...(message?.reasoning_content
        ? {
            reasoning_content: message.reasoning_content,
          }
        : {}),
      tool_calls: toolCalls,
    });

    const toolContent = buildKimiToolResultContent(data);
    let pushedToolResult = false;
    for (const toolCall of toolCalls) {
      const toolCallId = toolCall.id?.trim();
      if (!toolCallId) {
        continue;
      }
      pushedToolResult = true;
      messages.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: toolContent,
      });
    }

    if (!pushedToolResult) {
      return { content: text ?? "No response", citations: [...collectedCitations] };
    }
  }

  return {
    content: "Search completed but no final answer was produced.",
    citations: [...collectedCitations],
  };
}
