import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve, relative, join, sep, dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  fetchWithSsrFGuard,
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import { validateLeaseAccess } from "./leases.js";

type GatewayCallResult = {
  ok?: boolean;
  error?: string;
  result?: unknown;
};

type CallGatewayFn = (opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<unknown>;

type SearchOffer = Web3PluginConfig["resources"]["provider"]["offers"]["search"][number];

type StorageOffer = Web3PluginConfig["resources"]["provider"]["offers"]["storage"][number];

type ModelOffer = Web3PluginConfig["resources"]["provider"]["offers"]["models"][number];

type SearchQuery = {
  q: string;
  limit?: number;
  site?: string;
};

type StoragePutRequest = {
  path: string;
  bytesBase64: string;
  mime?: string;
};

type StorageListRequest = {
  prefix?: string;
  limit?: number;
};

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 20;
const MAX_SEARCH_QUERY_CHARS = 1024;
const DEFAULT_STORAGE_LIST_LIMIT = 50;
const MAX_STORAGE_LIST_LIMIT = 200;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

const CONCURRENCY_BY_LEASE = new Map<string, number>();

function reserveLeaseConcurrency(leaseId: string, limit?: number): (() => void) | null {
  if (!limit || limit <= 0) {
    return () => undefined;
  }
  const current = CONCURRENCY_BY_LEASE.get(leaseId) ?? 0;
  if (current >= limit) {
    return null;
  }
  CONCURRENCY_BY_LEASE.set(leaseId, current + 1);
  return () => {
    const next = (CONCURRENCY_BY_LEASE.get(leaseId) ?? 1) - 1;
    if (next <= 0) {
      CONCURRENCY_BY_LEASE.delete(leaseId);
      return;
    }
    CONCURRENCY_BY_LEASE.set(leaseId, next);
  };
}

function extractRequestId(req: IncomingMessage): string | null {
  const header = req.headers["x-openclaw-request-id"];
  if (typeof header === "string" && header.trim().length > 0) {
    return header.trim();
  }
  if (Array.isArray(header) && typeof header[0] === "string" && header[0].trim().length > 0) {
    return header[0].trim();
  }
  return null;
}

function applyRequestId(req: IncomingMessage, res: ServerResponse): void {
  const requestId = extractRequestId(req);
  if (requestId) {
    res.setHeader("X-OpenClaw-Request-Id", requestId);
  }
}

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  return null;
}

function extractLeaseId(req: IncomingMessage): string | null {
  const header = req.headers["x-openclaw-lease"];
  if (typeof header === "string" && header.trim().length > 0) return header.trim();
  if (Array.isArray(header) && typeof header[0] === "string" && header[0].trim().length > 0) {
    return header[0].trim();
  }
  const url = req.url ? new URL(req.url, "http://localhost") : null;
  const leaseId = url?.searchParams.get("leaseId");
  if (leaseId && leaseId.trim().length > 0) return leaseId.trim();
  return null;
}

async function loadCallGateway(): Promise<CallGatewayFn> {
  try {
    const mod = await import("../../../../src/gateway/call.ts");
    if (typeof mod.callGateway === "function") {
      return mod.callGateway as CallGatewayFn;
    }
  } catch {
    // ignore
  }

  // @ts-expect-error — dist fallback only exists after build; unreachable when src import succeeds
  const mod = await import("../../../../dist/gateway/call.js");
  if (typeof mod.callGateway !== "function") {
    throw new Error("callGateway is not available");
  }
  return mod.callGateway as CallGatewayFn;
}

function normalizeGatewayResult(payload: unknown): {
  ok: boolean;
  result?: unknown;
  error?: string;
} {
  if (payload && typeof payload === "object") {
    const record = payload as GatewayCallResult;
    if (record.ok === false) {
      return { ok: false, error: record.error ?? "gateway call failed" };
    }
    const result = "result" in record ? record.result : payload;
    return { ok: true, result };
  }
  return { ok: true, result: payload };
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}

