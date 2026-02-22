/**
 * Shared internal utilities for market handlers.
 * Not re-exported — consumed only by sibling handler modules.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import { ErrorCode, ERROR_CODE_DESCRIPTIONS, type ErrorResponse } from "../../errors/codes.js";
import type { MarketStateStore } from "../../state/store.js";
import { EvmAnchorAdapter, type AnchorResult } from "../chain.js";
import { createDeliveryCredentialsStore } from "../credentials.js";
import { hashCanonical } from "../hash.js";
import type { MarketResourceKind } from "../resources.js";
import type {
  AuditEvent,
  AuditEventKind,
  Consent,
  Delivery,
  DeliveryPayload,
  Offer,
  Order,
  RevocationJob,
} from "../types.js";
import { normalizeBuyerId } from "../validators.js";

// ---- Time helpers ----

export function nowIso() {
  return new Date().toISOString();
}

export function nextAttemptAt(config: MarketPluginConfig): string {
  const delay = config.revocation.retryDelayMs ?? 60_000;
  return new Date(Date.now() + delay).toISOString();
}

export function maxAttempts(config: MarketPluginConfig): number {
  return config.revocation.maxAttempts ?? 3;
}

// ---- Constants ----

export const RESOURCE_PRICE_UNITS: Record<
  MarketResourceKind,
  Array<"token" | "call" | "query" | "gb_day" | "put" | "get">
> = {
  model: ["token", "call"],
  search: ["query"],
  storage: ["gb_day", "put", "get"],
};

// ---- Error formatting ----

/**
 * Redact sensitive information from error messages to prevent information leakage.
 * Removes: file paths, URLs with tokens/endpoints, environment variables
 *
 * NOTE: Dispute status naming convention
 * market-core uses prefixed statuses: "dispute_opened", "dispute_evidence_submitted", "dispute_resolved", "dispute_rejected"
 * web3-core uses unprefixed statuses: "open", "evidence_submitted", "resolved", "rejected", "expired"
 * This is by design — the two domains maintain independent state models.
 */
const REDACTED = "[REDACTED]";
const SENSITIVE_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "token",
  "apikey",
  "secret",
  "password",
  "privatekey",
  "endpoint",
  "providerendpoint",
  "downloadurl",
  "rpcurl",
  "dbpath",
  "storepath",
  "payload",
  "payloadref",
]);

function redactSensitiveInfo(message: string): string {
  let redacted = message;

  // Redact absolute file paths with at least two segments (Unix and Windows)
  redacted = redacted.replace(/\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.\-/]+/g, "[PATH]");
  redacted = redacted.replace(/[A-Z]:\\[a-zA-Z0-9_\-.\\]+/g, "[PATH]");

  // Redact URLs with potential sensitive data
  redacted = redacted.replace(/https?:\/\/[^\s]+/g, "[URL]");

  // Redact environment variable patterns
  redacted = redacted.replace(/[A-Z_]+=[^\s]+/g, "[ENV]");

  // Redact hex addresses that might be endpoints
  redacted = redacted.replace(/0x[a-fA-F0-9]{40,}/g, "[ADDRESS]");

  // Redact JWT-like tokens
  redacted = redacted.replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[TOKEN]");

  // Redact bearer tokens and access tokens (requires tok_ prefix with underscore)
  redacted = redacted.replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]");
  redacted = redacted.replace(/\btok_[\w-]+\b/gi, "tok_***");

  return redacted;
}

function redactAuditValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactSensitiveInfo(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((entry) => redactAuditValue(entry));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(record)) {
      const lowered = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowered)) {
        out[key] = REDACTED;
        continue;
      }
      out[key] = redactAuditValue(raw);
    }
    return out;
  }
  return String(value);
}

export function redactAuditDetails(
  details?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const redacted = redactAuditValue(details);
  if (redacted && typeof redacted === "object") {
    return redacted as Record<string, unknown>;
  }
  return { value: redacted };
}

const VALID_ERROR_CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));

