import type { GatewayBrowserClient } from "../gateway.ts";
import type { MarketStatusSummary } from "../types.ts";
import { normalizeGatewayPayload } from "./normalize.ts";

type MarketSummaryState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  web3MarketStatus: MarketStatusSummary | null;
  web3MarketError: string | null;
};

export async function loadWeb3MarketSummary(state: MarketSummaryState) {
  if (!state.client || !state.connected) {
    return;
  }

  try {
    const res = await state.client.request("web3.market.status.summary", {});
    state.web3MarketStatus = normalizeGatewayPayload<MarketStatusSummary>(res);
    state.web3MarketError = null;
  } catch (err) {
    state.web3MarketStatus = null;
    state.web3MarketError = String(err);
  }
}
