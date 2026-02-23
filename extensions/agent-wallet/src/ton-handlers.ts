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

      const { provider } = await ensureTonConnected(config);
      const txHash = await provider.transfer(to, amount);
      respond(true, { txHash, chain: "ton" });
    } catch (err) {
      respondError(respond, err);
    }
  };
}
