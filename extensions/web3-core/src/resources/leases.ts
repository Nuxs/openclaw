import { createHash } from "node:crypto";
import type { Web3PluginConfig } from "../config.js";

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

export type LeaseSnapshot = {
  leaseId: string;
  resourceId: string;
  providerActorId: string;
  consumerActorId: string;
  status: "lease_active" | "lease_revoked" | "lease_expired";
  expiresAt: string;
  accessTokenHash?: string;
};

export type ConsumerLeaseAccess = {
  leaseId: string;
  resourceId: string;
  accessToken: string;
  expiresAt: string;
  providerEndpoint?: string;
};

const consumerLeaseCache = new Map<string, ConsumerLeaseAccess>();

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

function hashAccessToken(token: string): string {
  const digest = createHash("sha256").update(token).digest("hex");
  return `sha256:${digest}`;
}

function isTokenValid(expectedHash: string | undefined, token: string): boolean {
  if (!expectedHash) return false;
  return expectedHash === hashAccessToken(token);
}

export async function validateLeaseAccess(params: {
  leaseId: string;
  token: string;
  config: Web3PluginConfig;
}): Promise<{ ok: true; lease: LeaseSnapshot } | { ok: false; error: string }> {
  try {
    const callGateway = await loadCallGateway();
    const response = await callGateway({
      method: "market.lease.get",
      params: { leaseId: params.leaseId },
      timeoutMs: params.config.brain.timeoutMs,
    });
    const normalized = normalizeGatewayResult(response);
    if (!normalized.ok) {
      return { ok: false, error: normalized.error ?? "lease lookup failed" };
    }
    const payload = normalized.result as { lease?: LeaseSnapshot | null } | undefined;
    const lease = payload?.lease ?? null;
    if (!lease) {
      return { ok: false, error: "lease not found" };
    }
    if (lease.status !== "lease_active") {
      return { ok: false, error: "lease not active" };
    }
    const expiresAt = Date.parse(lease.expiresAt);
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      return { ok: false, error: "lease expired" };
    }
    if (!isTokenValid(lease.accessTokenHash, params.token)) {
      return { ok: false, error: "invalid lease token" };
    }
    const allowed = params.config.resources.provider.auth.allowedConsumers;
    if (allowed && allowed.length > 0 && !allowed.includes(lease.consumerActorId)) {
      return { ok: false, error: "consumer not allowed" };
    }
    return { ok: true, lease };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function isLeaseExpired(expiresAt: string): boolean {
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return true;
  return parsed <= Date.now();
}

export function saveConsumerLeaseAccess(entry: ConsumerLeaseAccess): void {
  if (!entry.accessToken) return;
  consumerLeaseCache.set(entry.resourceId, entry);
}

export function getConsumerLeaseAccess(resourceId: string): ConsumerLeaseAccess | null {
  const entry = consumerLeaseCache.get(resourceId);
  if (!entry) return null;
  if (isLeaseExpired(entry.expiresAt)) {
    consumerLeaseCache.delete(resourceId);
    return null;
  }
  return entry;
}

export function clearConsumerLeaseAccess(resourceId: string): void {
  consumerLeaseCache.delete(resourceId);
}

export function clearConsumerLeaseById(leaseId: string): void {
  for (const [resourceId, entry] of consumerLeaseCache.entries()) {
    if (entry.leaseId === leaseId) {
      consumerLeaseCache.delete(resourceId);
    }
  }
}
