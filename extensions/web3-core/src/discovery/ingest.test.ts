import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { P2pPeerRecord, ResourceIndexEntry } from "../state/store.js";
import { ingestDiscoveryRecords } from "./ingest.js";
import type { IngestResult } from "./ingest.js";
import { signEntryV2 } from "./signature-v2.js";
import type { DiscoveryRecord } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyDer: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKeyDer: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

/** Create a signed DiscoveryRecord. */
function makeSignedRecord(
  overrides?: Partial<DiscoveryRecord>,
  keys?: ReturnType<typeof genKeys>,
): DiscoveryRecord {
  const k = keys ?? genKeys();
  const base = {
    providerId: "provider-test",
    peerId: "12D3KooWTest",
    resources: [{ resourceId: "res-1", kind: "model" as const, label: "GPT-4o" }],
    reachability: "relay" as const,
    updatedAt: "2026-03-01T00:00:00.000Z",
    expiresAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };

  // Build a signable entry (needs endpoint etc. for v2 payload)
  const signable = {
    providerId: base.providerId,
    resources: base.resources,
    updatedAt: base.updatedAt,
    expiresAt: base.expiresAt,
    peerId: base.peerId,
    reachability: base.reachability,
  };

  const sig = signEntryV2(signable, k.privateKeyDer, k.publicKeyDer);

  return {
    ...base,
    signature: sig,
  };
}

