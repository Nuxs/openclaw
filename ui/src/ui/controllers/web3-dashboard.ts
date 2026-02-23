import type { GatewayBrowserClient } from "../gateway.ts";
import type { Web3StatusSummary } from "../types.ts";
import { normalizeGatewayPayload } from "./normalize.ts";

type Web3DashboardState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  web3Status: Web3StatusSummary | null;
  web3Error: string | null;
};

export async function loadWeb3Dashboard(state: Web3DashboardState) {
  if (!state.client || !state.connected) {
    return;
  }

  try {
    const res = await state.client.request("web3.status.summary", {});
    state.web3Status = normalizeGatewayPayload<Web3StatusSummary>(res);
    state.web3Error = null;
  } catch (err) {
    state.web3Status = null;
    state.web3Error = String(err);
  }
}
