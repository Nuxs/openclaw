/**
 * Billing plugin commands: /credits, /pay_status
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PluginCommandHandler } from "openclaw/plugin-sdk";
import { hashString } from "../audit/canonicalize.js";
import type { Web3PluginConfig } from "../config.js";
import type { Web3StateStore } from "../state/store.js";

type MarketStoreMode = "sqlite" | "file";

type MarketStoreConfig = {
  mode: MarketStoreMode;
  dbPath?: string;
};

type SettlementSnapshot = {
  settlementId: string;
  orderId: string;
  status?: string;
  amount?: string;
  tokenAddress?: string;
  lockedAt?: string;
  releasedAt?: string;
  refundedAt?: string;
  lockTxHash?: string;
  releaseTxHash?: string;
  refundTxHash?: string;
};

type OrderSnapshot = {
  orderId: string;
  status?: string;
};

type PayStatusDeps = {
  stateDir: string;
  config: Web3PluginConfig;
  marketConfig?: Record<string, unknown>;
};

export function createCreditsCommand(
  store: Web3StateStore,
  config: Web3PluginConfig,
): PluginCommandHandler {
  return async (ctx) => {
    const sessionHash = resolveSessionHash({
      senderId: ctx.senderId,
      from: ctx.from,
    });
    const usage = store.getUsage(sessionHash);
    if (!usage) {
      return { text: "No usage recorded yet for this session." };
    }
    const remaining = usage.creditsQuota - usage.creditsUsed;
    return {
      text: [
        `Credits: ${usage.creditsUsed} / ${usage.creditsQuota} (${remaining} remaining)`,
        `LLM calls: ${usage.llmCalls}`,
        `Tool calls: ${usage.toolCalls}`,
        `Last activity: ${usage.lastActivity}`,
        `Brain source: ${resolveBrainSource(config)}`,
      ].join("\n"),
    };
  };
}

function resolveSessionHash(input: { senderId?: string; from?: string }) {
  return hashString(input.senderId ?? input.from ?? "unknown");
}

function resolveMarketStoreConfig(raw?: Record<string, unknown>): MarketStoreConfig {
  const storeRaw = (raw?.store ?? {}) as Record<string, unknown>;
  const mode = storeRaw.mode === "file" ? "file" : "sqlite";
  const dbPath = typeof storeRaw.dbPath === "string" ? storeRaw.dbPath : undefined;
  return { mode, dbPath };
}

function parsePayStatusInput(arg: string): { orderId?: string; settlementId?: string } {
  const trimmed = arg.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("order:")) return { orderId: trimmed.slice("order:".length) };
  if (trimmed.startsWith("settlement:"))
    return { settlementId: trimmed.slice("settlement:".length) };
  return { orderId: trimmed };
}

function readJsonMap<T>(path: string): Record<string, T> {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, T>;
}

function readFromFileStore(
  stateDir: string,
  ids: { orderId?: string; settlementId?: string },
): { settlement?: SettlementSnapshot; order?: OrderSnapshot } {
  const dir = join(stateDir, "market");
  const settlements = readJsonMap<SettlementSnapshot>(join(dir, "settlements.json"));
  const orders = readJsonMap<OrderSnapshot>(join(dir, "orders.json"));

  let settlement =
    ids.settlementId && settlements[ids.settlementId] ? settlements[ids.settlementId] : undefined;

  if (!settlement && ids.orderId) {
    settlement = Object.values(settlements).find((entry) => entry.orderId === ids.orderId);
  }

  const orderId = ids.orderId ?? settlement?.orderId;
  const order = orderId ? orders[orderId] : undefined;

  return { settlement, order };
}

function readFromSqliteStore(
  config: MarketStoreConfig,
  stateDir: string,
  ids: { orderId?: string; settlementId?: string },
): { settlement?: SettlementSnapshot; order?: OrderSnapshot } {
  const dir = join(stateDir, "market");
  const dbPath = config.dbPath ?? join(dir, "market.db");
  if (!existsSync(dbPath)) return {};

  const db = new DatabaseSync(dbPath);
  try {
    let settlement: SettlementSnapshot | undefined;
    if (ids.settlementId) {
      const row = db.prepare("SELECT data FROM settlements WHERE id = ?").get(ids.settlementId) as
        | { data: string }
        | undefined;
      if (row?.data) settlement = JSON.parse(row.data) as SettlementSnapshot;
    }

    if (!settlement && ids.orderId) {
      const rows = db.prepare("SELECT data FROM settlements").all() as { data: string }[];
      settlement = rows
        .map((row) => JSON.parse(row.data) as SettlementSnapshot)
        .find((entry) => entry.orderId === ids.orderId);
    }

    const orderId = ids.orderId ?? settlement?.orderId;
    let order: OrderSnapshot | undefined;
    if (orderId) {
      const row = db.prepare("SELECT data FROM orders WHERE id = ?").get(orderId) as
        | { data: string }
        | undefined;
      if (row?.data) order = JSON.parse(row.data) as OrderSnapshot;
    }

    return { settlement, order };
  } finally {
    db.close();
  }
}

function readMarketSettlementStatus(
  stateDir: string,
  storeConfig: MarketStoreConfig,
  ids: { orderId?: string; settlementId?: string },
): { settlement?: SettlementSnapshot; order?: OrderSnapshot } {
  if (storeConfig.mode === "file") {
    return readFromFileStore(stateDir, ids);
  }
  return readFromSqliteStore(storeConfig, stateDir, ids);
}

function resolveBrainSource(config: Web3PluginConfig): string {
  return config.brain.enabled ? "web3/decentralized" : "centralized";
}

function formatPayStatus(snapshot: {
  settlement: SettlementSnapshot;
  order?: OrderSnapshot;
  brainSource: string;
  pendingCount: number;
}): string {
  const { settlement, order, brainSource, pendingCount } = snapshot;
  const lines = [
    `Settlement status: ${settlement.status ?? "unknown"}`,
    `Order: ${settlement.orderId}${order?.status ? ` (${order.status})` : ""}`,
    `Settlement: ${settlement.settlementId}`,
    `Brain source: ${brainSource}`,
    `Pending settlements: ${pendingCount}`,
  ];
  if (settlement.amount) lines.push(`Amount: ${settlement.amount}`);
  if (settlement.lockTxHash) lines.push(`Lock tx: ${settlement.lockTxHash}`);
  if (settlement.releaseTxHash) lines.push(`Release tx: ${settlement.releaseTxHash}`);
  if (settlement.refundTxHash) lines.push(`Refund tx: ${settlement.refundTxHash}`);
  return lines.join("\n");
}

export function createPayStatusCommand(
  store: Web3StateStore,
  deps: PayStatusDeps,
): PluginCommandHandler {
  return async (ctx) => {
    const raw = ctx.args?.trim() ?? "";
    if (!raw) {
      return {
        text: "Usage: /pay_status <orderId|settlementId> (prefix with order: or settlement:)",
      };
    }

    const ids = parsePayStatusInput(raw);
    if (!ids.orderId && !ids.settlementId) {
      return {
        text: "Usage: /pay_status <orderId|settlementId> (prefix with order: or settlement:)",
      };
    }

    const marketConfig =
      deps.marketConfig ??
      ((ctx.config.plugins?.entries?.["market-core"]?.config ?? {}) as Record<string, unknown>);
    const storeConfig = resolveMarketStoreConfig(marketConfig);

    const { settlement, order } = readMarketSettlementStatus(deps.stateDir, storeConfig, ids);
    if (!settlement) {
      const ref = ids.orderId ?? ids.settlementId ?? "unknown";
      return { text: `No settlement found for ${ref}.` };
    }

    return {
      text: formatPayStatus({
        settlement,
        order,
        brainSource: resolveBrainSource(deps.config),
        pendingCount: store.getPendingSettlements().length,
      }),
    };
  };
}
