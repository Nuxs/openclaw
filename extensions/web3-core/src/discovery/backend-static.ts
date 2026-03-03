/**
 * Static (no-op) discovery backend.
 *
 * Used when `config.discovery.backend === "static"` or when discovery is
 * disabled. All methods are no-ops — publish/discover do nothing, stop is
 * immediate. This preserves backward compatibility: existing setups that
 * rely on manual config or LAN gossip continue to work unchanged.
 */

import type { DiscoveryBackend, DiscoveryQuery, DiscoveryRecord } from "./types.js";

export class StaticDiscoveryBackend implements DiscoveryBackend {
  async publish(_record: DiscoveryRecord): Promise<void> {
    // No-op: static backend does not publish to any network.
  }

  async discover(_query: DiscoveryQuery): Promise<DiscoveryRecord[]> {
    // No-op: static backend returns empty results.
    return [];
  }

  async stop(): Promise<void> {
    // No-op: nothing to clean up.
  }
}
