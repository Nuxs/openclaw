import {
  assertProviderEVM,
  getEVMProvider,
  initBlockchainFactory,
  type IProviderEVM,
} from "@openclaw/blockchain-adapter";
import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import { getAddress } from "viem";
import type { AgentWalletConfig } from "./config.js";
import { formatAgentWalletGatewayErrorResponse } from "./errors.js";
import { appendPolicyDecisionLog, checkPolicy, loadPolicy, type PolicyIntent } from "./policy.js";
import { addDailySpent, readDailySpent, reserveDailyBudget } from "./state.js";
import { loadOrCreateWallet } from "./wallet.js";

const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  optimism: 10,
  arbitrum: 42161,
  sepolia: 11155111,
};

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

function parseMethodSelector(data: string | undefined): string | undefined {
  if (!data) {
    return undefined;
  }
  const normalized = data.trim().toLowerCase();
  if (/^0x[a-f0-9]{8,}$/.test(normalized)) {
    return normalized.slice(0, 10);
  }
  return undefined;
}

async function resolveProvider(
  config: AgentWalletConfig,
  privateKey: `0x${string}`,
): Promise<IProviderEVM> {
  ensureBlockchainFactory();
  const chainId = CHAIN_IDS[config.chain.network] ?? 8453;
  const provider = getEVMProvider(chainId);
  if (!provider.isConnected) {
    await provider.connect({ privateKey });
  }
  assertProviderEVM(provider);
  return provider;
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

  // For intents with an amount and a dailyCap configured, use atomic reservation
  // to eliminate the TOCTOU race between read and commit.
  let dailySpent: bigint | undefined;
  let rollback: (() => Promise<void>) | undefined;

  if (typeof intent.amount === "bigint" && loadedPolicy.policy?.budget?.dailyCap) {
    const dailyCap = BigInt(loadedPolicy.policy.budget.dailyCap);
    // reserveDailyBudget atomically: lock → read → check → pre-commit
    // Throws POLICY_REJECTED:budget_daily_exceeded if over cap.
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

export function createAgentWalletCreateHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const wallet = await loadOrCreateWallet(config);
      respond(true, { address: wallet.address, publicKey: wallet.publicKey });
    } catch (err) {
      respondError(respond, err);
    }
  };
}

export function createAgentWalletBalanceHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const wallet = await loadOrCreateWallet(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const address = input.address
        ? getAddress(requireString(input.address, "address"))
        : wallet.address;
      const provider = await resolveProvider(config, wallet.privateKey);
      const balance = await provider.getBalance(address);
      respond(true, {
        address,
        balance: balance.toString(),
        symbol: provider.nativeToken.symbol,
      });
    } catch (err) {
      respondError(respond, err);
    }
  };
}

export function createAgentWalletSignHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const message = requireString(input.message, "message");
      await enforcePolicy(config, {
        action: "sign",
        chain: "evm",
        tool: "agent-wallet.sign",
        method: "sign_message",
      });

      const wallet = await loadOrCreateWallet(config);
      const provider = await resolveProvider(config, wallet.privateKey);
      const signature = await provider.signMessage(message);
      respond(true, { signature });
    } catch (err) {
      respondError(respond, err);
    }
  };
}

export function createAgentWalletSendHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const to = getAddress(requireString(input.to, "to"));
      const value = parseAmount(input.value, "value");
      const data = typeof input.data === "string" ? input.data : undefined;
      const enforcement = await enforcePolicy(config, {
        action: "send",
        chain: "evm",
        tool: "agent-wallet.send",
        to,
        amount: value,
        method: parseMethodSelector(data),
      });

      try {
        const wallet = await loadOrCreateWallet(config);
        const provider = await resolveProvider(config, wallet.privateKey);
        const txHash = await provider.sendTransaction({ to, value, data });
        await enforcement.commitUsage();
        respond(true, { txHash });
      } catch (txErr) {
        await enforcement.rollbackUsage();
        throw txErr;
      }
    } catch (err) {
      respondError(respond, err);
    }
  };
}

export function createAgentWalletAutopayHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const to = getAddress(requireString(input.to, "to"));
      const valueRaw = input.value ?? input.amount;
      const value = parseAmount(valueRaw, "value");
      const data = typeof input.data === "string" ? input.data : undefined;
      const enforcement = await enforcePolicy(config, {
        action: "autopay",
        chain: "evm",
        tool: "agent-wallet.autopay",
        to,
        amount: value,
        method: parseMethodSelector(data),
      });

      try {
        const wallet = await loadOrCreateWallet(config);
        const provider = await resolveProvider(config, wallet.privateKey);
        const txHash = await provider.sendTransaction({ to, value, data });
        await enforcement.commitUsage();
        respond(true, {
          txHash,
          chain: "evm",
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
