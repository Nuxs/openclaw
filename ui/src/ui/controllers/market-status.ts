import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  MarketDispute,
  MarketLedgerEntry,
  MarketLedgerSummary,
  MarketLease,
  MarketMetricsSnapshot,
  MarketResource,
  MarketStatusSummary,
} from "../types.ts";

type MarketStatusState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  marketLoading: boolean;
  marketError: string | null;
  marketStatus: MarketStatusSummary | null;
  marketMetrics: MarketMetricsSnapshot | null;
  marketResources: MarketResource[];
  marketLeases: MarketLease[];
  marketLedgerSummary: MarketLedgerSummary | null;
  marketLedgerEntries: MarketLedgerEntry[];
  marketDisputes: MarketDispute[];
  marketLastSuccess: number | null;
};

export async function loadMarketStatus(state: MarketStatusState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.marketLoading) {
    return;
  }
  state.marketLoading = true;
  state.marketError = null;

  try {
    const [
      statusRes,
      metricsRes,
      resourcesRes,
      leasesRes,
      ledgerRes,
      ledgerEntriesRes,
      disputesRes,
    ] = await Promise.allSettled([
      state.client.request("web3.market.status.summary", {}),
      state.client.request("web3.market.metrics.snapshot", {}),
      state.client.request("web3.market.resource.list", { limit: 200 }),
      state.client.request("web3.market.lease.list", { limit: 50 }),
      state.client.request("web3.market.ledger.summary", {}),
      state.client.request("web3.market.ledger.list", { limit: 50 }),
      state.client.request("web3.market.dispute.list", { limit: 50 }),
    ]);

    const errors: string[] = [];
    let anySuccess = false;

    if (statusRes.status === "fulfilled") {
      state.marketStatus = normalizePayload<MarketStatusSummary>(statusRes.value);
      anySuccess = true;
    } else {
      errors.push(String(statusRes.reason ?? "Failed to load market status"));
    }

    if (metricsRes.status === "fulfilled") {
      state.marketMetrics = normalizePayload<MarketMetricsSnapshot>(metricsRes.value);
      anySuccess = true;
    } else {
      errors.push(String(metricsRes.reason ?? "Failed to load market metrics"));
    }

    if (resourcesRes.status === "fulfilled") {
      const payload = normalizePayload<{ resources?: MarketResource[] }>(resourcesRes.value);
      state.marketResources = payload?.resources ?? [];
      anySuccess = true;
    } else {
      errors.push(String(resourcesRes.reason ?? "Failed to load market resources"));
    }

    if (leasesRes.status === "fulfilled") {
      const payload = normalizePayload<{ leases?: MarketLease[] }>(leasesRes.value);
      state.marketLeases = payload?.leases ?? [];
      anySuccess = true;
    } else {
      errors.push(String(leasesRes.reason ?? "Failed to load market leases"));
    }

    if (ledgerRes.status === "fulfilled") {
      const payload = normalizePayload<{ summary?: MarketLedgerSummary }>(ledgerRes.value);
      state.marketLedgerSummary = payload?.summary ?? null;
      anySuccess = true;
    } else {
      errors.push(String(ledgerRes.reason ?? "Failed to load market ledger"));
    }

    if (ledgerEntriesRes.status === "fulfilled") {
      const payload = normalizePayload<{ entries?: MarketLedgerEntry[] }>(ledgerEntriesRes.value);
      state.marketLedgerEntries = payload?.entries ?? [];
      anySuccess = true;
    } else {
      errors.push(String(ledgerEntriesRes.reason ?? "Failed to load market ledger entries"));
    }

    if (disputesRes.status === "fulfilled") {
      const payload = normalizePayload<{ disputes?: MarketDispute[] }>(disputesRes.value);
      state.marketDisputes = payload?.disputes ?? [];
      anySuccess = true;
    } else {
      errors.push(String(disputesRes.reason ?? "Failed to load market disputes"));
    }

    if (errors.length > 0) {
      state.marketError = errors[0];
    }
    if (anySuccess) {
      state.marketLastSuccess = Date.now();
    }
  } catch (err) {
    state.marketError = String(err);
  } finally {
    state.marketLoading = false;
  }
}

function normalizePayload<T>(input: unknown): T | null {
  if (!input) {
    return null;
  }
  const payload = (input as { result?: unknown }).result ?? input;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload as T;
}
