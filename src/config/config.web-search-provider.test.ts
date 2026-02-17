import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./config.js";

describe("web search provider config", () => {
  it("accepts perplexity provider and config", () => {
    const res = validateConfigObject({
      tools: {
        web: {
          search: {
            enabled: true,
            provider: "perplexity",
            perplexity: {
              apiKey: "test-key",
              baseUrl: "https://api.perplexity.ai",
              model: "perplexity/sonar-pro",
            },
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("accepts searxng provider and config", () => {
    const res = validateConfigObject({
      tools: {
        web: {
          search: {
            enabled: true,
            provider: "searxng",
            searxng: {
              baseUrl: "https://search.example.com",
              apiKey: "test-key",
              rerank: {
                mode: "auto",
                endpoint: "http://127.0.0.1:8899/rerank",
                timeoutSeconds: 1,
                maxCandidates: 20,
                maxLength: 256,
              },
            },
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });
});
