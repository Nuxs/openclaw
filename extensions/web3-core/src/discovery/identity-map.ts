import type { DiscoveryRecord } from "./types.js";

export type DiscoveryIdentityMapEntry = {
  providerId: string;
  peerId: string;
  actorId: string;
  did?: string;
  publicKey?: string;
  updatedAt: string;
};

function normalizeOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveActorId(record: DiscoveryRecord): string {
  const did = normalizeOptional(record.identity?.did);
  if (did) return did;
  const actorId = normalizeOptional(record.identity?.actorId);
  if (actorId) return actorId;
  return `provider:${record.providerId}`;
}

export function buildDiscoveryIdentityMapEntry(
  record: DiscoveryRecord,
): DiscoveryIdentityMapEntry | undefined {
  const providerId = normalizeOptional(record.providerId);
  const peerId = normalizeOptional(record.peerId);
  if (!providerId || !peerId) return undefined;
  return {
    providerId,
    peerId,
    actorId: resolveActorId(record),
    did: normalizeOptional(record.identity?.did),
    publicKey: normalizeOptional(record.signature?.publicKey),
    updatedAt: record.updatedAt,
  };
}
