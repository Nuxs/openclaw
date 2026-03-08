/**
 * Market Discovery Layer (MDL) — core type definitions.
 *
 * Provides the pluggable DiscoveryBackend interface and associated data types
 * for decentralized resource discovery via libp2p (DHT + Rendezvous).
 *
 * Security invariant: DiscoveryRecord NEVER contains endpoint, multiaddr,
 * accessToken, meta, or resources[].metadata.
 */

import type { IndexSignature, IndexedResourceKind } from "../state/store.js";

// Re-export DiscoveryConfig from the canonical location (config.ts)
// to avoid duplicate type definitions.
export type { DiscoveryConfig } from "../config.js";

// ---------------------------------------------------------------------------
// Reachability
// ---------------------------------------------------------------------------

/** How a provider can be reached — "direct" (publicly routable),
 *  "relay" (via circuit-relay), or "unknown" (not yet probed). */
export type Reachability = "direct" | "relay" | "unknown";

// ---------------------------------------------------------------------------
// Discovery resource summary (redacted by design)
// ---------------------------------------------------------------------------

/** Subset of IndexedResource safe for network propagation.
 *  Excludes: description, metadata — those are local-only. */
export type DiscoveryResourceSummary = {
  resourceId: string;
  kind: IndexedResourceKind;
  label?: string;
  tags?: string[];
  price?: string;
  unit?: string;
};

// ---------------------------------------------------------------------------
// Discovery record (the unit propagated over the network)
// ---------------------------------------------------------------------------

/** A verifiable summary of a provider's offerings, propagated via
 *  DHT / Rendezvous. Contains NO endpoint, multiaddr, or token. */
export type DiscoveryRecordIdentity = {
  actorId?: string;
  did?: string;
};

export type DiscoveryRecord = {
  providerId: string;
  peerId: string;
  resources: DiscoveryResourceSummary[];
  reachability: Reachability;
  updatedAt: string;
  expiresAt?: string;
  signature?: IndexSignature & { payloadVersion: 2 };
  identity?: DiscoveryRecordIdentity;
};

// ---------------------------------------------------------------------------
// Discovery query
// ---------------------------------------------------------------------------

/** Filter criteria for the discover() call. */
export type DiscoveryQuery = {
  kind?: IndexedResourceKind;
  tags?: string[];
  limit?: number;
};

// ---------------------------------------------------------------------------
// DiscoveryBackend interface
// ---------------------------------------------------------------------------

/** Pluggable discovery backend.
 *
 *  Implementations:
 *  - StaticDiscoveryBackend — no-op fallback (config.discovery.backend = "static")
 *  - Libp2pDiscoveryBackend — DHT + Rendezvous (config.discovery.backend = "libp2p")
 */
export interface DiscoveryBackend {
  /** Publish the local provider's discovery record to the network. */
  publish(record: DiscoveryRecord): Promise<void>;

  /** Discover remote providers matching the query. */
  discover(query: DiscoveryQuery): Promise<DiscoveryRecord[]>;

  /** Gracefully shut down the backend and release resources. */
  stop(): Promise<void>;
}