function resolveModelEndpoint(offer: {
  backend: "ollama" | "lmstudio" | "openai-compat" | "custom";
  backendConfig: Record<string, unknown>;
}): { url: string; apiKey?: string } {
  const baseUrlRaw =
    typeof offer.backendConfig.baseUrl === "string" ? offer.backendConfig.baseUrl : "";
  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  if (!baseUrl) {
    throw new Error("model backend baseUrl is required");
  }
  if (offer.backend !== "openai-compat" && offer.backend !== "custom") {
    throw new Error("model backend is not supported yet");
  }
  const apiKey =
    typeof offer.backendConfig.apiKey === "string" && offer.backendConfig.apiKey.trim().length > 0
      ? offer.backendConfig.apiKey.trim()
      : undefined;
  return { url: `${baseUrl}/chat/completions`, apiKey };
}

function resolveSearchEndpoint(offer: SearchOffer): { url: string; apiKey?: string } {
  if (offer.backend !== "searxng" && offer.backend !== "custom") {
    throw new Error("search backend is not supported yet");
  }
  const baseUrlRaw =
    typeof offer.backendConfig.baseUrl === "string" ? offer.backendConfig.baseUrl : "";
  const baseUrl = baseUrlRaw.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("search backend baseUrl is required");
  }
  const apiKey =
    typeof offer.backendConfig.apiKey === "string" && offer.backendConfig.apiKey.trim().length > 0
      ? offer.backendConfig.apiKey.trim()
      : undefined;
  return { url: `${baseUrl}/search`, apiKey };
}

function parseSearchRequest(payload: unknown): SearchQuery {
  const input = (payload ?? {}) as Record<string, unknown>;
  const q = typeof input.q === "string" ? input.q.trim() : "";
  if (!q) {
    throw new Error("search query is required");
  }
  if (q.length > MAX_SEARCH_QUERY_CHARS) {
    throw new Error("search query too long");
  }
  const limitRaw = typeof input.limit === "number" ? Math.floor(input.limit) : undefined;
  const limit = limitRaw ? Math.min(Math.max(limitRaw, 1), MAX_SEARCH_LIMIT) : undefined;
  const site = typeof input.site === "string" && input.site.trim() ? input.site.trim() : undefined;
  return { q, limit, site };
}

function parseModelRequest(rawBody: string): Record<string, unknown> {
  const parsed = JSON.parse(rawBody) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("invalid model request");
  }
  return parsed;
}

