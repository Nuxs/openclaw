import type { Web3PluginConfig } from "../config.js";

type GatewayCallResult = {
  ok?: boolean;
  error?: string;
  result?: unknown;
};

type CallGatewayFn = (opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<unknown>;

async function loadCallGateway(): Promise<CallGatewayFn> {
  try {
    const mod = await import("../../../../src/gateway/call.ts");
    if (typeof mod.callGateway === "function") {
      return mod.callGateway as CallGatewayFn;
    }
  } catch {
    // ignore
  }

  // @ts-expect-error — dist fallback only exists after build; unreachable when src import succeeds
  const mod = await import("../../../../dist/gateway/call.js");
  if (typeof mod.callGateway !== "function") {
    throw new Error("callGateway is not available");
  }
  return mod.callGateway as CallGatewayFn;
}

function normalizeGatewayResult(payload: unknown): {
  ok: boolean;
  result?: unknown;
  error?: string;
} {
  if (payload && typeof payload === "object") {
    const record = payload as GatewayCallResult;
    if (record.ok === false) {
      return { ok: false, error: record.error ?? "gateway call failed" };
    }
    const result = "result" in record ? record.result : payload;
    return { ok: true, result };
  }
  return { ok: true, result: payload };
}

import { redactString, redactUnknown } from "../utils/redact.js";

type ResourceSummary = {
  total: number;
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  sampleIds: string[];
};

type LeaseSummary = {
  total: number;
  byStatus: Record<string, number>;
  sampleIds: string[];
};

type LedgerSummary = {
  summary?: unknown;
  recentCount?: number;
};

export type Web3MarketStatusProfile = "fast" | "deep";

export type Web3MarketStatusSummary = {
  meta: {
    profile: Web3MarketStatusProfile;
    stale?: boolean;
    staleAgeSec?: number;
    lastOkAtMs?: number;
  };
  runtime: {
    web3Status?: unknown;
    marketStatus?: unknown;
    resources?: ResourceSummary;
    leases?: LeaseSummary;
    ledger?: LedgerSummary;
    errors?: string[];
  };
};

type CachedRuntime = {
  at: number;
  runtime: Web3MarketStatusSummary["runtime"];
};

let lastOkRuntimeByProfile: Partial<Record<Web3MarketStatusProfile, CachedRuntime>> = {};

export function resetWeb3MarketStatusCacheForTests(): void {
  lastOkRuntimeByProfile = {};
}

function extractGatewayErrorMeta(err: unknown): {
  message: string;
  code?: string;
  status?: number;
} {
  if (err && typeof err === "object") {
    const record = err as {
      message?: unknown;
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      cause?: unknown;
    };

    const message =
      typeof record.message === "string"
        ? record.message
        : err instanceof Error
          ? err.message
          : String(err);

    const code = typeof record.code === "string" ? record.code : undefined;
    const status =
      typeof record.status === "number"
        ? record.status
        : typeof record.statusCode === "number"
          ? record.statusCode
          : undefined;

    if (code || status) {
      return { message, code, status };
    }

    if (record.cause && typeof record.cause === "object") {
      const cause = record.cause as { code?: unknown; status?: unknown; statusCode?: unknown };
      const causeCode = typeof cause.code === "string" ? cause.code : undefined;
      const causeStatus =
        typeof cause.status === "number"
          ? cause.status
          : typeof cause.statusCode === "number"
            ? cause.statusCode
            : undefined;
      if (causeCode || causeStatus) {
        return { message, code: causeCode, status: causeStatus };
      }
    }

    return { message };
  }

  return { message: err instanceof Error ? err.message : String(err) };
}

function isRetryableGatewayError(err: unknown): boolean {
  const meta = extractGatewayErrorMeta(err);
  const msg = meta.message.toLowerCase();

  if (typeof meta.status === "number") {
    if ([401, 403, 404].includes(meta.status)) {
      return false;
    }
    if ([429, 502, 503, 504].includes(meta.status)) {
      return true;
    }
  }

  if (typeof meta.code === "string") {
    const code = meta.code.toUpperCase();
    if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"].includes(code)) {
      return true;
    }
  }

  if (
    msg.includes("permission") ||
    msg.includes("unauthor") ||
    msg.includes("forbidden") ||
    msg.includes("invalid") ||
    msg.includes("unknown method") ||
    msg.includes("not found")
  ) {
    return false;
  }

  if (msg.includes("gateway timeout after")) {
    return true;
  }
  if (msg.includes("gateway closed (1006")) {
    return true;
  }

  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("socket hang up") ||
    msg.includes("temporarily") ||
    msg.includes("429") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryProbe<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= 2 || !isRetryableGatewayError(err)) {
        throw err;
      }
      const delay = 200 + Math.floor(Math.random() * 100);
      await sleep(delay);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function callGatewayMethod(
  config: Web3PluginConfig,
  method: string,
  params?: unknown,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const callGateway = await loadCallGateway();
  try {
    const response = await retryProbe(async () => {
      const raw = await callGateway({
        method,
        params,
        timeoutMs: config.brain.timeoutMs,
      });
      const normalized = normalizeGatewayResult(raw);
      if (!normalized.ok) {
        throw new Error(normalized.error ?? "gateway call failed");
      }
      return normalized.result;
    });
    return { ok: true, result: response };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, error: redactString(raw) };
  }
}

