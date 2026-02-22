/**
 * Shared redaction utilities for sensitive data.
 * Used by tools.ts, market-tools.ts, market-status.ts, and errors.ts.
 */

export const REDACTED = "[REDACTED]";
export const REDACTED_ENDPOINT = "[REDACTED_ENDPOINT]";

export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "accesstoken",
  "refreshtoken",
  "token",
  "apikey",
  "secret",
  "password",
  "privatekey",
  "endpoint",
  "providerendpoint",
  "downloadurl",
  "rpcurl",
  "dbpath",
  "storepath",
]);

/**
 * Redact sensitive patterns from a string:
 * - tok_ prefixed identifiers (e.g. tok_abc123)
 * - Bearer tokens
 * - URLs (may contain infrastructure info)
 * - JWT tokens
 * - User home directory paths
 */
export function redactString(input: string): string {
  // Redact tok_ prefixed tokens (requires underscore: tok_xxx)
  const tokenRedacted = input.replace(/\btok_[\w-]+\b/gi, "tok_***");
  const bearerRedacted = tokenRedacted.replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]");
  const urlRedacted = bearerRedacted.replace(/https?:\/\/[^\s)\]]+/gi, REDACTED_ENDPOINT);
  const jwtRedacted = urlRedacted.replace(
    /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    "[TOKEN]",
  );
  return jwtRedacted.replace(/\/(Users|home)\/[A-Za-z0-9._-]+\//g, "~/");
}

/**
 * Recursively redact unknown values:
 * - Strings go through redactString
 * - Object keys matching SENSITIVE_KEYS are fully redacted
 * - Arrays are mapped recursively
 */
export function redactUnknown(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknown(entry));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const lowered = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowered)) {
        out[key] = REDACTED;
        continue;
      }
      out[key] = redactUnknown(raw);
    }
    return out;
  }
  return String(value);
}
