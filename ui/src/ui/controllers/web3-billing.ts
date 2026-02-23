import type { GatewayBrowserClient } from "../gateway.ts";
import type { Web3BillingSummary } from "../types.ts";
import { normalizeGatewayPayload } from "./normalize.ts";

type Web3BillingState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey: string;
  web3BillingSummary: Web3BillingSummary | null;
  web3BillingError: string | null;
};

export async function loadWeb3BillingSummary(state: Web3BillingState) {
  if (!state.client || !state.connected) {
    return;
  }

  try {
    const res = await state.client.request("web3.billing.summary", {
      sessionKey: state.sessionKey,
    });
    state.web3BillingSummary = normalizeGatewayPayload<Web3BillingSummary>(res);
    state.web3BillingError = null;
  } catch (err) {
    state.web3BillingSummary = null;
    state.web3BillingError = String(err);
  }
}
