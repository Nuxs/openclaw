import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Web3PluginConfig } from "../config.js";
import type { IndexedResource, ResourceIndexEntry } from "../state/store.js";
import { Web3StateStore } from "../state/store.js";

const DEFAULT_TTL_MS = 10 * 60_000;
const MAX_LIMIT = 500;

function requireResourcesEnabled(config: Web3PluginConfig) {
  if (!config.resources.enabled) {
    throw new Error("resources is disabled");
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function parseLimit(input: unknown): number | undefined {
  if (typeof input !== "number" || Number.isNaN(input)) return undefined;
  if (input <= 0) return undefined;
  return Math.min(Math.floor(input), MAX_LIMIT);
}

function filterExpired(entries: ResourceIndexEntry[], now = Date.now()): ResourceIndexEntry[] {
  return entries.filter((entry) => {
    if (!entry.expiresAt) return true;
    const expiresAt = Date.parse(entry.expiresAt);
    if (Number.isNaN(expiresAt)) return true;
    return expiresAt > now;
  });
}

function filterResources(
  resources: IndexedResource[],
  filters: { kind?: string; tag?: string },
): IndexedResource[] {
  let list = resources;
  if (filters.kind) {
    list = list.filter((resource) => resource.kind === filters.kind);
  }
  if (filters.tag) {
    list = list.filter((resource) => resource.tags?.includes(filters.tag ?? ""));
  }
  return list;
}

function buildEntry(params: {
  providerId: string;
  endpoint?: string;
  resources: IndexedResource[];
  ttlMs?: number;
  meta?: Record<string, unknown>;
}): ResourceIndexEntry {
  const updatedAt = new Date().toISOString();
  const ttlMs =
    typeof params.ttlMs === "number" && params.ttlMs > 0 ? params.ttlMs : DEFAULT_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  return {
    providerId: params.providerId,
    endpoint: params.endpoint?.trim() || undefined,
    resources: params.resources,
    updatedAt,
    expiresAt,
    meta: params.meta,
  };
}

export function createResourceIndexReportHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const providerId = requireString(input.providerId, "providerId");
      const endpoint = typeof input.endpoint === "string" ? input.endpoint.trim() : undefined;
      const ttlMs = typeof input.ttlMs === "number" ? input.ttlMs : undefined;
      const meta = (input.meta ?? undefined) as Record<string, unknown> | undefined;
      const resources = Array.isArray(input.resources)
        ? (input.resources as IndexedResource[]).filter((item) => item && item.resourceId)
        : [];

      const existing = store.getResourceIndex().find((entry) => entry.providerId === providerId);
      const resolvedResources = resources.length > 0 ? resources : (existing?.resources ?? []);

      const entry = buildEntry({ providerId, endpoint, resources: resolvedResources, ttlMs, meta });
      store.upsertResourceIndex(entry);
      respond(true, { providerId, updatedAt: entry.updatedAt, expiresAt: entry.expiresAt });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createResourceIndexListHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      requireResourcesEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const providerId = typeof input.providerId === "string" ? input.providerId.trim() : undefined;
      const kind = typeof input.kind === "string" ? input.kind.trim() : undefined;
      const tag = typeof input.tag === "string" ? input.tag.trim() : undefined;
      const limit = parseLimit(input.limit);

      let entries = filterExpired(store.getResourceIndex());
      if (providerId) {
        entries = entries.filter((entry) => entry.providerId === providerId);
      }

      let total = 0;
      const filtered = entries
        .map((entry) => {
          const resources = filterResources(entry.resources, { kind, tag });
          if (resources.length === 0) return null;
          let trimmed = resources;
          if (typeof limit === "number") {
            const remaining = Math.max(limit - total, 0);
            trimmed = resources.slice(0, remaining);
            total += trimmed.length;
          }
          return { ...entry, resources: trimmed };
        })
        .filter((entry): entry is ResourceIndexEntry => Boolean(entry));

      respond(true, {
        entries: filtered,
        total: filtered.reduce((sum, entry) => sum + entry.resources.length, 0),
      });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}
