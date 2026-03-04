/**
 * Libp2p-based discovery backend (MDL).
 *
 * Uses KAD-DHT for provider publish/lookup, plus optional DHT record value
 * exchange and Rendezvous namespace registration/discovery.
 */

import { createHash } from "node:crypto";
import type { IndexedResourceKind } from "../state/store.js";
import { buildDhtKey, buildRendezvousNs } from "./namespace.js";
import type {
  DiscoveryBackend,
  DiscoveryConfig,
  DiscoveryQuery,
  DiscoveryRecord,
} from "./types.js";

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
  services?: {
    dht?: {
      put?(key: Uint8Array, value: Uint8Array): Promise<void>;
      get?(key: Uint8Array): AsyncIterable<unknown>;
    };
  };
  register?(ns: string, options?: Record<string, unknown>): Promise<void>;
  unregister?(ns: string): Promise<void>;
  discover?(
    ns: string,
    options?: Record<string, unknown>,
  ): AsyncIterable<{ id?: { toString(): string }; peerId?: { toString(): string } }>;
}

function routingKeyBytes(rawKey: string): Uint8Array {
  const hash = createHash("sha256").update(rawKey).digest();
  return new Uint8Array(hash);
}

function encodeRecord(record: DiscoveryRecord): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(record));
}

function decodeRecord(data: Uint8Array): DiscoveryRecord | null {
  try {
    return JSON.parse(new TextDecoder().decode(data)) as DiscoveryRecord;
  } catch {
    return null;
  }
}

function extractRecordPayload(candidate: unknown): Uint8Array | null {
  if (candidate instanceof Uint8Array) return candidate;
  if (!candidate || typeof candidate !== "object") return null;
  const record = candidate as Record<string, unknown>;
  if (record.value instanceof Uint8Array) return record.value;
  const nestedRecord = record.record;
  if (
    nestedRecord &&
    typeof nestedRecord === "object" &&
    (nestedRecord as Record<string, unknown>).value instanceof Uint8Array
  ) {
    return (nestedRecord as Record<string, unknown>).value as Uint8Array;
  }
  return null;
}

export type Libp2pBackendOptions = {
  config: DiscoveryConfig;
  privateKeyDer?: string;
  logger?: (msg: string) => void;
};

async function importOptionalModule(moduleId: string): Promise<unknown> {
  return import(moduleId);
}

export class Libp2pDiscoveryBackend implements DiscoveryBackend {
  private node: Libp2pNode | null = null;
  private readonly config: DiscoveryConfig;
  private readonly logger: (msg: string) => void;
  private readonly privateKeyDer?: string;
  private starting: Promise<void> | null = null;

  private readonly cache = new Map<string, { record: DiscoveryRecord; expiresAt: number }>();
  private readonly registeredNamespaces = new Set<string>();
  private readonly knownResourceKeys = new Map<IndexedResourceKind, Set<string>>();

  constructor(options: Libp2pBackendOptions) {
    this.config = options.config;
    this.logger = options.logger ?? console.log;
    this.privateKeyDer = options.privateKeyDer;
  }

