/**
 * MDL ingest pipeline — converts DiscoveryRecords into local store entries.
 *
 * Flow:
 *   DiscoveryRecord[] → verify signature → filter expired → convert to
 *   ResourceIndexEntry + P2pPeerRecord → upsert into Web3StateStore.
 *
 * Security: endpoint/meta/metadata are NEVER present on DiscoveryRecord;
 * the conversion explicitly sets them to undefined so they never leak into
 * the local index from network-sourced data.
 */

import { verifyIndexSignature } from "../resources/signature-verification.js";
import type { P2pPeerRecord, ResourceIndexEntry } from "../state/store.js";
import type { Web3StateStore } from "../state/store.js";
import type { DiscoveryRecord } from "./types.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type IngestOptions = {
  /** Skip cryptographic signature verification (dev/test only). */
  skipVerification?: boolean;
  /** Logger for warnings. Defaults to console.warn. */
  logger?: (msg: string) => void;
  /** Reference time for expiry checks. Defaults to Date.now(). */
  now?: number;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type IngestResult = {
  /** Number of records accepted and written to store. */
  accepted: number;
  /** Number of records rejected (bad sig, expired, etc.). */
  rejected: number;
  /** Rejection reasons keyed by providerId (for diagnostics). */
  rejections: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check whether a DiscoveryRecord has expired. */
function isExpired(record: DiscoveryRecord, now: number): boolean {
  if (!record.expiresAt) return false;
  const expiresMs = Date.parse(record.expiresAt);
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs <= now;
}

function getSignatureRejectionReason(record: DiscoveryRecord): string | undefined {
  if (!record.signature) {
    return "signature missing";
  }
  if (record.signature.payloadVersion !== 2) {
    return `payloadVersion must be 2 (got ${record.signature.payloadVersion ?? "missing"})`;
  }
  if (!record.peerId || record.peerId.trim().length === 0) {
    return "peerId missing";
  }
  return undefined;
}

/**
 * Convert a verified DiscoveryRecord into a ResourceIndexEntry.
 *
 * Security: endpoint/meta are explicitly omitted (set to undefined).
 * resources[].description and resources[].metadata are also omitted.
 */
function toResourceIndexEntry(record: DiscoveryRecord): ResourceIndexEntry {
  return {
    providerId: record.providerId,
    // endpoint is NEVER in DiscoveryRecord — omit entirely
    resources: record.resources.map((r) => {
      const out: Record<string, unknown> = {
        resourceId: r.resourceId,
        kind: r.kind,
      };
      if (r.label !== undefined) out.label = r.label;
      if (r.tags !== undefined) out.tags = r.tags;
      if (r.price !== undefined) out.price = r.price;
      if (r.unit !== undefined) out.unit = r.unit;
      // description and metadata intentionally omitted
      return out as ResourceIndexEntry["resources"][number];
    }),
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    // meta is NEVER in DiscoveryRecord — omit entirely
    signature: record.signature,
    // MDL-specific fields
    peerId: record.peerId,
    reachability: record.reachability,
  };
}

/** Convert a DiscoveryRecord into a P2pPeerRecord. */
function toP2pPeerRecord(record: DiscoveryRecord): P2pPeerRecord {
  return {
    peerId: record.peerId,
    transport: "dht",
    lastSeenAt: record.updatedAt,
    source: `mdl:${record.providerId}`,
  };
}

// ---------------------------------------------------------------------------
// Main ingest function
// ---------------------------------------------------------------------------

/**
 * Ingest an array of DiscoveryRecords into the local Web3StateStore.
 *
 * For each record:
 * 1. Skip if expired
 * 2. Verify v2 signature (unless skipVerification)
 * 3. Convert to ResourceIndexEntry + P2pPeerRecord
 * 4. Upsert both into store
 *
 * @param records - Records discovered from the network
 * @param store - Local state store
 * @param options - Optional ingest configuration
 * @returns Summary of accepted/rejected records
 */
export function ingestDiscoveryRecords(
  records: DiscoveryRecord[],
  store: Web3StateStore,
  options?: IngestOptions,
): IngestResult {
  const logger = options?.logger ?? console.warn;
  const now = options?.now ?? Date.now();
  const skip = options?.skipVerification ?? false;

  const result: IngestResult = {
    accepted: 0,
    rejected: 0,
    rejections: {},
  };

  for (const record of records) {
    const pid = record.providerId;

    // 1. Expiry check
    if (isExpired(record, now)) {
      result.rejected++;
      result.rejections[pid] = "expired";
      logger(`[mdl:ingest] Skipping expired record from ${pid}`);
      continue;
    }

    // 2. Signature version gate + cryptographic verification
    if (!skip) {
      const signatureError = getSignatureRejectionReason(record);
      if (signatureError) {
        result.rejected++;
        result.rejections[pid] = `signature: ${signatureError}`;
        logger(`[mdl:ingest] Signature verification failed for ${pid}: ${signatureError}`);
        continue;
      }

      // Build a temporary ResourceIndexEntry for verification
      const tempEntry = toResourceIndexEntry(record);
      const verification = verifyIndexSignature(tempEntry);
      if (!verification.valid) {
        result.rejected++;
        result.rejections[pid] = `signature: ${verification.reason}`;
        logger(`[mdl:ingest] Signature verification failed for ${pid}: ${verification.reason}`);
        continue;
      }
    }

    // 3. Convert and upsert
    const indexEntry = toResourceIndexEntry(record);
    const peerRecord = toP2pPeerRecord(record);

    store.upsertResourceIndex(indexEntry);
    store.upsertP2pPeer(peerRecord);

    result.accepted++;
  }

  return result;
}
