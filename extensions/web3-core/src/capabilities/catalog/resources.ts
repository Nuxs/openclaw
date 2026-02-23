/**
 * Resource & Index capability descriptors.
 */
import type { Web3PluginConfig } from "../../config.js";
import type { CapabilityDescriptor } from "../types.js";
import { availability } from "./shared.js";

export function resourceCapabilities(config: Web3PluginConfig): CapabilityDescriptor[] {
  const resourcesEnabled = config.resources.enabled;
  const advertiseEnabled = resourcesEnabled && config.resources.advertiseToMarket;
  const consumerEnabled = resourcesEnabled && config.resources.consumer.enabled;

  return [
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
                  currency: { type: "string", description: "Must match price.currency" },
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
      returns:
        "Lease issuance result with leaseId/orderId/consentId/deliveryId/expiresAt/stored (token is stored internally and not returned).",
      risk: {
        level: "high",
        notes: ["Plaintext token is issued once and stored internally; never return it"],
      },
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
    // ── Index ──────────────────────────────────────────
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
          tag: { type: "string", description: "Filter by tag (optional)", example: "ipfs" },
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
        { summary: "List all index entries", params: { limit: 20 } },
        {
          summary: "List storage resources from specific provider",
          params: { kind: "storage", providerId: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1" },
        },
      ],
    },
    {
      name: "web3.index.gossip",
      summary: "Gossip signed index entries and peer hints to another gateway.",
      kind: "gateway",
      group: "index",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        required: ["entries"],
        properties: {
          entries: {
            type: "array",
            description: "Signed index entries to merge",
            items: { type: "object" },
          },
          peers: {
            type: "array",
            description: "Optional peer hints (no endpoint exposure)",
            items: {
              type: "object",
              required: ["peerId"],
              properties: {
                peerId: { type: "string" },
                transport: { type: "string", enum: ["gossip", "dht", "pubsub", "mdns", "static"] },
                lastSeenAt: { type: "string", description: "ISO timestamp" },
                source: { type: "string" },
              },
            },
          },
        },
      },
      returns: "Gossip merge stats (accepted/rejected).",
      risk: { level: "low" },
    },
    {
      name: "web3.index.peers.list",
      summary: "List known P2P peer hints (redacted).",
      kind: "gateway",
      group: "index",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max peers to return", minimum: 1, maximum: 500 },
        },
      },
      returns: "P2P peer list (no endpoints).",
      risk: { level: "low" },
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
  ];
}
