/**
 * Canonicalize & hash audit payloads.
 * - Redact sensitive fields before hashing
 * - Sort keys for deterministic JSON
 * - SHA-256 hex digest
 */

import { createHash } from "node:crypto";

const DEFAULT_REDACT = new Set(["apiKey", "token", "password", "secret", "privateKey"]);

/** Deep-clone an object, replacing values of redacted keys with "[REDACTED]". */
function redact(obj: unknown, redactFields: Set<string>): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((item) => redact(item, redactFields));
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      out[key] = redactFields.has(key) ? "[REDACTED]" : redact(value, redactFields);
    }
    return out;
  }
  return obj;
}

/** Produce a deterministic JSON string (sorted keys, deep). */
function canonicalJson(obj: unknown): string {
  const normalize = (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map((item) => normalize(item));
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, normalize(val)] as const);
      return Object.fromEntries(entries);
    }
    return value;
  };

  return JSON.stringify(normalize(obj));
}

/** Return a redacted payload for safe local/archival use. */
export function redactPayload(payload: unknown, extraRedactFields?: string[]): unknown {
  const fields = new Set([...DEFAULT_REDACT, ...(extraRedactFields ?? [])]);
  return redact(payload, fields);
}

/** SHA-256 hex hash of the canonical, redacted payload. */
export function hashPayload(payload: unknown, extraRedactFields?: string[]): string {
  const redacted = redactPayload(payload, extraRedactFields);
  const canonical = canonicalJson(redacted);
  return createHash("sha256").update(canonical).digest("hex");
}

/** SHA-256 hex hash of a raw string (for session id hashing etc). */
export function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
