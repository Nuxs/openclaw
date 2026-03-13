/**
 * Shared in-memory filtering & aggregation utilities for MarketStore implementations.
 *
 * Both `FileStore` and `SqliteStore` delegate to these helpers after their
 * storage-specific list operations, keeping filtering logic DRY.
 */

import type {
  MarketLedgerEntry,
  MarketLedgerFilter,
  MarketLedgerSummary,
  MarketLease,
  MarketLeaseFilter,
  MarketResource,
  MarketResourceFilter,
} from "../market/resources.js";
import type {
  BridgeTransfer,
  BridgeTransferFilter,
  PrivacyReplay,
  PrivacyReplayFilter,
  ServiceProof,
  ServiceProofFilter,
  SettlementOperation,
  SettlementOperationFilter,
  TaskBid,
  TaskBidFilter,
  TaskOrder,
  TaskOrderFilter,
  TaskReceipt,
  TaskReceiptFilter,
  TaskResult,
  TaskResultFilter,
} from "../market/types.js";

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/** Truncate from head (default) or tail. */
export function applyLimit<T>(
  items: T[],
  limit: number | undefined,
  mode: "head" | "tail" = "head",
): T[] {
  if (limit === undefined) return items;
  const n = Math.max(0, limit);
  return mode === "tail" ? items.slice(-n) : items.slice(0, n);
}

/** Parse a date string, returning NaN-safe milliseconds. */
function safeDateMs(value: string): number {
  return Date.parse(value);
}

/** Sort items by a date-typed string field (ascending). */
export function sortByDateAsc<T>(items: T[], field: keyof T): T[] {
  return items.sort((a, b) => safeDateMs(String(a[field])) - safeDateMs(String(b[field])));
}

// ---------------------------------------------------------------------------
// Domain-specific filters
// ---------------------------------------------------------------------------

export function filterResources(
  items: MarketResource[],
  filter?: MarketResourceFilter,
): MarketResource[] {
  if (!filter) return items;
  let result = items;
  if (filter.kind) result = result.filter((e) => e.kind === filter.kind);
  if (filter.providerActorId)
    result = result.filter((e) => e.providerActorId === filter.providerActorId);
  if (filter.status) result = result.filter((e) => e.status === filter.status);
  if (filter.tag) result = result.filter((e) => e.tags?.includes(filter.tag ?? "") ?? false);
  return applyLimit(result, filter.limit);
}

export function filterTasks(items: TaskOrder[], filter?: TaskOrderFilter): TaskOrder[] {
  if (!filter) return items;
  let result = items;
  if (filter.taskId) result = result.filter((e) => e.taskId === filter.taskId);
  if (filter.creatorActorId)
    result = result.filter((e) => e.creatorActorId === filter.creatorActorId);
  if (filter.status) result = result.filter((e) => e.status === filter.status);
  return applyLimit(result, filter.limit);
}

export function filterTaskBids(items: TaskBid[], filter?: TaskBidFilter): TaskBid[] {
  if (!filter) return items;
  let result = items;
  if (filter.taskId) result = result.filter((e) => e.taskId === filter.taskId);
  if (filter.bidderActorId) result = result.filter((e) => e.bidderActorId === filter.bidderActorId);
  if (filter.status) result = result.filter((e) => e.status === filter.status);
  return applyLimit(result, filter.limit);
}

export function filterTaskResults(items: TaskResult[], filter?: TaskResultFilter): TaskResult[] {
  if (!filter) return items;
  let result = items;
  if (filter.taskId) result = result.filter((e) => e.taskId === filter.taskId);
  if (filter.bidId) result = result.filter((e) => e.bidId === filter.bidId);
  if (filter.delivererActorId)
    result = result.filter((e) => e.delivererActorId === filter.delivererActorId);
  if (filter.status) result = result.filter((e) => e.status === filter.status);
  return applyLimit(result, filter.limit);
}

export function filterTaskReceipts(
  items: TaskReceipt[],
  filter?: TaskReceiptFilter,
): TaskReceipt[] {
  if (!filter) return items;
  let result = items;
  if (filter.taskId) result = result.filter((e) => e.taskId === filter.taskId);
  if (filter.bidId) result = result.filter((e) => e.bidId === filter.bidId);
  if (filter.payerActorId) result = result.filter((e) => e.payerActorId === filter.payerActorId);
  if (filter.payeeActorId) result = result.filter((e) => e.payeeActorId === filter.payeeActorId);
  if (filter.settlementId) result = result.filter((e) => e.settlementId === filter.settlementId);
  if (filter.status) result = result.filter((e) => e.status === filter.status);
  return applyLimit(result, filter.limit);
}

export function filterPrivacyReplays(
  items: PrivacyReplay[],
  filter?: PrivacyReplayFilter,
): PrivacyReplay[] {
  if (!filter) return items;
  let result = items;
  if (filter.consentId) result = result.filter((e) => e.consentId === filter.consentId);
  if (filter.orderId) result = result.filter((e) => e.orderId === filter.orderId);
  if (filter.actorId) result = result.filter((e) => e.actorId === filter.actorId);
  if (filter.status) result = result.filter((e) => e.status === filter.status);
  return applyLimit(result, filter.limit);
}

