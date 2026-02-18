import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  SessionsUsageResult,
  CostUsageSummary,
  SessionUsageTimeSeries,
  Web3BillingSummary,
} from "../types.ts";
import type { SessionLogEntry } from "../views/usage.ts";

export type UsageState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey: string;
  usageLoading: boolean;
  usageResult: SessionsUsageResult | null;
  usageCostSummary: CostUsageSummary | null;
  usageBillingSummary: Web3BillingSummary | null;
  usageBillingError: string | null;
  usageError: string | null;
  usageStartDate: string;
  usageEndDate: string;
  usageSelectedSessions: string[];
  usageSelectedDays: string[];
  usageTimeSeries: SessionUsageTimeSeries | null;
  usageTimeSeriesLoading: boolean;
  usageTimeSeriesCursorStart: number | null;
  usageTimeSeriesCursorEnd: number | null;
  usageSessionLogs: SessionLogEntry[] | null;
  usageSessionLogsLoading: boolean;
};

export async function loadUsage(
  state: UsageState,
  overrides?: {
    startDate?: string;
    endDate?: string;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.usageLoading) {
    return;
  }
  state.usageLoading = true;
  state.usageError = null;
  try {
    const startDate = overrides?.startDate ?? state.usageStartDate;
    const endDate = overrides?.endDate ?? state.usageEndDate;

    // Load both endpoints in parallel
    const [sessionsRes, costRes, billingRes] = await Promise.allSettled([
      state.client.request("sessions.usage", {
        startDate,
        endDate,
        limit: 1000, // Cap at 1000 sessions
        includeContextWeight: true,
      }),
      state.client.request("usage.cost", { startDate, endDate }),
      state.client.request("web3.billing.summary", { sessionKey: state.sessionKey }),
    ]);

    if (sessionsRes.status === "fulfilled") {
      state.usageResult = sessionsRes.value as SessionsUsageResult;
    } else {
      state.usageError = String(sessionsRes.reason ?? "Failed to load usage sessions");
    }

    if (costRes.status === "fulfilled") {
      state.usageCostSummary = costRes.value as CostUsageSummary;
    } else {
      state.usageError = String(costRes.reason ?? "Failed to load usage costs");
    }

    if (billingRes.status === "fulfilled") {
      state.usageBillingSummary = normalizeBillingSummary(billingRes.value);
      state.usageBillingError = null;
    } else {
      state.usageBillingSummary = null;
      state.usageBillingError = String(billingRes.reason ?? "Failed to load billing summary");
    }
  } catch (err) {
    state.usageError = String(err);
    state.usageBillingSummary = null;
    state.usageBillingError = String(err);
  } finally {
    state.usageLoading = false;
  }
}

function normalizeBillingSummary(input: unknown): Web3BillingSummary | null {
  if (!input) {
    return null;
  }
  const payload = (input as { result?: unknown }).result ?? input;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload as Web3BillingSummary;
}

export async function loadSessionTimeSeries(state: UsageState, sessionKey: string) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.usageTimeSeriesLoading) {
    return;
  }
  state.usageTimeSeriesLoading = true;
  state.usageTimeSeries = null;
  try {
    const res = await state.client.request("sessions.usage.timeseries", { key: sessionKey });
    if (res) {
      state.usageTimeSeries = res as SessionUsageTimeSeries;
    }
  } catch {
    // Silently fail - time series is optional
    state.usageTimeSeries = null;
  } finally {
    state.usageTimeSeriesLoading = false;
  }
}

export async function loadSessionLogs(state: UsageState, sessionKey: string) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.usageSessionLogsLoading) {
    return;
  }
  state.usageSessionLogsLoading = true;
  state.usageSessionLogs = null;
  try {
    const res = await state.client.request("sessions.usage.logs", {
      key: sessionKey,
      limit: 1000,
    });
    if (res && Array.isArray((res as { logs: SessionLogEntry[] }).logs)) {
      state.usageSessionLogs = (res as { logs: SessionLogEntry[] }).logs;
    }
  } catch {
    // Silently fail - logs are optional
    state.usageSessionLogs = null;
  } finally {
    state.usageSessionLogsLoading = false;
  }
}
