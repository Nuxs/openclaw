import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  BridgeRoutesSnapshot,
  BridgeTransfer,
  ConsentView,
  MarketDispute,
  MarketLedgerEntry,
  MarketLedgerSummary,
  MarketLease,
  MarketMetricsSnapshot,
  MarketOpsSummary,
  MarketPresetVerification,
  MarketPrivacySummary,
  MarketReputationSummary,
  MarketResource,
  MarketStatusSummary,
  MarketTaskSummary,
  OpsAlertView,
  OpsHealthProbe,
  PrivacyAssetView,
  PrivacyReplayView,
  TaskBidView,
  TaskOrderView,
  TaskReceiptView,
  TaskResultView,
  TokenEconomyState,
  Web3IndexEntry,
  Web3IndexStats,
  Web3MonitorSnapshot,
} from "../types.ts";

type MarketStatusState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  marketLoading: boolean;
  marketError: string | null;
  marketStatus: MarketStatusSummary | null;
  marketMetrics: MarketMetricsSnapshot | null;
  marketIndexEntries: Web3IndexEntry[];
  marketIndexStats: Web3IndexStats | null;
  marketMonitor: Web3MonitorSnapshot | null;
  marketResources: MarketResource[];
  marketLeases: MarketLease[];
  marketLedgerSummary: MarketLedgerSummary | null;
  marketLedgerEntries: MarketLedgerEntry[];
  marketDisputes: MarketDispute[];
  marketReputation: MarketReputationSummary | null;
  marketTokenEconomy: TokenEconomyState | null;
  marketBridgeRoutes: BridgeRoutesSnapshot | null;
  marketBridgeTransfers: BridgeTransfer[];
  marketLastSuccess: number | null;
};

export async function loadMarketStatus(state: MarketStatusState & { hello?: unknown }) {
  if (!state.client || !state.connected || state.marketLoading) {
    return;
  }
  state.marketLoading = true;
  state.marketError = null;

  const hello = state.hello as { features?: { methods?: unknown } } | undefined;
  const methods = Array.isArray(hello?.features?.methods) ? hello.features.methods : null;
  const requiredMethods = [
    "web3.market.status.summary",
    "web3.market.metrics.snapshot",
    "web3.index.list",
    "web3.index.stats",
    "web3.monitor.snapshot",
  ];
  if (methods) {
    const available = new Set<string>(methods.filter((m): m is string => typeof m === "string"));
    const missing = requiredMethods.filter((m) => !available.has(m));
    if (missing.length > 0) {
      state.marketError = `市场 API 未就绪：缺少 ${missing.join(", ")}。请启用/升级 web3-core 后重试。`;
      state.marketLoading = false;
      return;
    }
  }

  try {
    const [
      status,
      metrics,
      indexList,
      indexStats,
      monitor,
      resources,
      leases,
      ledgerSummary,
      ledgerEntries,
      disputes,
      reputation,
      tokenEconomy,
      bridgeRoutes,
      bridgeTransfers,
    ] = await Promise.all([
      state.client.request<MarketStatusSummary>("web3.market.status.summary", {}),
      state.client.request<MarketMetricsSnapshot>("web3.market.metrics.snapshot", {}),
      state.client.request<{ entries?: unknown[] }>("web3.index.list", { limit: 200 }),
      state.client.request<Web3IndexStats>("web3.index.stats", {}),
      state.client.request<Web3MonitorSnapshot>("web3.monitor.snapshot", {}),
      state.client.request<{ resources?: unknown[] }>("web3.market.resource.list", { limit: 200 }),
      state.client.request<{ leases?: unknown[] }>("web3.market.lease.list", { limit: 200 }),
      state.client.request<MarketLedgerSummary>("web3.market.ledger.summary", {}),
      state.client.request<{ entries?: unknown[] }>("web3.market.ledger.list", { limit: 200 }),
      state.client.request<{ disputes?: unknown[] }>("web3.market.dispute.list", { limit: 200 }),
      state.client.request<MarketReputationSummary>("web3.market.reputation.summary", {}),
      state.client.request<TokenEconomyState>("web3.market.tokenEconomy.summary", {}),
      state.client.request<BridgeRoutesSnapshot>("web3.market.bridge.routes", {}),
      state.client.request<{ transfers?: unknown[] }>("web3.market.bridge.transfers", {
        limit: 100,
      }),
    ]);

    state.marketStatus = normalizePayload<MarketStatusSummary>(status);
    state.marketMetrics = normalizePayload<MarketMetricsSnapshot>(metrics);
    state.marketIndexEntries = normalizeListPayload<Web3IndexEntry>(indexList, "entries");
    state.marketIndexStats = normalizePayload<Web3IndexStats>(indexStats);
    state.marketMonitor = normalizePayload<Web3MonitorSnapshot>(monitor);
    state.marketResources = normalizeListPayload<MarketResource>(resources, "resources");
    state.marketLeases = normalizeListPayload<MarketLease>(leases, "leases");
    state.marketLedgerSummary = normalizePayload<MarketLedgerSummary>(ledgerSummary);
    state.marketLedgerEntries = normalizeListPayload<MarketLedgerEntry>(ledgerEntries, "entries");
    state.marketDisputes = normalizeListPayload<MarketDispute>(disputes, "disputes");
    state.marketReputation = normalizePayload<MarketReputationSummary>(reputation);
    state.marketTokenEconomy = normalizePayload<TokenEconomyState>(tokenEconomy);
    state.marketBridgeRoutes = normalizePayload<BridgeRoutesSnapshot>(bridgeRoutes);
    state.marketBridgeTransfers = normalizeListPayload<BridgeTransfer>(
      bridgeTransfers,
      "transfers",
    );
    state.marketLastSuccess = Date.now();
  } catch (error) {
    state.marketError = String(error);
  } finally {
    state.marketLoading = false;
  }
}

