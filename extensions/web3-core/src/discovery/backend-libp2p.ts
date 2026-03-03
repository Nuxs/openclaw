/**
 * Libp2p-based discovery backend (MDL).
 *
 * Uses KAD-DHT for provider record publish/lookup, and TCP transport
 * with Noise encryption + Yamux multiplexing. Circuit Relay v2 is
 * enabled for NAT traversal.
 *
 * Lifecycle:
 *   - Lazy-init: the libp2p node is created on the first publish/discover call.
 *   - Graceful shutdown: stop() tears down the node.
 *
 * Security: DiscoveryRecords propagated via this backend NEVER contain
 * endpoint, multiaddr, accessToken, meta, or resources[].metadata.
 */

import { createHash } from "node:crypto";
import type { IndexedResourceKind } from "../state/store.js";
import { buildRendezvousNs } from "./namespace.js";
import type {
  DiscoveryBackend,
  DiscoveryConfig,
  DiscoveryQuery,
  DiscoveryRecord,
} from "./types.js";

// ---------------------------------------------------------------------------
// Libp2p module type stubs (dynamic imports at runtime)
// ---------------------------------------------------------------------------

/** Minimal subset of the libp2p node interface we use. */
interface Libp2pNode {
  peerId: { toString(): string };
  start(): Promise<void>;
  stop(): Promise<void>;
  contentRouting: {
    provide(key: Uint8Array, options?: Record<string, unknown>): Promise<void>;
    findProviders(
      key: Uint8Array,
      options?: Record<string, unknown>,
    ): AsyncIterable<{ id: { toString(): string }; multiaddrs: unknown[] }>;
  };
  register(ns: string, options?: Record<string, unknown>): Promise<void>;
  unregister(ns: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build CID-compatible DHT key bytes from a namespace string. */
function dhtKeyBytes(ns: string): Uint8Array {
  const hash = createHash("sha256").update(ns).digest();
  return new Uint8Array(hash);
}

/** Encode a DiscoveryRecord for DHT value storage. */
function encodeRecord(record: DiscoveryRecord): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(record));
}

