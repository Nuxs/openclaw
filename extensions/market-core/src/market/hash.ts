import { createHash } from "node:crypto";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (isPlainObject(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function hashCanonical(value: unknown): string {
  const input = typeof value === "string" ? value : canonicalize(value);
  return `0x${createHash("sha256").update(input).digest("hex")}`;
}
