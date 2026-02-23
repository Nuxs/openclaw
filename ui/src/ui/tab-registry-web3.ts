/**
 * Web3 / Market tab definitions — overlay for tab-registry.ts.
 *
 * Keeps web3-specific tab entries out of the upstream registry so
 * merge conflicts are limited to a single import + spread line.
 */

import { nothing } from "lit";
import { renderMarketTab } from "./app-render-market-tab.ts";
import { loadMarket, loadWeb3 } from "./app-tab-loaders-web3.ts";
import type { TabDefinition } from "./tab-registry.ts";
import { renderWeb3 } from "./views/web3.ts";

export const WEB3_TAB_ENTRIES: TabDefinition[] = [
  {
    id: "web3",
    path: "/web3",
    icon: "globe",
    group: "control",
    render: (state) => {
      if (state.tab !== "web3") {
        return nothing;
      }
      return renderWeb3({
        connected: state.connected,
        loading: state.web3Loading,
        error: state.web3Error,
        status: state.web3Status,
        billing: state.web3BillingSummary,
        billingError: state.web3BillingError,
        marketStatus: state.web3MarketStatus,
        marketError: state.web3MarketError,
        lastSuccessAt: state.web3LastSuccess,
        onRefresh: () => state.loadWeb3(),
      });
    },
    load: async (host) => {
      await loadWeb3(host as Parameters<typeof loadWeb3>[0]);
    },
  },
  {
    id: "market",
    path: "/market",
    icon: "radio",
    group: "control",
    render: renderMarketTab,
    load: async (host) => {
      await loadMarket(host as Parameters<typeof loadMarket>[0]);
    },
  },
];
