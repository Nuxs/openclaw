/**
 * Shared helpers for capability catalog entries.
 */
import type { CapabilityAvailability } from "../types.js";

export function availability(enabled: boolean, reason?: string): CapabilityAvailability {
  return enabled ? { enabled } : { enabled, reason: reason ?? "disabled" };
}
