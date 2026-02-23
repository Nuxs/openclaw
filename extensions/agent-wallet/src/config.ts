export type AgentWalletChainNetwork =
  | "ethereum"
  | "base"
  | "optimism"
  | "arbitrum"
  | "sepolia"
  | "ton-mainnet"
  | "ton-testnet";

/** Chains that use the EVM execution path. */
const EVM_NETWORKS: ReadonlySet<string> = new Set([
  "ethereum",
  "base",
  "optimism",
  "arbitrum",
  "sepolia",
]);

/** Chains that use the TON execution path. */
const TON_NETWORKS: ReadonlySet<string> = new Set(["ton-mainnet", "ton-testnet"]);

export function isEVMNetwork(network: AgentWalletChainNetwork): boolean {
  return EVM_NETWORKS.has(network);
}

export function isTONNetwork(network: AgentWalletChainNetwork): boolean {
  return TON_NETWORKS.has(network);
}

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
  const VALID_NETWORKS = [
    "ethereum",
    "base",
    "optimism",
    "arbitrum",
    "sepolia",
    "ton-mainnet",
    "ton-testnet",
  ];
  const network =
    typeof chainRaw.network === "string" && VALID_NETWORKS.includes(chainRaw.network)
      ? (chainRaw.network as AgentWalletChainNetwork)
      : DEFAULT_CONFIG.chain.network;

  return {
    enabled,
    storePath,
    encryptionKey,
    chain: { network },
  };
}
