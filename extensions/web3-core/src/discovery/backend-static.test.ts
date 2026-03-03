import { describe, expect, it } from "vitest";
import { StaticDiscoveryBackend } from "./backend-static.js";
import type { DiscoveryRecord } from "./types.js";

describe("StaticDiscoveryBackend", () => {
  it("implements DiscoveryBackend interface", () => {
    const backend = new StaticDiscoveryBackend();
    expect(typeof backend.publish).toBe("function");
    expect(typeof backend.discover).toBe("function");
    expect(typeof backend.stop).toBe("function");
  });

  it("publish resolves without error", async () => {
    const backend = new StaticDiscoveryBackend();
    const record: DiscoveryRecord = {
      providerId: "p1",
      peerId: "12D3KooW1",
      resources: [],
      reachability: "unknown",
      updatedAt: new Date().toISOString(),
    };
    await expect(backend.publish(record)).resolves.toBeUndefined();
  });

  it("discover returns empty array", async () => {
    const backend = new StaticDiscoveryBackend();
    const result = await backend.discover({});
    expect(result).toEqual([]);
  });

  it("discover with filters still returns empty array", async () => {
    const backend = new StaticDiscoveryBackend();
    const result = await backend.discover({ kind: "model", tags: ["llm"], limit: 10 });
    expect(result).toEqual([]);
  });

  it("stop resolves without error", async () => {
    const backend = new StaticDiscoveryBackend();
    await expect(backend.stop()).resolves.toBeUndefined();
  });

  it("can be used multiple times without issues", async () => {
    const backend = new StaticDiscoveryBackend();
    await backend.publish({
      providerId: "p1",
      peerId: "peer1",
      resources: [],
      reachability: "direct",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    await backend.discover({});
    await backend.discover({ kind: "storage" });
    await backend.stop();
    // After stop, should still work (no state to corrupt)
    await expect(backend.discover({})).resolves.toEqual([]);
  });
});
