import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withFileLock } from "openclaw/plugin-sdk/file-lock";
import type { WalletPolicyConfig } from "./policy.js";

const DEFAULT_LOCK_OPTIONS = {
  retries: {
    retries: 6,
    factor: 1.6,
    minTimeout: 40,
    maxTimeout: 800,
    randomize: true,
  },
  stale: 15_000,
};

type PolicyBudgetState = {
  version: 1;
  totals: Record<string, string>;
};

function emptyState(): PolicyBudgetState {
  return { version: 1, totals: {} };
}

function resolveStatePath(config: WalletPolicyConfig): string {
  if (config.statePath && config.statePath.trim().length > 0) {
    return config.statePath;
  }
  return path.join(os.homedir(), ".openclaw", "credentials", "agent-wallet", "policy-state.json");
}

function buildDayString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function buildDailyBudgetKey(now: Date, chainKey: string): string {
  return `budget:daily:${buildDayString(now)}:${chainKey}`;
}

async function loadState(target: string): Promise<PolicyBudgetState> {
  try {
    const raw = await fs.readFile(target, "utf8");
    const parsed = JSON.parse(raw) as Partial<PolicyBudgetState>;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) {
      return emptyState();
    }
    const totals: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.totals ?? {})) {
      if (typeof value === "string" && /^\d+$/.test(value)) {
        totals[key] = value;
      }
    }
    return { version: 1, totals };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyState();
    }
    throw err;
  }
}

async function saveState(target: string, state: PolicyBudgetState): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf8");
}

export async function readDailySpent(params: {
  config: WalletPolicyConfig;
  chainKey: string;
  now?: Date;
}): Promise<bigint> {
  const target = resolveStatePath(params.config);
  const key = buildDailyBudgetKey(params.now ?? new Date(), params.chainKey);
  const state = await loadState(target);
  return BigInt(state.totals[key] ?? "0");
}

/**
 * Atomically reserve daily budget: read current spent, check against cap,
 * and pre-commit the amount — all within a single file lock.
 * Returns a rollback function to undo the reservation if the transaction fails.
 */
export async function reserveDailyBudget(params: {
  config: WalletPolicyConfig;
  chainKey: string;
  amount: bigint;
  dailyCap: bigint;
  now?: Date;
}): Promise<{ dailySpent: bigint; rollback: () => Promise<void> }> {
  const target = resolveStatePath(params.config);
  const now = params.now ?? new Date();

  return withFileLock(target, DEFAULT_LOCK_OPTIONS, async () => {
    const state = await loadState(target);
    const key = buildDailyBudgetKey(now, params.chainKey);
    const current = BigInt(state.totals[key] ?? "0");

    if (current + params.amount > params.dailyCap) {
      throw new Error("POLICY_REJECTED:budget_daily_exceeded");
    }

    // Pre-commit: reserve the amount before the transaction executes
    const reserved = current + params.amount;
    state.totals[key] = reserved.toString();
    await saveState(target, state);

    return {
      dailySpent: current,
      rollback: async () => {
        // Undo the reservation if the transaction fails
        await withFileLock(target, DEFAULT_LOCK_OPTIONS, async () => {
          const s = await loadState(target);
          const cur = BigInt(s.totals[key] ?? "0");
          const reverted = cur >= params.amount ? cur - params.amount : 0n;
          s.totals[key] = reverted.toString();
          await saveState(target, s);
        });
      },
    };
  });
}

export async function addDailySpent(params: {
  config: WalletPolicyConfig;
  chainKey: string;
  amount: bigint;
  now?: Date;
}): Promise<bigint> {
  const target = resolveStatePath(params.config);
  const now = params.now ?? new Date();

  return withFileLock(target, DEFAULT_LOCK_OPTIONS, async () => {
    const state = await loadState(target);
    const key = buildDailyBudgetKey(now, params.chainKey);
    const current = BigInt(state.totals[key] ?? "0");
    const updated = current + params.amount;
    state.totals[key] = updated.toString();
    await saveState(target, state);
    return updated;
  });
}
