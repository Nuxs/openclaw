import { PassThrough } from "node:stream";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveConfig } from "../config.js";
import {
  createResourceModelChatHandler,
  createResourceSearchQueryHandler,
  createResourceStorageGetHandler,
  createResourceStorageListHandler,
  createResourceStoragePutHandler,
} from "./http.js";

const validateLeaseAccessMock = vi.fn();

vi.mock("./leases.js", () => ({
  validateLeaseAccess: (...args: unknown[]) => validateLeaseAccessMock(...args),
}));

const callGatewayMock = vi.fn().mockResolvedValue({ ok: true, result: {} });

vi.mock("../../../src/gateway/call.js", () => ({
  callGateway: (...args: unknown[]) => callGatewayMock(...args),
}));

// Also mock the .ts variant used by loadCallGateway dynamic import
vi.mock("../../../../src/gateway/call.ts", () => ({
  callGateway: (...args: unknown[]) => callGatewayMock(...args),
}));

describe("web3 resource storage handlers", () => {
  beforeEach(() => {
    validateLeaseAccessMock.mockReset();
    callGatewayMock.mockReset().mockResolvedValue({ ok: true, result: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects storage put with path traversal", async () => {
    const tempDir = "/tmp/openclaw-web3-storage";
    const config = resolveConfig({
      resources: {
        enabled: true,
        advertiseToMarket: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: {
            models: [],
            search: [],
            storage: [
              {
                id: "res_storage_local",
                label: "Local Storage",
                backend: "filesystem",
                backendConfig: { rootDir: tempDir },
                price: { unit: "put", amount: 1, currency: "USDC" },
                policy: { maxBytes: 1024 },
              },
            ],
          },
        },
        consumer: { enabled: false, preferLocalFirst: true },
      },
    });

    validateLeaseAccessMock.mockResolvedValue({
      ok: true,
      lease: {
        leaseId: "lease-1",
        resourceId: "res_storage_local",
        providerActorId: "0xprovider",
        consumerActorId: "0xconsumer",
        status: "lease_active",
        expiresAt: new Date(Date.now() + 10_000).toISOString(),
      },
    });

    const handler = createResourceStoragePutHandler(config);
    const req = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-1",
      },
    });
    const res = createResponse();

    const promise = handler(req, res);
    req.end(JSON.stringify({ path: "../secret.txt", bytesBase64: "aGVsbG8=" }));
    await promise;

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("invalid path");
  });

  it("rejects storage list with invalid prefix", async () => {
    const tempDir = "/tmp/openclaw-web3-storage";
    const config = resolveConfig({
      resources: {
        enabled: true,
        advertiseToMarket: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: {
            models: [],
            search: [],
            storage: [
              {
                id: "res_storage_local",
                label: "Local Storage",
                backend: "filesystem",
                backendConfig: { rootDir: tempDir },
                price: { unit: "get", amount: 1, currency: "USDC" },
                policy: { maxBytes: 1024 },
              },
            ],
          },
        },
        consumer: { enabled: false, preferLocalFirst: true },
      },
    });

    validateLeaseAccessMock.mockResolvedValue({
      ok: true,
      lease: {
        leaseId: "lease-1",
        resourceId: "res_storage_local",
        providerActorId: "0xprovider",
        consumerActorId: "0xconsumer",
        status: "lease_active",
        expiresAt: new Date(Date.now() + 10_000).toISOString(),
      },
    });

    const handler = createResourceStorageListHandler(config);
    const req = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-1",
      },
    });
    const res = createResponse();

    const promise = handler(req, res);
    req.end(JSON.stringify({ prefix: "../" }));
    await promise;

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("invalid path");
  });

  // --- Auth failure: missing authorization ---
  it("rejects storage put with missing auth", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: { models: [], search: [], storage: [] },
        },
        consumer: { enabled: false },
      },
    });

    const handler = createResourceStoragePutHandler(config);
    const req = createRequest({ method: "POST", headers: {} });
    const res = createResponse();

    const promise = handler(req, res);
    req.end("{}");
    await promise;

    expect(res.statusCode).toBe(401);
    expect(res.body).toContain("authorization");
  });

  // --- Auth failure: lease validation fails ---
  it("rejects storage put when lease validation fails", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: { models: [], search: [], storage: [] },
        },
        consumer: { enabled: false },
      },
    });

    validateLeaseAccessMock.mockResolvedValue({
      ok: false,
      error: "invalid lease token",
    });

    const handler = createResourceStoragePutHandler(config);
    const req = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_bad",
        "x-openclaw-lease": "lease-bad",
      },
    });
    const res = createResponse();

    const promise = handler(req, res);
    req.end(JSON.stringify({ path: "test.txt", bytesBase64: "aGVsbG8=" }));
    await promise;

    expect(res.statusCode).toBe(403);
    expect(res.body).toContain("invalid lease token");
  });

  // --- Method not allowed ---
  it("rejects storage put with GET method", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: { models: [], search: [], storage: [] },
        },
        consumer: { enabled: false },
      },
    });

    const handler = createResourceStoragePutHandler(config);
    const req = createRequest({ method: "GET", headers: {} });
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
  });

  it("rejects storage get with POST method", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: { models: [], search: [], storage: [] },
        },
        consumer: { enabled: false },
      },
    });

    const handler = createResourceStorageGetHandler(config);
    const req = createRequest({ method: "POST", headers: {} });
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
  });

  it("rejects model chat with GET method", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: { models: [], search: [], storage: [] },
        },
        consumer: { enabled: false },
      },
    });

    const handler = createResourceModelChatHandler(config);
    const req = createRequest({ method: "GET", headers: {} });
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
  });

  it("rejects search query with GET method", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: { models: [], search: [], storage: [] },
        },
        consumer: { enabled: false },
      },
    });

    const handler = createResourceSearchQueryHandler(config);
    const req = createRequest({ method: "GET", headers: {} });
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
  });

  // --- Resources provider disabled ---
  it("returns 404 when resources provider disabled for model chat", async () => {
    const config = resolveConfig({
      resources: {
        enabled: false,
        provider: {
          listen: { enabled: false },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: { models: [], search: [], storage: [] },
        },
        consumer: { enabled: false },
      },
    });

    const handler = createResourceModelChatHandler(config);
    const req = createRequest({
      method: "POST",
      headers: { authorization: "Bearer tok_test", "x-openclaw-lease": "lease-1" },
    });
    const res = createResponse();

    const promise = handler(req, res);
    req.end("{}");
    await promise;

    expect(res.statusCode).toBe(404);
  });

  // --- Auth missing for model and search ---
  it("rejects model chat with missing auth", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: { models: [], search: [], storage: [] },
        },
        consumer: { enabled: false },
      },
    });

    const handler = createResourceModelChatHandler(config);
    const req = createRequest({ method: "POST", headers: {} });
    const res = createResponse();

    const promise = handler(req, res);
    req.end("{}");
    await promise;

    expect(res.statusCode).toBe(401);
    expect(res.body).toContain("authorization");
  });

  it("returns safe error when model backend fails", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        advertiseToMarket: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: {
            models: [
              {
                id: "res_model_fail",
                label: "Model",
                backend: "openai-compat",
                backendConfig: { baseUrl: "https://api.example.com/v1" },
                price: { unit: "token", amount: 1, currency: "USDC" },
              },
            ],
            search: [],
            storage: [],
          },
        },
        consumer: { enabled: false },
      },
    });

    validateLeaseAccessMock.mockResolvedValue({
      ok: true,
      lease: {
        leaseId: "lease-model-1",
        resourceId: "res_model_fail",
        providerActorId: "0xprovider",
        consumerActorId: "0xconsumer",
        status: "lease_active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    const mockFetchResponse = new Response(JSON.stringify({ error: "boom" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse));

    const handler = createResourceModelChatHandler(config);
    const req = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-model-1",
        "content-type": "application/json",
      },
    });
    const res = createResponse();

    const promise = handler(req, res);
    req.end(JSON.stringify({ messages: [{ role: "user", content: "hi" }] }));
    await promise;

    expect(res.statusCode).toBe(502);
    expect(res.body).toContain("model backend error");
  });

  it("echoes request id header on model chat responses", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        advertiseToMarket: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: {
            models: [
              {
                id: "res_model_echo",
                label: "Model",
                backend: "openai-compat",
                backendConfig: { baseUrl: "https://api.example.com/v1" },
                price: { unit: "token", amount: 1, currency: "USDC" },
              },
            ],
            search: [],
            storage: [],
          },
        },
        consumer: { enabled: false },
      },
    });

    validateLeaseAccessMock.mockResolvedValue({
      ok: true,
      lease: {
        leaseId: "lease-echo",
        resourceId: "res_model_echo",
        providerActorId: "0xprovider",
        consumerActorId: "0xconsumer",
        status: "lease_active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
    });
    const mockFetchResponse = new Response(stream, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse));

    const handler = createResourceModelChatHandler(config);
    const req = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-echo",
        "x-openclaw-request-id": "req-123",
        "content-type": "application/json",
      },
    });
    const res = new PassThrough() as any;
    res.statusCode = 200;
    res.headers = new Map();
    res.setHeader = (key: string, value: string) => res.headers.set(key, value);

    const promise = handler(req, res);
    req.end(JSON.stringify({ messages: [] }));
    await promise;

    expect(res.headers.get("X-OpenClaw-Request-Id")).toBe("req-123");
  });

  it("rejects model chat when max_tokens exceeds policy", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        advertiseToMarket: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: {
            models: [
              {
                id: "res_model_limit",
                label: "Model",
                backend: "openai-compat",
                backendConfig: { baseUrl: "https://api.example.com/v1" },
                price: { unit: "token", amount: 1, currency: "USDC" },
                policy: { maxConcurrent: 2, maxTokens: 5, allowTools: true },
              },
            ],
            search: [],
            storage: [],
          },
        },
        consumer: { enabled: false },
      },
    });

    validateLeaseAccessMock.mockResolvedValue({
      ok: true,
      lease: {
        leaseId: "lease-limit",
        resourceId: "res_model_limit",
        providerActorId: "0xprovider",
        consumerActorId: "0xconsumer",
        status: "lease_active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const handler = createResourceModelChatHandler(config);
    const req = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-limit",
        "content-type": "application/json",
      },
    });
    const res = createResponse();

    const promise = handler(req, res);
    req.end(JSON.stringify({ max_tokens: 10, messages: [] }));
    await promise;

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("max_tokens");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects model chat when tools are not allowed", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        advertiseToMarket: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: {
            models: [
              {
                id: "res_model_no_tools",
                label: "Model",
                backend: "openai-compat",
                backendConfig: { baseUrl: "https://api.example.com/v1" },
                price: { unit: "token", amount: 1, currency: "USDC" },
                policy: { maxConcurrent: 1, maxTokens: 100, allowTools: false },
              },
            ],
            search: [],
            storage: [],
          },
        },
        consumer: { enabled: false },
      },
    });

    validateLeaseAccessMock.mockResolvedValue({
      ok: true,
      lease: {
        leaseId: "lease-no-tools",
        resourceId: "res_model_no_tools",
        providerActorId: "0xprovider",
        consumerActorId: "0xconsumer",
        status: "lease_active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const handler = createResourceModelChatHandler(config);
    const req = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-no-tools",
        "content-type": "application/json",
      },
    });
    const res = createResponse();

    const promise = handler(req, res);
    req.end(
      JSON.stringify({
        messages: [],
        tools: [
          {
            type: "function",
            function: { name: "noop", description: "noop", parameters: {} },
          },
        ],
      }),
    );
    await promise;

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("tools not allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects model chat when maxConcurrent exceeded", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        advertiseToMarket: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: {
            models: [
              {
                id: "res_model_concurrent",
                label: "Model",
                backend: "openai-compat",
                backendConfig: { baseUrl: "https://api.example.com/v1" },
                price: { unit: "token", amount: 1, currency: "USDC" },
                policy: { maxConcurrent: 1, maxTokens: 100, allowTools: true },
              },
            ],
            search: [],
            storage: [],
          },
        },
        consumer: { enabled: false },
      },
    });

    validateLeaseAccessMock.mockResolvedValue({
      ok: true,
      lease: {
        leaseId: "lease-concurrent",
        resourceId: "res_model_concurrent",
        providerActorId: "0xprovider",
        consumerActorId: "0xconsumer",
        status: "lease_active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    let resolveFirst: (response: Response) => void;
    const firstFetch = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let notifyFetch: () => void = () => undefined;
    const fetchCalled = new Promise<void>((resolve) => {
      notifyFetch = resolve;
    });
    const fetchMock = vi.fn().mockImplementationOnce(() => {
      notifyFetch();
      return firstFetch;
    });
    vi.stubGlobal("fetch", fetchMock);

    const handler = createResourceModelChatHandler(config);
    const req1 = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-concurrent",
        "content-type": "application/json",
      },
    });
    const res1 = new PassThrough() as any;
    res1.statusCode = 200;
    res1.headers = new Map();
    res1.setHeader = (key: string, value: string) => res1.headers.set(key, value);

    const req2 = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-concurrent",
        "content-type": "application/json",
      },
    });
    const res2 = createResponse();

    const promise1 = handler(req1, res1);
    req1.end(JSON.stringify({ messages: [] }));
    await fetchCalled;

    const promise2 = handler(req2, res2);
    req2.end(JSON.stringify({ messages: [] }));
    await promise2;

    expect(res2.statusCode).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
    });
    resolveFirst!(
      new Response(stream, { status: 200, headers: { "content-type": "application/json" } }),
    );
    await promise1;
  });

  it("rejects search query with missing lease header", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: { models: [], search: [], storage: [] },
        },
        consumer: { enabled: false },
      },
    });

    const handler = createResourceSearchQueryHandler(config);
    const req = createRequest({
      method: "POST",
      headers: { authorization: "Bearer tok_test" },
    });
    const res = createResponse();

    const promise = handler(req, res);
    req.end(JSON.stringify({ q: "test" }));
    await promise;

    expect(res.statusCode).toBe(401);
  });

  it("rejects search query when query too long", async () => {
    const config = resolveConfig({
      resources: {
        enabled: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: {
            models: [],
            search: [
              {
                id: "res_search_1",
                label: "Search",
                backend: "custom",
                backendConfig: { baseUrl: "https://search.example.com" },
                price: { unit: "query", amount: 1, currency: "USDC" },
                policy: { maxQueryChars: 1000 },
              },
            ],
            storage: [],
          },
        },
        consumer: { enabled: false },
      },
    });

    validateLeaseAccessMock.mockResolvedValue({
      ok: true,
      lease: {
        leaseId: "lease-search",
        resourceId: "res_search_1",
        providerActorId: "0xprovider",
        consumerActorId: "0xconsumer",
        status: "lease_active",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const handler = createResourceSearchQueryHandler(config);
    const req = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-search",
      },
    });
    const res = createResponse();

    const promise = handler(req, res);
    req.end(JSON.stringify({ q: "x".repeat(2000) }));
    await promise;

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

type MockResponse = {
  statusCode: number;
  headers: Map<string, string>;
  body: string;
  setHeader: (key: string, value: string) => void;
  end: (payload?: string) => void;
};

function createRequest({
  method,
  headers = {},
}: {
  method: string;
  headers?: Record<string, string>;
}) {
  const req = new PassThrough() as any;
  req.method = method;
  req.headers = headers;
  return req;
}

function createResponse() {
  const res: MockResponse = {
    statusCode: 200,
    headers: new Map(),
    body: "",
    setHeader(key, value) {
      res.headers.set(key, value);
    },
    end(payload?: string) {
      res.body = payload ?? "";
    },
  };
  return res as any;
}

describe("model chat ledger (appendModelLedger)", () => {
  const modelOffer = {
    id: "res_model_1",
    label: "GPT-4",
    backend: "openai-compat" as const,
    backendConfig: {
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
    },
    price: { unit: "token" as const, amount: 1, currency: "USDC" },
  };

  function makeModelConfig() {
    return resolveConfig({
      resources: {
        enabled: true,
        advertiseToMarket: true,
        provider: {
          listen: { enabled: true, bind: "loopback", port: 0 },
          auth: { mode: "token", tokenTtlMs: 600_000, allowedConsumers: [] },
          offers: {
            models: [modelOffer],
            search: [],
            storage: [],
          },
        },
        consumer: { enabled: false, preferLocalFirst: true },
      },
    });
  }

  const mockLease = {
    leaseId: "lease-model-1",
    resourceId: "res_model_1",
    providerActorId: "0xprovider",
    consumerActorId: "0xconsumer",
    status: "lease_active",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  function createWritableResponse() {
    const pass = new PassThrough();
    const chunks: Buffer[] = [];
    pass.on("data", (chunk: Buffer) => chunks.push(chunk));
    const res = pass as any;
    res.statusCode = 200;
    res.headers = new Map();
    res.setHeader = (key: string, value: string) => res.headers.set(key, value);
    res.getBody = () => Buffer.concat(chunks).toString();
    return res;
  }

  beforeEach(() => {
    validateLeaseAccessMock.mockReset();
    callGatewayMock.mockReset().mockResolvedValue({ ok: true, result: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls market.ledger.append with usage tokens from response header", async () => {
    const config = makeModelConfig();
    validateLeaseAccessMock.mockResolvedValue({ ok: true, lease: mockLease });

    // Mock fetch: return response with x-usage-tokens header and a readable body
    const body = JSON.stringify({ choices: [] });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    const mockFetchResponse = new Response(stream, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-usage-tokens": "150",
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse));

    const handler = createResourceModelChatHandler(config);
    const req = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-model-1",
        "content-type": "application/json",
      },
    });
    const res = createWritableResponse();

    const promise = handler(req, res);
    req.end(JSON.stringify({ messages: [{ role: "user", content: "hello" }] }));
    await promise;

    // Wait for fire-and-forget ledger append
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(res.statusCode).toBe(200);
    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "market.ledger.append",
        params: expect.objectContaining({
          actorId: "0xprovider",
          entry: expect.objectContaining({
            kind: "model",
            unit: "token",
            quantity: "150",
            cost: "150",
            leaseId: "lease-model-1",
            resourceId: "res_model_1",
            providerActorId: "0xprovider",
            consumerActorId: "0xconsumer",
          }),
        }),
      }),
    );
  });

  it("uses fallback quantity '1' when x-usage-tokens header missing", async () => {
    const config = makeModelConfig();
    validateLeaseAccessMock.mockResolvedValue({ ok: true, lease: mockLease });

    // Return response with no x-usage-tokens and null body → hits early return path
    const mockFetchResponse = {
      ok: true,
      status: 200,
      body: null,
      headers: new Headers({ "content-type": "application/json" }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse));

    const handler = createResourceModelChatHandler(config);
    const req = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-model-1",
        "content-type": "application/json",
      },
    });
    const res = createResponse();

    const promise = handler(req, res);
    req.end(JSON.stringify({ messages: [] }));
    await promise;

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(callGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "market.ledger.append",
        params: expect.objectContaining({
          entry: expect.objectContaining({
            kind: "model",
            quantity: "1",
            cost: "1",
          }),
        }),
      }),
    );
  });

  it("does not throw when ledger append fails (fire-and-forget)", async () => {
    const config = makeModelConfig();
    validateLeaseAccessMock.mockResolvedValue({ ok: true, lease: mockLease });
    callGatewayMock.mockRejectedValue(new Error("ledger unavailable"));

    const mockFetchResponse = {
      ok: true,
      status: 200,
      body: null,
      headers: new Headers({ "content-type": "application/json" }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse));

    const handler = createResourceModelChatHandler(config);
    const req = createRequest({
      method: "POST",
      headers: {
        authorization: "Bearer tok_test",
        "x-openclaw-lease": "lease-model-1",
        "content-type": "application/json",
      },
    });
    const res = createResponse();

    const promise = handler(req, res);
    req.end(JSON.stringify({ messages: [] }));
    await promise;

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Handler should still have returned 200 despite ledger failure
    expect(res.statusCode).toBe(200);
  });
});
