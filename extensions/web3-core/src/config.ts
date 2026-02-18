/**
 * Plugin configuration types and defaults for web3-core.
 *
 * Privacy default: "hash_only" on-chain, encrypted archive, redact sensitive fields.
 * Chain default: Base (EVM L2) — cheapest gas, broad wallet support, SIWE-compatible.
 */

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

export type ChainNetwork = "base" | "optimism" | "arbitrum" | "ethereum" | "sepolia";

export type ChainConfig = {
  network: ChainNetwork;
  rpcUrl?: string;
  privateKey?: string;
  contractAddress?: string;
};

// ---------------------------------------------------------------------------
// Decentralized storage
// ---------------------------------------------------------------------------

export type StorageProvider = "ipfs" | "arweave" | "filecoin";

export type StorageConfig = {
  provider: StorageProvider;
  gateway?: string;
  pinataJwt?: string;
  arweaveKeyfile?: string;
};

// ---------------------------------------------------------------------------
// Privacy & redaction
// ---------------------------------------------------------------------------

export type OnChainDataPolicy = "hash_only" | "hash_and_meta" | "encrypted_content";

export type PrivacyConfig = {
  onChainData: OnChainDataPolicy;
  archiveEncryption: boolean;
  redactFields: string[];
};

// ---------------------------------------------------------------------------
// Identity (wallet / SIWE)
// ---------------------------------------------------------------------------

export type IdentityConfig = {
  allowSiwe: boolean;
  requiredChainId?: number;
  domain?: string;
  uri?: string;
  statement?: string;
  challengeTtlMs?: number;
};

// ---------------------------------------------------------------------------
// Billing / quota
// ---------------------------------------------------------------------------

export type BillingConfig = {
  enabled: boolean;
  quotaPerSession: number;
  costPerLlmCall: number;
  costPerToolCall: number;
  paymentTokenAddress?: string;
  paymentReceiverAddress?: string;
};

// ---------------------------------------------------------------------------
// Top-level plugin config
// ---------------------------------------------------------------------------

export type Web3PluginConfig = {
  chain: ChainConfig;
  storage: StorageConfig;
  privacy: PrivacyConfig;
  identity: IdentityConfig;
  billing: BillingConfig;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_REDACT_FIELDS = ["apiKey", "token", "password", "secret", "privateKey"];

export const DEFAULT_CONFIG: Web3PluginConfig = {
  chain: {
    network: "base",
  },
  storage: {
    provider: "ipfs",
    gateway: "https://w3s.link",
  },
  privacy: {
    onChainData: "hash_only",
    archiveEncryption: true,
    redactFields: DEFAULT_REDACT_FIELDS,
  },
  identity: {
    allowSiwe: true,
    domain: "openclaw.ai",
    uri: "https://openclaw.ai",
    statement: "Sign in to OpenClaw Web3",
    challengeTtlMs: 5 * 60_000,
  },
  billing: {
    enabled: false,
    quotaPerSession: 1000,
    costPerLlmCall: 1,
    costPerToolCall: 0.5,
  },
};

/** Merge user-supplied partial config with defaults. */
export function resolveConfig(raw?: Record<string, unknown>): Web3PluginConfig {
  if (!raw) return { ...DEFAULT_CONFIG };
  const merge = <T extends Record<string, unknown>>(defaults: T, partial?: unknown): T => {
    if (!partial || typeof partial !== "object") return { ...defaults };
    return { ...defaults, ...(partial as Partial<T>) };
  };
  return {
    chain: merge(DEFAULT_CONFIG.chain, raw.chain),
    storage: merge(DEFAULT_CONFIG.storage, raw.storage),
    privacy: merge(DEFAULT_CONFIG.privacy, raw.privacy),
    identity: merge(DEFAULT_CONFIG.identity, raw.identity),
    billing: merge(DEFAULT_CONFIG.billing, raw.billing),
  };
}
