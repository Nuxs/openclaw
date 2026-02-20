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
      paramsSchema: { address: "string", chainId: "number" },
      returns: "Challenge payload for SIWE signing.",
      risk: { level: "medium", notes: ["Identity binding"] },
    },
    {
      name: "web3.siwe.verify",
      summary: "Verify a SIWE signed message.",
      kind: "gateway",
      group: "identity",
      availability: availability(identityEnabled, "siwe disabled"),
      paramsSchema: { message: "string", signature: "string" },
      returns: "Verification result and bound identity.",
      risk: { level: "medium", notes: ["Identity binding"] },
    },
    {
      name: "web3.audit.query",
      summary: "Query recent audit events.",
      kind: "gateway",
      group: "audit",
      availability: availability(true),
      paramsSchema: { limit: "number" },
      returns: "Recent audit events list.",
      risk: { level: "low" },
    },
    {
      name: "web3.billing.status",
      summary: "Check billing status by session hash.",
      kind: "gateway",
      group: "billing",
      availability: availability(true, billingEnabled ? undefined : "billing disabled"),
      paramsSchema: { sessionIdHash: "string" },
      returns: "Billing enabled flag and usage snapshot.",
      risk: { level: "low" },
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
      paramsSchema: { limit: "number", kind: "string", tag: "string" },
      returns: "Index list response with signatures.",
      risk: { level: "low" },
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
      name: "web3.market.resource.publish",
      summary: "Market entrypoint for resource publish (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(advertiseEnabled, "resources advertise disabled"),
      paramsSchema: { resource: "ResourceOffer" },
      returns: "Published resource record.",
      aliases: ["web3.resources.publish"],
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
      paramsSchema: { limit: "number", cursor: "string" },
      returns: "Resource list response.",
      aliases: ["web3.resources.list"],
    },
    {
      name: "web3.market.lease.issue",
      summary: "Market entrypoint for lease issuance (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(consumerEnabled, "resources consumer disabled"),
      paramsSchema: { resourceId: "string", consumerActorId: "string" },
      returns: "Lease record with access token (one-time).",
      aliases: ["web3.resources.lease"],
      risk: { level: "high", notes: ["Access token issued once"] },
      pricing: { requiresPreLock: true },
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
      paramsSchema: { limit: "number", cursor: "string" },
      returns: "Ledger entries list.",
    },
    {
      name: "web3.market.ledger.summary",
      summary: "Summarize ledger totals (proxy to market-core).",
      kind: "gateway",
      group: "market",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { resourceId: "string", leaseId: "string" },
      returns: "Ledger summary.",
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
