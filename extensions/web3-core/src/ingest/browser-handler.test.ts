import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { Web3StateStore } from "../state/store.js";
import { createBrowserIngestHandler } from "./browser-handler.js";

vi.mock("../audit/hooks.js", () => ({
  recordExternalAuditEvent: vi.fn(),
}));

describe("browser ingest handler", () => {
  it("handles CORS preflight", async () => {
    const config = resolveConfig({ browserIngest: { enabled: true } });
    const store = new Web3StateStore("/tmp");
    const handler = createBrowserIngestHandler(store, config);

    const req = createRequest({ method: "OPTIONS" });
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(204);
  });

  it("rejects unauthorized requests", async () => {
    const config = resolveConfig({
      browserIngest: { enabled: true, token: "secret", allowLoopback: false },
    });
    const store = new Web3StateStore("/tmp");
    const handler = createBrowserIngestHandler(store, config);

    const req = createRequest({ method: "POST" });
    const res = createResponse();

    const promise = handler(req, res);
    req.end(JSON.stringify({ method: "eth_requestAccounts", origin: "https://dapp.test" }));
    await promise;

    expect(res.statusCode).toBe(401);
  });

  it("records a dapp request when authorized", async () => {
    const config = resolveConfig({
      browserIngest: { enabled: true, token: "secret", allowLoopback: false },
    });
    const store = new Web3StateStore("/tmp");
    const handler = createBrowserIngestHandler(store, config);

    const req = createRequest({
      method: "POST",
      headers: { "x-openclaw-token": "secret" },
    });
    const res = createResponse();

    const { recordExternalAuditEvent } = await import("../audit/hooks.js");

    const promise = handler(req, res);
    req.end(JSON.stringify({ method: "eth_requestAccounts", origin: "https://dapp.test" }));
    await promise;

    expect(res.statusCode).toBe(200);
    expect(recordExternalAuditEvent).toHaveBeenCalledOnce();
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
  remoteAddress = "127.0.0.1",
}: {
  method: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
}) {
  const req = new PassThrough() as any;
  req.method = method;
  req.headers = headers;
  req.socket = { remoteAddress };
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
