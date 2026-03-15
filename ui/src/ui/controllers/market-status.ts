import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  BridgeRoutesSnapshot,
  BridgeTransfer,
  ConsentView,
  GaReadinessCheck,
  MarketDispute,
  MarketLedgerEntry,
  MarketLedgerSummary,
  MarketLease,
  MarketMetricsSnapshot,
  MarketOpsSummary,
  MarketPresetIntent,
  MarketPresetMode,
  MarketPresetPreview,
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
  hello?: unknown;
  taskLoading: boolean;
  taskError: string | null;
  taskSummary: MarketTaskSummary | null;
  taskOrders: TaskOrderView[];
  taskBids: TaskBidView[];
  taskResults: TaskResultView[];
  taskReceipts: TaskReceiptView[];
};

const REQUIRED_TASK_METHODS = [
  "web3.market.task.list",
  "web3.market.task.bid.list",
  "web3.market.task.result.list",
  "web3.market.task.receipt.list",
] as const;

export async function loadMarketTasks(state: TaskState) {
  if (!state.client || !state.connected || state.taskLoading) {
    return;
  }
  state.taskLoading = true;
  state.taskError = null;

  const missingMethods = findMissingMethods(state.hello, REQUIRED_TASK_METHODS);
  if (missingMethods.length > 0) {
    state.taskSummary = createEmptyTaskSummary();
    state.taskOrders = [];
    state.taskBids = [];
    state.taskResults = [];
    state.taskReceipts = [];
    state.taskError = `Task Market API 未就绪：缺少 ${missingMethods.join(", ")}。请启用/升级 web3-core 后重试。`;
    state.taskLoading = false;
    return;
  }

  try {
    const [orders, bids, results, receipts] = await Promise.allSettled([
      state.client.request<{ tasks?: unknown[] }>("web3.market.task.list", { limit: 100 }),
      state.client.request<{ bids?: unknown[] }>("web3.market.task.bid.list", { limit: 100 }),
      state.client.request<{ results?: unknown[] }>("web3.market.task.result.list", { limit: 100 }),
      state.client.request<{ receipts?: unknown[] }>("web3.market.task.receipt.list", {
        limit: 100,
      }),
    ]);

    // Keep partial data visible so operators can see which endpoint failed instead of a blank panel.
    state.taskOrders = normalizeSettledListPayload<TaskOrderView>(orders, "tasks");
    state.taskBids = normalizeSettledListPayload<TaskBidView>(bids, "bids");
    state.taskResults = normalizeSettledListPayload<TaskResultView>(results, "results");
    state.taskReceipts = normalizeSettledListPayload<TaskReceiptView>(receipts, "receipts");
    state.taskSummary = buildTaskSummary(
      state.taskOrders,
      state.taskBids,
      state.taskResults,
      state.taskReceipts,
    );
    const requestErrors = collectRequestErrors([
      ["web3.market.task.list", orders],
      ["web3.market.task.bid.list", bids],
      ["web3.market.task.result.list", results],
      ["web3.market.task.receipt.list", receipts],
    ]);
    state.taskError = requestErrors.length > 0 ? requestErrors.join("; ") : null;
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
    const [consents, assets, replays] = await Promise.all([
      state.client.request<{ consents?: unknown[] }>("web3.market.consent.list", { limit: 100 }),
      state.client.request<{ assets?: unknown[] }>("web3.market.privacy.assets", { limit: 100 }),
      state.client.request<{ replays?: unknown[] }>("web3.market.privacy.replay.list", {
        limit: 100,
      }),
    ]);

    state.privacyConsents = normalizeListPayload<ConsentView>(consents, "consents");
    state.privacyAssets = normalizeListPayload<PrivacyAssetView>(assets, "assets");
    state.privacyReplays = normalizeListPayload<PrivacyReplayView>(replays, "replays");
    state.privacySummary = buildPrivacySummary(
      state.privacyConsents,
      state.privacyAssets,
      state.privacyReplays,
    );
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
  marketPresetMode?: MarketPresetMode;
};

export type MarketPresetState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  marketPresetLoading: boolean;
  marketPresetError: string | null;
  marketPresetPreview: MarketPresetPreview | null;
  marketPresetMode: MarketPresetMode;
  marketPresetIntent: MarketPresetIntent;
};

