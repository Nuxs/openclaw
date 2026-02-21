/**
 * Index signature verification utilities.
 * Consumer-side verification of provider-signed index entries.
 *
 * @see docs/plugins/web3-core-dev.md#index-signing
 */

import { createHash, createPublicKey, verify } from "node:crypto";
import type { IndexSignature, ResourceIndexEntry } from "../state/store.js";

/**
 * Build stable signature payload from index entry.
 * Must match the payload generation logic in indexer.ts
 */
function buildSignaturePayload(entry: Omit<ResourceIndexEntry, "signature">): string {
  function stableStringify(value: unknown): string {
    if (value === null || value === undefined) {
      return "null";
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys
        .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  return stableStringify({
    providerId: entry.providerId,
    endpoint: entry.endpoint ?? null,
    resources: entry.resources,
    meta: entry.meta ?? null,
    updatedAt: entry.updatedAt,
    expiresAt: entry.expiresAt ?? null,
    lastHeartbeatAt: entry.lastHeartbeatAt ?? null,
  });
}

/**
 * Verification result for index signature.
 */
export type IndexSignatureVerification = {
  /** Whether signature verification passed */
  valid: boolean;
  /** Reason for failure (if valid=false) */
  reason?: string;
};

/**
 * Verify the Ed25519 signature on a resource index entry.
 *
 * @param entry - The signed index entry to verify
 * @returns Verification result with valid flag and optional reason
 *
 * @example
 * ```typescript
 * const entry = store.getResourceIndex().find(e => e.providerId === "provider-1");
 * const result = verifyIndexSignature(entry);
 * if (!result.valid) {
 *   console.error("Invalid signature:", result.reason);
 * }
 * ```
 */
export function verifyIndexSignature(entry: ResourceIndexEntry): IndexSignatureVerification {
  // 1. Check if signature exists
  if (!entry.signature) {
    return { valid: false, reason: "signature missing" };
  }

  const sig = entry.signature;

  // 2. Validate signature structure
  if (sig.scheme !== "ed25519") {
    return { valid: false, reason: `unsupported signature scheme: ${sig.scheme}` };
  }

  if (!sig.publicKey || !sig.signature || !sig.payloadHash) {
    return {
      valid: false,
      reason: "incomplete signature (missing publicKey/signature/payloadHash)",
    };
  }

  try {
    // 3. Rebuild payload from entry
    const { signature: _, ...entryWithoutSig } = entry;
    const payload = buildSignaturePayload(entryWithoutSig);

    // 4. Verify payload hash matches
    const computedHash = createHash("sha256").update(payload).digest("hex");
    if (computedHash !== sig.payloadHash) {
      return {
        valid: false,
        reason: `payload hash mismatch (expected: ${sig.payloadHash}, got: ${computedHash})`,
      };
    }

    // 5. Import Ed25519 public key from SPKI DER (Base64)
    const publicKey = createPublicKey({
      key: Buffer.from(sig.publicKey, "base64"),
      format: "der",
      type: "spki",
    });

    // 6. Verify Ed25519 signature
    const signatureBuffer = Buffer.from(sig.signature, "base64");
    const payloadHashBuffer = Buffer.from(sig.payloadHash, "utf-8");
    const isValid = verify(null, payloadHashBuffer, publicKey, signatureBuffer);

    if (!isValid) {
      return {
        valid: false,
        reason: "signature verification failed (invalid cryptographic signature)",
      };
    }

    // 7. All checks passed
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      reason: `verification error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Verify multiple index entries and return only valid ones.
 * Invalid entries are filtered out with logged warnings.
 *
 * @param entries - Array of index entries to verify
 * @param options - Verification options
 * @returns Array of verified entries (invalid entries removed)
 *
 * @example
 * ```typescript
 * const entries = store.getResourceIndex();
 * const trusted = verifyIndexEntries(entries);
 * // Only entries with valid signatures are returned
 * ```
 */
export function verifyIndexEntries(
  entries: ResourceIndexEntry[],
  options?: {
    /** Whether to skip verification (dev mode) */
    skipVerification?: boolean;
    /** Logger function for warnings */
    logger?: (message: string) => void;
  },
): ResourceIndexEntry[] {
  if (options?.skipVerification) {
    return entries;
  }

  const logger = options?.logger ?? console.warn;

  return entries.filter((entry) => {
    const result = verifyIndexSignature(entry);
    if (!result.valid) {
      logger(
        `[web3-core] Index entry verification failed for provider ${entry.providerId}: ${result.reason}`,
      );
      return false;
    }
    return true;
  });
}
