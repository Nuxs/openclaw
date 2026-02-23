/**
 * Web3 status scanning — overlay for status.scan.ts
 *
 * Keeps web3-specific types, normalisation, and gateway calls out
 * of the upstream status scanner to minimise merge conflicts.
 */

import { callGateway } from "../gateway/call.js";

export type Web3StatusScanSummary = {
  auditEventsRecent: number;
  auditLastAt: string | null;
  archiveProvider: string | null;
  archiveLastCid: string | null;
  anchorNetwork: string | null;
  anchorLastTx: string | null;
  pendingAnchors: number;
  anchoringEnabled: boolean;
  brain?: {
    source: "web3/decentralized" | "centralized" | null;
    provider: string | null;
    model: string | null;
    availability: "ok" | "degraded" | "unavailable" | null;
  };
  billing?: {
    status: "active" | "exhausted" | "unbound";
    credits: number;
  };
  settlement?: {
    pending: number;
  };
};

export function normalizeWeb3Summary(input: unknown): Web3StatusScanSummary | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const payload = (input as { result?: unknown }).result ?? input;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload as Web3StatusScanSummary;
}

export type Web3ScanResult = {
  web3: Web3StatusScanSummary | null;
  web3Error: string | null;
};

/**
 * Fetch web3 status from gateway. Returns null/error if gateway
 * is unreachable or the web3 plugin is disabled.
 */
export async function scanWeb3Status(opts: {
  gatewayReachable: boolean;
  timeoutMs?: number;
  all?: boolean;
}): Promise<Web3ScanResult> {
  if (!opts.gatewayReachable) {
    return { web3: null, web3Error: null };
  }
  try {
    const res = await callGateway({
      method: "web3.status.summary",
      params: {},
      timeoutMs: Math.min(opts.all ? 5000 : 2500, opts.timeoutMs ?? 10_000),
    });
    return { web3: normalizeWeb3Summary(res), web3Error: null };
  } catch (err) {
    return { web3: null, web3Error: String(err) };
  }
}