type TaskState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  taskLoading: boolean;
  taskError: string | null;
  taskSummary: MarketTaskSummary | null;
  taskOrders: TaskOrderView[];
  taskBids: TaskBidView[];
  taskResults: TaskResultView[];
  taskReceipts: TaskReceiptView[];
};

export async function loadMarketTasks(state: TaskState) {
  if (!state.client || !state.connected || state.taskLoading) {
    return;
  }
  state.taskLoading = true;
  state.taskError = null;
  try {
    const [summary, orders, bids, results, receipts] = await Promise.all([
      state.client.request<MarketTaskSummary>("web3.market.task.summary", {}),
      state.client.request<{ tasks?: unknown[] }>("web3.market.task.list", { limit: 100 }),
      state.client.request<{ bids?: unknown[] }>("web3.market.bid.list", { limit: 100 }),
      state.client.request<{ results?: unknown[] }>("web3.market.result.list", { limit: 100 }),
      state.client.request<{ receipts?: unknown[] }>("web3.market.receipt.list", { limit: 100 }),
    ]);

    state.taskSummary = normalizePayload<MarketTaskSummary>(summary);
    state.taskOrders = normalizeListPayload<TaskOrderView>(orders, "tasks");
    state.taskBids = normalizeListPayload<TaskBidView>(bids, "bids");
    state.taskResults = normalizeListPayload<TaskResultView>(results, "results");
    state.taskReceipts = normalizeListPayload<TaskReceiptView>(receipts, "receipts");
  } catch (error) {
    state.taskError = String(error);
  } finally {
    state.taskLoading = false;
  }
}

type PrivacyState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  privacyLoading: boolean;
  privacySummary: MarketPrivacySummary | null;
  privacyConsents: ConsentView[];
  privacyAssets: PrivacyAssetView[];
  privacyReplays: PrivacyReplayView[];
};

export async function loadMarketPrivacy(state: PrivacyState) {
  if (!state.client || !state.connected || state.privacyLoading) {
    return;
  }
  state.privacyLoading = true;
  try {
    const [summary, consents, assets, replays] = await Promise.all([
      state.client.request<MarketPrivacySummary>("web3.market.privacy.summary", {}),
      state.client.request<{ consents?: unknown[] }>("web3.market.consent.list", { limit: 100 }),
      state.client.request<{ assets?: unknown[] }>("web3.market.asset.list", { limit: 100 }),
      state.client.request<{ replays?: unknown[] }>("web3.market.replay.list", { limit: 100 }),
    ]);

    state.privacySummary = normalizePayload<MarketPrivacySummary>(summary);
    state.privacyConsents = normalizeListPayload<ConsentView>(consents, "consents");
    state.privacyAssets = normalizeListPayload<PrivacyAssetView>(assets, "assets");
    state.privacyReplays = normalizeListPayload<PrivacyReplayView>(replays, "replays");
  } finally {
    state.privacyLoading = false;
  }
}

export type MarketOpsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  opsLoading: boolean;
  opsSummary: MarketOpsSummary | null;
  opsAlerts: OpsAlertView[];
};

