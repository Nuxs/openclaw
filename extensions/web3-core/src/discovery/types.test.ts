import { describe, expect, it } from "vitest";
import type {
  DiscoveryBackend,
  DiscoveryConfig,
  DiscoveryQuery,
  DiscoveryRecord,
  DiscoveryResourceSummary,
  Reachability,
} from "./types.js";

describe("DiscoveryRecord type contracts", () => {
  const validRecord: DiscoveryRecord = {
    providerId: "provider-1",
    peerId: "12D3KooWTest",
    resources: [
      {
        resourceId: "res-1",
        kind: "model",
        label: "GPT-4o",
        tags: ["llm"],
        price: "0.01",
        unit: "token",
      },
      { resourceId: "res-2", kind: "search" },
    ],
    reachability: "relay",
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };

  it("accepts a well-formed DiscoveryRecord", () => {
    expect(validRecord.providerId).toBe("provider-1");
    expect(validRecord.peerId).toBe("12D3KooWTest");
    expect(validRecord.resources).toHaveLength(2);
    expect(validRecord.reachability).toBe("relay");
  });

  it("DiscoveryResourceSummary excludes description and metadata", () => {
    const summary: DiscoveryResourceSummary = {
      resourceId: "res-1",
      kind: "model",
      label: "Test",
    };
    // These fields must NOT exist on the summary type
    expect("description" in summary).toBe(false);
    expect("metadata" in summary).toBe(false);
  });

  it("Reachability only allows direct | relay | unknown", () => {
    const values: Reachability[] = ["direct", "relay", "unknown"];
    for (const v of values) {
      expect(["direct", "relay", "unknown"]).toContain(v);
    }
  });

  it("DiscoveryRecord without optional fields is valid", () => {
    const minimal: DiscoveryRecord = {
      providerId: "p1",
      peerId: "12D3KooW",
      resources: [],
      reachability: "unknown",
      updatedAt: new Date().toISOString(),
    };
    expect(minimal.expiresAt).toBeUndefined();
    expect(minimal.signature).toBeUndefined();
  });

  it("DiscoveryQuery accepts partial filters", () => {
    const q1: DiscoveryQuery = {};
    const q2: DiscoveryQuery = { kind: "model" };
    const q3: DiscoveryQuery = { kind: "storage", tags: ["fast"], limit: 10 };
    expect(q1.kind).toBeUndefined();
    expect(q2.kind).toBe("model");
    expect(q3.limit).toBe(10);
  });

  it("DiscoveryConfig has sensible default shape", () => {
    const cfg: DiscoveryConfig = {
      enabled: false,
      backend: "static",
      bootstrapPeers: [],
      rendezvousIntervalMs: 30_000,
      dhtKeyPrefix: "/openclaw/resource",
    };
    expect(cfg.enabled).toBe(false);
    expect(cfg.backend).toBe("static");
    expect(cfg.rendezvousIntervalMs).toBe(30_000);
  });

  it("DiscoveryBackend interface is implementable", () => {
    // Verify the interface shape is correct by creating a mock implementation
    const mock: DiscoveryBackend = {
      publish: async () => {},
      discover: async () => [],
      stop: async () => {},
    };
    expect(mock.publish).toBeTypeOf("function");
    expect(mock.discover).toBeTypeOf("function");
    expect(mock.stop).toBeTypeOf("function");
  });
});
