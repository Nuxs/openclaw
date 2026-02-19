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
  filecoinToken?: string;
  filecoinEndpoint?: string;
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
// Web3 decentralized brain
// ---------------------------------------------------------------------------

export type BrainProtocol = "openai-compat" | "custom-ws" | "p2p";

export type BrainConfig = {
  enabled: boolean;
  providerId: string;
  defaultModel: string;
  allowlist: string[];
  endpoint?: string;
  protocol: BrainProtocol;
  fallback: "centralized";
  timeoutMs: number;
};

// ---------------------------------------------------------------------------
// Browser ingest (extension -> Gateway)
// ---------------------------------------------------------------------------

export type BrowserIngestConfig = {
  enabled: boolean;
  ingestPath: string;
  token?: string;
  allowLoopback: boolean;
  maxBodyBytes: number;
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
  brain: BrainConfig;
  browserIngest: BrowserIngestConfig;
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
    filecoinEndpoint: "https://api.web3.storage/upload",
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
  brain: {
    enabled: false,
    providerId: "web3-decentralized",
    defaultModel: "",
    allowlist: [],
    protocol: "openai-compat",
    fallback: "centralized",
    timeoutMs: 30_000,
  },
  browserIngest: {
    enabled: false,
    ingestPath: "/plugins/web3-core/ingest",
    allowLoopback: true,
    maxBodyBytes: 64 * 1024,
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
    brain: merge(DEFAULT_CONFIG.brain, raw.brain),
    browserIngest: merge(DEFAULT_CONFIG.browserIngest, raw.browserIngest),
  };
}