function extractMaxTokens(payload: Record<string, unknown>): number | undefined {
  const rawMaxTokens = payload["max_tokens"] ?? payload["max_completion_tokens"];
  if (typeof rawMaxTokens === "number" && Number.isFinite(rawMaxTokens)) {
    return Math.floor(rawMaxTokens);
  }
  if (typeof rawMaxTokens === "string") {
    const parsed = Number.parseInt(rawMaxTokens, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function hasToolInvocation(payload: Record<string, unknown>): boolean {
  const tools = payload.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    return true;
  }
  const toolChoice = payload.tool_choice;
  if (typeof toolChoice === "string") {
    return toolChoice.trim().length > 0 && toolChoice !== "none";
  }
  return toolChoice != null;
}

function resolveLedgerCost(quantity: string, priceAmount: number): string {
  const qty = Number.parseFloat(quantity);
  if (!Number.isFinite(qty) || !Number.isFinite(priceAmount)) {
    return "0";
  }
  return String(Math.max(0, qty) * priceAmount);
}

async function appendSearchLedger(params: {
  config: Web3PluginConfig;
  lease: { leaseId: string; resourceId: string; providerActorId: string; consumerActorId: string };
  offer: SearchOffer;
}): Promise<void> {
  try {
    const callGateway = await loadCallGateway();
    const quantity = "1";
    const cost = resolveLedgerCost(quantity, params.offer.price.amount);
    await callGateway({
      method: "market.ledger.append",
      params: {
        actorId: params.lease.providerActorId,
        entry: {
          leaseId: params.lease.leaseId,
          resourceId: params.lease.resourceId,
          kind: "search",
          providerActorId: params.lease.providerActorId,
          consumerActorId: params.lease.consumerActorId,
          unit: "query",
          quantity,
          cost,
          currency: params.offer.price.currency,
        },
      },
      timeoutMs: params.config.brain.timeoutMs,
    });
  } catch {
    // ignore ledger failures
  }
}

function resolveStorageRoot(offer: StorageOffer): string {
  if (offer.backend !== "filesystem" && offer.backend !== "custom") {
    throw new Error("storage backend is not supported yet");
  }
  const rootDir =
    typeof offer.backendConfig.rootDir === "string" ? offer.backendConfig.rootDir.trim() : "";
  if (!rootDir) {
    throw new Error("storage backend rootDir is required");
  }
  return rootDir;
}

function normalizeVirtualPath(value: string): string {
  const trimmed = value.trim().replace(/^\/+/, "");
  if (!trimmed) {
    throw new Error("path is required");
  }
  if (trimmed.includes("\u0000")) {
    throw new Error("invalid path");
  }
  const segments = trimmed.split("/");
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    throw new Error("invalid path");
  }
  return trimmed;
}

function resolveStoragePath(rootDir: string, virtualPath: string): { root: string; full: string } {
  const root = resolve(rootDir);
  const sanitized = normalizeVirtualPath(virtualPath);
  const full = resolve(root, sanitized);
  if (full === root) {
    throw new Error("path must point to a file");
  }
  if (!full.startsWith(root + sep)) {
    throw new Error("invalid path");
  }
  return { root, full };
}

function toVirtualPath(root: string, full: string): string {
  return relative(root, full).split(sep).join("/");
}

function hashBytes(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseStoragePutRequest(payload: unknown): StoragePutRequest {
  const input = (payload ?? {}) as Record<string, unknown>;
  const path = typeof input.path === "string" ? input.path.trim() : "";
  const bytesBase64 = typeof input.bytesBase64 === "string" ? input.bytesBase64.trim() : "";
  const mime = typeof input.mime === "string" ? input.mime.trim() : undefined;
  if (!path || !bytesBase64) {
    throw new Error("path and bytesBase64 are required");
  }
  return { path, bytesBase64, mime };
}

function parseStorageListRequest(payload: unknown): StorageListRequest {
  const input = (payload ?? {}) as Record<string, unknown>;
  const prefix = typeof input.prefix === "string" ? input.prefix.trim() : undefined;
  const limitRaw = typeof input.limit === "number" ? Math.floor(input.limit) : undefined;
  const limit = limitRaw
    ? Math.min(Math.max(limitRaw, 1), MAX_STORAGE_LIST_LIMIT)
    : DEFAULT_STORAGE_LIST_LIMIT;
  return { prefix, limit };
}

async function listStorageFiles(params: {
  rootDir: string;
  prefix?: string;
  limit: number;
}): Promise<Array<{ path: string; size?: number; updatedAt?: string }>> {
  const root = resolve(params.rootDir);
  const entries: Array<{ path: string; size?: number; updatedAt?: string }> = [];
  const stack = [root];

  while (stack.length > 0 && entries.length < params.limit) {
    const current = stack.pop();
    if (!current) break;
    let children: Dirent<string>[];
    try {
      children = await readdir(current, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }

    for (const child of children) {
      if (entries.length >= params.limit) break;
      const full = join(current, child.name);
      if (child.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!child.isFile()) continue;
      let fileStat: Awaited<ReturnType<typeof stat>>;
      try {
        fileStat = await stat(full);
      } catch {
        continue;
      }
      const virtualPath = toVirtualPath(root, full);
      if (params.prefix && !virtualPath.startsWith(params.prefix)) {
        continue;
      }
      entries.push({
        path: virtualPath,
        size: fileStat.size,
        updatedAt: fileStat.mtime.toISOString(),
      });
    }
  }

  return entries;
}

async function appendStorageLedger(params: {
  config: Web3PluginConfig;
  lease: { leaseId: string; resourceId: string; providerActorId: string; consumerActorId: string };
  offer: StorageOffer;
  bytes: number;
  operation: "put" | "get";
}): Promise<void> {
  try {
    const callGateway = await loadCallGateway();
    const unit =
      params.offer.price.unit === "put" || params.offer.price.unit === "get" ? "call" : "byte";
    const quantity = unit === "call" ? "1" : String(Math.max(0, params.bytes));
    const cost = resolveLedgerCost(quantity, params.offer.price.amount);
    await callGateway({
      method: "market.ledger.append",
      params: {
        actorId: params.lease.providerActorId,
        entry: {
          leaseId: params.lease.leaseId,
          resourceId: params.lease.resourceId,
          kind: "storage",
          providerActorId: params.lease.providerActorId,
          consumerActorId: params.lease.consumerActorId,
          unit,
          quantity,
          cost,
          currency: params.offer.price.currency,
        },
      },
      timeoutMs: params.config.brain.timeoutMs,
    });
  } catch {
    // ignore ledger failures
  }
}

async function appendModelLedger(params: {
  config: Web3PluginConfig;
  lease: { leaseId: string; resourceId: string; providerActorId: string; consumerActorId: string };
  offer: ModelOffer;
  usageTokens?: number;
}): Promise<void> {
  try {
    const callGateway = await loadCallGateway();
    const quantity =
      params.usageTokens && params.usageTokens > 0 ? String(params.usageTokens) : "1";
    const cost = resolveLedgerCost(quantity, params.offer.price.amount);
    await callGateway({
      method: "market.ledger.append",
      params: {
        actorId: params.lease.providerActorId,
        entry: {
          leaseId: params.lease.leaseId,
          resourceId: params.lease.resourceId,
          kind: "model",
          providerActorId: params.lease.providerActorId,
          consumerActorId: params.lease.consumerActorId,
          unit: "token",
          quantity,
          cost,
          currency: params.offer.price.currency,
        },
      },
      timeoutMs: params.config.brain.timeoutMs,
    });
  } catch {
    // ignore ledger failures — fire-and-forget
  }
}

export function createResourceModelChatHandler(config: Web3PluginConfig) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return;
    }

    applyRequestId(req, res);

    if (!config.resources.enabled || !config.resources.provider.listen.enabled) {
      sendJson(res, 404, { ok: false, error: "resources provider disabled" });
      return;
    }

    const token = extractBearerToken(req);
    const leaseId = extractLeaseId(req);
    if (!token || !leaseId) {
      sendJson(res, 401, { ok: false, error: "authorization or leaseId missing" });
      return;
    }

    const leaseResult = await validateLeaseAccess({ leaseId, token, config });
    if (!leaseResult.ok) {
      sendJson(res, 403, { ok: false, error: leaseResult.error });
      return;
    }

    const offer = config.resources.provider.offers.models.find(
      (entry) => entry.id === leaseResult.lease.resourceId,
    );
    if (!offer) {
      sendJson(res, 404, { ok: false, error: "model resource not found" });
      return;
    }

    const release = reserveLeaseConcurrency(leaseResult.lease.leaseId, offer.policy?.maxConcurrent);
    if (!release) {
      sendJson(res, 429, { ok: false, error: "rate limited" });
      return;
    }

    try {
      let rawBody = "";
      try {
        rawBody = await readRequestBodyWithLimit(req, {
          maxBytes: Math.max(DEFAULT_MAX_BODY_BYTES, config.browserIngest.maxBodyBytes),
          timeoutMs: 30_000,
        });
      } catch (err) {
        if (isRequestBodyLimitError(err)) {
          sendJson(res, err.statusCode, { ok: false, error: requestBodyErrorToText(err.code) });
          return;
        }
        sendJson(res, 400, { ok: false, error: "invalid request body" });
        return;
      }

      let parsedBody: Record<string, unknown>;
      try {
        parsedBody = parseModelRequest(rawBody);
      } catch {
        sendJson(res, 400, { ok: false, error: "invalid request body" });
        return;
      }

      const maxTokens = extractMaxTokens(parsedBody);
      if (
        typeof offer.policy?.maxTokens === "number" &&
        maxTokens !== undefined &&
        maxTokens > offer.policy.maxTokens
      ) {
        sendJson(res, 400, { ok: false, error: "max_tokens exceeds policy" });
        return;
      }

      if (offer.policy?.allowTools === false && hasToolInvocation(parsedBody)) {
        sendJson(res, 400, { ok: false, error: "tools not allowed" });
        return;
      }

      const { url, apiKey } = resolveModelEndpoint(offer);
      const headers: Record<string, string> = {
        "Content-Type":
          typeof req.headers["content-type"] === "string"
            ? req.headers["content-type"]
            : "application/json",
      };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const { response: upstream, release: releaseUpstream } = await fetchWithSsrFGuard({
        url,
        init: {
          method: "POST",
          headers,
          body: rawBody,
        },
        auditContext: "web3-resource-model-forward",
      });

      try {
        if (!upstream.ok) {
          sendJson(res, upstream.status, { ok: false, error: "model backend error" });
          return;
        }

        res.statusCode = upstream.status;
        const contentType = upstream.headers.get("content-type");
        if (contentType) {
          res.setHeader("Content-Type", contentType);
        }

        if (!upstream.body) {
          res.end();
          // Fire-and-forget ledger append even for empty body
          appendModelLedger({ config, lease: leaseResult.lease, offer }).catch(() => {});
          return;
        }

        await pipeline(Readable.fromWeb(upstream.body as any), res);

        // Extract usage tokens from upstream response headers if available
        const usageHeader = upstream.headers.get("x-usage-tokens");
        const usageTokens = usageHeader ? Number.parseInt(usageHeader, 10) : undefined;

        // Fire-and-forget: write Provider authority ledger after streaming completes
        appendModelLedger({
          config,
          lease: leaseResult.lease,
          offer,
          usageTokens: Number.isFinite(usageTokens) ? usageTokens : undefined,
        }).catch(() => {});
      } finally {
        await releaseUpstream();
      }
    } finally {
      release();
    }
  };
}

