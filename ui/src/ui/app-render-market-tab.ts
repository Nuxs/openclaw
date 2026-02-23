import { nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { pathForTab } from "./navigation.ts";
import { renderMarket } from "./views/market.ts";

export function renderMarketTab(state: AppViewState) {
  if (state.tab !== "market") {
    return nothing;
  }

  return renderMarket({
    loading: state.marketLoading,
    error: state.marketError,
    lastSuccessAt: state.marketLastSuccess,
    status: state.marketStatus,
    metrics: state.marketMetrics,
    indexEntries: state.marketIndexEntries,
    indexStats: state.marketIndexStats,
    monitor: state.marketMonitor,
    resources: state.marketResources,
    leases: state.marketLeases,
    ledger: state.marketLedgerSummary,
    ledgerEntries: state.marketLedgerEntries,
    disputes: state.marketDisputes,
    reputation: state.marketReputation,
    tokenEconomy: state.marketTokenEconomy,
    bridgeRoutes: state.marketBridgeRoutes,
    bridgeTransfers: state.marketBridgeTransfers,
    resourceKind: state.marketResourceKind,
    filters: state.marketFilters,
    enableBusy: state.marketEnableBusy,
    enableError: state.marketEnableError,
    enableNotice: state.marketEnableNotice,
    configPath: pathForTab("config", state.basePath),
    onResourceKindChange: (next) => (state.marketResourceKind = next),
    onFiltersChange: (next) => (state.marketFilters = next),
    onRefresh: () => state.loadMarket(),
    onEnable: () => state.handleMarketEnable(),
  });
}
