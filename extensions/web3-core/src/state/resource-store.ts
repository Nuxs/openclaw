/**
 * Resource sub-store — resource index, P2P peer gossip table and
 * discovery identity map.
 *
 * Split from the monolithic `Web3StateStore` to honour single-responsibility.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DiscoveryIdentityRecord, P2pPeerRecord, ResourceIndexEntry } from "./store-types.js";

export class ResourceStore {
  constructor(private readonly dir: string) {}

  // ── Resource index ───────────────────────────────────────────────

  private get resourceIndexPath() {
    return join(this.dir, "resource-index.json");
  }

  getResourceIndex(): ResourceIndexEntry[] {
    if (!existsSync(this.resourceIndexPath)) return [];
    return JSON.parse(readFileSync(this.resourceIndexPath, "utf-8")) as ResourceIndexEntry[];
  }

  saveResourceIndex(entries: ResourceIndexEntry[]): void {
    writeFileSync(this.resourceIndexPath, JSON.stringify(entries, null, 2));
  }

  upsertResourceIndex(entry: ResourceIndexEntry): void {
    const list = this.getResourceIndex();
    const index = list.findIndex((item) => item.providerId === entry.providerId);
    if (index >= 0) {
      list[index] = entry;
    } else {
      list.push(entry);
    }
    this.saveResourceIndex(list);
  }

  removeResourceIndex(providerId: string): void {
    const list = this.getResourceIndex().filter((item) => item.providerId !== providerId);
    this.saveResourceIndex(list);
  }

  // ── P2P peers ────────────────────────────────────────────────────

  private get p2pPeersPath() {
    return join(this.dir, "p2p-peers.json");
  }

  getP2pPeers(): P2pPeerRecord[] {
    if (!existsSync(this.p2pPeersPath)) return [];
    return JSON.parse(readFileSync(this.p2pPeersPath, "utf-8")) as P2pPeerRecord[];
  }

  saveP2pPeers(entries: P2pPeerRecord[]): void {
    writeFileSync(this.p2pPeersPath, JSON.stringify(entries, null, 2));
  }

  upsertP2pPeer(entry: P2pPeerRecord): void {
    const list = this.getP2pPeers();
    const index = list.findIndex((item) => item.peerId === entry.peerId);
    if (index >= 0) {
      list[index] = entry;
    } else {
      list.push(entry);
    }
    this.saveP2pPeers(list);
  }

  pruneP2pPeers(maxAgeMs: number): number {
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return 0;
    const cutoff = Date.now() - maxAgeMs;
    const list = this.getP2pPeers();
    const filtered = list.filter((entry) => Date.parse(entry.lastSeenAt) > cutoff);
    if (filtered.length !== list.length) {
      this.saveP2pPeers(filtered);
    }
    return list.length - filtered.length;
  }

  // ── Discovery identity map ───────────────────────────────────────

  private get discoveryIdentityPath() {
    return join(this.dir, "identity-map.json");
  }

  getDiscoveryIdentityMap(): DiscoveryIdentityRecord[] {
    if (!existsSync(this.discoveryIdentityPath)) return [];
    return JSON.parse(
      readFileSync(this.discoveryIdentityPath, "utf-8"),
    ) as DiscoveryIdentityRecord[];
  }

  saveDiscoveryIdentityMap(entries: DiscoveryIdentityRecord[]): void {
    writeFileSync(this.discoveryIdentityPath, JSON.stringify(entries, null, 2));
  }

  upsertDiscoveryIdentity(entry: DiscoveryIdentityRecord): void {
    const list = this.getDiscoveryIdentityMap();
    const index = list.findIndex((item) => item.providerId === entry.providerId);
    if (index >= 0) {
      list[index] = entry;
    } else {
      list.push(entry);
    }
    this.saveDiscoveryIdentityMap(list);
  }
}