export function createResourceSearchQueryHandler(config: Web3PluginConfig) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return;
    }

    applyRequestId(req, res);

    if (!config.resources.enabled || !config.resources.provider.listen.enabled) {
      sendJson(res, 404, { ok: false, error: "resources provider disabled" });
      return;
    }

    const token = extractBearerToken(req);
    const leaseId = extractLeaseId(req);
    if (!token || !leaseId) {
      sendJson(res, 401, { ok: false, error: "authorization or leaseId missing" });
      return;
    }

    const leaseResult = await validateLeaseAccess({ leaseId, token, config });
    if (!leaseResult.ok) {
      sendJson(res, 403, { ok: false, error: leaseResult.error });
      return;
    }

    const offer = config.resources.provider.offers.search.find(
      (entry) => entry.id === leaseResult.lease.resourceId,
    );
    if (!offer) {
      sendJson(res, 404, { ok: false, error: "search resource not found" });
      return;
    }

    const release = reserveLeaseConcurrency(leaseResult.lease.leaseId, offer.policy?.maxConcurrent);
    if (!release) {
      sendJson(res, 429, { ok: false, error: "rate limited" });
      return;
    }

    try {
      let payload: SearchQuery;
      try {
        const rawBody = await readRequestBodyWithLimit(req, {
          maxBytes: Math.max(DEFAULT_MAX_BODY_BYTES, config.browserIngest.maxBodyBytes),
          timeoutMs: 30_000,
        });
        payload = parseSearchRequest(JSON.parse(rawBody));
      } catch (err) {
        if (isRequestBodyLimitError(err)) {
          sendJson(res, err.statusCode, { ok: false, error: requestBodyErrorToText(err.code) });
          return;
        }
        sendJson(res, 400, { ok: false, error: "invalid request body" });
        return;
      }

      if (
        typeof offer.policy?.maxQueryChars === "number" &&
        payload.q.length > offer.policy.maxQueryChars
      ) {
        sendJson(res, 400, { ok: false, error: "search query too long" });
        return;
      }

      try {
        const { url, apiKey } = resolveSearchEndpoint(offer);
        const query = payload.site ? `${payload.q} site:${payload.site}` : payload.q;
        const searchUrl = new URL(url);
        searchUrl.searchParams.set("q", query);
        searchUrl.searchParams.set("format", "json");
        if (apiKey) {
          searchUrl.searchParams.set("apikey", apiKey);
        }

        const { response: upstream, release: releaseUpstream } = await fetchWithSsrFGuard({
          url: searchUrl.toString(),
          init: {
            method: "GET",
            headers: { Accept: "application/json" },
          },
          auditContext: "web3-resource-search-forward",
        });
        try {
          if (!upstream.ok) {
            sendJson(res, upstream.status, { ok: false, error: "search backend error" });
            return;
          }

          const data = (await upstream.json()) as {
            results?: Array<{ title?: string; url?: string; content?: string }>;
          };
          const results = Array.isArray(data.results) ? data.results : [];
          const limit = payload.limit ?? DEFAULT_SEARCH_LIMIT;
          const mapped = results.slice(0, limit).map((entry) => ({
            title: entry.title ?? "",
            url: entry.url ?? "",
            snippet: entry.content ?? "",
          }));

          await appendSearchLedger({
            config,
            lease: leaseResult.lease,
            offer,
          });

          sendJson(res, 200, { ok: true, results: mapped });
        } finally {
          await releaseUpstream();
        }
      } catch {
        sendJson(res, 500, { ok: false, error: "search provider failed" });
      }
    } finally {
      release();
    }
  };
}

