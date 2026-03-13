/**
 * Shared utility helpers for market handlers and market-status.
 *
 * Extracted to eliminate duplicate `countByStatus` / `countByKind` definitions.
 */

/**
 * Group items by their `status` field and return per-status counts.
 * Handles both typed objects and loosely-typed data (runtime-safe).
 */
export function countByStatus(items: Array<unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const status =
      item && typeof item === "object" && typeof (item as { status?: unknown }).status === "string"
        ? ((item as { status?: string }).status ?? "unknown")
        : "unknown";
    out[status] = (out[status] ?? 0) + 1;
  }
  return out;
}

/**
 * Group items by their `kind` field and return per-kind counts.
 * Handles both typed objects and loosely-typed data (runtime-safe).
 */
export function countByKind(items: Array<unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const kind =
      item && typeof item === "object" && typeof (item as { kind?: unknown }).kind === "string"
        ? ((item as { kind?: string }).kind ?? "unknown")
        : "unknown";
    out[kind] = (out[kind] ?? 0) + 1;
  }
  return out;
}