function countByStatus(items: Array<unknown>): Record<string, number> {
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

function countByKind(items: Array<unknown>): Record<string, number> {
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

export async function buildWeb3MarketStatusSummary(params: {
  config: Web3PluginConfig;
  profile?: Web3MarketStatusProfile;
  resourceLimit?: number;
  leaseLimit?: number;
  ledgerLimit?: number;
}): Promise<Web3MarketStatusSummary> {
  const profile: Web3MarketStatusProfile = params.profile ?? "fast";
  const resourceLimit = params.resourceLimit ?? 200;
  const leaseLimit = params.leaseLimit ?? 200;
  const ledgerLimit = params.ledgerLimit ?? 50;

  const errors: string[] = [];
  const runtime: Web3MarketStatusSummary["runtime"] = {};

  const web3StatusPromise = callGatewayMethod(params.config, "web3.status.summary", {});
  const marketStatusPromise = callGatewayMethod(params.config, "web3.market.status.summary", {});
  const ledgerSummaryPromise = callGatewayMethod(params.config, "web3.market.ledger.summary", {});

  const resourcesPromise =
    profile === "deep"
      ? callGatewayMethod(params.config, "web3.market.resource.list", { limit: resourceLimit })
      : null;
  const leasesPromise =
    profile === "deep"
      ? callGatewayMethod(params.config, "web3.market.lease.list", { limit: leaseLimit })
      : null;
  const ledgerListPromise =
    profile === "deep"
      ? callGatewayMethod(params.config, "web3.market.ledger.list", { limit: ledgerLimit })
      : null;

  const [web3StatusRes, marketStatusRes, ledgerSummaryRes, resourcesRes, leasesRes, ledgerListRes] =
    await Promise.all([
      web3StatusPromise,
      marketStatusPromise,
      ledgerSummaryPromise,
      resourcesPromise,
      leasesPromise,
      ledgerListPromise,
    ]);

  if (web3StatusRes.ok) {
    runtime.web3Status = redactUnknown(web3StatusRes.result);
  } else {
    errors.push(`web3.status.summary: ${web3StatusRes.error}`);
  }

  if (marketStatusRes.ok) {
    runtime.marketStatus = redactUnknown(marketStatusRes.result);
  } else {
    errors.push(`web3.market.status.summary: ${marketStatusRes.error}`);
  }

  if (resourcesRes && resourcesRes.ok) {
    const payload = resourcesRes.result as { resources?: Array<unknown> } | undefined;
    const resources = Array.isArray(payload?.resources) ? payload.resources : [];
    const sampleIds = resources
      .map((r) => (r && typeof r === "object" ? (r as { resourceId?: unknown }).resourceId : null))
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .slice(0, 3);
    runtime.resources = {
      total: resources.length,
      byStatus: countByStatus(resources),
      byKind: countByKind(resources),
      sampleIds,
    };
  } else if (resourcesRes && !resourcesRes.ok) {
    errors.push(`web3.market.resource.list: ${resourcesRes.error}`);
  }

  if (leasesRes && leasesRes.ok) {
    const payload = leasesRes.result as { leases?: Array<unknown> } | undefined;
    const leases = Array.isArray(payload?.leases) ? payload.leases : [];
    const sampleIds = leases
      .map((r) => (r && typeof r === "object" ? (r as { leaseId?: unknown }).leaseId : null))
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .slice(0, 3);
    runtime.leases = {
      total: leases.length,
      byStatus: countByStatus(leases),
      sampleIds,
    };
  } else if (leasesRes && !leasesRes.ok) {
    errors.push(`web3.market.lease.list: ${leasesRes.error}`);
  }

  const ledger: LedgerSummary = {};
  if (ledgerSummaryRes.ok) {
    ledger.summary = redactUnknown(ledgerSummaryRes.result);
  } else {
    errors.push(`web3.market.ledger.summary: ${ledgerSummaryRes.error}`);
  }
  if (ledgerListRes && ledgerListRes.ok) {
    const payload = ledgerListRes.result as { entries?: Array<unknown> } | undefined;
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    ledger.recentCount = entries.length;
  } else if (ledgerListRes && !ledgerListRes.ok) {
    errors.push(`web3.market.ledger.list: ${ledgerListRes.error}`);
  }
  if (Object.keys(ledger).length > 0) {
    runtime.ledger = ledger;
  }

  const cached = lastOkRuntimeByProfile[profile];

  // If any deep probe threw (retryProbe) it will reject the Promise.all above.
  // In that case we won't reach here; callers should handle that.
  // Here we only cache "all ok" results.
  if (errors.length === 0) {
    lastOkRuntimeByProfile[profile] = { at: Date.now(), runtime };
    return { meta: { profile }, runtime };
  }

  if (cached) {
    const now = Date.now();
    const staleAgeSec = Math.max(0, Math.floor((now - cached.at) / 1000));
    return {
      meta: { profile, stale: true, staleAgeSec, lastOkAtMs: cached.at },
      runtime: { ...cached.runtime, ...runtime, errors },
    };
  }

  runtime.errors = errors;
  return { meta: { profile }, runtime };
}

function formatCounts(counts: Record<string, number> | undefined): string {
  if (!counts) return "-";
  const parts = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return parts.length ? parts.join(", ") : "-";
}

export function formatWeb3MarketStatusMessage(summary: Web3MarketStatusSummary): string {
  const lines: string[] = [];

  const metaParts: string[] = [`profile=${summary.meta.profile}`];
  if (summary.meta.stale) {
    const age = typeof summary.meta.staleAgeSec === "number" ? `${summary.meta.staleAgeSec}s` : "?";
    metaParts.push(`stale=${age}`);
  }
  lines.push(`🧪 Probes: ${metaParts.join(" · ")}`);

  if (summary.runtime.web3Status !== undefined) {
    lines.push("🌐 Web3: ok");
  }
  if (summary.runtime.marketStatus !== undefined) {
    lines.push("🧺 Market: ok");
  }

  if (summary.runtime.resources) {
    lines.push(
      `📦 Resources: total=${summary.runtime.resources.total} · byKind(${formatCounts(summary.runtime.resources.byKind)}) · byStatus(${formatCounts(summary.runtime.resources.byStatus)})`,
    );
  }
  if (summary.runtime.leases) {
    lines.push(
      `🪪 Leases: total=${summary.runtime.leases.total} · byStatus(${formatCounts(summary.runtime.leases.byStatus)})`,
    );
  }
  if (summary.runtime.ledger) {
    const recent =
      typeof summary.runtime.ledger.recentCount === "number"
        ? `recent=${summary.runtime.ledger.recentCount}`
        : "";
    lines.push(`📒 Ledger: ${recent || "ok"}`.trim());
  }

  if (summary.runtime.errors && summary.runtime.errors.length > 0) {
    lines.push("⚠️ Some probes failed:");
    for (const err of summary.runtime.errors.slice(0, 3)) {
      lines.push(`- ${redactString(err)}`);
    }
  }

  return lines.join("\n");
}
