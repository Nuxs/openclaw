/**
 * Web3 / Market view-state properties — overlay for app-view-state.ts.
 *
 * Defines the web3/market portion of AppViewState as an intersection
 * type so the upstream file only needs a single import + `&` merge.
 */

import type {
  BridgeRoutesSnapshot,
  BridgeTransfer,
  ConsentView,
  MarketDispute,
  MarketExecutionSummaryView,
  MarketFilters,
  MarketLedgerEntry,
  MarketLedgerSummary,
  MarketLease,
  MarketMetricsSnapshot,
  MarketOpsSummary,
  MarketPrivacySummary,
  MarketReputationSummary,
  MarketResource,
  MarketResourceKind,
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
  Web3BillingSummary,
  Web3IndexEntry,
  Web3IndexStats,
  Web3MonitorSnapshot,
  Web3StatusSummary,
} from "./types-web3.ts";

export type Web3ViewState = {
  overviewWeb3Status: Web3StatusSummary | null;
  overviewWeb3Error: string | null;
  web3Loading: boolean;
  web3Error: string | null;
  web3Status: Web3StatusSummary | null;
  web3BillingSummary: Web3BillingSummary | null;
  web3BillingError: string | null;
  web3MarketStatus: MarketStatusSummary | null;
  web3MarketError: string | null;
  web3LastSuccess: number | null;
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
  marketExecutionLoading: boolean;
  marketExecutionError: string | null;
  marketExecutions: MarketExecutionSummaryView[];
  marketLastSuccess: number | null;
  taskLoading: boolean;
  taskError: string | null;
  taskSummary: MarketTaskSummary | null;
  taskOrders: TaskOrderView[];
  taskBids: TaskBidView[];
  taskResults: TaskResultView[];
  taskReceipts: TaskReceiptView[];
  privacyLoading: boolean;
  privacySummary: MarketPrivacySummary | null;
  privacyConsents: ConsentView[];
  privacyAssets: PrivacyAssetView[];
  privacyReplays: PrivacyReplayView[];
  opsLoading: boolean;
  opsSummary: MarketOpsSummary | null;
  opsAlerts: OpsAlertView[];
  marketResourceKind: MarketResourceKind | "all";
  marketFilters: MarketFilters;
  debugWeb3Audit: unknown;
  debugWeb3AuditError: string | null;
  loadMarket(): Promise<void>;
  loadWeb3(): Promise<void>;
};