export function createResourceStoragePutHandler(config: Web3PluginConfig) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return;
    }

    applyRequestId(req, res);

    if (!config.resources.enabled || !config.resources.provider.listen.enabled) {
      sendJson(res, 404, { ok: false, error: "resources provider disabled" });
      return;
    }

    const token = extractBearerToken(req);
    const leaseId = extractLeaseId(req);
    if (!token || !leaseId) {
      sendJson(res, 401, { ok: false, error: "authorization or leaseId missing" });
      return;
    }

    const leaseResult = await validateLeaseAccess({ leaseId, token, config });
    if (!leaseResult.ok) {
      sendJson(res, 403, { ok: false, error: leaseResult.error });
      return;
    }

    const offer = config.resources.provider.offers.storage.find(
      (entry) => entry.id === leaseResult.lease.resourceId,
    );
    if (!offer) {
      sendJson(res, 404, { ok: false, error: "storage resource not found" });
      return;
    }

    const release = reserveLeaseConcurrency(leaseResult.lease.leaseId, offer.policy?.maxConcurrent);
    if (!release) {
      sendJson(res, 429, { ok: false, error: "rate limited" });
      return;
    }

    try {
      let payload: StoragePutRequest;
      try {
        const rawBody = await readRequestBodyWithLimit(req, {
          maxBytes: Math.max(DEFAULT_MAX_BODY_BYTES, config.browserIngest.maxBodyBytes),
          timeoutMs: 30_000,
        });
        payload = parseStoragePutRequest(JSON.parse(rawBody));
      } catch (err) {
        if (isRequestBodyLimitError(err)) {
          sendJson(res, err.statusCode, { ok: false, error: requestBodyErrorToText(err.code) });
          return;
        }
        sendJson(res, 400, { ok: false, error: "invalid request body" });
        return;
      }

      try {
        if (
          offer.policy?.allowMime &&
          payload.mime &&
          !offer.policy.allowMime.includes(payload.mime)
        ) {
          sendJson(res, 415, { ok: false, error: "mime type not allowed" });
          return;
        }

        const bytes = Buffer.from(payload.bytesBase64, "base64");
        if (offer.policy?.maxBytes && bytes.length > offer.policy.maxBytes) {
          sendJson(res, 413, { ok: false, error: "payload too large" });
          return;
        }

        const rootDir = resolveStorageRoot(offer);
        const { full } = resolveStoragePath(rootDir, payload.path);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, bytes);

        const etag = hashBytes(bytes);
        const createdAt = new Date().toISOString();

        await appendStorageLedger({
          config,
          lease: leaseResult.lease,
          offer,
          bytes: bytes.length,
          operation: "put",
        });

        sendJson(res, 200, {
          ok: true,
          size: bytes.length,
          etag,
          createdAt,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("path")) {
          sendJson(res, 400, { ok: false, error: "invalid path" });
          return;
        }
        sendJson(res, 500, { ok: false, error: "storage write failed" });
      }
    } finally {
      release();
    }
  };
}

