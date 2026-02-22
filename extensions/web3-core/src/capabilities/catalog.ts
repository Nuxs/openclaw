import type { Web3PluginConfig } from "../config.js";
import type { CapabilityDescriptor, CapabilitySummary } from "./types.js";

type CapabilityFilter = {
  includeUnavailable?: boolean;
  group?: string;
};

function availability(enabled: boolean, reason?: string) {
  return enabled ? { enabled } : { enabled, reason: reason ?? "disabled" };
}

function filterCapabilities(
  entries: CapabilityDescriptor[],
  filter?: CapabilityFilter,
): CapabilityDescriptor[] {
  const includeUnavailable = Boolean(filter?.includeUnavailable);
  const group = filter?.group?.trim();
  return entries.filter((entry) => {
    if (group && entry.group !== group) return false;
    if (includeUnavailable) return true;
    return entry.availability.enabled;
  });
}

export function describeWeb3Capabilities(
  config: Web3PluginConfig,
  filter?: CapabilityFilter,
): CapabilityDescriptor[] {
  const resourcesEnabled = config.resources.enabled;
  const advertiseEnabled = resourcesEnabled && config.resources.advertiseToMarket;
  const consumerEnabled = resourcesEnabled && config.resources.consumer.enabled;
  const identityEnabled = config.identity.allowSiwe;
  const billingEnabled = config.billing.enabled;

  const capabilities: CapabilityDescriptor[] = [
    {
      name: "web3.capabilities.list",
      summary: "List web3 capability summaries and availability.",
      kind: "gateway",
      group: "capabilities",
      availability: availability(true),
      paramsSchema: {
        includeUnavailable: "boolean",
        includeDetails: "boolean",
        group: "string",
      },
      returns: "Array of capability summaries or full descriptors.",
      examples: [{ summary: "List enabled capabilities" }],
    },
    {
      name: "web3.capabilities.describe",
      summary: "Describe a single web3 capability by name.",
      kind: "gateway",
      group: "capabilities",
      availability: availability(true),
      paramsSchema: { name: "string" },
      returns: "Capability descriptor with parameters, guards, and pricing hints.",
      examples: [
        {
          summary: "Describe web3.market.resource.publish",
          params: { name: "web3.market.resource.publish" },
        },
      ],
    },
    {
      name: "web3.siwe.challenge",
      summary: "Issue a SIWE challenge for wallet authentication.",
      kind: "gateway",
      group: "identity",
      availability: availability(identityEnabled, "siwe disabled"),
      paramsSchema: {
        type: "object",
        required: ["address"],
        properties: {
          address: {
            type: "string",
            description: "Ethereum wallet address to authenticate",
            pattern: "^0x[a-fA-F0-9]{40}$",
            example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          },
          chainId: {
            type: "number",
            description: "EVM chain ID (default: 1 for Ethereum mainnet)",
            example: 1,
          },
          statement: {
            type: "string",
            description: "Custom statement to include in challenge (optional)",
            maxLength: 200,
            example: "Sign in to OpenClaw Web3 Market",
          },
        },
      },
      returns: "SIWE challenge payload (message to sign with wallet).",
      risk: { level: "medium", notes: ["Identity binding - user must sign with private key"] },
      examples: [
        {
          summary: "Issue challenge for Ethereum address",
          params: {
            address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
            chainId: 1,
          },
        },
      ],
    },
    {
      name: "web3.siwe.verify",
      summary: "Verify a SIWE signed message.",
      kind: "gateway",
      group: "identity",
      availability: availability(identityEnabled, "siwe disabled"),
      paramsSchema: {
        type: "object",
        required: ["message", "signature"],
        properties: {
          message: {
            type: "string",
            description: "SIWE message from challenge (plain text)",
            minLength: 50,
            example: "example.com wants you to sign in...",
          },
          signature: {
            type: "string",
            description: "Hex-encoded signature from wallet",
            pattern: "^0x[a-fA-F0-9]{130}$",
            example: "0x1234abcd...",
          },
        },
      },
      returns: "Verification result (success/failure) and bound actorId if valid.",
      risk: { level: "medium", notes: ["Identity binding - creates authenticated session"] },
      examples: [
        {
          summary: "Verify SIWE signature",
          params: {
            message: "example.com wants you to sign in with your Ethereum account...",
            signature: "0x1234567890abcdef...",
          },
        },
      ],
    },
    {
      name: "web3.audit.query",
      summary: "Query recent audit events.",
      kind: "gateway",
      group: "audit",
      availability: availability(true),
      paramsSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max events to return (default: 50)",
            minimum: 1,
            maximum: 500,
            example: 50,
          },
          after: {
            type: "string",
            description: "Filter events after timestamp (ISO8601, optional)",
            example: "2026-02-01T00:00:00Z",
          },
          actorId: {
            type: "string",
            description: "Filter by actor ID (optional)",
            pattern: "^0x[a-fA-F0-9]{40}$",
            example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          },
          action: {
            type: "string",
            description: "Filter by action type (optional)",
            enum: [
              "resource.publish",
              "resource.unpublish",
              "lease.issue",
              "lease.revoke",
              "billing.charge",
            ],
            example: "lease.issue",
          },
        },
      },
      returns: "Recent audit events list with timestamps and actors.",
      risk: { level: "low" },
      examples: [
        {
          summary: "Query last 50 audit events",
          params: { limit: 50 },
        },
        {
          summary: "Query lease events for specific actor",
          params: { actorId: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1", action: "lease.issue" },
        },
      ],
    },
    {
      name: "web3.billing.status",
      summary: "Check billing status by session hash.",
      kind: "gateway",
      group: "billing",
      availability: availability(true, billingEnabled ? undefined : "billing disabled"),
      paramsSchema: {
        type: "object",
        required: ["sessionIdHash"],
        properties: {
          sessionIdHash: {
            type: "string",
            description: "SHA256 hash of session ID (hex string)",
            pattern: "^[a-fA-F0-9]{64}$",
            example: "a3c5e8d1b2f4...9f7e6d3c1a0b",
          },
        },
      },
      returns: "Billing enabled flag and current usage/credits snapshot.",
      risk: { level: "low" },
      examples: [
        {
          summary: "Check billing status for session",
          params: {
            sessionIdHash: "a3c5e8d1b2f4c7e9a1b3d5f7e9c1a3b5d7f9e1c3a5b7d9f1e3c5a7b9d1f3e5c7",
          },
        },
      ],
    },
    {
      name: "web3.billing.summary",
      summary: "Resolve billing summary by session identifiers.",
      kind: "gateway",
      group: "billing",
      availability: availability(true, billingEnabled ? undefined : "billing disabled"),
      paramsSchema: { sessionKey: "string", sessionId: "string", senderId: "string" },
      returns: "Billing enabled flag and remaining credits.",
      risk: { level: "low" },
    },
    {
      name: "web3.status.summary",
      summary: "Summarize web3-core status (audit, storage, anchoring).",
      kind: "gateway",
      group: "status",
      availability: availability(true),
      returns: "Status snapshot for web3-core services.",
    },
    {
      name: "web3.resources.publish",
      summary: "Publish a resource offer to the market.",
      kind: "gateway",
      group: "resources",
      availability: availability(advertiseEnabled, "resources advertise disabled"),
      paramsSchema: {
        type: "object",
        required: ["actorId", "resource"],
        properties: {
          actorId: {
            type: "string",
            description: "Provider actor identifier (required)",
            pattern: "^0x[a-fA-F0-9]{40}$",
            example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          },
          resource: {
            type: "object",
            description: "Market resource payload",
            required: ["kind", "label", "price", "offer"],
            properties: {
              resourceId: {
                type: "string",
                description: "Optional resourceId override (advanced)",
              },
              kind: {
                type: "string",
                description: "Resource kind",
                enum: ["model", "search", "storage"],
                example: "storage",
              },
              label: {
                type: "string",
                description: "Short display label",
                maxLength: 80,
                example: "Fast IPFS Storage",
              },
              description: {
                type: "string",
                description: "Optional description",
                maxLength: 400,
                example: "100TB IPFS-compatible storage",
              },
              tags: {
                type: "array",
                description: "Optional tags",
                items: { type: "string" },
                maxItems: 12,
                example: ["ipfs", "storage"],
              },
              price: {
                type: "object",
                description: "Pricing definition",
                required: ["unit", "amount", "currency"],
                properties: {
                  unit: {
                    type: "string",
                    description: "Billing unit (must match resource kind)",
                    enum: ["token", "call", "query", "gb_day", "put", "get"],
                    example: "gb_day",
                  },
                  amount: {
                    type: "string",
                    description: "Price per unit (decimal string)",
                    pattern: "^[0-9]+(\\.[0-9]+)?$",
                    example: "0.001",
                  },
                  currency: {
                    type: "string",
                    description: "Payment token symbol",
                    example: "USDT",
                  },
                  tokenAddress: {
                    type: "string",
                    description: "Optional ERC-20 token address",
                    pattern: "^0x[a-fA-F0-9]{40}$",
                  },
                },
              },
              policy: {
                type: "object",
                description: "Optional usage policy constraints",
                properties: {
                  maxConcurrent: { type: "number", minimum: 1, maximum: 1000 },
                  maxTokens: { type: "number", minimum: 1, maximum: 200000 },
                  maxBytes: { type: "number", minimum: 1, maximum: 1073741824 },
                  allowTools: { type: "boolean" },
                  allowMime: { type: "array", items: { type: "string" }, maxItems: 64 },
                },
              },
              offer: {
                type: "object",
                description: "Offer metadata (must align with price.currency)",
                required: ["assetId", "assetType", "currency", "usageScope", "deliveryType"],
                properties: {
                  assetId: { type: "string", description: "Asset identifier" },
                  assetType: {
                    type: "string",
                    description: "Asset type",
                    enum: ["data", "api", "service"],
                  },
                  currency: {
                    type: "string",
                    description: "Must match price.currency",
                  },
                  usageScope: {
                    type: "object",
                    description: "Usage scope",
                    required: ["purpose"],
                    properties: { purpose: { type: "string" } },
                  },
                  deliveryType: {
                    type: "string",
                    description: "Delivery type",
                    enum: ["download", "api", "service"],
                  },
                  assetMeta: { type: "object", description: "Optional asset metadata" },
                },
              },
            },
          },
        },
      },
      returns: "Published resource record.",
      risk: { level: "medium", notes: ["Public offer exposure"] },
      pricing: { requiresPreLock: false },
    },
    {
      name: "web3.resources.unpublish",
      summary: "Unpublish a resource offer.",
      kind: "gateway",
      group: "resources",
      availability: availability(advertiseEnabled, "resources advertise disabled"),
      paramsSchema: {
        type: "object",
        required: ["actorId", "resourceId"],
        properties: {
          actorId: {
            type: "string",
            description: "Provider actor identifier",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          resourceId: { type: "string", description: "Resource ID to unpublish" },
        },
      },
      returns: "Unpublish result.",
      risk: { level: "low" },
    },
    {
      name: "web3.resources.list",
      summary: "List published resource offers.",
      kind: "gateway",
      group: "resources",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            description: "Filter by resource kind (optional)",
            enum: ["model", "search", "storage"],
          },
          providerActorId: {
            type: "string",
            description: "Filter by provider actor ID (optional)",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          status: {
            type: "string",
            description: "Filter by resource status (optional)",
            enum: ["resource_draft", "resource_published", "resource_unpublished"],
          },
          tag: { type: "string", description: "Filter by tag (optional)" },
          limit: {
            type: "number",
            description: "Max number of resources to return",
            minimum: 1,
            maximum: 200,
          },
        },
      },
      returns: "Resource offers.",
      risk: { level: "low" },
    },
    {
      name: "web3.resources.lease",
      summary: "Issue a resource lease.",
      kind: "gateway",
      group: "resources",
      availability: availability(consumerEnabled, "resources consumer disabled"),
      paramsSchema: {
        type: "object",
        required: ["actorId", "resourceId", "consumerActorId", "ttlMs"],
        properties: {
          actorId: {
            type: "string",
            description: "Consumer actor identifier (must match consumerActorId)",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          resourceId: { type: "string", description: "Resource ID" },
          consumerActorId: {
            type: "string",
            description: "Consumer wallet address",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          ttlMs: {
            type: "number",
            description: "Lease duration in milliseconds",
            minimum: 10000,
            maximum: 604800000,
          },
          maxCost: {
            type: "string",
            description: "Optional max cost (decimal string)",
            pattern: "^[0-9]+(\\.[0-9]+)?$",
          },
          sessionKey: {
            type: "string",
            description: "Optional session key for settlement binding",
          },
          providerEndpoint: {
            type: "string",
            description: "Optional provider endpoint override (HTTPS)",
            pattern: "^https://",
          },
        },
      },
      returns: "Lease record with access token (one-time).",
      risk: { level: "high", notes: ["Access token issued once"] },
      pricing: { requiresPreLock: true },
    },
    {
      name: "web3.resources.revokeLease",
      summary: "Revoke a resource lease.",
      kind: "gateway",
      group: "resources",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        required: ["actorId", "leaseId"],
        properties: {
          actorId: {
            type: "string",
            description: "Actor requesting revocation",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          leaseId: { type: "string", description: "Lease ID" },
          reason: { type: "string", description: "Optional revoke reason" },
        },
      },
      returns: "Revocation result.",
      risk: { level: "low" },
    },
    {
      name: "web3.resources.status",
      summary: "Get resource or lease status.",
      kind: "gateway",
      group: "resources",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        properties: {
          actorId: {
            type: "string",
            description: "Optional actorId for lease access check",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          resourceId: { type: "string", description: "Resource ID (optional)" },
          leaseId: { type: "string", description: "Lease ID (optional)" },
        },
      },
      returns: "Resource or lease status.",
      risk: { level: "low" },
    },
    {
      name: "web3.index.report",
      summary: "Report signed resource index entries.",
      kind: "gateway",
      group: "index",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        required: ["resources"],
        properties: {
          providerId: {
            type: "string",
            description: "Provider actor ID (optional; defaults to local provider)",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          endpoint: {
            type: "string",
            description: "Provider endpoint URL (optional; internal use)",
            pattern: "^https://",
          },
          ttlMs: {
            type: "number",
            description: "TTL override (ms)",
            minimum: 60000,
            maximum: 2592000000,
          },
          meta: { type: "object", description: "Optional provider metadata" },
          resources: {
            type: "array",
            description: "Indexed resources",
            items: {
              type: "object",
              required: ["resourceId", "kind"],
              properties: {
                resourceId: { type: "string" },
                kind: { type: "string", enum: ["model", "search", "storage"] },
                label: { type: "string" },
                description: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                price: { type: "string" },
                unit: { type: "string" },
                metadata: { type: "object" },
              },
            },
          },
        },
      },
      returns: "Index report acknowledgement (signed entry stored).",
      risk: { level: "low" },
    },
    {
      name: "web3.index.list",
      summary: "List signed index entries.",
      kind: "gateway",
      group: "index",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max entries to return (default: 20)",
            minimum: 1,
            maximum: 500,
            example: 20,
          },
          kind: {
            type: "string",
            description: "Filter by resource kind (optional)",
            enum: ["model", "search", "storage"],
            example: "storage",
          },
          tag: {
            type: "string",
            description: "Filter by tag (optional)",
            example: "ipfs",
          },
          providerId: {
            type: "string",
            description: "Filter by provider actor ID (optional)",
            pattern: "^0x[a-fA-F0-9]{40}$",
            example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          },
        },
      },
      returns: "Index list response with provider signatures.",
      risk: { level: "low" },
      examples: [
        {
          summary: "List all index entries",
          params: { limit: 20 },
        },
        {
          summary: "List storage resources from specific provider",
          params: { kind: "storage", providerId: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1" },
        },
      ],
    },
    {
      name: "web3.index.heartbeat",
      summary: "Refresh index TTL for a provider entry.",
      kind: "gateway",
      group: "index",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        properties: {
          providerId: {
            type: "string",
            description: "Provider actor ID (optional; defaults to local provider)",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          ttlMs: {
            type: "number",
            description: "TTL override (ms)",
            minimum: 60000,
            maximum: 2592000000,
          },
        },
      },
      returns: "Heartbeat acknowledgement.",
      risk: { level: "low" },
    },
    {
      name: "web3.index.stats",
      summary: "Summarize indexed resources and providers.",
      kind: "gateway",
      group: "index",
      availability: availability(resourcesEnabled, "resources disabled"),
      returns: "Index stats (provider/resource counts).",
      risk: { level: "low" },
    },
    {
      name: "web3.metrics.snapshot",
      summary: "Snapshot web3-core metrics and alert signals.",
      kind: "gateway",
      group: "monitor",
      availability: availability(true),
      returns: "Metrics snapshot payload.",
      risk: { level: "low" },
    },
    {
      name: "web3.monitor.snapshot",
      summary: "Aggregate web3 + market metrics for monitoring dashboards.",
      kind: "gateway",
      group: "monitor",
      availability: availability(true),
      returns: "Combined monitoring snapshot (web3 + market).",
      risk: { level: "low" },
    },
    {
      name: "web3.market.resource.publish",
      summary: "Market entrypoint for resource publish (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(advertiseEnabled, "resources advertise disabled"),
      paramsSchema: {
        type: "object",
        required: ["actorId", "resource"],
        properties: {
          actorId: {
            type: "string",
            description: "Provider actor identifier (required)",
            pattern: "^0x[a-fA-F0-9]{40}$",
            example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          },
          resource: {
            type: "object",
            description: "Market resource payload",
            required: ["kind", "label", "price", "offer"],
            properties: {
              resourceId: {
                type: "string",
                description: "Optional resourceId override (advanced)",
              },
              kind: {
                type: "string",
                description: "Resource kind",
                enum: ["model", "search", "storage"],
                example: "storage",
              },
              label: {
                type: "string",
                description: "Short display label",
                maxLength: 80,
                example: "Fast IPFS Storage",
              },
              description: {
                type: "string",
                description: "Optional description",
                maxLength: 400,
                example: "100TB IPFS-compatible storage",
              },
              tags: {
                type: "array",
                description: "Optional tags",
                items: { type: "string" },
                maxItems: 12,
                example: ["ipfs", "storage"],
              },
              price: {
                type: "object",
                description: "Pricing definition",
                required: ["unit", "amount", "currency"],
                properties: {
                  unit: {
                    type: "string",
                    description: "Billing unit (must match resource kind)",
                    enum: ["token", "call", "query", "gb_day", "put", "get"],
                    example: "gb_day",
                  },
                  amount: {
                    type: "string",
                    description: "Price per unit (decimal string)",
                    pattern: "^[0-9]+(\\.[0-9]+)?$",
                    example: "0.001",
                  },
                  currency: {
                    type: "string",
                    description: "Payment token symbol",
                    example: "USDT",
                  },
                  tokenAddress: {
                    type: "string",
                    description: "Optional ERC-20 token address",
                    pattern: "^0x[a-fA-F0-9]{40}$",
                  },
                },
              },
              policy: {
                type: "object",
                description: "Optional usage policy constraints",
                properties: {
                  maxConcurrent: { type: "number", minimum: 1, maximum: 1000 },
                  maxTokens: { type: "number", minimum: 1, maximum: 200000 },
                  maxBytes: { type: "number", minimum: 1, maximum: 1073741824 },
                  allowTools: { type: "boolean" },
                  allowMime: { type: "array", items: { type: "string" }, maxItems: 64 },
                },
              },
              offer: {
                type: "object",
                description: "Offer metadata (must align with price.currency)",
                required: ["assetId", "assetType", "currency", "usageScope", "deliveryType"],
                properties: {
                  assetId: { type: "string", description: "Asset identifier" },
                  assetType: {
                    type: "string",
                    description: "Asset type",
                    enum: ["data", "api", "service"],
                  },
                  currency: {
                    type: "string",
                    description: "Must match price.currency",
                  },
                  usageScope: {
                    type: "object",
                    description: "Usage scope",
                    required: ["purpose"],
                    properties: { purpose: { type: "string" } },
                  },
                  deliveryType: {
                    type: "string",
                    description: "Delivery type",
                    enum: ["download", "api", "service"],
                  },
                  assetMeta: { type: "object", description: "Optional asset metadata" },
                },
              },
            },
          },
        },
      },
      returns: "Published resource record with generated resourceId.",
      aliases: ["web3.resources.publish"],
      examples: [
        {
          summary: "Publish a storage resource",
          params: {
            actorId: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
            resource: {
              kind: "storage",
              endpoint: "https://storage.example.com/v1",
              description: "100TB IPFS-compatible storage",
              pricing: { unit: "GB", amount: "0.001", currency: "USDT" },
              tags: ["ipfs", "high-speed"],
            },
          },
        },
      ],
    },
    {
      name: "web3.market.resource.unpublish",
      summary: "Market entrypoint for resource unpublish (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(advertiseEnabled, "resources advertise disabled"),
      paramsSchema: {
        type: "object",
        required: ["actorId", "resourceId"],
        properties: {
          actorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          resourceId: { type: "string" },
        },
      },
      returns: "Unpublish result.",
      aliases: ["web3.resources.unpublish"],
    },
    {
      name: "web3.market.resource.get",
      summary: "Market entrypoint for resource lookup (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        required: ["resourceId"],
        properties: { resourceId: { type: "string" } },
      },
      returns: "Resource record.",
    },
    {
      name: "web3.market.resource.list",
      summary: "Market entrypoint for resource listing (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            description: "Filter by resource kind (optional)",
            enum: ["model", "search", "storage"],
          },
          providerActorId: {
            type: "string",
            description: "Filter by provider actor ID (optional)",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          status: {
            type: "string",
            description: "Filter by resource status (optional)",
            enum: ["resource_draft", "resource_published", "resource_unpublished"],
          },
          tag: { type: "string", description: "Filter by tag (optional)" },
          limit: { type: "number", minimum: 1, maximum: 200 },
        },
      },
      returns: "Resource list response.",
      aliases: ["web3.resources.list"],
      examples: [
        {
          summary: "List first 10 storage resources",
          params: { limit: 10, kind: "storage" },
        },
        {
          summary: "List IPFS-tagged resources",
          params: { tag: "ipfs", limit: 20 },
        },
      ],
    },
    {
      name: "web3.market.lease.issue",
      summary: "Market entrypoint for lease issuance (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(consumerEnabled, "resources consumer disabled"),
      paramsSchema: {
        type: "object",
        required: ["actorId", "resourceId", "consumerActorId", "ttlMs"],
        properties: {
          actorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          resourceId: { type: "string", description: "Target resource ID" },
          consumerActorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          ttlMs: {
            type: "number",
            description: "Lease duration in milliseconds",
            minimum: 10000,
            maximum: 604800000,
          },
          maxCost: {
            type: "string",
            description: "Optional max cost (decimal string)",
            pattern: "^[0-9]+(\\.[0-9]+)?$",
          },
        },
      },
      returns: "Lease record with ONE-TIME access token (store immediately!).",
      aliases: ["web3.resources.lease"],
      risk: { level: "high", notes: ["Access token issued once and never shown again"] },
      pricing: { requiresPreLock: true },
      examples: [
        {
          summary: "Issue lease for storage resource",
          params: {
            actorId: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
            resourceId: "res_abc123",
            consumerActorId: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
            ttlMs: 86400000,
          },
        },
      ],
    },
    {
      name: "web3.market.lease.revoke",
      summary: "Market entrypoint for lease revocation (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        required: ["actorId", "leaseId"],
        properties: {
          actorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          leaseId: { type: "string" },
          reason: { type: "string" },
        },
      },
      returns: "Revocation result.",
      aliases: ["web3.resources.revokeLease"],
    },
    {
      name: "web3.market.lease.get",
      summary: "Market entrypoint for lease lookup (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        required: ["leaseId"],
        properties: {
          leaseId: { type: "string" },
          actorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
        },
      },
      returns: "Lease record.",
    },
    {
      name: "web3.market.lease.list",
      summary: "Market entrypoint for lease listing (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        properties: {
          providerActorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          consumerActorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          resourceId: { type: "string" },
          status: {
            type: "string",
            enum: ["lease_active", "lease_revoked", "lease_expired"],
          },
          limit: { type: "number", minimum: 1, maximum: 200 },
        },
      },
      returns: "Lease list response.",
    },
    {
      name: "web3.market.lease.expireSweep",
      summary: "Expire stale leases (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        properties: {
          actorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          now: { type: "string", description: "ISO timestamp (optional)" },
          limit: { type: "number", minimum: 1, maximum: 1000 },
          dryRun: { type: "boolean" },
        },
      },
      returns: "Expiration sweep summary.",
    },
    {
      name: "web3.market.ledger.list",
      summary: "List ledger entries (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        properties: {
          leaseId: { type: "string" },
          resourceId: { type: "string" },
          providerActorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          consumerActorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          since: { type: "string", description: "ISO timestamp (optional)" },
          until: { type: "string", description: "ISO timestamp (optional)" },
          limit: { type: "number", minimum: 1, maximum: 200 },
        },
      },
      returns: "Ledger entries list.",
      examples: [
        {
          summary: "List last 50 ledger entries",
          params: { limit: 50 },
        },
        {
          summary: "List entries for a specific lease",
          params: { leaseId: "lease_xyz789" },
        },
      ],
    },
    {
      name: "web3.market.ledger.summary",
      summary: "Summarize ledger totals (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        properties: {
          resourceId: { type: "string" },
          leaseId: { type: "string" },
          providerActorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          consumerActorId: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
          since: { type: "string" },
          until: { type: "string" },
        },
      },
      returns: "Ledger summary with total charges, refunds, and net balance.",
      examples: [
        {
          summary: "Get ledger summary for a lease",
          params: { leaseId: "lease_xyz789" },
        },
      ],
    },
    {
      name: "web3.dispute.open",
      summary: "Open a dispute for an order or lease.",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        required: ["orderId", "reason", "resourceId", "consumerId", "providerId"],
        properties: {
          orderId: { type: "string", description: "Order or lease identifier" },
          reason: {
            type: "string",
            description: "Dispute reason (10-500 chars)",
            minLength: 10,
            maxLength: 500,
          },
          resourceId: { type: "string", description: "Resource ID" },
          consumerId: {
            type: "string",
            description: "Consumer actor ID",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          providerId: {
            type: "string",
            description: "Provider actor ID",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
        },
      },
      returns: "Dispute opened status with expiry information.",
      risk: { level: "medium", notes: ["Creates dispute record"] },
    },
    {
      name: "web3.dispute.submitEvidence",
      summary: "Submit dispute evidence.",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        required: ["disputeId", "submittedBy", "description"],
        properties: {
          disputeId: { type: "string", description: "Dispute ID" },
          submittedBy: {
            type: "string",
            description: "Submitting party actor ID",
            pattern: "^0x[a-fA-F0-9]{40}$",
          },
          type: {
            type: "string",
            description: "Evidence type",
            enum: ["usage_log", "screenshot", "api_response", "other"],
          },
          description: { type: "string", description: "Evidence summary" },
          data: { type: "object", description: "Optional evidence payload (limited size)" },
        },
      },
      returns: "Evidence submission status with content hash.",
      risk: { level: "medium" },
    },
    {
      name: "web3.dispute.resolve",
      summary: "Resolve a dispute with a ruling.",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        required: ["disputeId", "ruling", "reason"],
        properties: {
          disputeId: { type: "string", description: "Dispute ID" },
          ruling: {
            type: "string",
            description: "Resolution ruling",
            enum: ["provider_wins", "consumer_wins", "split", "timeout"],
          },
          reason: { type: "string", description: "Resolution reason" },
          refundAmount: {
            type: "string",
            description: "Optional refund amount (decimal string)",
            pattern: "^[0-9]+(\\.[0-9]+)?$",
          },
          resolvedBy: { type: "string", description: "Resolver actor ID or system" },
        },
      },
      returns: "Resolution result with ruling details.",
      risk: { level: "medium" },
    },
    {
      name: "web3.dispute.reject",
      summary: "Reject a dispute without ruling.",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        required: ["disputeId"],
        properties: {
          disputeId: { type: "string", description: "Dispute ID" },
          reason: { type: "string", description: "Optional rejection reason" },
        },
      },
      returns: "Rejection result.",
      risk: { level: "medium" },
    },
    {
      name: "web3.dispute.get",
      summary: "Get a dispute record.",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        required: ["disputeId"],
        properties: { disputeId: { type: "string", description: "Dispute ID" } },
      },
      returns: "Dispute record.",
      risk: { level: "low" },
    },
    {
      name: "web3.dispute.list",
      summary: "List dispute records.",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Filter by order/lease ID" },
          status: {
            type: "string",
            description: "Filter by dispute status",
            enum: ["open", "evidence_submitted", "resolved", "rejected", "expired"],
          },
          limit: {
            type: "number",
            description: "Max records to return",
            minimum: 1,
            maximum: 100,
          },
        },
      },
      returns: "Dispute list.",
      risk: { level: "low" },
    },
    {
      name: "web3.search.query",
      summary: "Query a leased search resource.",
      kind: "tool",
      group: "tools",
      availability: availability(consumerEnabled, "resources consumer disabled"),
      paramsSchema: { resourceId: "string", q: "string", limit: "number", site: "string" },
      returns: "Search results.",
      risk: { level: "medium", notes: ["Calls provider endpoint with lease"] },
    },
    {
      name: "web3.storage.put",
      summary: "Write bytes to a leased storage resource.",
      kind: "tool",
      group: "tools",
      availability: availability(consumerEnabled, "resources consumer disabled"),
      paramsSchema: { resourceId: "string", path: "string", bytesBase64: "string", mime: "string" },
      returns: "Write result with size and etag.",
      risk: { level: "medium", notes: ["Calls provider endpoint with lease"] },
    },
    {
      name: "web3.storage.get",
      summary: "Read bytes from a leased storage resource.",
      kind: "tool",
      group: "tools",
      availability: availability(consumerEnabled, "resources consumer disabled"),
      paramsSchema: { resourceId: "string", path: "string" },
      returns: "Read result with bytesBase64.",
      risk: { level: "medium", notes: ["Calls provider endpoint with lease"] },
    },
    {
      name: "web3.storage.list",
      summary: "List items in a leased storage resource.",
      kind: "tool",
      group: "tools",
      availability: availability(consumerEnabled, "resources consumer disabled"),
      paramsSchema: { resourceId: "string", prefix: "string", limit: "number" },
      returns: "Storage listing.",
      risk: { level: "medium", notes: ["Calls provider endpoint with lease"] },
    },
  ];

  return filterCapabilities(capabilities, filter);
}

export function listWeb3Capabilities(
  config: Web3PluginConfig,
  filter?: CapabilityFilter,
): CapabilitySummary[] {
  return describeWeb3Capabilities(config, filter).map((entry) => ({
    name: entry.name,
    summary: entry.summary,
    kind: entry.kind,
    group: entry.group,
    availability: entry.availability,
    aliases: entry.aliases,
  }));
}

export function findWeb3Capability(
  config: Web3PluginConfig,
  name: string,
  filter?: CapabilityFilter,
): CapabilityDescriptor | null {
  const normalized = name.trim();
  if (!normalized) return null;
  return (
    describeWeb3Capabilities(config, filter).find((entry) => entry.name === normalized) ?? null
  );
}
