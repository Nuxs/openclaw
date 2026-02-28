/**
 * Capability catalog — thin orchestrator that delegates to group-specific
 * sub-modules under `catalog/` and exposes the public query API.
 */
import type { Web3PluginConfig } from "../config.js";
import { coreCapabilities } from "./catalog/core.js";
import { marketCapabilities } from "./catalog/market.js";
import { monitorCapabilities } from "./catalog/monitor.js";
import { resourceCapabilities } from "./catalog/resources.js";
import { rewardCapabilities } from "./catalog/reward.js";
import { toolsCapabilities } from "./catalog/tools.js";
import type { CapabilityDescriptor, CapabilitySummary } from "./types.js";

type CapabilityFilter = {
  includeUnavailable?: boolean;
  group?: string;
};

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
  const capabilities: CapabilityDescriptor[] = [
    ...coreCapabilities(config),
    ...resourceCapabilities(config),
    ...rewardCapabilities(config),
    ...monitorCapabilities(),
    ...marketCapabilities(config),
    ...toolsCapabilities(config),
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
