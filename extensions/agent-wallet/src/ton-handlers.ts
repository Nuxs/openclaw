/**
 * TON-specific agent wallet handlers (headless).
 *
 * - Address derivation: `@ton/crypto` (via blockchain-adapter helpers)
 * - Transaction sending: blockchain-adapter TON provider in headless mode
 */

import {
  getProvider,
  isProviderTON,
  type IProvider,
  type IProviderTON,
} from "@openclaw/blockchain-adapter";
import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { AgentWalletConfig } from "./config.js";
import {
  enforcePolicy,
  ensureBlockchainFactory,
  ensureEnabled,
  parseAmount,
  requireString,
  respondError,
} from "./handler-base.js";
import { loadOrCreateTonWallet } from "./ton-wallet.js";

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
