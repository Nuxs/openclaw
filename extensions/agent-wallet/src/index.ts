import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk/compat";
import { createAutopayRouterHandler } from "./autopay-router.js";
import type { AgentWalletConfig } from "./config.js";
import { isTONNetwork, resolveConfig } from "./config.js";
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
    api.registerGatewayMethod(
      "agent-wallet.autopay",
      createAutopayRouterHandler({
        config,
        evmAutopayHandler,
        tonAutopayHandler,
      }),
    );

    // EVM-only: sign (TON signing requires TonConnect, not yet supported)
    if (!tonMode) {
      api.registerGatewayMethod("agent-wallet.sign", createAgentWalletSignHandler(config));
    }
  },
};

export default plugin;
