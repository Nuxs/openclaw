import { describe, expect, it, vi } from "vitest";
import { Libp2pDiscoveryBackend } from "./backend-libp2p.js";
import { buildDhtKey } from "./namespace.js";
import type { DiscoveryRecord } from "./types.js";

function createRecord(overrides: Partial<DiscoveryRecord> = {}): DiscoveryRecord {
  return {
    providerId: "provider-1",
    peerId: "12D3KooWTestPeer",
    resources: [
      {
        resourceId: "res-model-1",
        kind: "model",
        label: "Model A",
        tags: ["llm"],
      },
    ],
    reachability: "relay",
    updatedAt: new Date().toISOString(),
    signature: {
      scheme: "ed25519",
      publicKey: "pub",
      signature: "sig",
      payloadHash: "hash",
      signedAt: new Date().toISOString(),
      payloadVersion: 2,
    },
    ...overrides,
  };
}

describe("Libp2pDiscoveryBackend", () => {
  it("publishes resource-granular DHT keys and remembers them", async () => {
    const providedKeys: Uint8Array[] = [];
    const backend = new Libp2pDiscoveryBackend({
      config: {
        enabled: true,
        backend: "libp2p",
        bootstrapPeers: [],
        rendezvousIntervalMs: 30_000,
        dhtKeyPrefix: "/openclaw/resource",
      },
      logger: () => {},
    });

    (backend as any).node = {
      peerId: { toString: () => "12D3KooWLocal" },
      start: vi.fn(),
      stop: vi.fn(),
      register: vi.fn(),
      contentRouting: {
        provide: async (key: Uint8Array) => {
          providedKeys.push(key);
        },
        findProviders: async function* () {},
      },
      services: {
        dht: {
          put: vi.fn(async () => undefined),
          get: async function* () {},
        },
      },
    };

    const record = createRecord();
    await backend.publish(record);

    expect(providedKeys.length).toBeGreaterThan(0);

    const knownResourceKeys = (backend as any).knownResourceKeys as Map<string, Set<string>>;
    const expectedKey = buildDhtKey("model", "res-model-1", "/openclaw/resource");
    expect(knownResourceKeys.get("model")?.has(expectedKey)).toBe(true);
  });

  it("discovers records from DHT value exchange (not only local cache)", async () => {
    const remoteRecord = createRecord({
      providerId: "provider-remote",
      peerId: "12D3KooWRemote",
      resources: [{ resourceId: "res-remote", kind: "model", tags: ["llm"] }],
    });

    const encoded = new TextEncoder().encode(JSON.stringify(remoteRecord));

    const backend = new Libp2pDiscoveryBackend({
      config: {
        enabled: true,
        backend: "libp2p",
        bootstrapPeers: [],
        rendezvousIntervalMs: 30_000,
        dhtKeyPrefix: "/openclaw/resource",
      },
      logger: () => {},
    });

    (backend as any).node = {
      peerId: { toString: () => "12D3KooWLocal" },
      start: vi.fn(),
      stop: vi.fn(),
      discover: async function* () {},
      contentRouting: {
        provide: vi.fn(async () => undefined),
        findProviders: async function* () {
          yield { id: { toString: () => "12D3KooWRemote" }, multiaddrs: [] };
        },
      },
      services: {
        dht: {
          put: vi.fn(async () => undefined),
          get: async function* () {
            yield { value: encoded };
          },
        },
      },
    };

    const records = await backend.discover({ kind: "model", limit: 5 });
    expect(records.some((entry) => entry.providerId === "provider-remote")).toBe(true);
  });

  it("queries rendezvous discover channel per kind", async () => {
    const discoverMock = vi.fn(async function* (_ns: string, _options?: Record<string, unknown>) {
      yield { id: { toString: () => "12D3KooWRendezvous" } };
    });

    const backend = new Libp2pDiscoveryBackend({
      config: {
        enabled: true,
        backend: "libp2p",
        bootstrapPeers: [],
        rendezvousIntervalMs: 30_000,
        dhtKeyPrefix: "/openclaw/resource",
      },
      logger: () => {},
    });

    (backend as any).node = {
      peerId: { toString: () => "12D3KooWLocal" },
      start: vi.fn(),
      stop: vi.fn(),
      discover: discoverMock,
      contentRouting: {
        provide: vi.fn(async () => undefined),
        findProviders: async function* () {},
      },
      services: {
        dht: {
          put: vi.fn(async () => undefined),
          get: async function* () {},
        },
      },
    };

    await backend.discover({ kind: "storage", limit: 2 });

    expect(discoverMock).toHaveBeenCalledTimes(1);
    expect(discoverMock.mock.calls[0]?.[0]).toBe("openclaw:market:storage");
  });
});
