import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withFileLock } from "openclaw/plugin-sdk";
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

const EMPTY_STATE: PolicyBudgetState = {
  version: 1,
  totals: {},
};

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
      return { ...EMPTY_STATE };
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
      return { ...EMPTY_STATE };
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
