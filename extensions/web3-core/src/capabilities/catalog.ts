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
      paramsSchema: { resource: "ResourceOffer" },
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
      paramsSchema: { resourceId: "string" },
      returns: "Unpublish result.",
      risk: { level: "low" },
    },
    {
      name: "web3.resources.list",
      summary: "List published resource offers.",
      kind: "gateway",
      group: "resources",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { limit: "number", cursor: "string" },
      returns: "Resource offers.",
      risk: { level: "low" },
    },
    {
      name: "web3.resources.lease",
      summary: "Issue a resource lease.",
      kind: "gateway",
      group: "resources",
      availability: availability(consumerEnabled, "resources consumer disabled"),
      paramsSchema: { resourceId: "string", consumerActorId: "string" },
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
      paramsSchema: { leaseId: "string" },
      returns: "Revocation result.",
      risk: { level: "low" },
    },
    {
      name: "web3.resources.status",
      summary: "Get resource or lease status.",
      kind: "gateway",
      group: "resources",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { resourceId: "string", leaseId: "string" },
      returns: "Resource or lease status.",
      risk: { level: "low" },
    },
    {
      name: "web3.index.report",
      summary: "Report signed resource index entries.",
      kind: "gateway",
      group: "index",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { providerId: "string", resources: "IndexedResource[]", ttlMs: "number" },
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
            maximum: 100,
            example: 20,
          },
          kind: {
            type: "string",
            description: "Filter by resource kind (optional)",
            enum: ["storage", "compute", "search", "custom"],
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
      paramsSchema: { providerId: "string", ttlMs: "number" },
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
            description: "Resource offer details",
            required: ["kind", "endpoint", "description", "pricing"],
            properties: {
              kind: {
                type: "string",
                description: "Resource type",
                enum: ["storage", "compute", "search", "custom"],
                example: "storage",
              },
              endpoint: {
                type: "string",
                description: "Provider endpoint URL (HTTPS required)",
                pattern: "^https://",
                example: "https://storage.provider.com/v1",
              },
              description: {
                type: "string",
                description: "Human-readable resource description",
                minLength: 10,
                maxLength: 500,
                example: "High-speed IPFS-compatible storage with 99.9% uptime SLA",
              },
              pricing: {
                type: "object",
                description: "Pricing model",
                required: ["unit", "amount", "currency"],
                properties: {
                  unit: {
                    type: "string",
                    description: "Billing unit",
                    enum: ["hour", "GB", "query", "tx"],
                    example: "GB",
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
                },
              },
              tags: {
                type: "array",
                description: "Search tags (optional)",
                items: { type: "string" },
                example: ["ipfs", "fast", "sla"],
              },
              metadata: {
                type: "object",
                description: "Provider-specific metadata (optional)",
                example: { region: "us-east-1", tier: "premium" },
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
      paramsSchema: { resourceId: "string" },
      returns: "Unpublish result.",
      aliases: ["web3.resources.unpublish"],
    },
    {
      name: "web3.market.resource.get",
      summary: "Market entrypoint for resource lookup (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { resourceId: "string" },
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
          limit: {
            type: "number",
            description: "Max number of resources to return (default: 20)",
            minimum: 1,
            maximum: 100,
            example: 20,
          },
          cursor: {
            type: "string",
            description: "Pagination cursor from previous response (optional)",
            example: "eyJpZCI6InJlc18xMjM0In0=",
          },
          kind: {
            type: "string",
            description: "Filter by resource kind (optional)",
            enum: ["storage", "compute", "search", "custom"],
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
      returns: "Resource list response with pagination cursor.",
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
        required: ["resourceId", "consumerActorId"],
        properties: {
          resourceId: {
            type: "string",
            description: "Target resource ID (must be published)",
            pattern: "^res_[a-zA-Z0-9]+$",
            example: "res_1234abcd",
          },
          consumerActorId: {
            type: "string",
            description: "Consumer wallet address (must match session)",
            pattern: "^0x[a-fA-F0-9]{40}$",
            example: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
          },
          durationHours: {
            type: "number",
            description: "Lease duration in hours (optional, default: 24)",
            minimum: 1,
            maximum: 720,
            example: 24,
          },
          metadata: {
            type: "object",
            description: "Consumer-provided metadata (optional)",
            example: { purpose: "backup", project: "demo" },
          },
        },
      },
      returns: "Lease record with ONE-TIME access token (store immediately!).",
      aliases: ["web3.resources.lease"],
      risk: { level: "high", notes: ["Access token issued once and never shown again"] },
      pricing: { requiresPreLock: true },
      examples: [
        {
          summary: "Issue 24-hour lease for storage resource",
          params: {
            resourceId: "res_abc123",
            consumerActorId: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
            durationHours: 24,
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
      paramsSchema: { leaseId: "string" },
      returns: "Revocation result.",
      aliases: ["web3.resources.revokeLease"],
    },
    {
      name: "web3.market.lease.get",
      summary: "Market entrypoint for lease lookup (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { leaseId: "string" },
      returns: "Lease record.",
    },
    {
      name: "web3.market.lease.list",
      summary: "Market entrypoint for lease listing (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { limit: "number", cursor: "string" },
      returns: "Lease list response.",
    },
    {
      name: "web3.market.lease.expireSweep",
      summary: "Expire stale leases (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { now: "string" },
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
          limit: {
            type: "number",
            description: "Max entries to return (default: 50)",
            minimum: 1,
            maximum: 200,
            example: 50,
          },
          cursor: {
            type: "string",
            description: "Pagination cursor (optional)",
            example: "eyJvZmZzZXQiOjUwfQ==",
          },
          leaseId: {
            type: "string",
            description: "Filter by lease ID (optional)",
            pattern: "^lease_[a-zA-Z0-9]+$",
            example: "lease_xyz789",
          },
          type: {
            type: "string",
            description: "Filter by ledger entry type (optional)",
            enum: ["charge", "refund", "penalty", "bonus"],
            example: "charge",
          },
          after: {
            type: "string",
            description: "Filter entries after timestamp (ISO8601, optional)",
            example: "2026-02-01T00:00:00Z",
          },
        },
      },
      returns: "Ledger entries list with pagination.",
      examples: [
        {
          summary: "List last 50 ledger entries",
          params: { limit: 50 },
        },
        {
          summary: "List charges for a specific lease",
          params: { leaseId: "lease_xyz789", type: "charge" },
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
          resourceId: {
            type: "string",
            description: "Filter by resource ID (optional)",
            pattern: "^res_[a-zA-Z0-9]+$",
            example: "res_abc123",
          },
          leaseId: {
            type: "string",
            description: "Filter by lease ID (optional)",
            pattern: "^lease_[a-zA-Z0-9]+$",
            example: "lease_xyz789",
          },
          actorId: {
            type: "string",
            description: "Filter by actor ID (optional)",
            pattern: "^0x[a-fA-F0-9]{40}$",
            example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          },
        },
      },
      returns: "Ledger summary with total charges, refunds, and net balance.",
      examples: [
        {
          summary: "Get ledger summary for a lease",
          params: { leaseId: "lease_xyz789" },
        },
        {
          summary: "Get actor's total ledger balance",
          params: { actorId: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1" },
        },
      ],
    },
    {
      name: "web3.dispute.open",
      summary: "Open a dispute for an order (proxy to market-core).",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { orderId: "string", reason: "string" },
      returns: "Dispute opened status and hash.",
      risk: { level: "medium", notes: ["Creates dispute record"] },
    },
    {
      name: "web3.dispute.submitEvidence",
      summary: "Submit dispute evidence (proxy to market-core).",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { disputeId: "string", orderId: "string", evidence: "object" },
      returns: "Evidence submission status.",
      risk: { level: "medium" },
    },
    {
      name: "web3.dispute.resolve",
      summary: "Resolve a dispute (proxy to market-core).",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { disputeId: "string", orderId: "string", resolution: "string" },
      returns: "Resolution result.",
      risk: { level: "medium" },
    },
    {
      name: "web3.dispute.reject",
      summary: "Reject a dispute (proxy to market-core).",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { disputeId: "string", orderId: "string" },
      returns: "Rejection result.",
      risk: { level: "medium" },
    },
    {
      name: "web3.dispute.get",
      summary: "Get a dispute record (proxy to market-core).",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { disputeId: "string", orderId: "string" },
      returns: "Dispute record.",
      risk: { level: "low" },
    },
    {
      name: "web3.dispute.list",
      summary: "List dispute records (proxy to market-core).",
      kind: "gateway",
      group: "dispute",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { orderId: "string", status: "string", limit: "number" },
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
