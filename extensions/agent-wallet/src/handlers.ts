import {
  assertProviderEVM,
  getEVMProvider,
  initBlockchainFactory,
  type IProviderEVM,
} from "@openclaw/blockchain-adapter";
import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import { getAddress } from "viem";
import type { AgentWalletConfig } from "./config.js";
import { formatAgentWalletGatewayErrorResponse } from "./errors.js";
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
      const wallet = await loadOrCreateWallet(config);
      const provider = await resolveProvider(config, wallet.privateKey);
      const txHash = await provider.sendTransaction({ to, value, data });
      respond(true, { txHash });
    } catch (err) {
      respondError(respond, err);
    }
  };
}
