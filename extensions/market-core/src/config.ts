/**
 * Plugin configuration types and defaults for market-core.
 */

export type ChainNetwork =
  | "base"
  | "optimism"
  | "arbitrum"
  | "ethereum"
  | "sepolia"
  | "ton-mainnet"
  | "ton-testnet";

export type ChainConfig = {
  network: ChainNetwork;
  rpcUrl?: string;

  /** EVM signer private key (0x-prefixed) */
  privateKey?: string;

  /** TON headless signer mnemonic (space-separated) */
  tonMnemonic?: string;
  /** TON workchain (default: 0) */
  tonWorkchain?: number;

  escrowContractAddress?: string;

  /** EVM RewardDistributor contract address (for claim-based rewards). */
  rewardDistributorAddress?: string;
};

export type SettlementMode = "contract" | "anchor_only";

export type SettlementConfig = {
  mode: SettlementMode;
  tokenAddress?: string;
};

export type RevocationMode = "none" | "webhook";

export type RevocationConfig = {
  mode: RevocationMode;
  endpoint?: string;
  apiKey?: string;
  signingSecret?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
};

export type StoreMode = "file" | "sqlite";

export type StoreConfig = {
  mode: StoreMode;
  dbPath?: string;
  migrateFromFile?: boolean;
};

export type AccessMode = "open" | "scoped" | "allowlist";
export type ActorSource = "param" | "client" | "either";

export type AccessConfig = {
  mode: AccessMode;
  allowClientIds?: string[];
  allowRoles?: string[];
  allowScopes?: string[];
  readScopes?: string[];
  writeScopes?: string[];
  requireActor?: boolean;
  actorSource?: ActorSource;
  requireActorMatch?: boolean;
};

export type CredentialsMode = "inline" | "external";

export type CredentialsConfig = {
  mode: CredentialsMode;
  storePath?: string;
  encryptionKey?: string;
  lockTimeoutMs?: number;
};

export type RewardsConfig = {
  /** Master switch for reward grant capabilities. Default: true. */
  enabled: boolean;
};

export type MarketPluginConfig = {
  chain: ChainConfig;
  settlement: SettlementConfig;
  revocation: RevocationConfig;
  store: StoreConfig;
  access: AccessConfig;
  credentials: CredentialsConfig;
  rewards: RewardsConfig;
};

export const DEFAULT_CONFIG: MarketPluginConfig = {
  chain: {
    network: "base",
  },
  settlement: {
    mode: "contract",
  },
  revocation: {
    mode: "none",
  },
  store: {
    mode: "sqlite",
    migrateFromFile: true,
  },
  access: {
    mode: "allowlist",
    allowClientIds: ["gateway-client"],
    requireActor: false,
    actorSource: "param",
    requireActorMatch: false,
  },
  credentials: {
    mode: "inline",
    lockTimeoutMs: 5000,
  },
  rewards: {
    enabled: true,
  },
};

/** Merge user-supplied partial config with defaults. */
export function resolveConfig(raw?: Record<string, unknown>): MarketPluginConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  const merge = <T extends Record<string, unknown>>(defaults: T, partial?: unknown): T => {
    if (!partial || typeof partial !== "object") return { ...defaults };
    return { ...defaults, ...(partial as Partial<T>) };
  };
  return {
    chain: merge(DEFAULT_CONFIG.chain, raw.chain),
    settlement: merge(DEFAULT_CONFIG.settlement, raw.settlement),
    revocation: merge(DEFAULT_CONFIG.revocation, raw.revocation),
    store: merge(DEFAULT_CONFIG.store, raw.store),
    access: merge(DEFAULT_CONFIG.access, raw.access),
    credentials: merge(DEFAULT_CONFIG.credentials, raw.credentials),
    rewards: merge(DEFAULT_CONFIG.rewards, raw.rewards),
  };
}
