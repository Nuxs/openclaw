/**
 * Web3 / Market view-state properties — overlay for app-view-state.ts.
 *
 * Defines the web3/market portion of AppViewState as an intersection
 * type so the upstream file only needs a single import + `&` merge.
 */

import type {
  BridgeRoutesSnapshot,
  BridgeTransfer,
  MarketDispute,
  MarketFilters,
  MarketLedgerEntry,
  MarketLedgerSummary,
  MarketLease,
  MarketMetricsSnapshot,
  MarketReputationSummary,
  MarketResource,
  MarketResourceKind,
  MarketStatusSummary,
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
  marketLastSuccess: number | null;
  marketResourceKind: MarketResourceKind | "all";
  marketFilters: MarketFilters;
  marketEnableBusy: boolean;
  marketEnableError: string | null;
  marketEnableNotice: string | null;
  handleMarketEnable(): void;
  loadWeb3(): Promise<void>;
};
