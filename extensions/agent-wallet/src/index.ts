import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk";
import type { AgentWalletConfig } from "./config.js";
import { resolveConfig } from "./config.js";
import {
  createAgentWalletBalanceHandler,
  createAgentWalletCreateHandler,
  createAgentWalletSendHandler,
  createAgentWalletSignHandler,
} from "./handlers.js";

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

    api.registerGatewayMethod("agent-wallet.create", createAgentWalletCreateHandler(config));
    api.registerGatewayMethod("agent-wallet.balance", createAgentWalletBalanceHandler(config));
    api.registerGatewayMethod("agent-wallet.sign", createAgentWalletSignHandler(config));
    api.registerGatewayMethod("agent-wallet.send", createAgentWalletSendHandler(config));
  },
};

export default plugin;
