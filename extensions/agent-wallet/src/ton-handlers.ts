/**
 * TON-specific agent wallet handlers.
 *
 * These mirror the EVM handlers but use the blockchain-adapter TON provider.
 * Key generation reuses the same secure random seed stored by the existing wallet store;
 * TON address derivation is deferred to the TON provider at connect time.
 */

import {
  getTONProvider,
  initBlockchainFactory,
  type IProvider,
} from "@openclaw/blockchain-adapter";
import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { AgentWalletConfig } from "./config.js";
import { formatAgentWalletGatewayErrorResponse } from "./errors.js";
import { loadOrCreateWallet } from "./wallet.js";

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

function respondError(respond: GatewayRequestHandlerOptions["respond"], err: unknown): void {
  respond(false, formatAgentWalletGatewayErrorResponse(err));
}

function resolveTonProvider(): IProvider {
  ensureBlockchainFactory();
  return getTONProvider();
}

/**
 * TON wallet create handler.
 * Reuses the EVM wallet store (same seed/key); the TON address is derived separately.
 * For now, returns the EVM-derived key info with a note that TON address derivation
 * requires `@ton/crypto` integration (planned for Phase 1 TEE).
 */
export function createTonWalletCreateHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const wallet = await loadOrCreateWallet(config);
      // TON address derivation from the same seed is deferred to Phase 1
      // For now, expose the EVM-derived identity with chain annotation
      respond(true, {
        address: wallet.address,
        publicKey: wallet.publicKey,
        chain: "ton",
        note: "TON address derivation pending @ton/crypto integration",
      });
    } catch (err) {
      respondError(respond, err);
    }
  };
}

/**
 * TON balance handler — queries via the TON provider.
 */
export function createTonWalletBalanceHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const address = requireString(input.address, "address");
      const provider = resolveTonProvider();
      const balance = await provider.getBalance(address);
      respond(true, {
        address,
        balance: balance.toString(),
        symbol: "TON",
        chain: "ton",
      });
    } catch (err) {
      respondError(respond, err);
    }
  };
}

/**
 * TON send handler — transfers TON via the TON provider.
 */
export function createTonWalletSendHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const to = requireString(input.to, "to");
      const amount = requireString(input.amount, "amount");
      const provider = resolveTonProvider();
      const txHash = await provider.transfer(to, BigInt(amount));
      respond(true, { txHash, chain: "ton" });
    } catch (err) {
      respondError(respond, err);
    }
  };
}
