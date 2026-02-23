/**
 * Tools capability descriptors (agent-facing tool surface).
 */
import type { Web3PluginConfig } from "../../config.js";
import type { CapabilityDescriptor } from "../types.js";
import { availability } from "./shared.js";

export function toolsCapabilities(config: Web3PluginConfig): CapabilityDescriptor[] {
  const resourcesEnabled = config.resources.enabled;
  const advertiseEnabled = resourcesEnabled && config.resources.advertiseToMarket;
  const consumerEnabled = resourcesEnabled && config.resources.consumer.enabled;

  return [
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
    {
      name: "web3_market_status",
      summary: "Show a redacted Web3 Market status summary (fast/deep).",
      kind: "tool",
      group: "tools",
      availability: availability(true),
      paramsSchema: { profile: "string" },
      returns: "Redacted Web3 Market status summary safe for sharing.",
      risk: { level: "low" },
    },
    {
      name: "web3.market.index.list",
      summary: "List discoverable Web3 market resources (redacted).",
      kind: "tool",
      group: "tools",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { limit: "number" },
      returns: "Redacted market index list (no provider endpoints).",
      risk: { level: "low" },
    },
    {
      name: "web3.market.lease",
      summary: "Lease a market resource (token stored internally; never returned).",
      kind: "tool",
      group: "tools",
      availability: availability(consumerEnabled, "resources consumer disabled"),
      paramsSchema: {
        resourceId: "string",
        sessionKey: "string",
        consumerActorId: "string",
        actorId: "string",
      },
      returns:
        "Lease response with leaseId/orderId/consentId/deliveryId/expiresAt/stored (no token or endpoint).",
      risk: { level: "high", notes: ["Access token stored internally; never returned"] },
    },
    {
      name: "web3.market.lease.revoke",
      summary: "Revoke a market lease and clear cached access locally.",
      kind: "tool",
      group: "tools",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: { leaseId: "string" },
      returns: "Lease revocation result.",
      risk: { level: "low" },
    },
    {
      name: "web3.market.resource.publish",
      summary: "Publish a market resource (seller/provider flow).",
      kind: "tool",
      group: "tools",
      availability: availability(advertiseEnabled, "resources advertise disabled"),
      paramsSchema: { actorId: "string", resource: "object" },
      returns: "Redacted publish result.",
      risk: { level: "medium" },
    },
    {
      name: "web3.market.resource.unpublish",
      summary: "Unpublish a market resource (seller/provider flow).",
      kind: "tool",
      group: "tools",
      availability: availability(advertiseEnabled, "resources advertise disabled"),
      paramsSchema: { resourceId: "string" },
      returns: "Unpublish result.",
      risk: { level: "low" },
    },
    {
      name: "web3.market.ledger.summary",
      summary: "Summarize market ledger totals.",
      kind: "tool",
      group: "tools",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {},
      returns: "Ledger totals snapshot.",
      risk: { level: "low" },
    },
    {
      name: "web3.market.ledger.list",
      summary: "List recent market ledger entries.",
      kind: "tool",
      group: "tools",
      availability: availability(resourcesEnabled, "resources disabled"),
      paramsSchema: {
        limit: "number",
        resourceId: "string",
        leaseId: "string",
        providerActorId: "string",
      },
      returns: "Ledger entries list.",
      risk: { level: "low" },
    },
  ];
}