export function formatGatewayError(err: unknown, fallback = ErrorCode.E_INTERNAL): ErrorCode {
  const message = err instanceof Error ? err.message : String(err);
  const redactedMessage = redactSensitiveInfo(message);

  if (redactedMessage.startsWith("E_")) {
    // Extract the error code token and validate against known ErrorCode values
    const match = redactedMessage.match(/^(E_[A-Z_]+)/);
    if (match && VALID_ERROR_CODES.has(match[1])) {
      return match[1] as ErrorCode;
    }
  }

  const normalized = redactedMessage.toLowerCase();

  if (normalized.includes("actorid is required")) {
    return ErrorCode.E_AUTH_REQUIRED;
  }
  if (
    normalized.includes("access denied") ||
    normalized.includes("forbidden") ||
    normalized.includes("not allowed") ||
    normalized.includes("does not match") ||
    normalized.includes("mismatch")
  ) {
    return ErrorCode.E_FORBIDDEN;
  }
  if (normalized.includes("not found")) {
    return ErrorCode.E_NOT_FOUND;
  }
  if (normalized.includes("expired")) {
    return ErrorCode.E_EXPIRED;
  }
  if (normalized.includes("revoked")) {
    return ErrorCode.E_REVOKED;
  }
  if (
    normalized.includes("conflict") ||
    normalized.includes("already") ||
    normalized.includes("not published") ||
    normalized.includes("transition")
  ) {
    return ErrorCode.E_CONFLICT;
  }
  if (
    normalized.includes("invalid") ||
    normalized.includes("must") ||
    normalized.includes("required") ||
    normalized.includes("missing") ||
    normalized.includes("exceeds")
  ) {
    return ErrorCode.E_INVALID_ARGUMENT;
  }
  if (normalized.includes("quota") || normalized.includes("limit")) {
    return ErrorCode.E_QUOTA_EXCEEDED;
  }
  if (normalized.includes("timeout")) {
    return ErrorCode.E_TIMEOUT;
  }
  if (normalized.includes("unavailable") || normalized.includes("unreachable")) {
    return ErrorCode.E_UNAVAILABLE;
  }
  return fallback;
}

export function formatGatewayErrorResponse(
  err: unknown,
  fallback = ErrorCode.E_INTERNAL,
  details?: Record<string, unknown>,
): ErrorResponse {
  const code = formatGatewayError(err, fallback);
  const message = ERROR_CODE_DESCRIPTIONS[code] ?? "An internal error occurred.";
  if (details && Object.keys(details).length > 0) {
    return { error: code, message, details };
  }
  return { error: code, message };
}

// ---- Token/price helpers ----

export function hashAccessToken(token: string): string {
  const digest = createHash("sha256").update(token).digest("hex");
  return `sha256:${digest}`;
}

export function parsePriceAmount(amount: string): number {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    throw new Error("E_INVALID_ARGUMENT: price.amount must be numeric");
  }
  return parsed;
}

// ---- Address helpers ----

export { randomBytes, randomUUID };

import { requireAddress } from "../validators.js";
export { normalizeBuyerId };

export function requireOptionalAddress(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const raw = params[key];
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  try {
    return requireAddress(raw, key);
  } catch {
    throw new Error(`E_INVALID_ARGUMENT: ${key} is invalid`);
  }
}

// ---- Revocation job factory ----