export function createResourceStorageGetHandler(config: Web3PluginConfig) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.end("Method Not Allowed");
      return;
    }

    applyRequestId(req, res);

    if (!config.resources.enabled || !config.resources.provider.listen.enabled) {
      sendJson(res, 404, { ok: false, error: "resources provider disabled" });
      return;
    }

    const token = extractBearerToken(req);
    const leaseId = extractLeaseId(req);
    if (!token || !leaseId) {
      sendJson(res, 401, { ok: false, error: "authorization or leaseId missing" });
      return;
    }

    const leaseResult = await validateLeaseAccess({ leaseId, token, config });
    if (!leaseResult.ok) {
      sendJson(res, 403, { ok: false, error: leaseResult.error });
      return;
    }

    const offer = config.resources.provider.offers.storage.find(
      (entry) => entry.id === leaseResult.lease.resourceId,
    );
    if (!offer) {
      sendJson(res, 404, { ok: false, error: "storage resource not found" });
      return;
    }

    const release = reserveLeaseConcurrency(leaseResult.lease.leaseId, offer.policy?.maxConcurrent);
    if (!release) {
      sendJson(res, 429, { ok: false, error: "rate limited" });
      return;
    }

    try {
      try {
        const url = req.url ? new URL(req.url, "http://localhost") : null;
        const path = url?.searchParams.get("path") ?? "";
        const rootDir = resolveStorageRoot(offer);
        const { full } = resolveStoragePath(rootDir, path);
        const bytes = await readFile(full);
        const etag = hashBytes(bytes);

        await appendStorageLedger({
          config,
          lease: leaseResult.lease,
          offer,
          bytes: bytes.length,
          operation: "get",
        });

        sendJson(res, 200, {
          ok: true,
          bytesBase64: bytes.toString("base64"),
          etag,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("path")) {
          sendJson(res, 400, { ok: false, error: "invalid path" });
          return;
        }
        sendJson(res, 404, { ok: false, error: "storage item not found" });
      }
    } finally {
      release();
    }
  };
}

