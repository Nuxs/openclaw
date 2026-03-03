import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk";
import type { AgentWalletConfig } from "./config.js";
import { isEVMNetwork, isTONNetwork, resolveConfig } from "./config.js";
import { formatAgentWalletGatewayErrorResponse } from "./errors.js";
import {
  createAgentWalletAutopayHandler,
  createAgentWalletBalanceHandler,
  createAgentWalletCreateHandler,
  createAgentWalletSendHandler,
  createAgentWalletSignHandler,
} from "./handlers.js";
import {
  createTonWalletAutopayHandler,
  createTonWalletBalanceHandler,
  createTonWalletCreateHandler,
  createTonWalletSendHandler,
} from "./ton-handlers.js";

const agentWalletConfigSchema = {
  parse(value: unknown): AgentWalletConfig {
    const raw =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return resolveConfig(raw);
  },
  uiHints: {
    enabled: { label: "Enable Agent Wallet" },
    encryptionKey: { label: "Wallet Encryption Key", sensitive: true },
    storePath: { label: "Wallet Store Path", advanced: true },
    "chain.network": { label: "Chain Network" },
    "policy.enabled": { label: "Enable Wallet Policy Guard" },
    "policy.policyPath": { label: "Wallet Policy File Path", advanced: true },
    "policy.decisionLogPath": { label: "Wallet Policy Decision Log Path", advanced: true },
    "policy.statePath": { label: "Wallet Policy State Path", advanced: true },
  },
};

const plugin: OpenClawPluginDefinition = {
  id: "agent-wallet",
  name: "Agent Wallet",
  description: "Agent-owned wallet for signing and sending transactions",
  version: "2026.2.16",
  configSchema: agentWalletConfigSchema,

  register(api) {
    const config = agentWalletConfigSchema.parse(api.pluginConfig);
    const tonMode = isTONNetwork(config.chain.network);

    // Core wallet methods — dispatch to EVM or TON based on chain config
    api.registerGatewayMethod(
      "agent-wallet.create",
      tonMode ? createTonWalletCreateHandler(config) : createAgentWalletCreateHandler(config),
    );
    api.registerGatewayMethod(
      "agent-wallet.balance",
      tonMode ? createTonWalletBalanceHandler(config) : createAgentWalletBalanceHandler(config),
    );
    api.registerGatewayMethod(
      "agent-wallet.send",
      tonMode ? createTonWalletSendHandler(config) : createAgentWalletSendHandler(config),
    );
    const evmAutopayHandler = createAgentWalletAutopayHandler(config);
    const tonAutopayHandler = createTonWalletAutopayHandler(config);
    /**
     * Autopay dispatcher: routes to EVM or TON handler based on the `chain`
     * parameter from the billing invoice.
     *
     * Current assumption: a single node is configured for ONE network family
     * (either EVM or TON, never both simultaneously). If future multi-network
     * support is needed, `resolveConfig` and this dispatcher must be split
     * into per-family config/handler pairs.
     */
    api.registerGatewayMethod("agent-wallet.autopay", async (options) => {
      const input = (options.params ?? {}) as Record<string, unknown>;
      const chain = typeof input.chain === "string" ? input.chain.trim().toLowerCase() : undefined;
      if (chain === "evm") {
        if (!isEVMNetwork(config.chain.network)) {
          options.respond(
            false,
            formatAgentWalletGatewayErrorResponse(
              new Error(
                `E_INVALID_ARGUMENT: evm autopay is not supported on ${config.chain.network}`,
              ),
            ),
          );
          return;
        }
        await evmAutopayHandler(options);
        return;
      }
      if (chain === "ton") {
        if (!isTONNetwork(config.chain.network)) {
          options.respond(
            false,
            formatAgentWalletGatewayErrorResponse(
              new Error(
                `E_INVALID_ARGUMENT: ton autopay is not supported on ${config.chain.network}`,
              ),
            ),
          );
          return;
        }
        await tonAutopayHandler(options);
        return;
      }
      if (chain) {
        options.respond(
          false,
          formatAgentWalletGatewayErrorResponse(
            new Error(`E_INVALID_ARGUMENT: unsupported chain ${chain} for autopay`),
          ),
        );
        return;
      }
      if (tonMode) {
        await tonAutopayHandler(options);
        return;
      }
      await evmAutopayHandler(options);
    });

    // EVM-only: sign (TON signing requires TonConnect, not yet supported)
    if (!tonMode) {
      api.registerGatewayMethod("agent-wallet.sign", createAgentWalletSignHandler(config));
    }
  },
};

export default plugin;
