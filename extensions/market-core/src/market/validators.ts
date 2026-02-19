import { getAddress } from "viem";
import type { AssetType, DeliveryPayload, DeliveryType, UsageScope } from "./types.js";

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

export function requireAddress(value: unknown, field: string): `0x${string}` {
  const input = requireString(value, field);
  return getAddress(input) as `0x${string}`;
}

export function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}

export function requireAssetType(value: unknown): AssetType {
  if (value === "data" || value === "api" || value === "service") return value;
  throw new Error("assetType must be data | api | service");
}

export function requireDeliveryType(value: unknown): DeliveryType {
  if (value === "download" || value === "api" || value === "service") return value;
  throw new Error("deliveryType must be download | api | service");
}

export function requireUsageScope(value: unknown): UsageScope {
  if (!value || typeof value !== "object") throw new Error("usageScope is required");
  const scope = value as UsageScope;
  if (!scope.purpose || typeof scope.purpose !== "string") {
    throw new Error("usageScope.purpose is required");
  }
  return scope;
}

export function normalizeBuyerId(value: unknown): string {
  const raw = requireString(value, "buyerId");
  try {
    return getAddress(raw);
  } catch {
    return raw;
  }
}

export function requireDeliveryPayload(
  type: DeliveryType,
  payload: unknown,
): DeliveryPayload | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  if (type === "download") {
    const input = payload as { downloadUrl?: string };
    if (!input.downloadUrl) throw new Error("downloadUrl is required for download delivery");
    return { type: "download", downloadUrl: input.downloadUrl };
  }
  if (type === "api") {
    const input = payload as { accessToken?: string; quota?: number };
    if (!input.accessToken) throw new Error("accessToken is required for api delivery");
    return { type: "api", accessToken: input.accessToken, quota: input.quota };
  }
  if (type === "service") {
    const input = payload as { serviceQuota?: number; ticketId?: string };
    return { type: "service", serviceQuota: input.serviceQuota, ticketId: input.ticketId };
  }
  return undefined;
}

export * from "./resources/validators.js";
