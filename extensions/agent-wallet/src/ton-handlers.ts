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
import type { TxReceipt } from "@openclaw/blockchain-adapter";
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

async function resolveTonProvider(
  network: AgentWalletConfig["chain"]["network"],
): Promise<IProviderTON> {
  await ensureBlockchainFactory();
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
  const provider = await resolveTonProvider(config.chain.network);

  if (!provider.isConnected) {
    await provider.connect({
      tonMnemonic: wallet.mnemonic,
      tonWorkchain: 0,
    });
  }

  return { provider, address: wallet.address };
}

async function confirmTonTransfer(
  provider: IProviderTON,
  to: string,
  amount: bigint,
): Promise<{
  submissionId: string;
  receipt: TxReceipt;
  confirmedAt: string;
  explorerUrl: string;
}> {
  const submissionId = await provider.transfer(to, amount);
  const receipt = await provider.waitForTransaction(submissionId, 1);
  const confirmedAt = new Date().toISOString();
  return {
    submissionId,
    receipt,
    confirmedAt,
    explorerUrl: provider.getExplorerUrl(receipt.txHash),
  };
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
        const confirmation = await confirmTonTransfer(provider, to, amount);
        await enforcement.commitUsage();
        respond(true, {
          txHash: confirmation.receipt.txHash,
          submissionId: confirmation.submissionId,
          chain: "ton",
          network: config.chain.network,
          confirmationStatus: "confirmed",
          confirmedAt: confirmation.confirmedAt,
          explorerUrl: confirmation.explorerUrl,
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

export function createTonWalletAutopayHandler(config: AgentWalletConfig): GatewayRequestHandler {
  return async ({ params, respond }: GatewayRequestHandlerOptions) => {
    try {
      ensureEnabled(config);
      const input = (params ?? {}) as Record<string, unknown>;
      const to = requireString(input.to, "to");
      const amountRaw = input.amount ?? input.value;
      const amount = parseAmount(amountRaw, "amount");
      const callerTool =
        typeof input.tool === "string" && input.tool.trim().length > 0
          ? input.tool.trim()
          : "agent-wallet.autopay";
      const enforcement = await enforcePolicy(config, {
        action: "autopay",
        chain: "ton",
        tool: callerTool,
        to,
        amount,
        method: "ton_transfer",
      });

      try {
        const { provider } = await ensureTonConnected(config);
        const confirmation = await confirmTonTransfer(provider, to, amount);
        await enforcement.commitUsage();
        respond(true, {
          txHash: confirmation.receipt.txHash,
          submissionId: confirmation.submissionId,
          chain: "ton",
          network: config.chain.network,
          confirmationStatus: "confirmed",
          confirmedAt: confirmation.confirmedAt,
          explorerUrl: confirmation.explorerUrl,
          policyAutoPayMaxRetries: enforcement.autoPayMaxRetries,
          policyDecisionId: enforcement.decision.decisionId,
          policyDecisionResult: enforcement.decision.result,
          policyDecisionReason: enforcement.decision.reasonCode,
          policyTool: callerTool,
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
