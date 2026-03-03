/**
 * MDL v2 signature payload construction and signing.
 *
 * v2 extends the existing v1 payload with peerId, reachability, and
 * payloadVersion fields. The v1 payload (buildSignaturePayload in
 * signature-verification.ts) is NOT modified.
 */

import { createHash, createPrivateKey, sign } from "node:crypto";
import type { IndexSignature, ResourceIndexEntry } from "../state/store.js";
import type { Reachability } from "./types.js";

// ---------------------------------------------------------------------------
// stableStringify — identical to the one in signature-verification.ts
// Duplicated here to avoid coupling; both implementations MUST produce
// the exact same output for the same input.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// v2 payload builder
// ---------------------------------------------------------------------------

/** Fields expected on the entry for v2 payload construction. */
export type SignableV2Entry = Omit<ResourceIndexEntry, "signature"> & {
  peerId: string;
  reachability: Reachability;
};

/**
 * Build the v2 signature payload.
 *
 * Includes all v1 fields PLUS peerId, reachability, payloadVersion.
 * Sorted-key deterministic serialization ensures reproducibility.
 */
export function buildSignaturePayloadV2(entry: SignableV2Entry): string {
  return stableStringify({
    providerId: entry.providerId,
    endpoint: entry.endpoint ?? null,
    resources: entry.resources,
    meta: entry.meta ?? null,
    updatedAt: entry.updatedAt,
    expiresAt: entry.expiresAt ?? null,
    lastHeartbeatAt: entry.lastHeartbeatAt ?? null,
    // ---- v2 additions ----
    peerId: entry.peerId,
    reachability: entry.reachability,
    payloadVersion: 2,
  });
}

// ---------------------------------------------------------------------------
// v2 signer
// ---------------------------------------------------------------------------

/**
 * Sign an index entry using the v2 payload schema.
 *
 * @param entry - Entry data (must include peerId and reachability)
 * @param privateKeyDer - Ed25519 private key in PKCS#8 DER format (base64)
 * @param publicKeyDer - Ed25519 public key in SPKI DER format (base64)
 * @returns IndexSignature with payloadVersion: 2
 */
export function signEntryV2(
  entry: SignableV2Entry,
  privateKeyDer: string,
  publicKeyDer: string,
): IndexSignature & { payloadVersion: 2 } {
  const payload = buildSignaturePayloadV2(entry);
  const payloadHash = createHash("sha256").update(payload).digest("hex");

  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyDer, "base64"),
    format: "der",
    type: "pkcs8",
  });

  const signatureBuffer = sign(null, Buffer.from(payloadHash, "utf-8"), privateKey);

  return {
    scheme: "ed25519",
    publicKey: publicKeyDer,
    signature: signatureBuffer.toString("base64"),
    payloadHash,
    signedAt: new Date().toISOString(),
    payloadVersion: 2,
  };
}
