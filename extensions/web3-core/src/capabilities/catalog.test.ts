import { describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { describeWeb3Capabilities, findWeb3Capability, listWeb3Capabilities } from "./catalog.js";
import type { CapabilityDescriptor } from "./types.js";

/**
 * Known registered gateway method names from web3-core/index.ts.
 * Used as the ground-truth list to verify catalog coverage.
 */
const REGISTERED_GATEWAY_METHODS = [
  "web3.capabilities.list",
  "web3.capabilities.describe",
  "web3.siwe.challenge",
  "web3.siwe.verify",
  "web3.identity.resolveEns",
  "web3.identity.reverseEns",
  "web3.audit.query",
  "web3.billing.status",
  "web3.billing.summary",
  "web3.status.summary",
  "web3.reward.get",
  "web3.reward.list",
  "web3.reward.claim",
  "web3.reward.updateStatus",
  "web3.resources.publish",
  "web3.resources.unpublish",
  "web3.resources.list",
  "web3.resources.lease",
  "web3.resources.revokeLease",
  "web3.resources.status",
  "web3.market.resource.publish",
  "web3.market.resource.unpublish",
  "web3.market.resource.get",
  "web3.market.resource.list",
  "web3.market.lease.issue",
  "web3.market.lease.revoke",
  "web3.market.lease.get",
  "web3.market.lease.list",
  "web3.market.lease.expireSweep",
  "web3.market.ledger.list",
  "web3.market.ledger.summary",
  "web3.market.reputation.summary",
  "web3.market.tokenEconomy.summary",
  "web3.market.tokenEconomy.configure",
  "web3.market.tokenEconomy.mint",
  "web3.market.tokenEconomy.burn",
  "web3.market.tokenEconomy.governance.update",
  "web3.market.bridge.routes",
  "web3.market.bridge.request",
  "web3.market.bridge.update",
  "web3.market.bridge.status",
  "web3.market.bridge.list",
  "web3.market.metrics.snapshot",
  "web3.market.reconciliation.summary",
  "web3.market.status.summary",
  "web3.market.dispute.get",
  "web3.market.dispute.list",
  "web3.market.dispute.open",
  "web3.market.dispute.submitEvidence",
  "web3.market.dispute.resolve",
  "web3.market.dispute.reject",
  "web3.dispute.open",
  "web3.dispute.submitEvidence",
  "web3.dispute.resolve",
  "web3.dispute.reject",
  "web3.dispute.get",
  "web3.dispute.list",
  "web3.index.report",
  "web3.index.list",
  "web3.index.gossip",
  "web3.index.peers.list",
  "web3.index.heartbeat",
  "web3.index.stats",
  "web3.metrics.snapshot",
  "web3.monitor.snapshot",
  "web3.monitor.alerts.list",
  "web3.monitor.alerts.get",
  "web3.monitor.alerts.acknowledge",
  "web3.monitor.alerts.resolve",
  "web3.monitor.metrics",
  "web3.monitor.health",
] as const;

function getConfig() {
  return resolveConfig({
    resources: { enabled: true },
    billing: { enabled: true },
    monitor: { enabled: true },
  });
}

describe("capabilities catalog completeness", () => {
  it("lists capabilities without error", () => {
    const config = getConfig();
    const list = listWeb3Capabilities(config, { includeUnavailable: true });
    expect(list.length).toBeGreaterThan(0);
    // Every entry should have required fields
    for (const entry of list) {
      expect(entry.name).toBeTruthy();
      expect(entry.summary).toBeTruthy();
      expect(entry.kind).toBeTruthy();
      expect(entry.group).toBeTruthy();
    }
  });

  it("describeWeb3Capabilities returns full descriptors", () => {
    const config = getConfig();
    const descriptors = describeWeb3Capabilities(config, { includeUnavailable: true });
    expect(descriptors.length).toBeGreaterThan(0);
    for (const descriptor of descriptors) {
      expect(descriptor.name).toBeTruthy();
      expect(descriptor.kind).toMatch(/^(gateway|tool|http)$/);
      expect(descriptor.availability).toBeDefined();
    }
  });

  it("catalogs all registered gateway methods", () => {
    const config = getConfig();
    const descriptors = describeWeb3Capabilities(config, { includeUnavailable: true });
    const catalogNames = new Set(descriptors.map((d) => d.name));

    const uncovered: string[] = [];
    for (const method of REGISTERED_GATEWAY_METHODS) {
      if (!catalogNames.has(method)) {
        uncovered.push(method);
      }
    }

    expect(uncovered).toEqual([]);
  });

  it("has no phantom entries (catalog entries without registered methods)", () => {
    const config = getConfig();
    const descriptors = describeWeb3Capabilities(config, { includeUnavailable: true });
    const registeredSet: Set<string> = new Set(REGISTERED_GATEWAY_METHODS);

    const phantoms: string[] = [];
    for (const descriptor of descriptors) {
      if (descriptor.kind !== "gateway") continue;
      if (!registeredSet.has(descriptor.name)) {
        phantoms.push(descriptor.name);
      }
    }

    expect(phantoms).toEqual([]);
  });
});

describe("capabilities catalog structure", () => {
  it("every descriptor has a valid group", () => {
    const config = getConfig();
    const descriptors = describeWeb3Capabilities(config, { includeUnavailable: true });
    const validGroups = new Set([
      "capabilities",
      "identity",
      "audit",
      "billing",
      "status",
      "resources",
      "market",
      "index",
      "monitor",
      "dispute",
      "reward",
      "tools",
    ]);

    for (const descriptor of descriptors) {
      expect(validGroups.has(descriptor.group)).toBe(true);
    }
  });

  it("gateway descriptors have paramsSchema", () => {
    const config = getConfig();
    const descriptors = describeWeb3Capabilities(config, { includeUnavailable: true });
    const gateways = descriptors.filter((d) => d.kind === "gateway");

    // Most gateway methods should have paramsSchema
    const withSchema = gateways.filter((d) => d.paramsSchema);
    expect(withSchema.length / gateways.length).toBeGreaterThan(0.8);
  });

  it("gateway descriptors have returns description", () => {
    const config = getConfig();
    const descriptors = describeWeb3Capabilities(config, { includeUnavailable: true });
    const gateways = descriptors.filter((d) => d.kind === "gateway");

    const withReturns = gateways.filter((d) => d.returns);
    expect(withReturns.length / gateways.length).toBeGreaterThan(0.8);
  });
});

describe("findWeb3Capability", () => {
  it("finds a known capability", () => {
    const config = getConfig();
    const cap = findWeb3Capability(config, "web3.capabilities.list");
    expect(cap).not.toBeNull();
    expect(cap!.name).toBe("web3.capabilities.list");
  });

  it("returns null for unknown capability", () => {
    const config = getConfig();
    const cap = findWeb3Capability(config, "web3.nonexistent.method");
    expect(cap).toBeNull();
  });

  it("returns null for empty name", () => {
    const config = getConfig();
    const cap = findWeb3Capability(config, "");
    expect(cap).toBeNull();
  });

  it("respects includeUnavailable filter", () => {
    const config = resolveConfig({ resources: { enabled: false } });
    const capWithUnavail = findWeb3Capability(config, "web3.resources.publish", {
      includeUnavailable: true,
    });
    const capWithoutUnavail = findWeb3Capability(config, "web3.resources.publish", {
      includeUnavailable: false,
    });

    // With resources disabled, the capability should be found only when includeUnavailable=true
    if (capWithUnavail) {
      expect(capWithUnavail.availability.enabled).toBe(false);
    }
    // Without includeUnavailable, it should be filtered out
    expect(capWithoutUnavail).toBeNull();
  });
});