  private async ensureNode(): Promise<Libp2pNode> {
    if (this.node) return this.node;
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

    const [{ createLibp2p }, { tcp }, { noise }, { yamux }, { kadDHT }, { circuitRelayTransport }] =
      await Promise.all([
        importOptionalModule("libp2p") as Promise<{
          createLibp2p: (opts: Record<string, unknown>) => Promise<unknown>;
        }>,
        importOptionalModule("@libp2p/tcp") as Promise<{ tcp: () => unknown }>,
        importOptionalModule("@chainsafe/libp2p-noise") as Promise<{ noise: () => unknown }>,
        importOptionalModule("@chainsafe/libp2p-yamux") as Promise<{ yamux: () => unknown }>,
        importOptionalModule("@libp2p/kad-dht") as Promise<{
          kadDHT: (opts: Record<string, unknown>) => unknown;
        }>,
        importOptionalModule("@libp2p/circuit-relay-v2") as Promise<{
          circuitRelayTransport: () => unknown;
        }>,
      ]);

    const node = await (createLibp2p as any)({
      transports: [tcp(), circuitRelayTransport()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: {
        dht: kadDHT({
          clientMode: true,
        }),
      },
      connectionManager: {
        maxConnections: 50,
      },
    });

    await node.start();
    this.node = node as unknown as Libp2pNode;
    this.logger(`[mdl:libp2p] Node started — peerId=${this.node.peerId.toString()}`);

    if (this.config.bootstrapPeers.length === 0) return;

    this.logger(
      `[mdl:libp2p] Connecting to ${this.config.bootstrapPeers.length} bootstrap peers...`,
    );
    for (const addr of this.config.bootstrapPeers) {
      try {
        const { multiaddr } = (await importOptionalModule("@multiformats/multiaddr")) as {
          multiaddr: (addr: string) => unknown;
        };
        await (node as any).dial(multiaddr(addr));
      } catch (err) {
        this.logger(
          `[mdl:libp2p] Failed to connect to bootstrap peer ${addr}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private rememberResourceKey(kind: IndexedResourceKind, key: string): void {
    const existing = this.knownResourceKeys.get(kind) ?? new Set<string>();
    existing.add(key);
    this.knownResourceKeys.set(kind, existing);
  }

  private getKindRoutingKey(kind: IndexedResourceKind): string {
    return buildRendezvousNs(kind);
  }

  private async putRecordValue(
    node: Libp2pNode,
    key: string,
    record: DiscoveryRecord,
  ): Promise<void> {
    const dht = node.services?.dht;
    if (!dht?.put) return;
    try {
      await dht.put(routingKeyBytes(key), encodeRecord(record));
    } catch (err) {
      this.logger(
        `[mdl:libp2p] DHT put(record) failed for key=${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async readRecordsFromDht(
    node: Libp2pNode,
    key: string,
    limit: number,
  ): Promise<DiscoveryRecord[]> {
    const dht = node.services?.dht;
    if (!dht?.get) return [];

    const results: DiscoveryRecord[] = [];
    try {
      for await (const candidate of dht.get(routingKeyBytes(key))) {
        if (results.length >= limit) break;
        const payload = extractRecordPayload(candidate);
        if (!payload) continue;
        const record = decodeRecord(payload);
        if (record) results.push(record);
      }
    } catch (err) {
      this.logger(
        `[mdl:libp2p] DHT get(record) failed for key=${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return results;
  }

  async publish(record: DiscoveryRecord): Promise<void> {
    const node = await this.ensureNode();

    const kinds = new Set<IndexedResourceKind>(record.resources.map((resource) => resource.kind));

    for (const resource of record.resources) {
      const resourceDhtKey = buildDhtKey(
        resource.kind,
        resource.resourceId,
        this.config.dhtKeyPrefix,
      );
      this.rememberResourceKey(resource.kind, resourceDhtKey);

      try {
        await node.contentRouting.provide(routingKeyBytes(resourceDhtKey));
      } catch (err) {
        this.logger(
          `[mdl:libp2p] DHT provide failed for resource key=${resourceDhtKey}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      await this.putRecordValue(node, resourceDhtKey, record);
    }

    for (const kind of kinds) {
      const kindKey = this.getKindRoutingKey(kind);
      try {
        await node.contentRouting.provide(routingKeyBytes(kindKey));
      } catch (err) {
        this.logger(
          `[mdl:libp2p] DHT provide failed for kind key=${kindKey}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      await this.putRecordValue(node, kindKey, record);

      const ns = buildRendezvousNs(kind);
      if (typeof node.register === "function") {
        try {
          await node.register(ns);
          this.registeredNamespaces.add(ns);
        } catch (err) {
          this.logger(
            `[mdl:libp2p] Rendezvous register failed for ${ns}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    const expiresAt = record.expiresAt ? Date.parse(record.expiresAt) : Date.now() + 3_600_000;
    this.cache.set(record.providerId, { record, expiresAt });
  }

  async discover(query: DiscoveryQuery): Promise<DiscoveryRecord[]> {
    const node = await this.ensureNode();

    const kinds: IndexedResourceKind[] = query.kind ? [query.kind] : ["model", "search", "storage"];
    const limit = Math.max(1, query.limit ?? 20);

    const results: DiscoveryRecord[] = [];
    const seenProviderIds = new Set<string>();
    const seenPeerIds = new Set<string>();

    const pushRecord = (record: DiscoveryRecord) => {
      if (results.length >= limit) return;
      if (seenProviderIds.has(record.providerId)) return;
      if (!matchesQuery(record, query)) return;
      results.push(record);
      seenProviderIds.add(record.providerId);
      seenPeerIds.add(record.peerId);
    };

    for (const kind of kinds) {
      if (results.length >= limit) break;

      const kindKey = this.getKindRoutingKey(kind);
      try {
        for await (const provider of node.contentRouting.findProviders(routingKeyBytes(kindKey))) {
          if (results.length >= limit) break;
          seenPeerIds.add(provider.id.toString());
        }
      } catch (err) {
        this.logger(
          `[mdl:libp2p] DHT findProviders failed for kind key=${kindKey}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const recordsByKind = await this.readRecordsFromDht(node, kindKey, limit - results.length);
      for (const record of recordsByKind) {
        pushRecord(record);
      }

      const resourceKeys = this.knownResourceKeys.get(kind) ?? new Set<string>();
      for (const resourceKey of resourceKeys) {
        if (results.length >= limit) break;

        try {
          for await (const provider of node.contentRouting.findProviders(
            routingKeyBytes(resourceKey),
          )) {
            if (results.length >= limit) break;
            seenPeerIds.add(provider.id.toString());
          }
        } catch (err) {
          this.logger(
            `[mdl:libp2p] DHT findProviders failed for resource key=${resourceKey}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        const recordsByResource = await this.readRecordsFromDht(
          node,
          resourceKey,
          limit - results.length,
        );
        for (const record of recordsByResource) {
          pushRecord(record);
        }
      }

      const ns = buildRendezvousNs(kind);
      if (typeof node.discover === "function") {
        try {
          for await (const peer of node.discover(ns, { limit: limit - results.length })) {
            if (results.length >= limit) break;
            const peerId = peer.id?.toString() ?? peer.peerId?.toString();
            if (peerId) seenPeerIds.add(peerId);
          }
        } catch (err) {
          this.logger(
            `[mdl:libp2p] Rendezvous discover failed for ${ns}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    if (results.length < limit) {
      for (const { record, expiresAt } of this.cache.values()) {
        if (results.length >= limit) break;
        if (expiresAt <= Date.now()) continue;
        if (seenProviderIds.has(record.providerId)) continue;
        if (seenPeerIds.size > 0 && !seenPeerIds.has(record.peerId)) continue;
        pushRecord(record);
      }
    }

    return results;
  }

  async stop(): Promise<void> {
    if (!this.node) return;

    for (const ns of this.registeredNamespaces) {
      if (typeof this.node.unregister !== "function") continue;
      try {
        await this.node.unregister(ns);
      } catch {
        // Best-effort cleanup.
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
    this.knownResourceKeys.clear();
  }
}

function matchesQuery(record: DiscoveryRecord, query: DiscoveryQuery): boolean {
  if (query.kind && !record.resources.some((resource) => resource.kind === query.kind)) {
    return false;
  }
  if (query.tags && query.tags.length > 0) {
    const hasTags = record.resources.some((resource) =>
      resource.tags?.some((tag) => query.tags!.includes(tag)),
    );
    if (!hasTags) return false;
  }
  return true;
}
