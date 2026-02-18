import type { GatewayBrowserClient } from "../gateway.ts";
import type { Web3StatusSummary } from "../types.ts";

type Web3StatusState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  overviewWeb3Status: Web3StatusSummary | null;
  overviewWeb3Error: string | null;
};

export async function loadWeb3Status(state: Web3StatusState) {
  if (!state.client || !state.connected) {
    return;
  }

  try {
    const res = await state.client.request("web3.status.summary", {});
    state.overviewWeb3Status = normalizeWeb3Status(res);
    state.overviewWeb3Error = null;
  } catch (err) {
    state.overviewWeb3Status = null;
    state.overviewWeb3Error = String(err);
  }
}

function normalizeWeb3Status(input: unknown): Web3StatusSummary | null {
  if (!input) {
    return null;
  }
  const payload = (input as { result?: unknown }).result ?? input;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload as Web3StatusSummary;
}