export function filterServiceProofs(
  items: ServiceProof[],
  filter?: ServiceProofFilter,
): ServiceProof[] {
  if (!filter) return items;
  let result = items;
  if (filter.orderId) result = result.filter((e) => e.orderId === filter.orderId);
  return applyLimit(result, filter.limit);
}

export function filterLeases(items: MarketLease[], filter?: MarketLeaseFilter): MarketLease[] {
  if (!filter) return items;
  let result = items;
  if (filter.resourceId) result = result.filter((e) => e.resourceId === filter.resourceId);
  if (filter.providerActorId)
    result = result.filter((e) => e.providerActorId === filter.providerActorId);
  if (filter.consumerActorId)
    result = result.filter((e) => e.consumerActorId === filter.consumerActorId);
  if (filter.status) result = result.filter((e) => e.status === filter.status);
  return applyLimit(result, filter.limit);
}

export function filterLedgerEntries(
  items: MarketLedgerEntry[],
  filter?: MarketLedgerFilter,
): MarketLedgerEntry[] {
  if (!filter) return items;
  let result = items;
  if (filter.leaseId) result = result.filter((e) => e.leaseId === filter.leaseId);
  if (filter.resourceId) result = result.filter((e) => e.resourceId === filter.resourceId);
  if (filter.providerActorId)
    result = result.filter((e) => e.providerActorId === filter.providerActorId);
  if (filter.consumerActorId)
    result = result.filter((e) => e.consumerActorId === filter.consumerActorId);
  if (filter.since) {
    const since = safeDateMs(filter.since);
    if (!Number.isNaN(since)) {
      result = result.filter((e) => safeDateMs(e.timestamp) >= since);
    }
  }
  if (filter.until) {
    const until = safeDateMs(filter.until);
    if (!Number.isNaN(until)) {
      result = result.filter((e) => safeDateMs(e.timestamp) <= until);
    }
  }
  result = sortByDateAsc(result, "timestamp");
  // Ledger uses tail-limit (most recent entries)
  return applyLimit(result, filter.limit, "tail");
}

export function filterSettlementOperations(
  items: SettlementOperation[],
  filter?: SettlementOperationFilter,
): SettlementOperation[] {
  if (!filter) return items;
  let result = items;
  if (filter.orderId) result = result.filter((e) => e.orderId === filter.orderId);
  if (filter.status) result = result.filter((e) => e.status === filter.status);
  if (filter.dueBefore) {
    const dueBefore = safeDateMs(filter.dueBefore);
    if (!Number.isNaN(dueBefore)) {
      result = result.filter((e) => safeDateMs(e.nextAttemptAt) <= dueBefore);
    }
  }
  result = sortByDateAsc(result, "updatedAt");
  return applyLimit(result, filter.limit);
}

/**
 * Apply JS-side filters for bridge transfers.
 * SqliteStore handles orderId/settlementId/status via SQL WHERE;
 * the remaining fields (fromChain, toChain, assetSymbol, limit) are filtered here.
 */
export function filterBridgeTransfersInMemory(
  items: BridgeTransfer[],
  filter?: BridgeTransferFilter,
): BridgeTransfer[] {
  if (!filter) return items;
  let result = items;
  if (filter.fromChain) result = result.filter((e) => e.fromChain === filter.fromChain);
  if (filter.toChain) result = result.filter((e) => e.toChain === filter.toChain);
  if (filter.assetSymbol) result = result.filter((e) => e.assetSymbol === filter.assetSymbol);
  // Bridge transfers use tail-limit (most recent)
  return applyLimit(result, filter.limit, "tail");
}

/**
 * Full in-memory bridge transfer filter (used by FileStore which does
 * all filtering in JS).
 */
export function filterBridgeTransfers(
  items: BridgeTransfer[],
  filter?: BridgeTransferFilter,
): BridgeTransfer[] {
  if (!filter) return items;
  let result = items;
  if (filter.orderId) result = result.filter((e) => e.orderId === filter.orderId);
  if (filter.settlementId) result = result.filter((e) => e.settlementId === filter.settlementId);
  if (filter.status) result = result.filter((e) => e.status === filter.status);
  result = sortByDateAsc(result, "updatedAt");
  return filterBridgeTransfersInMemory(result, filter);
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Compute ledger summary from pre-filtered entries.
 * Shared by both store implementations' `summarizeLedger`.
 */
export function summarizeLedgerEntries(entries: MarketLedgerEntry[]): MarketLedgerSummary {
  const byUnit: Record<string, { quantity: string; cost: string }> = {};
  let totalCost = 0n;
  let currency = "";
  for (const entry of entries) {
    if (!currency) currency = entry.currency;
    const unitBucket = byUnit[entry.unit] ?? { quantity: "0", cost: "0" };
    const nextQuantity = BigInt(unitBucket.quantity) + BigInt(entry.quantity);
    const nextCost = BigInt(unitBucket.cost) + BigInt(entry.cost);
    unitBucket.quantity = nextQuantity.toString();
    unitBucket.cost = nextCost.toString();
    byUnit[entry.unit] = unitBucket;
    totalCost += BigInt(entry.cost);
  }
  return { byUnit, totalCost: totalCost.toString(), currency };
}
