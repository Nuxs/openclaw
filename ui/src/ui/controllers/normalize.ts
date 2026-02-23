/**
 * Shared normalization helpers for gateway RPC responses.
 * Avoids duplicating the same unwrap logic across controllers.
 */

/** Unwrap a gateway response: extract `.result` if present, validate object shape. */
export function normalizeGatewayPayload<T>(input: unknown): T | null {
  if (!input) {
    return null;
  }
  const payload = (input as { result?: unknown }).result ?? input;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload as T;
}