export function createRevocationJob(input: {
  config: MarketPluginConfig;
  delivery: Delivery;
  order?: Order;
  offer?: Offer;
  consent?: Consent;
  reason?: string;
  error?: string;
}): RevocationJob {
  return {
    jobId: randomUUID(),
    deliveryId: input.delivery.deliveryId,
    orderId: input.order?.orderId,
    offerId: input.offer?.offerId,
    consentId: input.consent?.consentId,
    reason: input.reason,
    payloadHash: hashCanonical({
      deliveryId: input.delivery.deliveryId,
      orderId: input.order?.orderId,
      offerId: input.offer?.offerId,
      consentId: input.consent?.consentId,
      reason: input.reason,
    }),
    attempts: 1,
    status: "pending",
    lastError: input.error,
    nextAttemptAt: nextAttemptAt(input.config),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

// ---- Audit ----

export function recordAudit(
  store: MarketStateStore,
  kind: AuditEventKind,
  refId: string,
  hash?: string,
  actor?: string,
  details?: Record<string, unknown>,
) {
  const safeDetails = redactAuditDetails(details);
  const event: AuditEvent = {
    id: randomUUID(),
    kind,
    refId,
    hash,
    actor,
    timestamp: nowIso(),
    details: safeDetails,
  };
  store.appendAuditEvent(event);
}

async function tryAnchor(config: MarketPluginConfig, anchorId: string, payloadHash: string) {
  if (!config.chain.privateKey) return null;
  const chain = new EvmAnchorAdapter(config.chain);
  return await chain.anchorHash(anchorId, payloadHash);
}

export async function recordAuditWithAnchor(input: {
  store: MarketStateStore;
  config: MarketPluginConfig;
  kind: AuditEventKind;
  refId: string;
  hash: string;
  anchorId: string;
  actor?: string;
  details?: Record<string, unknown>;
}) {
  let anchorResult: AnchorResult | null = null;
  let anchorError: string | undefined;

  try {
    anchorResult = await tryAnchor(input.config, input.anchorId, input.hash);
  } catch (err) {
    anchorError = redactSensitiveInfo(String(err));
  }

  const mergedDetails: Record<string, unknown> = {
    ...(input.details ?? {}),
  };

  if (anchorResult) {
    mergedDetails.anchor = anchorResult;
  }

  if (anchorError) {
    mergedDetails.anchorError = anchorError;
  }

  recordAudit(
    input.store,
    input.kind,
    input.refId,
    input.hash,
    input.actor,
    Object.keys(mergedDetails).length > 0 ? mergedDetails : undefined,
  );
}

// ---- Access control ----

const DEFAULT_READ_SCOPES = ["operator.read", "operator.write"];
const DEFAULT_WRITE_SCOPES = ["operator.write"];

export function assertAccess(
  opts: GatewayRequestHandlerOptions,
  config: MarketPluginConfig,
  action: "read" | "write",
) {
  const access = config.access;
  if (access.mode === "open") return;

  const client = opts.client?.connect;
  if (!client) throw new Error("market access denied: client missing");

  if (access.allowClientIds && access.allowClientIds.length > 0) {
    if (!access.allowClientIds.includes(client.client.id)) {
      throw new Error("market access denied: client not allowed");
    }
  }

  if (access.allowRoles && access.allowRoles.length > 0) {
    if (!client.role || !access.allowRoles.includes(client.role)) {
      throw new Error("market access denied: role not allowed");
    }
  }

  if (access.allowScopes && access.allowScopes.length > 0) {
    const scopes = client.scopes ?? [];
    const match = access.allowScopes.some((scope) => scopes.includes(scope));
    if (!match) {
      throw new Error("market access denied: scope not allowed");
    }
  }

  const requiredScopes =
    action === "read"
      ? (access.readScopes ?? DEFAULT_READ_SCOPES)
      : (access.writeScopes ?? DEFAULT_WRITE_SCOPES);
  if (requiredScopes.length > 0) {
    const scopes = client.scopes ?? [];
    const match = requiredScopes.some((scope) => scopes.includes(scope));
    if (!match) {
      throw new Error(`market access denied: missing ${action} scope`);
    }
  }
}

// ---- Actor resolution ----

export function resolveActorId(
  opts: GatewayRequestHandlerOptions,
  config: MarketPluginConfig,
  input: Record<string, unknown>,
): string | undefined {
  const actorSource = config.access.actorSource ?? "param";
  const actorParam = typeof input.actorId === "string" ? input.actorId.trim() : "";
  const clientActor = opts.client?.connect?.client?.id?.trim() ?? "";

  if (actorSource === "param") {
    return actorParam || undefined;
  }
  if (actorSource === "client") {
    return clientActor || undefined;
  }
  if (actorParam && clientActor && actorParam !== clientActor) {
    throw new Error("actorId mismatch between params and client");
  }
  return actorParam || clientActor || undefined;
}

export function requireActorId(
  opts: GatewayRequestHandlerOptions,
  config: MarketPluginConfig,
  input: Record<string, unknown>,
): string {
  if (!config.access.requireActor) return "";
  const actorId = resolveActorId(opts, config, input);
  if (!actorId) {
    throw new Error("actorId is required for market access");
  }
  return actorId;
}

export function assertActorMatch(
  config: MarketPluginConfig,
  actorId: string,
  expected: string,
  label: string,
) {
  if (!config.access.requireActorMatch) return;
  if (!expected) return;
  if (actorId !== expected) {
    throw new Error(`actorId does not match ${label}`);
  }
}

// ---- Delivery payload resolution ----

export async function resolveDeliveryPayloadForRevocation(
  config: MarketPluginConfig,
  delivery: Delivery,
): Promise<DeliveryPayload | undefined> {
  if (delivery.payload) return delivery.payload;
  if (!delivery.payloadRef) return undefined;

  const store = createDeliveryCredentialsStore(config.credentials);
  if (!store) return undefined;
  return await store.getDeliveryPayload(delivery.payloadRef);
}