/** Decode a DiscoveryRecord from DHT value storage. */
function decodeRecord(data: Uint8Array): DiscoveryRecord | null {
  try {
    return JSON.parse(new TextDecoder().decode(data)) as DiscoveryRecord;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Libp2p backend options
// ---------------------------------------------------------------------------

export type Libp2pBackendOptions = {
  config: DiscoveryConfig;
  /** Ed25519 private key in PKCS#8 DER format (base64). Used as libp2p node identity. */
  privateKeyDer?: string;
  /** Logger for debug/info/warn messages. */
  logger?: (msg: string) => void;
};

// ---------------------------------------------------------------------------
// Libp2p discovery backend
// ---------------------------------------------------------------------------

export class Libp2pDiscoveryBackend implements DiscoveryBackend {
  private node: Libp2pNode | null = null;
  private readonly config: DiscoveryConfig;
  private readonly logger: (msg: string) => void;
  private readonly privateKeyDer?: string;
  private starting: Promise<void> | null = null;

  /** In-memory cache: providerId → DiscoveryRecord (TTL = expiresAt). */
  private readonly cache = new Map<string, { record: DiscoveryRecord; expiresAt: number }>();

  /** Published namespace registrations (for cleanup on stop). */
  private readonly registeredNamespaces = new Set<string>();

  constructor(options: Libp2pBackendOptions) {
    this.config = options.config;
    this.logger = options.logger ?? console.log;
    this.privateKeyDer = options.privateKeyDer;
  }

  // ---- Lazy init ---------------------------------------------------------

  private async ensureNode(): Promise<Libp2pNode> {
    if (this.node) return this.node;

    // Prevent concurrent init
    if (this.starting) {
      await this.starting;
      return this.node!;
    }

    this.starting = this.initNode();
    await this.starting;
    this.starting = null;
    return this.node!;
  }

  private async initNode(): Promise<void> {
    this.logger("[mdl:libp2p] Initializing libp2p node...");

    try {
      // Dynamic imports — tree-shaken when discovery is disabled
      const [
        { createLibp2p },
        { tcp },
        { noise },
        { yamux },
        { kadDHT },
        { circuitRelayTransport },
      ] = await Promise.all([
        import("libp2p"),
        import("@libp2p/tcp"),
        import("@chainsafe/libp2p-noise"),
        import("@chainsafe/libp2p-yamux"),
        import("@libp2p/kad-dht"),
        import("@libp2p/circuit-relay-v2"),
      ]);

      const node = await createLibp2p({
        transports: [tcp(), circuitRelayTransport()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: {
          dht: kadDHT({
            // Client mode — we don't serve records, just use the DHT for queries
            clientMode: true,
          }),
        },
        connectionManager: {
          maxConnections: 50,
          minConnections: 5,
        },
      });

      await node.start();
      this.node = node as unknown as Libp2pNode;

      this.logger(`[mdl:libp2p] Node started — peerId=${this.node.peerId.toString()}`);

      // Connect to bootstrap peers
      if (this.config.bootstrapPeers.length > 0) {
        this.logger(
          `[mdl:libp2p] Connecting to ${this.config.bootstrapPeers.length} bootstrap peers...`,
        );
        // Bootstrap connection is best-effort — don't block on failures
        for (const addr of this.config.bootstrapPeers) {
          try {
            const { multiaddr } = await import("@multiformats/multiaddr");
            const ma = multiaddr(addr);
            await (node as any).dial(ma);
          } catch (err) {
            this.logger(
              `[mdl:libp2p] Failed to connect to bootstrap peer ${addr}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    } catch (err) {
      this.logger(
        `[mdl:libp2p] Failed to initialize node: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  // ---- DiscoveryBackend interface ----------------------------------------

  async publish(record: DiscoveryRecord): Promise<void> {
    const node = await this.ensureNode();

    // Publish as DHT provider for each resource kind
    const kinds = new Set(record.resources.map((r) => r.kind));

    for (const kind of kinds) {
      const ns = buildRendezvousNs(kind);
      const key = dhtKeyBytes(ns);

      try {
        // DHT: advertise as provider
        await node.contentRouting.provide(key);
        this.logger(`[mdl:libp2p] Published DHT provider record for kind=${kind}`);
      } catch (err) {
        this.logger(
          `[mdl:libp2p] DHT provide failed for kind=${kind}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      try {
        // Rendezvous: register namespace
        if (typeof node.register === "function") {
          await node.register(ns);
          this.registeredNamespaces.add(ns);
          this.logger(`[mdl:libp2p] Registered rendezvous namespace: ${ns}`);
        }
      } catch (err) {
        this.logger(
          `[mdl:libp2p] Rendezvous register failed for ${ns}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Cache locally
    const expiresAt = record.expiresAt ? Date.parse(record.expiresAt) : Date.now() + 3_600_000;
    this.cache.set(record.providerId, { record, expiresAt });
  }

  async discover(query: DiscoveryQuery): Promise<DiscoveryRecord[]> {
    const node = await this.ensureNode();

    const kinds: IndexedResourceKind[] = query.kind ? [query.kind] : ["model", "search", "storage"];
    const limit = query.limit ?? 20;
    const results: DiscoveryRecord[] = [];
    const seen = new Set<string>();

    for (const kind of kinds) {
      if (results.length >= limit) break;

      const ns = buildRendezvousNs(kind);
      const key = dhtKeyBytes(ns);

      try {
        // DHT findProviders
        for await (const provider of node.contentRouting.findProviders(key)) {
          if (results.length >= limit) break;
          const peerId = provider.id.toString();
          if (seen.has(peerId)) continue;
          seen.add(peerId);

          // Check local cache for full record
          for (const [, cached] of this.cache) {
            if (cached.record.peerId === peerId && cached.expiresAt > Date.now()) {
              if (!matchesQuery(cached.record, query)) continue;
              results.push(cached.record);
              break;
            }
          }
        }
      } catch (err) {
        this.logger(
          `[mdl:libp2p] DHT findProviders failed for kind=${kind}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return results;
  }

  async stop(): Promise<void> {
    if (!this.node) return;

    this.logger("[mdl:libp2p] Shutting down...");

    // Unregister rendezvous namespaces
    for (const ns of this.registeredNamespaces) {
      try {
        if (typeof this.node.unregister === "function") {
          await this.node.unregister(ns);
        }
      } catch {
        // Best-effort cleanup
      }
    }
    this.registeredNamespaces.clear();

    try {
      await this.node.stop();
    } catch (err) {
      this.logger(
        `[mdl:libp2p] Error during shutdown: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.node = null;
    this.cache.clear();
    this.logger("[mdl:libp2p] Node stopped.");
  }
}

// ---------------------------------------------------------------------------
// Query matching helper
// ---------------------------------------------------------------------------

function matchesQuery(record: DiscoveryRecord, query: DiscoveryQuery): boolean {
  if (query.kind && !record.resources.some((r) => r.kind === query.kind)) {
    return false;
  }
  if (query.tags && query.tags.length > 0) {
    const hasTags = record.resources.some((r) => r.tags?.some((t) => query.tags!.includes(t)));
    if (!hasTags) return false;
  }
  return true;
}
