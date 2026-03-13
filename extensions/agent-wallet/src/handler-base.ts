/**
 * Shared handler utilities for agent-wallet EVM and TON handlers.
 *
 * Extracted to eliminate ~150 lines of copy-paste between `handlers.ts` (EVM)
 * and `ton-handlers.ts` (TON). Each chain-specific file now imports from here.
 */

import { initBlockchainFactory } from "@openclaw/blockchain-adapter";
import type { GatewayRequestHandlerOptions } from "openclaw/plugin-sdk/gateway-types";
import type { AgentWalletConfig } from "./config.js";
import { formatAgentWalletGatewayErrorResponse } from "./errors.js";
import { appendPolicyDecisionLog, checkPolicy, loadPolicy, type PolicyIntent } from "./policy.js";
import { readDailySpent, reserveDailyBudget } from "./state.js";

// ── Singleton init ───────────────────────────────────────────────────────────

let blockchainFactoryReady = false;

export async function ensureBlockchainFactory(): Promise<void> {
  if (!blockchainFactoryReady) {
    await initBlockchainFactory();
    blockchainFactoryReady = true;
  }
}

// ── Input validation ─────────────────────────────────────────────────────────

export function ensureEnabled(config: AgentWalletConfig): void {
  if (!config.enabled) {
    throw new Error("agent-wallet is disabled");
  }
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

export function parseAmount(value: unknown, label: string): bigint {
  const raw = requireString(value, label);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${label} must be an integer string`);
  }
  return BigInt(raw);
}

// ── Error response ───────────────────────────────────────────────────────────

export function respondError(respond: GatewayRequestHandlerOptions["respond"], err: unknown): void {
  respond(false, formatAgentWalletGatewayErrorResponse(err));
}

// ── Policy enforcement (shared by EVM + TON) ─────────────────────────────────

export type EnforcementResult = {
  commitUsage: () => Promise<void>;
  rollbackUsage: () => Promise<void>;
  autoPayMaxRetries?: number;
};

/**
 * Enforce the agent-wallet policy for a given intent.
 * Handles pre-flight checks, atomic budget reservation, audit logging,
 * and rejection with structured error codes.
 */
export async function enforcePolicy(
  config: AgentWalletConfig,
  intent: PolicyIntent,
): Promise<EnforcementResult> {
  if (!config.policy.enabled) {
    return {
      commitUsage: async () => undefined,
      rollbackUsage: async () => undefined,
    };
  }

  const loadedPolicy = await loadPolicy(config.policy);

  // Pre-flight: check non-budget policy conditions first (scope, perTxCap, ttl, etc.)
  // to avoid unnecessary file-lock operations when the request would be rejected anyway.
  const preCheck = checkPolicy(loadedPolicy.policy, intent, { dailySpent: 0n });
  if (preCheck.result === "rejected" && preCheck.reasonCode !== "budget_daily_exceeded") {
    try {
      await appendPolicyDecisionLog(config.policy.decisionLogPath, preCheck);
    } catch {
      // Audit log failure does not change the policy decision.
    }
    throw new Error(`POLICY_REJECTED:${preCheck.reasonCode}`);
  }

  // For intents with an amount and a dailyCap configured, use atomic reservation
  // to eliminate the TOCTOU race between read and commit.
  let dailySpent: bigint | undefined;
  let rollback: (() => Promise<void>) | undefined;

  if (typeof intent.amount === "bigint" && loadedPolicy.policy?.budget?.dailyCap) {
    const dailyCap = BigInt(loadedPolicy.policy.budget.dailyCap);
    const reservation = await reserveDailyBudget({
      config: config.policy,
      chainKey: config.chain.network,
      amount: intent.amount,
      dailyCap,
    });
    dailySpent = reservation.dailySpent;
    rollback = reservation.rollback;
  } else if (typeof intent.amount === "bigint") {
    dailySpent = await readDailySpent({
      config: config.policy,
      chainKey: config.chain.network,
    });
  }

  const decision = checkPolicy(loadedPolicy.policy, intent, {
    dailySpent,
  });

  try {
    await appendPolicyDecisionLog(config.policy.decisionLogPath, decision);
  } catch {
    // 审计日志失败不改变策略判定结果，避免放大故障域。
  }

  if (decision.result === "rejected") {
    if (rollback) {
      await rollback();
    }
    throw new Error(`POLICY_REJECTED:${decision.reasonCode}`);
  }

  const autoPayMaxRetriesRaw = loadedPolicy.policy?.autoPay?.maxRetries;
  const autoPayMaxRetries =
    typeof autoPayMaxRetriesRaw === "number" && Number.isFinite(autoPayMaxRetriesRaw)
      ? Math.max(0, Math.floor(autoPayMaxRetriesRaw))
      : undefined;

  return {
    commitUsage: async () => {
      // Budget already pre-committed in reserveDailyBudget, nothing more to do.
    },
    rollbackUsage: rollback ?? (async () => undefined),
    autoPayMaxRetries,
  };
}
