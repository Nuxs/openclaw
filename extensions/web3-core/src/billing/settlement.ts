import type { Web3PluginConfig } from "../config.js";
import type { PendingSettlement, Web3StateStore } from "../state/store.js";

type CallGatewayFn = (opts: {
  method: string;
  params?: unknown;
  timeoutMs?: number;
}) => Promise<{ ok?: boolean; error?: string }>;

async function loadCallGateway(): Promise<CallGatewayFn> {
  try {
    const mod = await import("../../../src/gateway/call.js");
    if (typeof mod.callGateway === "function") {
      return mod.callGateway as CallGatewayFn;
    }
  } catch {
    // ignore
  }

  const mod = await import("../../../dist/gateway/call.js");
  if (typeof mod.callGateway !== "function") {
    throw new Error("callGateway is not available");
  }
  return mod.callGateway as CallGatewayFn;
}

function isSettlementReady(entry: PendingSettlement): boolean {
  return Boolean(entry.orderId && entry.payer && entry.amount);
}

export async function flushPendingSettlements(
  store: Web3StateStore,
  config: Web3PluginConfig,
): Promise<void> {
  if (!config.billing.enabled) {
    return;
  }
  const pending = store.getPendingSettlements();
  if (pending.length === 0) {
    return;
  }

  const callGateway = await loadCallGateway();
  const next: PendingSettlement[] = [];

  for (const entry of pending) {
    if (!isSettlementReady(entry)) {
      next.push(entry);
      continue;
    }
    try {
      const result = await callGateway({
        method: "market.settlement.lock",
        params: {
          orderId: entry.orderId,
          amount: entry.amount,
          payer: entry.payer,
          actorId: entry.actorId,
        },
        timeoutMs: config.brain.timeoutMs,
      });
      if (!result?.ok) {
        throw new Error(result?.error || "settlement lock failed");
      }
    } catch (err) {
      const attempts = (entry.attempts ?? 0) + 1;
      next.push({
        ...entry,
        attempts,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  store.savePendingSettlements(next);
}
