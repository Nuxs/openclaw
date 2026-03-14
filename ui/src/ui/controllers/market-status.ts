import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  BridgeRoutesSnapshot,
  BridgeTransfer,
  ConfigSnapshot,
  ConsentView,
  MarketDispute,
  MarketLedgerEntry,
  MarketLedgerSummary,
  MarketLease,
  MarketMetricsSnapshot,
  MarketOpsSummary,
  MarketPrivacySummary,
  MarketReputationSummary,
  MarketResource,
  MarketStatusSummary,
  MarketTaskSummary,
  OpsAlertView,
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
import { cloneConfigObject, serializeConfigForm, setPathValue } from "./config/form-utils.ts";

type MarketStatusState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  marketLoading: boolean;
  marketError: string | null;
  marketEnableBusy: boolean;
  marketEnableError: string | null;
  marketEnableNotice: string | null;
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
  if (!state.client || !state.connected) {
    return;
  }
  if (state.marketLoading) {
    return;
  }
  state.marketLoading = true;
  state.marketError = null;

  // If the gateway hasn't registered these methods, fail fast with an actionable message.
  // This typically means the running gateway hasn't loaded `web3-core` (or it's outdated),
  // so the UI would otherwise just show "unknown method".
  const hello = state.hello as { features?: { methods?: unknown } } | undefined;
  const methods = Array.isArray(hello?.features?.methods) ? hello?.features?.methods : null;
  const requiredMethods = [
    "web3.market.status.summary",
    "web3.market.metrics.snapshot",
    "web3.index.list",
    "web3.index.stats",
    "web3.monitor.snapshot",
  ];
  if (methods) {
    const missing = requiredMethods.filter((m) => !methods.includes(m));
    if (missing.length > 0) {
      state.marketError =
        `市场 API 未就绪：网关未加载/未更新 web3 市场插件。\n` +
        `缺少方法：${missing.join(", ")}\n` +
        `建议：确认配置启用 web3-core/market-core，然后重启网关（macOS 请通过 OpenClaw Mac app 重启）。`;
      state.marketLoading = false;
      return;
    }
  }

  try {
    const [
      statusRes,
      metricsRes,
      indexListRes,
      indexStatsRes,
      monitorRes,
      resourcesRes,
      leasesRes,
      ledgerRes,
      ledgerEntriesRes,
      disputesRes,
      reputationRes,
      tokenEconomyRes,
      bridgeRoutesRes,
      bridgeListRes,
    ] = await Promise.allSettled([
      state.client.request("web3.market.status.summary", {}),
      state.client.request("web3.market.metrics.snapshot", {}),
      state.client.request("web3.index.list", { limit: 200 }),
      state.client.request("web3.index.stats", {}),
      state.client.request("web3.monitor.snapshot", {}),
      state.client.request("web3.market.resource.list", { limit: 200 }),
      state.client.request("web3.market.lease.list", { limit: 50 }),
      state.client.request("web3.market.ledger.summary", {}),
      state.client.request("web3.market.ledger.list", { limit: 50 }),
      state.client.request("web3.market.dispute.list", { limit: 50 }),
      state.client.request("web3.market.reputation.summary", {}),
      state.client.request("web3.market.tokenEconomy.summary", {}),
      state.client.request("web3.market.bridge.routes", {}),
      state.client.request("web3.market.bridge.list", { limit: 20 }),
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

    if (indexListRes.status === "fulfilled") {
      const payload = normalizePayload<{ entries?: Web3IndexEntry[] }>(indexListRes.value);
      state.marketIndexEntries = payload?.entries ?? [];
      anySuccess = true;
    } else {
      errors.push(String(indexListRes.reason ?? "Failed to load index entries"));
    }

    if (indexStatsRes.status === "fulfilled") {
      const payload = normalizePayload<Web3IndexStats>(indexStatsRes.value);
      state.marketIndexStats = payload;
      anySuccess = true;
    } else {
      errors.push(String(indexStatsRes.reason ?? "Failed to load index stats"));
    }

    if (monitorRes.status === "fulfilled") {
      state.marketMonitor = normalizePayload<Web3MonitorSnapshot>(monitorRes.value);
      anySuccess = true;
    } else {
      errors.push(String(monitorRes.reason ?? "Failed to load monitor snapshot"));
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

    if (reputationRes.status === "fulfilled") {
      state.marketReputation = normalizePayload<MarketReputationSummary>(reputationRes.value);
      anySuccess = true;
    } else {
      state.marketReputation = null;
    }

    if (tokenEconomyRes.status === "fulfilled") {
      state.marketTokenEconomy = normalizePayload<TokenEconomyState>(tokenEconomyRes.value);
      anySuccess = true;
    } else {
      state.marketTokenEconomy = null;
    }

    if (bridgeRoutesRes.status === "fulfilled") {
      state.marketBridgeRoutes = normalizePayload<BridgeRoutesSnapshot>(bridgeRoutesRes.value);
      anySuccess = true;
    } else {
      state.marketBridgeRoutes = null;
    }

    if (bridgeListRes.status === "fulfilled") {
      state.marketBridgeTransfers = normalizePayload<BridgeTransfer[]>(bridgeListRes.value) ?? [];
      anySuccess = true;
    } else {
      state.marketBridgeTransfers = [];
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

// ── Task / Privacy / Ops lazy loaders ──

export type MarketTaskState = {
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

export async function loadMarketTasks(state: MarketTaskState) {
  if (!state.client || !state.connected || state.taskLoading) {
    return;
  }
  state.taskLoading = true;
  state.taskError = null;
  try {
    const missingMethods = findMissingMethods(state.hello, [
      "web3.market.task.list",
      "web3.market.task.bid.list",
      "web3.market.task.result.list",
      "web3.market.task.receipt.list",
    ]);
    if (missingMethods.length > 0) {
      resetTaskCollections(state);
      state.taskSummary = buildTaskSummary([], [], [], []);
      state.taskError =
        `Task APIs 未就绪：缺少方法：${missingMethods.join(", ")}。` +
        "请确认 web3-core / market-core 已更新并重启 Gateway。";
      return;
    }

    const [tasksRes, bidsRes, resultsRes, receiptsRes] = await Promise.allSettled([
      state.client.request("web3.market.task.list", { limit: 50 }),
      state.client.request("web3.market.task.bid.list", { limit: 50 }),
      state.client.request("web3.market.task.result.list", { limit: 50 }),
      state.client.request("web3.market.task.receipt.list", { limit: 50 }),
    ]);
    const errors: string[] = [];

    if (tasksRes.status === "fulfilled") {
      const payload = normalizePayload<{ tasks?: TaskOrderView[] }>(tasksRes.value);
      state.taskOrders = payload?.tasks ?? [];
    } else {
      state.taskOrders = [];
      errors.push(formatTaskLoadError("web3.market.task.list", tasksRes.reason));
    }
    if (bidsRes.status === "fulfilled") {
      const payload = normalizePayload<{ bids?: TaskBidView[] }>(bidsRes.value);
      state.taskBids = payload?.bids ?? [];
    } else {
      state.taskBids = [];
      errors.push(formatTaskLoadError("web3.market.task.bid.list", bidsRes.reason));
    }
    if (resultsRes.status === "fulfilled") {
      const payload = normalizePayload<{ results?: TaskResultView[] }>(resultsRes.value);
      state.taskResults = payload?.results ?? [];
    } else {
      state.taskResults = [];
      errors.push(formatTaskLoadError("web3.market.task.result.list", resultsRes.reason));
    }
    if (receiptsRes.status === "fulfilled") {
      const payload = normalizePayload<{ receipts?: TaskReceiptView[] }>(receiptsRes.value);
      state.taskReceipts = payload?.receipts ?? [];
    } else {
      state.taskReceipts = [];
      errors.push(formatTaskLoadError("web3.market.task.receipt.list", receiptsRes.reason));
    }

    state.taskSummary = buildTaskSummary(
      state.taskOrders,
      state.taskBids,
      state.taskResults,
      state.taskReceipts,
    );
    state.taskError = errors.length > 0 ? formatTaskLoadErrors(errors) : null;
  } finally {
    state.taskLoading = false;
  }
}

export type MarketPrivacyState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  privacyLoading: boolean;
  privacySummary: MarketPrivacySummary | null;
  privacyConsents: ConsentView[];
  privacyAssets: PrivacyAssetView[];
  privacyReplays: PrivacyReplayView[];
};

export async function loadMarketPrivacy(state: MarketPrivacyState) {
  if (!state.client || !state.connected || state.privacyLoading) {
    return;
  }
  state.privacyLoading = true;
  try {
    const [consentsRes, assetsRes, replaysRes] = await Promise.allSettled([
      state.client.request("web3.market.consent.list", { limit: 20 }),
      state.client.request("web3.market.privacy.assets", { limit: 20 }),
      state.client.request("web3.market.privacy.replay.list", { limit: 20 }),
    ]);
    let activeConsents = 0;
    let revokedConsents = 0;
    if (consentsRes.status === "fulfilled") {
      const payload = normalizePayload<{ consents?: ConsentView[] }>(consentsRes.value);
      state.privacyConsents = payload?.consents ?? [];
      activeConsents = state.privacyConsents.filter((c) => c.status === "consent_granted").length;
      revokedConsents = state.privacyConsents.filter((c) => c.status === "consent_revoked").length;
    }
    if (assetsRes.status === "fulfilled") {
      const payload = normalizePayload<{ assets?: PrivacyAssetView[] }>(assetsRes.value);
      state.privacyAssets = payload?.assets ?? [];
    }
    if (replaysRes.status === "fulfilled") {
      const payload = normalizePayload<{ replays?: PrivacyReplayView[] }>(replaysRes.value);
      state.privacyReplays = payload?.replays ?? [];
    }
    state.privacySummary = {
      activeConsents,
      revokedConsents,
      pendingErasure: state.privacyReplays.filter((r) => r.status === "replay_generated").length,
      totalReplays: state.privacyReplays.length,
      assetCount: state.privacyAssets.length,
    };
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
    const [alertsRes, healthRes] = await Promise.allSettled([
      state.client.request("web3.monitor.alerts.list", { limit: 20 }),
      state.client.request("web3.monitor.health", {}),
    ]);

    const alertsPayload =
      alertsRes.status === "fulfilled"
        ? normalizePayload<{ alerts?: OpsAlertView[] }>(alertsRes.value)
        : null;
    state.opsAlerts = alertsPayload?.alerts ?? [];

    const health =
      healthRes.status === "fulfilled"
        ? normalizePayload<MonitorHealthResponse>(healthRes.value)
        : null;
    state.opsSummary = buildOpsSummary(state.opsAlerts, health);
  } finally {
    state.opsLoading = false;
  }
}

function findMissingMethods(hello: unknown, requiredMethods: string[]): string[] {
  const record = hello as { features?: { methods?: unknown } } | undefined;
  const methods = Array.isArray(record?.features?.methods) ? record.features.methods : null;
  if (!methods) {
    return [];
  }
  return requiredMethods.filter((method) => !methods.includes(method));
}

function resetTaskCollections(
  state: Pick<MarketTaskState, "taskOrders" | "taskBids" | "taskResults" | "taskReceipts">,
): void {
  state.taskOrders = [];
  state.taskBids = [];
  state.taskResults = [];
  state.taskReceipts = [];
}

function formatTaskLoadError(method: string, error: unknown): string {
  return `${method}: ${describeRequestError(error)}`;
}

function formatTaskLoadErrors(errors: string[]): string {
  return `Task 数据加载不完整：${errors.slice(0, 3).join("；")}`;
}

function describeRequestError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; error?: unknown };
    if (typeof record.message === "string") {
      return record.message;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
  }
  return String(error);
}

type MonitorHealthResponse = {
  status?: "healthy" | "degraded" | "down";
  healthy?: boolean;
  criticalAlerts?: number;
  lastActivity?: string | null;
  timestamp?: string;
};

function buildTaskSummary(
  tasks: TaskOrderView[],
  bids: TaskBidView[],
  results: TaskResultView[],
  receipts: TaskReceiptView[],
): MarketTaskSummary {
  return {
    openTasks: tasks.filter((task) => task.status === "task_open").length,
    awardedTasks: tasks.filter((task) => task.status === "task_awarded").length,
    closedTasks: tasks.filter((task) => task.status === "task_closed").length,
    totalBids: bids.length,
    pendingResults: results.filter((result) => result.status === "result_submitted").length,
    settledReceipts: receipts.filter((receipt) => receipt.status === "receipt_settled").length,
    disputedReceipts: receipts.filter((receipt) => receipt.status === "receipt_disputed").length,
  };
}

function buildOpsSummary(
  alerts: OpsAlertView[],
  health: MonitorHealthResponse | null,
): MarketOpsSummary {
  const activeAlerts = alerts.filter((alert) => alert.status === "active");
  const timestamp = health?.timestamp ?? new Date().toISOString();
  const discoveryHealthy = !hasActiveCategory(activeAlerts, "discovery");
  const paymentHealthy =
    !hasActiveCategory(activeAlerts, "billing") && !hasActiveCategory(activeAlerts, "chain");
  const settlementHealthy = !hasActiveCategory(activeAlerts, "settlement");
  const monitorStatus = mapMonitorStatus(health?.status, health?.healthy, activeAlerts.length > 0);

  return {
    activeAlerts: activeAlerts.length,
    alertsByLevel: activeAlerts.reduce(
      (acc, alert) => {
        acc[alert.level] = (acc[alert.level] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    healthProbes: [
      {
        name: "monitor",
        status: monitorStatus,
        lastCheck: timestamp,
        details: formatMonitorDetails(health),
      },
      {
        name: "discovery",
        status: discoveryHealthy ? "healthy" : "degraded",
        lastCheck: timestamp,
      },
      {
        name: "payment",
        status: paymentHealthy ? "healthy" : "degraded",
        lastCheck: timestamp,
      },
      {
        name: "settlement",
        status: settlementHealthy ? "healthy" : "degraded",
        lastCheck: timestamp,
      },
    ],
    discoveryHealthy,
    paymentHealthy,
    settlementHealthy,
  };
}

function hasActiveCategory(alerts: OpsAlertView[], category: string): boolean {
  return alerts.some(
    (alert) => alert.category.toLowerCase() === category && alert.status === "active",
  );
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

function getPathValue(root: Record<string, unknown>, path: Array<string | number>): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[String(key)];
  }
  return current;
}

function normalizeAllowList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string");
  }
  return [];
}

export async function enableWeb3Market(state: MarketStatusState & { hello?: unknown }) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.marketEnableBusy) {
    return;
  }
  state.marketEnableBusy = true;
  state.marketEnableError = null;
  state.marketEnableNotice = null;

  try {
    const snapshot = await state.client.request<ConfigSnapshot>("config.get", {});
    const baseHash = snapshot.hash;
    if (!baseHash) {
      state.marketEnableError = "Config hash missing; reload and retry.";
      return;
    }
    const configBase = snapshot.config ?? {};
    const next = cloneConfigObject(configBase);

    const allow = normalizeAllowList(getPathValue(next, ["plugins", "allow"]));
    const allowSet = new Set(allow);
    allowSet.add("web3-core");
    allowSet.add("market-core");

    setPathValue(next, ["plugins", "enabled"], true);
    setPathValue(next, ["plugins", "allow"], Array.from(allowSet));
    setPathValue(next, ["plugins", "entries", "web3-core", "enabled"], true);
    setPathValue(next, ["plugins", "entries", "market-core", "enabled"], true);

    setPathValue(next, ["plugins", "entries", "web3-core", "config", "resources", "enabled"], true);
    setPathValue(
      next,
      ["plugins", "entries", "web3-core", "config", "resources", "advertiseToMarket"],
      true,
    );
    setPathValue(
      next,
      ["plugins", "entries", "web3-core", "config", "resources", "consumer", "enabled"],
      true,
    );
    const listenEnabled = getPathValue(next, [
      "plugins",
      "entries",
      "web3-core",
      "config",
      "resources",
      "provider",
      "listen",
      "enabled",
    ]);
    if (listenEnabled === undefined || listenEnabled === null) {
      setPathValue(
        next,
        ["plugins", "entries", "web3-core", "config", "resources", "provider", "listen", "enabled"],
        true,
      );
    }
    const listenBind = getPathValue(next, [
      "plugins",
      "entries",
      "web3-core",
      "config",
      "resources",
      "provider",
      "listen",
      "bind",
    ]);
    if (listenBind === undefined || listenBind === null) {
      setPathValue(
        next,
        ["plugins", "entries", "web3-core", "config", "resources", "provider", "listen", "bind"],
        "loopback",
      );
    }
    const listenPort = getPathValue(next, [
      "plugins",
      "entries",
      "web3-core",
      "config",
      "resources",
      "provider",
      "listen",
      "port",
    ]);
    if (listenPort === undefined || listenPort === null || listenPort === 0) {
      setPathValue(
        next,
        ["plugins", "entries", "web3-core", "config", "resources", "provider", "listen", "port"],
        18790,
      );
    }

    const raw = serializeConfigForm(next);
    await state.client.request("config.apply", { raw, baseHash });
    state.marketEnableNotice = "已提交启用配置，请补齐 provider offers 后重启 Gateway。";
  } catch (err) {
    state.marketEnableError = String(err);
  } finally {
    state.marketEnableBusy = false;
  }
}