/** Minimal mock of Web3StateStore with only the methods ingest uses. */
function createMockStore() {
  const indexEntries: ResourceIndexEntry[] = [];
  const peerRecords: P2pPeerRecord[] = [];

  return {
    upsertResourceIndex: vi.fn((entry: ResourceIndexEntry) => {
      const idx = indexEntries.findIndex((e) => e.providerId === entry.providerId);
      if (idx >= 0) indexEntries[idx] = entry;
      else indexEntries.push(entry);
    }),
    upsertP2pPeer: vi.fn((entry: P2pPeerRecord) => {
      const idx = peerRecords.findIndex((e) => e.peerId === entry.peerId);
      if (idx >= 0) peerRecords[idx] = entry;
      else peerRecords.push(entry);
    }),
    getIndexEntries: () => indexEntries,
    getPeerRecords: () => peerRecords,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ingestDiscoveryRecords", () => {
  const logger = vi.fn();
  const now = new Date("2026-03-15T00:00:00.000Z").getTime();

  it("accepts valid signed records", () => {
    const store = createMockStore();
    const record = makeSignedRecord();
    const result = ingestDiscoveryRecords([record], store as any, { logger, now });

    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(store.upsertResourceIndex).toHaveBeenCalledOnce();
    expect(store.upsertP2pPeer).toHaveBeenCalledOnce();

    // Verify the index entry shape
    const entry = store.getIndexEntries()[0]!;
    expect(entry.providerId).toBe("provider-test");
    expect(entry.peerId).toBe("12D3KooWTest");
    expect(entry.reachability).toBe("relay");
    expect(entry.endpoint).toBeUndefined();
    expect(entry.meta).toBeUndefined();

    // Verify peer record
    const peer = store.getPeerRecords()[0]!;
    expect(peer.peerId).toBe("12D3KooWTest");
    expect(peer.transport).toBe("dht");
  });

  it("rejects expired records", () => {
    const store = createMockStore();
    const record = makeSignedRecord({
      expiresAt: "2026-03-10T00:00:00.000Z", // before `now`
    });

    const result = ingestDiscoveryRecords([record], store as any, { logger, now });

    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.rejections["provider-test"]).toBe("expired");
    expect(store.upsertResourceIndex).not.toHaveBeenCalled();
  });

  it("rejects records with invalid signatures", () => {
    const store = createMockStore();
    const record = makeSignedRecord();
    // Tamper with peerId after signing
    record.peerId = "tampered-peer";

    const result = ingestDiscoveryRecords([record], store as any, { logger, now });

    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.rejections["provider-test"]).toContain("signature:");
  });

  it("skips verification when skipVerification is true", () => {
    const store = createMockStore();
    const record = makeSignedRecord();
    record.peerId = "tampered-peer"; // would normally fail

    const result = ingestDiscoveryRecords([record], store as any, {
      logger,
      now,
      skipVerification: true,
    });

    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
  });

  it("processes multiple records — mixed valid/expired/bad-sig", () => {
    const keys = genKeys();
    const store = createMockStore();

    const valid1 = makeSignedRecord({ providerId: "p1", peerId: "peer1" }, keys);
    const valid2 = makeSignedRecord({ providerId: "p2", peerId: "peer2" }, keys);
    const expired = makeSignedRecord(
      {
        providerId: "p3",
        peerId: "peer3",
        expiresAt: "2026-03-01T00:00:00.000Z", // before `now`
      },
      keys,
    );
    const tampered = makeSignedRecord({ providerId: "p4", peerId: "peer4" }, keys);
    tampered.peerId = "tampered"; // break signature

    const result = ingestDiscoveryRecords([valid1, expired, valid2, tampered], store as any, {
      logger,
      now,
    });

    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(2);
    expect(result.rejections["p3"]).toBe("expired");
    expect(result.rejections["p4"]).toContain("signature:");
    expect(store.upsertResourceIndex).toHaveBeenCalledTimes(2);
    expect(store.upsertP2pPeer).toHaveBeenCalledTimes(2);
  });

  it("handles empty input gracefully", () => {
    const store = createMockStore();
    const result = ingestDiscoveryRecords([], store as any, { logger, now });

    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(0);
    expect(result.rejections).toEqual({});
  });

  it("records without expiresAt are treated as non-expired", () => {
    const store = createMockStore();
    const record = makeSignedRecord({ expiresAt: undefined });

    const result = ingestDiscoveryRecords([record], store as any, { logger, now });
    expect(result.accepted).toBe(1);
  });

  it("records without signature are rejected", () => {
    const store = createMockStore();
    const record = makeSignedRecord();
    delete (record as any).signature;

    const result = ingestDiscoveryRecords([record], store as any, { logger, now });
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.rejections["provider-test"]).toContain("signature:");
  });

  it("rejects records signed without payloadVersion=2", () => {
    const store = createMockStore();
    const record = makeSignedRecord();
    if (record.signature) {
      delete (record.signature as { payloadVersion?: number }).payloadVersion;
    }

    const result = ingestDiscoveryRecords([record], store as any, { logger, now });
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.rejections["provider-test"]).toContain("payloadVersion must be 2");
  });

  it("upserts same providerId — second record overwrites first", () => {
    const keys = genKeys();
    const store = createMockStore();

    const r1 = makeSignedRecord(
      {
        providerId: "same-provider",
        peerId: "peer-a",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
      keys,
    );
    const r2 = makeSignedRecord(
      {
        providerId: "same-provider",
        peerId: "peer-a",
        updatedAt: "2026-03-02T00:00:00.000Z",
      },
      keys,
    );

    ingestDiscoveryRecords([r1], store as any, { logger, now });
    ingestDiscoveryRecords([r2], store as any, { logger, now });

    expect(store.getIndexEntries()).toHaveLength(1);
    expect(store.getIndexEntries()[0]!.updatedAt).toBe("2026-03-02T00:00:00.000Z");
  });

  it("security: endpoint and meta are never set on ingested entries", () => {
    const store = createMockStore();
    const record = makeSignedRecord();

    ingestDiscoveryRecords([record], store as any, { logger, now });

    const entry = store.getIndexEntries()[0]!;
    expect(entry.endpoint).toBeUndefined();
    expect(entry.meta).toBeUndefined();
    // resources should not have description or metadata
    for (const r of entry.resources) {
      expect((r as any).description).toBeUndefined();
      expect((r as any).metadata).toBeUndefined();
    }
  });

  it("peer record has transport=dht and source=mdl:<providerId>", () => {
    const store = createMockStore();
    const record = makeSignedRecord({ providerId: "my-prov" });

    ingestDiscoveryRecords([record], store as any, { logger, now });

    const peer = store.getPeerRecords()[0]!;
    expect(peer.transport).toBe("dht");
    expect(peer.source).toBe("mdl:my-prov");
  });
});