export async function loadMarketPresetPreview(state: MarketPresetState) {
  if (!state.client || !state.connected || state.marketPresetLoading) {
    return;
  }
  state.marketPresetLoading = true;
  state.marketPresetError = null;
  try {
    const preview = await state.client.request<MarketPresetPreview>("web3.market.preset.preview", {
      mode: state.marketPresetMode,
      intent: state.marketPresetIntent,
    });
    state.marketPresetPreview = normalizePayload<MarketPresetPreview>(preview);
  } catch (error) {
    state.marketPresetError = String(error);
  } finally {
    state.marketPresetLoading = false;
  }
}

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
      state.client.request<MarketPresetVerification>("web3.market.preset.verify", {
        mode: state.marketPresetMode ?? "single-node",
      }),
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
    const walletProbe = summarizePresetProbe(normalizedPreset, ["wallet.readiness"]);
    const paymentProbe = summarizePresetProbe(normalizedPreset, ["payment.readiness"]);
    const discoveryProbe = summarizePresetProbe(normalizedPreset, [
      "discovery.mode",
      "discovery.enabled",
      "index.providers",
    ]);
    const settlementProbe = summarizePresetProbe(normalizedPreset, [
      "market.status.summary",
      "lease.flow",
    ]);
    const observedAt = new Date().toISOString();
    const healthProbes: OpsHealthProbe[] = [
      {
        name: "monitor",
        status: monitorStatus,
        lastCheck: normalizedHealth?.lastActivity ?? observedAt,
        details: formatMonitorDetails(normalizedHealth),
      },
      {
        name: "wallet",
        status: walletProbe.status,
        lastCheck: observedAt,
        details: walletProbe.details,
      },
      {
        name: "payment",
        status: paymentProbe.status,
        lastCheck: observedAt,
        details: paymentProbe.details,
      },
      {
        name: "discovery",
        status: discoveryProbe.status,
        lastCheck: observedAt,
        details: discoveryProbe.details,
      },
      {
        name: "settlement",
        status: settlementProbe.status,
        lastCheck: observedAt,
        details: settlementProbe.details,
      },
    ];

    state.opsSummary = {
      activeAlerts: activeAlerts.length,
      alertsByLevel: countAlertsByLevel(activeAlerts),
      healthProbes,
      walletHealthy: walletProbe.status === "healthy",
      discoveryHealthy: discoveryProbe.status === "healthy",
      paymentHealthy: paymentProbe.status === "healthy",
      settlementHealthy: settlementProbe.status === "healthy",
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

function normalizeSettledListPayload<T>(result: PromiseSettledResult<unknown>, key: string): T[] {
  return result.status === "fulfilled" ? normalizeListPayload<T>(result.value, key) : [];
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

function createEmptyTaskSummary(): MarketTaskSummary {
  return {
    openTasks: 0,
    awardedTasks: 0,
    closedTasks: 0,
    totalBids: 0,
    pendingResults: 0,
    settledReceipts: 0,
    disputedReceipts: 0,
  };
}

function buildTaskSummary(
  orders: TaskOrderView[],
  bids: TaskBidView[],
  results: TaskResultView[],
  receipts: TaskReceiptView[],
): MarketTaskSummary {
  return {
    openTasks: orders.filter((task) => task.status === "task_open").length,
    awardedTasks: orders.filter((task) => task.status === "task_awarded").length,
    closedTasks: orders.filter((task) => task.status === "task_closed").length,
    totalBids: bids.length,
    pendingResults: results.filter((result) => result.status === "result_submitted").length,
    settledReceipts: receipts.filter((receipt) => receipt.status === "receipt_settled").length,
    disputedReceipts: receipts.filter((receipt) => receipt.status === "receipt_disputed").length,
  };
}

function buildPrivacySummary(
  consents: ConsentView[],
  assets: PrivacyAssetView[],
  replays: PrivacyReplayView[],
): MarketPrivacySummary {
  return {
    activeConsents: consents.filter((consent) => consent.status === "consent_granted").length,
    revokedConsents: consents.filter((consent) => consent.status === "consent_revoked").length,
    pendingErasure: replays.filter((replay) => replay.retentionAction === "delete_on_revoke")
      .length,
    totalReplays: replays.length,
    assetCount: assets.length,
  };
}

function findMissingMethods(hello: unknown, requiredMethods: readonly string[]): string[] {
  const methods = extractAvailableMethods(hello);
  if (!methods) {
    return [];
  }
  return requiredMethods.filter((method) => !methods.has(method));
}

function extractAvailableMethods(hello: unknown): Set<string> | null {
  const features =
    hello && typeof hello === "object" && "features" in hello
      ? (hello as { features?: { methods?: unknown } }).features
      : undefined;
  if (!Array.isArray(features?.methods)) {
    return null;
  }
  return new Set(features.methods.filter((method): method is string => typeof method === "string"));
}

function collectRequestErrors(entries: Array<[string, PromiseSettledResult<unknown>]>): string[] {
  return entries.flatMap(([method, result]) => {
    if (result.status === "fulfilled") {
      return [];
    }
    return [`${method}: ${String(result.reason)}`];
  });
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

function summarizePresetProbe(
  preset: MarketPresetVerification | null,
  names: string[],
): { status: OpsHealthProbe["status"]; details?: string } {
  if (!preset) {
    return { status: "down", details: "preset verification unavailable" };
  }
  const matches = preset.readiness.checks.filter((check) => names.includes(check.name));
  if (matches.length === 0) {
    return { status: "degraded", details: formatPresetDetails(preset) };
  }
  if (matches.some((check) => check.status === "fail")) {
    return { status: "down", details: summarizePresetCheckDetails(matches) };
  }
  if (matches.some((check) => check.status === "warn")) {
    return { status: "degraded", details: summarizePresetCheckDetails(matches) };
  }
  return { status: "healthy", details: summarizePresetCheckDetails(matches) };
}

function summarizePresetCheckDetails(checks: GaReadinessCheck[]): string | undefined {
  const entries = checks
    .map((check) => check.detail ?? check.action ?? check.name)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  return entries.length > 0 ? entries.join(" · ") : undefined;
}
