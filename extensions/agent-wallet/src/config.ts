export type AgentWalletChainNetwork = "ethereum" | "base" | "optimism" | "arbitrum" | "sepolia";

export type AgentWalletChainConfig = {
  network: AgentWalletChainNetwork;
};

export type AgentWalletConfig = {
  enabled: boolean;
  storePath?: string;
  encryptionKey?: string;
  chain: AgentWalletChainConfig;
};

export const DEFAULT_CONFIG: AgentWalletConfig = {
  enabled: true,
  chain: { network: "base" },
};

export function resolveConfig(raw?: Record<string, unknown>): AgentWalletConfig {
  if (!raw) return { ...DEFAULT_CONFIG };

  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled;
  const storePath = typeof raw.storePath === "string" ? raw.storePath : undefined;
  const encryptionKey = typeof raw.encryptionKey === "string" ? raw.encryptionKey : undefined;

  const chainRaw =
    raw.chain && typeof raw.chain === "object" ? (raw.chain as Record<string, unknown>) : {};
  const network =
    typeof chainRaw.network === "string" &&
    ["ethereum", "base", "optimism", "arbitrum", "sepolia"].includes(chainRaw.network)
      ? (chainRaw.network as AgentWalletChainNetwork)
      : DEFAULT_CONFIG.chain.network;

  return {
    enabled,
    storePath,
    encryptionKey,
    chain: { network },
  };
}
