import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveConfig } from "../config.js";
import { clearConsumerLeaseAccess, saveConsumerLeaseAccess } from "./leases.js";
import {
  createWeb3SearchTool,
  createWeb3StorageGetTool,
  createWeb3StorageListTool,
  createWeb3StoragePutTool,
} from "./tools.js";

vi.mock("../../../../src/gateway/call.ts", () => ({
  callGateway: vi.fn().mockResolvedValue({ ok: true, result: {} }),
}));

function makeConfig(overrides: Record<string, unknown> = {}) {
  return resolveConfig({
    resources: {
      enabled: true,
      consumer: { enabled: true },
      ...overrides,
    },
  });
}

describe("web3 consumer tools", () => {
  beforeEach(() => {
    clearConsumerLeaseAccess("res-tool-1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("createWeb3SearchTool", () => {
    it("returns null when consumer disabled", () => {
      const config = resolveConfig({
        resources: { enabled: true, consumer: { enabled: false } },
      });
      expect(createWeb3SearchTool(config)).toBeNull();
    });

    it("returns null when resources disabled", () => {
      const config = resolveConfig({ resources: { enabled: false } });
      expect(createWeb3SearchTool(config)).toBeNull();
    });

    it("returns a tool when consumer enabled", () => {
      const config = makeConfig();
      const tool = createWeb3SearchTool(config);
      expect(tool).not.toBeNull();
      expect(tool?.name).toBe("web3.search.query");
    });

    it("returns error when no active lease exists", async () => {
      const config = makeConfig();
      const tool = createWeb3SearchTool(config)!;
      const result = (await tool.execute("tc-1", {
        resourceId: "res-tool-1",
        q: "test query",
      })) as { content: Array<{ text: string }> };
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("no active lease");
    });

    it("returns error when resourceId is empty", async () => {
      const config = makeConfig();
      const tool = createWeb3SearchTool(config)!;
      const result = (await tool.execute("tc-1", {
        resourceId: "",
        q: "test query",
      })) as { content: Array<{ text: string }> };
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("required");
    });

    it("returns error when endpoint not configured", async () => {
      saveConsumerLeaseAccess({
        leaseId: "lease-no-ep",
        resourceId: "res-tool-1",
        accessToken: "tok_test",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      const config = resolveConfig({
        brain: { endpoint: "" },
        resources: { enabled: true, consumer: { enabled: true } },
      });
      const tool = createWeb3SearchTool(config)!;
      const result = (await tool.execute("tc-1", {
        resourceId: "res-tool-1",
        q: "test",
      })) as { content: Array<{ text: string }> };
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("endpoint");
    });

    it("redacts provider errors and tokens", async () => {
      saveConsumerLeaseAccess({
        leaseId: "lease-redact",
        resourceId: "res-tool-1",
        accessToken: "tok_secret_123",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        providerEndpoint: "https://provider.example.com",
      });
      const config = makeConfig();
      const tool = createWeb3SearchTool(config)!;

      const mockFetchResponse = new Response(
        "Bearer tok_secret_123 https://provider.example.com /Users/test/secrets",
        {
          status: 502,
          headers: { "content-type": "text/plain" },
        },
      );
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse));

      const result = (await tool.execute("tc-1", {
        resourceId: "res-tool-1",
        q: "test",
      })) as { content: Array<{ text: string }> };
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain("tok_***");
      expect(parsed.message).toContain("[REDACTED_ENDPOINT]");
      expect(parsed.message).not.toContain("tok_secret_123");
      expect(parsed.message).not.toContain("provider.example.com");
      expect(parsed.message).not.toContain("/Users/test");
    });
  });

  describe("createWeb3StoragePutTool", () => {
    it("returns null when consumer disabled", () => {
      const config = resolveConfig({
        resources: { enabled: true, consumer: { enabled: false } },
      });
      expect(createWeb3StoragePutTool(config)).toBeNull();
    });

    it("returns a tool when consumer enabled", () => {
      const config = makeConfig();
      const tool = createWeb3StoragePutTool(config);
      expect(tool).not.toBeNull();
      expect(tool?.name).toBe("web3.storage.put");
    });

    it("returns error when required params missing", async () => {
      const config = makeConfig();
      const tool = createWeb3StoragePutTool(config)!;
      const result = (await tool.execute("tc-1", {
        resourceId: "",
        path: "",
        bytesBase64: "",
      })) as { content: Array<{ text: string }> };
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("required");
    });

    it("returns error when no active lease", async () => {
      const config = makeConfig();
      const tool = createWeb3StoragePutTool(config)!;
      const result = (await tool.execute("tc-1", {
        resourceId: "res-tool-1",
        path: "test.txt",
        bytesBase64: "aGVsbG8=",
      })) as { content: Array<{ text: string }> };
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("no active lease");
    });
  });

  describe("createWeb3StorageGetTool", () => {
    it("returns null when consumer disabled", () => {
      const config = resolveConfig({
        resources: { enabled: true, consumer: { enabled: false } },
      });
      expect(createWeb3StorageGetTool(config)).toBeNull();
    });

    it("returns a tool when consumer enabled", () => {
      const config = makeConfig();
      const tool = createWeb3StorageGetTool(config);
      expect(tool).not.toBeNull();
      expect(tool?.name).toBe("web3.storage.get");
    });

    it("returns error when path missing", async () => {
      const config = makeConfig();
      const tool = createWeb3StorageGetTool(config)!;
      const result = (await tool.execute("tc-1", {
        resourceId: "res-tool-1",
        path: "",
      })) as { content: Array<{ text: string }> };
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("required");
    });
  });

  describe("createWeb3StorageListTool", () => {
    it("returns null when consumer disabled", () => {
      const config = resolveConfig({
        resources: { enabled: true, consumer: { enabled: false } },
      });
      expect(createWeb3StorageListTool(config)).toBeNull();
    });

    it("returns a tool when consumer enabled", () => {
      const config = makeConfig();
      const tool = createWeb3StorageListTool(config);
      expect(tool).not.toBeNull();
      expect(tool?.name).toBe("web3.storage.list");
    });

    it("returns error when resourceId missing", async () => {
      const config = makeConfig();
      const tool = createWeb3StorageListTool(config)!;
      const result = (await tool.execute("tc-1", {
        resourceId: "",
      })) as { content: Array<{ text: string }> };
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("required");
    });

    it("returns error when no active lease", async () => {
      const config = makeConfig();
      const tool = createWeb3StorageListTool(config)!;
      const result = (await tool.execute("tc-1", {
        resourceId: "res-tool-1",
      })) as { content: Array<{ text: string }> };
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("no active lease");
    });
  });
});
