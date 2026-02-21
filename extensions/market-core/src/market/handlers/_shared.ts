/**
 * Shared internal utilities for market handlers.
 * Not re-exported — consumed only by sibling handler modules.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import { ErrorCode } from "../../errors/codes.js";
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
 */
function redactSensitiveInfo(message: string): string {
  let redacted = message;

  // Redact absolute file paths (Unix and Windows)
  redacted = redacted.replace(/\/[a-zA-Z0-9_\-./]+/g, "[PATH]");
  redacted = redacted.replace(/[A-Z]:\\[a-zA-Z0-9_\-.\\]+/g, "[PATH]");

  // Redact URLs with potential sensitive data
  redacted = redacted.replace(/https?:\/\/[^\s]+/g, "[URL]");

  // Redact environment variable patterns
  redacted = redacted.replace(/[A-Z_]+=[^\s]+/g, "[ENV]");

  // Redact hex addresses that might be endpoints
  redacted = redacted.replace(/0x[a-fA-F0-9]{40,}/g, "[ADDRESS]");

  // Redact JWT-like tokens
  redacted = redacted.replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[TOKEN]");

  return redacted;
}

export function formatGatewayError(err: unknown, fallback = ErrorCode.E_INTERNAL): ErrorCode {
  const message = err instanceof Error ? err.message : String(err);
  const redactedMessage = redactSensitiveInfo(message);

  if (redactedMessage.startsWith("E_")) {
    return redactedMessage as ErrorCode;
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
  const event: AuditEvent = {
    id: randomUUID(),
    kind,
    refId,
    hash,
    actor,
    timestamp: nowIso(),
    details,
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
    anchorError = String(err);
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
