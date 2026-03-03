/**
 * MDL namespace / key construction utilities.
 *
 * DHT key format:   <prefix>/<kind>/<sha256(resourceId)>
 * Rendezvous NS:    openclaw:market:<kind>
 */

import { createHash } from "node:crypto";
import type { IndexedResourceKind } from "../state/store.js";

/** Default DHT key prefix. */
export const DEFAULT_DHT_KEY_PREFIX = "/openclaw/resource";

/** Valid resource kinds (used for input validation). */
const VALID_KINDS = new Set<string>(["model", "search", "storage"]);

// ---------------------------------------------------------------------------
// DHT key
// ---------------------------------------------------------------------------

/**
 * Build a DHT provider-record key for a specific resource.
 *
 * @param kind - Resource kind (model / search / storage)
 * @param resourceId - Unique resource identifier
 * @param prefix - DHT key prefix (default: /openclaw/resource)
 * @returns Key string, e.g. `/openclaw/resource/model/a1b2c3...`
 */
export function buildDhtKey(
  kind: IndexedResourceKind,
  resourceId: string,
  prefix = DEFAULT_DHT_KEY_PREFIX,
): string {
  if (!kind || !VALID_KINDS.has(kind)) {
    throw new Error(`buildDhtKey: invalid kind "${String(kind)}"`);
  }
  if (!resourceId || typeof resourceId !== "string" || resourceId.trim().length === 0) {
    throw new Error("buildDhtKey: resourceId is required");
  }
  const hash = createHash("sha256").update(resourceId.trim()).digest("hex");
  return `${prefix}/${kind}/${hash}`;
}

/**
 * Parse a DHT key back into its components.
 *
 * @param key - Full DHT key string
 * @param prefix - Expected prefix (default: /openclaw/resource)
 * @returns Parsed components or null if the key doesn't match the expected format
 */
export function parseDhtKey(
  key: string,
  prefix = DEFAULT_DHT_KEY_PREFIX,
): { kind: IndexedResourceKind; resourceIdHash: string } | null {
  if (!key || typeof key !== "string") return null;
  const expectedStart = `${prefix}/`;
  if (!key.startsWith(expectedStart)) return null;

  const rest = key.slice(expectedStart.length);
  const slashIdx = rest.indexOf("/");
  if (slashIdx === -1) return null;

  const kind = rest.slice(0, slashIdx);
  const resourceIdHash = rest.slice(slashIdx + 1);

  if (!VALID_KINDS.has(kind)) return null;
  if (!resourceIdHash || resourceIdHash.length === 0) return null;

  return { kind: kind as IndexedResourceKind, resourceIdHash };
}

// ---------------------------------------------------------------------------
// Rendezvous namespace
// ---------------------------------------------------------------------------

/**
 * Build a Rendezvous namespace for aggregate discovery by resource kind.
 *
 * @param kind - Resource kind (model / search / storage)
 * @returns Namespace string, e.g. `openclaw:market:model`
 */
export function buildRendezvousNs(kind: IndexedResourceKind): string {
  if (!kind || !VALID_KINDS.has(kind)) {
    throw new Error(`buildRendezvousNs: invalid kind "${String(kind)}"`);
  }
  return `openclaw:market:${kind}`;
}

/**
 * Parse a Rendezvous namespace back into its kind.
 *
 * @param ns - Rendezvous namespace string
 * @returns Resource kind or null if format is invalid
 */
export function parseRendezvousNs(ns: string): IndexedResourceKind | null {
  if (!ns || typeof ns !== "string") return null;
  const prefix = "openclaw:market:";
  if (!ns.startsWith(prefix)) return null;
  const kind = ns.slice(prefix.length);
  if (!VALID_KINDS.has(kind)) return null;
  return kind as IndexedResourceKind;
}
