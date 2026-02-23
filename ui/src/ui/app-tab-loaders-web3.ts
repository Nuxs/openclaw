/**
 * Web3 / Market tab data-loading functions — overlay for app-tab-loaders.ts.
 *
 * Extracted so that upstream `app-tab-loaders.ts` only needs a single
 * import + re-export line for web3 loaders.
 */

import type { OpenClawApp } from "./app.ts";
import { loadMarketStatus } from "./controllers/market-status.ts";
import { loadWeb3MarketSummary } from "./controllers/market-summary.ts";
import { loadWeb3BillingSummary } from "./controllers/web3-billing.ts";
import { loadWeb3Dashboard } from "./controllers/web3-dashboard.ts";
import { loadWeb3Status } from "./controllers/web3-status.ts";

type LoadHost = {
  tab: string;
  connected: boolean;
};

export async function loadMarket(host: LoadHost) {
  await loadMarketStatus(host as unknown as OpenClawApp);
}

export async function loadWeb3(host: LoadHost) {
  const app = host as unknown as OpenClawApp;
  app.web3Loading = true;
  let anySuccess = false;
  const results = await Promise.allSettled([
    loadWeb3Dashboard(app),
    loadWeb3BillingSummary(app),
    loadWeb3MarketSummary(app),
  ]);
  for (const result of results) {
    if (result.status === "fulfilled") {
      anySuccess = true;
    }
  }
  if (anySuccess) {
    app.web3LastSuccess = Date.now();
  }
  app.web3Loading = false;
}

export async function loadWeb3StatusForOverview(app: OpenClawApp) {
  await loadWeb3Status(app);
}
