/**
 * TON-specific agent wallet handlers (headless).
 *
 * - Address derivation: `@ton/crypto` (via blockchain-adapter helpers)
 * - Transaction sending: blockchain-adapter TON provider in headless mode
 */

import {
  getProvider,
  initBlockchainFactory,
  isProviderTON,
  type IProvider,
  type IProviderTON,
} from "@openclaw/blockchain-adapter";
import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { AgentWalletConfig } from "./config.js";
import { formatAgentWalletGatewayErrorResponse } from "./errors.js";
import { appendPolicyDecisionLog, checkPolicy, loadPolicy, type PolicyIntent } from "./policy.js";
import { addDailySpent, readDailySpent, reserveDailyBudget } from "./state.js";
import { loadOrCreateTonWallet } from "./ton-wallet.js";

let blockchainFactoryReady = false;

function ensureBlockchainFactory() {
  if (!blockchainFactoryReady) {
    initBlockchainFactory();
    blockchainFactoryReady = true;
  }
}

function ensureEnabled(config: AgentWalletConfig) {
  if (!config.enabled) {
    throw new Error("agent-wallet is disabled");
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function parseAmount(value: unknown, label: string): bigint {
  const raw = requireString(value, label);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${label} must be an integer string`);
  }
  return BigInt(raw);
}

async function enforcePolicy(
  config: AgentWalletConfig,
  intent: PolicyIntent,
): Promise<{
  commitUsage: () => Promise<void>;
  rollbackUsage: () => Promise<void>;
  autoPayMaxRetries?: number;
}> {
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

function respondError(respond: GatewayRequestHandlerOptions["respond"], err: unknown): void {
  respond(false, formatAgentWalletGatewayErrorResponse(err));
}

function resolveTonProvider(network: AgentWalletConfig["chain"]["network"]): IProviderTON {
  ensureBlockchainFactory();
  const provider: IProvider = getProvider(network);
  if (!isProviderTON(provider)) {
    throw new Error(`Expected TON provider for ${network}, got ${provider.chainType}`);
  }
  return provider;
}

async function ensureTonConnected(
  config: AgentWalletConfig,
): Promise<{ provider: IProviderTON; address: string }> {
  const wallet = await loadOrCreateTonWallet(config);
  const provider = resolveTonProvider(config.chain.network);

  if (!provider.isConnected) {
    await provider.connect({
      tonMnemonic: wallet.mnemonic,
      tonWorkchain: 0,
    });
  }

  return { provider, address: wallet.address };
}

export function createTonWalletCreateHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const wallet = await loadOrCreateTonWallet(config);
      respond(true, {
        address: wallet.address,
        publicKey: wallet.publicKey,
        chain: "ton",
      });
    } catch (err) {
      respondError(respond, err);
    }
  };
}

export function createTonWalletBalanceHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const address = input.address ? requireString(input.address, "address") : undefined;
      const { provider, address: defaultAddress } = await ensureTonConnected(config);

      const target = address ?? defaultAddress;
      const balance = await provider.getBalance(target);
      respond(true, {
        address: target,
        balance: balance.toString(),
        symbol: "TON",
        chain: "ton",
      });
    } catch (err) {
      respondError(respond, err);
    }
  };
}

export function createTonWalletSendHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const to = requireString(input.to, "to");
      const amount = parseAmount(input.amount, "amount");
      const enforcement = await enforcePolicy(config, {
        action: "send",
        chain: "ton",
        tool: "agent-wallet.send",
        to,
        amount,
        method: "ton_transfer",
      });

      try {
        const { provider } = await ensureTonConnected(config);
        const txHash = await provider.transfer(to, amount);
        await enforcement.commitUsage();
        respond(true, { txHash, chain: "ton" });
      } catch (txErr) {
        await enforcement.rollbackUsage();
        throw txErr;
      }
    } catch (err) {
      respondError(respond, err);
    }
  };
}

export function createTonWalletAutopayHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const to = requireString(input.to, "to");
      const amountRaw = input.amount ?? input.value;
      const amount = parseAmount(amountRaw, "amount");
      const enforcement = await enforcePolicy(config, {
        action: "autopay",
        chain: "ton",
        tool: "agent-wallet.autopay",
        to,
        amount,
        method: "ton_transfer",
      });

      try {
        const { provider } = await ensureTonConnected(config);
        const txHash = await provider.transfer(to, amount);
        await enforcement.commitUsage();
        respond(true, {
          txHash,
          chain: "ton",
          network: config.chain.network,
          policyAutoPayMaxRetries: enforcement.autoPayMaxRetries,
        });
      } catch (txErr) {
        await enforcement.rollbackUsage();
        throw txErr;
      }
    } catch (err) {
      respondError(respond, err);
    }
  };
}
