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
// Monitor & Alerts
// ---------------------------------------------------------------------------

export type MonitorConfig = {
  enabled: boolean;
  notifications?: {
    enabled: boolean;
    channels?: {
      webhook?: {
        url: string;
        method?: "POST" | "PUT";
        headers?: Record<string, string>;
        timeout?: number;
      };
      wecom?: {
        webhookUrl: string;
        mentionUsers?: string[];
        mentionAll?: boolean;
      };
    };
  };
};

// ---------------------------------------------------------------------------
// Resources sharing (B-2)
// ---------------------------------------------------------------------------

export type ResourceProviderBind = "loopback" | "lan";

export type ResourcePriceUnit = "token" | "call" | "query" | "gb_day" | "put" | "get";

export type ResourcePrice = {
  unit: ResourcePriceUnit;
  amount: number;
  currency: string;
};

export type ResourceModelOffer = {
  id: string;
  label: string;
  backend: "ollama" | "lmstudio" | "openai-compat" | "custom";
  backendConfig: Record<string, unknown>;
  price: ResourcePrice;
  policy: {
    maxConcurrent: number;
    maxTokens?: number;
    allowTools: boolean;
  };
};

export type ResourceSearchOffer = {
  id: string;
  label: string;
  backend: "searxng" | "custom";
  backendConfig: Record<string, unknown>;
  price: ResourcePrice;
  policy?: {
    maxConcurrent?: number;
    maxQueryChars?: number;
  };
};

export type ResourceStorageOffer = {
  id: string;
  label: string;
  backend: "filesystem" | "s3" | "ipfs" | "custom";
  backendConfig: Record<string, unknown>;
  price: ResourcePrice;
  policy: {
    maxBytes: number;
    allowMime?: string[];
    maxConcurrent?: number;
  };
};

export type ResourceProviderConfig = {
  listen: {
    enabled: boolean;
    bind: ResourceProviderBind;
    port: number;
    publicBaseUrl?: string;
  };
  auth: {
    mode: "siwe" | "token";
    tokenTtlMs: number;
    allowedConsumers?: string[];
  };
  offers: {
    models: ResourceModelOffer[];
    search: ResourceSearchOffer[];
    storage: ResourceStorageOffer[];
  };
};

export type ResourceConsumerConfig = {
  enabled: boolean;
  preferLocalFirst: boolean;
};

export type ResourceSharingConfig = {
  enabled: boolean;
  advertiseToMarket: boolean;
  provider: ResourceProviderConfig;
  consumer: ResourceConsumerConfig;
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
  resources: ResourceSharingConfig;
  browserIngest: BrowserIngestConfig;
  monitor: MonitorConfig;
  rewards?: { enabled: boolean };
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
  resources: {
    enabled: false,
    advertiseToMarket: false,
    provider: {
      listen: {
        enabled: false,
        bind: "loopback",
        port: 0,
      },
      auth: {
        mode: "siwe",
        tokenTtlMs: 10 * 60_000,
        allowedConsumers: [],
      },
      offers: {
        models: [],
        search: [],
        storage: [],
      },
    },
    consumer: {
      enabled: true,
      preferLocalFirst: true,
    },
  },
  browserIngest: {
    enabled: false,
    ingestPath: "/plugins/web3-core/ingest",
    allowLoopback: true,
    maxBodyBytes: 64 * 1024,
  },
  monitor: {
    enabled: true,
    notifications: {
      enabled: false, // disabled by default, user must configure
      channels: {},
    },
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
    resources: merge(DEFAULT_CONFIG.resources, raw.resources),
    browserIngest: merge(DEFAULT_CONFIG.browserIngest, raw.browserIngest),
    monitor: merge(DEFAULT_CONFIG.monitor, raw.monitor),
  };
}
