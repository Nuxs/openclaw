import { PassThrough } from "node:stream";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveConfig } from "../config.js";
import { createResourceStorageListHandler, createResourceStoragePutHandler } from "./http.js";

const validateLeaseAccessMock = vi.fn();

vi.mock("./leases.js", () => ({
  validateLeaseAccess: (...args: unknown[]) => validateLeaseAccessMock(...args),
}));

vi.mock("../../../src/gateway/call.js", () => ({
  callGateway: vi.fn().mockResolvedValue({ ok: true, result: {} }),
}));

describe("web3 resource storage handlers", () => {
  beforeEach(() => {
    validateLeaseAccessMock.mockReset();
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