export function createResourceStorageListHandler(config: Web3PluginConfig) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return;
    }

    applyRequestId(req, res);

    if (!config.resources.enabled || !config.resources.provider.listen.enabled) {
      sendJson(res, 404, { ok: false, error: "resources provider disabled" });
      return;
    }

    const token = extractBearerToken(req);
    const leaseId = extractLeaseId(req);
    if (!token || !leaseId) {
      sendJson(res, 401, { ok: false, error: "authorization or leaseId missing" });
      return;
    }

    const leaseResult = await validateLeaseAccess({ leaseId, token, config });
    if (!leaseResult.ok) {
      sendJson(res, 403, { ok: false, error: leaseResult.error });
      return;
    }

    const offer = config.resources.provider.offers.storage.find(
      (entry) => entry.id === leaseResult.lease.resourceId,
    );
    if (!offer) {
      sendJson(res, 404, { ok: false, error: "storage resource not found" });
      return;
    }

    const release = reserveLeaseConcurrency(leaseResult.lease.leaseId, offer.policy?.maxConcurrent);
    if (!release) {
      sendJson(res, 429, { ok: false, error: "rate limited" });
      return;
    }

    try {
      let payload: StorageListRequest;
      try {
        const rawBody = await readRequestBodyWithLimit(req, {
          maxBytes: Math.max(DEFAULT_MAX_BODY_BYTES, config.browserIngest.maxBodyBytes),
          timeoutMs: 30_000,
        });
        payload = parseStorageListRequest(JSON.parse(rawBody));
      } catch (err) {
        if (isRequestBodyLimitError(err)) {
          sendJson(res, err.statusCode, { ok: false, error: requestBodyErrorToText(err.code) });
          return;
        }
        sendJson(res, 400, { ok: false, error: "invalid request body" });
        return;
      }

      try {
        const rootDir = resolveStorageRoot(offer);
        const prefix = payload.prefix ? normalizeVirtualPath(payload.prefix) : undefined;
        const items = await listStorageFiles({
          rootDir,
          prefix,
          limit: payload.limit ?? DEFAULT_STORAGE_LIST_LIMIT,
        });
        sendJson(res, 200, { ok: true, items });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("path")) {
          sendJson(res, 400, { ok: false, error: "invalid path" });
          return;
        }
        sendJson(res, 500, { ok: false, error: "storage list failed" });
      }
    } finally {
      release();
    }
  };
}
