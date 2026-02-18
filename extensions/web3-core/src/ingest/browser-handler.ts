/**
 * Browser extension ingest HTTP handler.
 *
 * Accepts POST requests from the OpenClaw Web3 Audit Bridge browser extension,
 * validates auth (timing-safe token or loopback), parses the payload, and
 * records a `dapp_request` audit event via the shared audit pipeline.
 */

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBodyWithLimit, requestBodyErrorToText } from "openclaw/plugin-sdk";
import { recordExternalAuditEvent } from "../audit/hooks.js";
import type { Web3PluginConfig } from "../config.js";
import type { Web3StateStore } from "../state/store.js";

// ---------------------------------------------------------------------------
// CORS — the browser extension sends fetch() from a chrome-extension:// origin
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-OpenClaw-Token",
  "Access-Control-Max-Age": "86400",
};

function setCorsHeaders(res: ServerResponse): void {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}

// ---------------------------------------------------------------------------
// JSON response helper
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  setCorsHeaders(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  const header = req.headers["x-openclaw-token"];
  if (typeof header === "string") return header.trim();
  if (Array.isArray(header) && typeof header[0] === "string") return header[0].trim();
  return null;
}

function isLoopbackAddress(value?: string | null): boolean {
  if (!value) return false;
  return value === "127.0.0.1" || value === "::1" || value.startsWith("::ffff:127.");
}

/** Constant-time token comparison to prevent timing attacks. */
function tokensEqual(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) {
    // Compare against self to keep constant time regardless of length mismatch
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

function isAuthorizedBrowserIngest(req: IncomingMessage, config: Web3PluginConfig): boolean {
  const token = config.browserIngest.token?.trim();
  const provided = extractBearerToken(req);

  // When a shared secret is configured, require timing-safe match
  if (token) {
    if (!provided) return false;
    return tokensEqual(token, provided);
  }

  // No token configured — allow loopback only when explicitly permitted
  if (!config.browserIngest.allowLoopback) return false;
  return isLoopbackAddress(req.socket.remoteAddress);
}

// ---------------------------------------------------------------------------
// Payload parsing helpers
// ---------------------------------------------------------------------------

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) return trimmed.slice(0, maxLength);
  return trimmed;
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createBrowserIngestHandler(store: Web3StateStore, config: Web3PluginConfig) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      setCorsHeaders(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== "POST") {
      setCorsHeaders(res);
      res.statusCode = 405;
      res.setHeader("Allow", "POST, OPTIONS");
      res.end("Method Not Allowed");
      return;
    }

    if (!isAuthorizedBrowserIngest(req, config)) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const bodyResult = await readJsonBodyWithLimit(req, {
      maxBytes: config.browserIngest.maxBodyBytes,
      timeoutMs: 5_000,
      emptyObjectOnEmpty: false,
    });
    if (!bodyResult.ok) {
      const status =
        bodyResult.code === "PAYLOAD_TOO_LARGE"
          ? 413
          : bodyResult.code === "REQUEST_BODY_TIMEOUT"
            ? 408
            : 400;
      const errorText =
        bodyResult.code === "INVALID_JSON"
          ? "Invalid JSON"
          : requestBodyErrorToText(bodyResult.code);
      sendJson(res, status, { ok: false, error: errorText });
      return;
    }

    const raw =
      typeof bodyResult.value === "object" && bodyResult.value !== null ? bodyResult.value : {};
    const payload = raw as Record<string, unknown>;
    const method = readString(payload.method, 128);
    const origin = readString(payload.origin, 512);
    if (!method || !origin) {
      sendJson(res, 400, { ok: false, error: "origin and method are required" });
      return;
    }

    const eventPayload = {
      source: "browser-extension",
      method,
      origin,
      url: readString(payload.url, 2048),
      chainId:
        typeof payload.chainId === "string" || typeof payload.chainId === "number"
          ? payload.chainId
          : undefined,
      requestId: readString(payload.requestId, 128),
      ok: typeof payload.ok === "boolean" ? payload.ok : undefined,
      durationMs: typeof payload.durationMs === "number" ? payload.durationMs : undefined,
      error: readString(payload.error, 512),
      timestamp: readString(payload.timestamp, 64) ?? new Date().toISOString(),
    };

    await recordExternalAuditEvent({
      kind: "dapp_request",
      sessionId: `browser:${origin}`,
      payload: eventPayload,
      store,
      config,
    });

    sendJson(res, 200, { ok: true });
  };
}
