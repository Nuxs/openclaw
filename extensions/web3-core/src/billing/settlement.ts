import type { Web3PluginConfig } from "../config.js";
import { loadCallGateway, normalizeGatewayResult } from "../core-imports.js";
import type { PendingSettlement, Web3StateStore } from "../state/store.js";

/** @internal exported for testing */
export function isSettlementReady(entry: PendingSettlement): boolean {
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
      const normalized = normalizeGatewayResult(result);
      if (!normalized.ok) {
        throw new Error(normalized.error ?? "settlement lock failed");
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
