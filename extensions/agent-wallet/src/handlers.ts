import { assertProviderEVM, getEVMProvider, type IProviderEVM } from "@openclaw/blockchain-adapter";
import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import { getAddress } from "viem";
import type { AgentWalletConfig } from "./config.js";
import {
  enforcePolicy,
  ensureBlockchainFactory,
  ensureEnabled,
  parseAmount,
  requireString,
  respondError,
} from "./handler-base.js";
import { loadOrCreateWallet } from "./wallet.js";

const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  optimism: 10,
  arbitrum: 42161,
  sepolia: 11155111,
};

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
  await ensureBlockchainFactory();
  const chainId = CHAIN_IDS[config.chain.network] ?? 8453;
  const provider = await getEVMProvider(chainId);
  if (!provider.isConnected) {
    await provider.connect({ privateKey });
  }
  assertProviderEVM(provider);
  return provider;
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
      const callerTool =
        typeof input.tool === "string" && input.tool.trim().length > 0
          ? input.tool.trim()
          : "agent-wallet.autopay";
      const enforcement = await enforcePolicy(config, {
        action: "autopay",
        chain: "evm",
        tool: callerTool,
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