export async function loadMarketOps(state: MarketOpsState) {
  if (!state.client || !state.connected || state.opsLoading) {
    return;
  }
  state.opsLoading = true;
  try {
    const [health, alerts, preset] = await Promise.all([
      state.client.request<MonitorHealthResponse>("web3.monitor.health", {}),
      state.client.request<{ alerts?: unknown[] }>("web3.monitor.alerts.list", {
        activeOnly: false,
        limit: 100,
      }),
      state.client.request<MarketPresetVerification>("web3.market.preset.verify", {}),
    ]);

    const normalizedAlerts = normalizeListPayload<OpsAlertView>(alerts, "alerts");
    const normalizedHealth = normalizePayload<MonitorHealthResponse>(health);
    const normalizedPreset = normalizePayload<MarketPresetVerification>(preset);
    const activeAlerts = normalizedAlerts.filter((alert) => alert.status !== "resolved");
    const hasActiveAlerts = activeAlerts.length > 0;
    const monitorStatus = mapMonitorStatus(
      normalizedHealth?.status,
      normalizedHealth?.healthy,
      hasActiveAlerts,
    );
    const observedAt = new Date().toISOString();
    const healthProbes: OpsHealthProbe[] = [
      {
        name: "monitor",
        status: monitorStatus,
        lastCheck: normalizedHealth?.lastActivity ?? observedAt,
        details: formatMonitorDetails(normalizedHealth),
      },
      {
        name: "discovery",
        status:
          normalizedPreset?.metrics.discoveryEnabled === false
            ? "degraded"
            : normalizedPreset?.healthy
              ? "healthy"
              : "degraded",
        lastCheck: observedAt,
        details: normalizedPreset?.summary,
      },
      {
        name: "payment",
        status: normalizedHealth?.healthy === false ? "degraded" : "healthy",
        lastCheck: normalizedHealth?.lastActivity ?? observedAt,
        details: hasActiveAlerts ? `${activeAlerts.length} active alerts` : undefined,
      },
      {
        name: "settlement",
        status: normalizedPreset?.healthy ? "healthy" : "degraded",
        lastCheck: observedAt,
        details: formatPresetDetails(normalizedPreset),
      },
    ];

    state.opsSummary = {
      activeAlerts: activeAlerts.length,
      alertsByLevel: countAlertsByLevel(normalizedAlerts),
      healthProbes,
      discoveryHealthy: normalizedPreset?.metrics.discoveryEnabled ?? false,
      paymentHealthy: normalizedHealth?.healthy ?? false,
      settlementHealthy: normalizedPreset?.healthy ?? false,
      preset: normalizedPreset,
    };
    state.opsAlerts = normalizedAlerts;
  } finally {
    state.opsLoading = false;
  }
}

type MonitorHealthResponse = {
  status?: "healthy" | "degraded" | "down";
  healthy?: boolean;
  criticalAlerts?: number;
  lastActivity?: string;
};

function normalizePayload<T>(payload: unknown): T | null {
  const value = unwrapResult(payload);
  return value && typeof value === "object" ? (value as T) : null;
}

function normalizeListPayload<T>(payload: unknown, key: string): T[] {
  const value = unwrapResult(payload);
  if (!value || typeof value !== "object") {
    return [];
  }
  const list = (value as Record<string, unknown>)[key];
  return Array.isArray(list) ? (list as T[]) : [];
}

function unwrapResult(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "result" in payload) {
    return (payload as { result?: unknown }).result ?? null;
  }
  return payload;
}

function countAlertsByLevel(alerts: OpsAlertView[]): Record<string, number> {
  return alerts.reduce<Record<string, number>>((acc, alert) => {
    const key = alert.level ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function mapMonitorStatus(
  status: MonitorHealthResponse["status"],
  healthy: boolean | undefined,
  hasActiveAlerts: boolean,
): "healthy" | "degraded" | "down" {
  if (status === "healthy" || status === "degraded" || status === "down") {
    return status;
  }
  if (healthy === true) {
    return "healthy";
  }
  if (healthy === false || hasActiveAlerts) {
    return "degraded";
  }
  return "healthy";
}

function formatMonitorDetails(health: MonitorHealthResponse | null): string | undefined {
  if (!health) {
    return undefined;
  }
  if (health.lastActivity) {
    return `last activity ${health.lastActivity}`;
  }
  if (typeof health.criticalAlerts === "number") {
    return `${health.criticalAlerts} critical alerts`;
  }
  return undefined;
}

function formatPresetDetails(preset: MarketPresetVerification | null): string | undefined {
  if (!preset) {
    return undefined;
  }
  const { passCount, warnCount, failCount } = preset.readiness;
  return `pass ${passCount} · warn ${warnCount} · fail ${failCount}`;
}
