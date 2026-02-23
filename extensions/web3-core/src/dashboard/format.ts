/**
 * Dashboard formatting utilities: truncation, redaction, and layout helpers.
 * All outputs are paste-safe and follow web3-market redaction rules.
 */

import type { WalletBinding } from "../identity/types.js";
import { AlertLevel } from "../monitor/types.js";
import type { AlertEvent } from "../monitor/types.js";

/** Truncate EVM address: 0x1234…abcd */
export function truncateAddress(address: string): string {
  if (!address || !address.startsWith("0x") || address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Truncate tx hash: 0xabcd…1234 */
export function truncateTx(tx: string): string {
  if (!tx || !tx.startsWith("0x")) return tx;
  if (tx.length <= 14) return tx;
  return `${tx.slice(0, 8)}…${tx.slice(-4)}`;
}

/** Truncate CID: bafy…xyz */
export function truncateCid(cid: string): string {
  if (!cid || cid.length <= 16) return cid;
  return `${cid.slice(0, 8)}…${cid.slice(-4)}`;
}

/** Mask endpoint: hide real paths and hosts */
export function maskEndpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint) return undefined;
  try {
    const url = new URL(endpoint);
    // Keep protocol and partial host, mask path
    const hostParts = url.hostname.split(".");
    const maskedHost =
      hostParts.length > 2 ? `${hostParts[0]}…${hostParts[hostParts.length - 1]}` : url.hostname;
    return `${url.protocol}//${maskedHost}/***`;
  } catch {
    return "***masked***";
  }
}

/** Redact sensitive fields from any object recursively (shallow) */
export function redactSensitive<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const sensitiveKeys = new Set([
    "accessToken",
    "access_token",
    "token",
    "apiKey",
    "api_key",
    "secret",
    "privateKey",
    "private_key",
    "password",
    "authorization",
    "endpoint",
    "path",
    "stateDir",
    "filePath",
  ]);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.has(key)) {
      result[key] = "***REDACTED***";
    } else if (typeof value === "string" && value.length > 64) {
      // Likely a key or token
      result[key] = `${value.slice(0, 8)}…${value.slice(-4)}`;
    } else {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

/** Format wallet binding summary line */
export function formatWalletBinding(b: WalletBinding): string {
  const addr = truncateAddress(b.address);
  const ens = b.ensName ? ` (${b.ensName})` : "";
  return `• ${addr}${ens} — chain ${b.chainId}`;
}

/** Format credit/number with units */
export function formatCredits(n: number | string | undefined): string {
  if (n === undefined || n === null) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString();
}

/** Format alert level as emoji badge */
export function alertLevelBadge(level: AlertEvent["level"]): string {
  const map: Record<string, string> = {
    [AlertLevel.P0]: "🔴",
    [AlertLevel.P1]: "🟠",
    [AlertLevel.P2]: "🟡",
  };
  return map[level] ?? "⚪";
}

/** Format status indicator */
export function statusIndicator(ok: boolean): string {
  return ok ? "✅" : "⚠️";
}

/** Build a compact dashboard line */
export function buildStatLine(label: string, value: string, status?: boolean): string {
  const indicator = status !== undefined ? `${statusIndicator(status)} ` : "";
  return `${indicator}${label}: ${value}`;
}

/** Create a bordered section header */
export function sectionHeader(title: string): string {
  return `\n━━━ ${title} ━━━\n`;
}

/** Format "next actions" list */
export function formatNextActions(actions: string[]): string {
  if (actions.length === 0) return "";
  const lines = actions.map((a, i) => `${i + 1}. ${a}`);
  return `\n📋 Next:\n${lines.join("\n")}`;
}

/** Truncate list to max items with "+N more" hint */
export function truncateList<T>(items: T[], max = 3): { shown: T[]; more: number } {
  if (items.length <= max) return { shown: items, more: 0 };
  return { shown: items.slice(0, max), more: items.length - max };
}
