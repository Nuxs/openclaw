import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DHT_KEY_PREFIX,
  buildDhtKey,
  buildRendezvousNs,
  parseDhtKey,
  parseRendezvousNs,
} from "./namespace.js";

describe("buildDhtKey", () => {
  it("constructs key in expected format", () => {
    const key = buildDhtKey("model", "res-123");
    const expectedHash = createHash("sha256").update("res-123").digest("hex");
    expect(key).toBe(`/openclaw/resource/model/${expectedHash}`);
  });

  it("uses custom prefix", () => {
    const key = buildDhtKey("search", "res-456", "/custom/prefix");
    const expectedHash = createHash("sha256").update("res-456").digest("hex");
    expect(key).toBe(`/custom/prefix/search/${expectedHash}`);
  });

  it("trims resourceId whitespace", () => {
    const key1 = buildDhtKey("model", "  res-123  ");
    const key2 = buildDhtKey("model", "res-123");
    expect(key1).toBe(key2);
  });

  it("throws for invalid kind", () => {
    expect(() => buildDhtKey("invalid" as never, "res-1")).toThrow("invalid kind");
  });

  it("throws for empty kind", () => {
    expect(() => buildDhtKey("" as never, "res-1")).toThrow("invalid kind");
  });

  it("throws for empty resourceId", () => {
    expect(() => buildDhtKey("model", "")).toThrow("resourceId is required");
  });

  it("throws for whitespace-only resourceId", () => {
    expect(() => buildDhtKey("model", "   ")).toThrow("resourceId is required");
  });

  it("produces different keys for different resources", () => {
    const k1 = buildDhtKey("model", "res-a");
    const k2 = buildDhtKey("model", "res-b");
    expect(k1).not.toBe(k2);
  });

  it("produces different keys for different kinds with same resourceId", () => {
    const k1 = buildDhtKey("model", "res-a");
    const k2 = buildDhtKey("search", "res-a");
    expect(k1).not.toBe(k2);
  });
});

describe("parseDhtKey", () => {
  it("round-trips with buildDhtKey", () => {
    const key = buildDhtKey("model", "res-123");
    const parsed = parseDhtKey(key);
    expect(parsed).not.toBeNull();
    expect(parsed!.kind).toBe("model");
    const expectedHash = createHash("sha256").update("res-123").digest("hex");
    expect(parsed!.resourceIdHash).toBe(expectedHash);
  });

  it("round-trips all valid kinds", () => {
    for (const kind of ["model", "search", "storage"] as const) {
      const key = buildDhtKey(kind, `res-${kind}`);
      const parsed = parseDhtKey(key);
      expect(parsed).not.toBeNull();
      expect(parsed!.kind).toBe(kind);
    }
  });

  it("returns null for wrong prefix", () => {
    expect(parseDhtKey("/wrong/prefix/model/abc123")).toBeNull();
  });

  it("returns null for invalid kind in key", () => {
    expect(parseDhtKey("/openclaw/resource/invalid/abc123")).toBeNull();
  });

  it("returns null for missing hash segment", () => {
    expect(parseDhtKey("/openclaw/resource/model")).toBeNull();
    expect(parseDhtKey("/openclaw/resource/model/")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDhtKey("")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(parseDhtKey(null as never)).toBeNull();
    expect(parseDhtKey(undefined as never)).toBeNull();
  });

  it("supports custom prefix", () => {
    const key = buildDhtKey("storage", "res-x", "/custom");
    const parsed = parseDhtKey(key, "/custom");
    expect(parsed).not.toBeNull();
    expect(parsed!.kind).toBe("storage");
  });
});

describe("buildRendezvousNs", () => {
  it("builds expected namespace for model", () => {
    expect(buildRendezvousNs("model")).toBe("openclaw:market:model");
  });

  it("builds expected namespace for search", () => {
    expect(buildRendezvousNs("search")).toBe("openclaw:market:search");
  });

  it("builds expected namespace for storage", () => {
    expect(buildRendezvousNs("storage")).toBe("openclaw:market:storage");
  });

  it("throws for invalid kind", () => {
    expect(() => buildRendezvousNs("invalid" as never)).toThrow("invalid kind");
  });

  it("throws for empty kind", () => {
    expect(() => buildRendezvousNs("" as never)).toThrow("invalid kind");
  });
});

describe("parseRendezvousNs", () => {
  it("round-trips with buildRendezvousNs", () => {
    for (const kind of ["model", "search", "storage"] as const) {
      expect(parseRendezvousNs(buildRendezvousNs(kind))).toBe(kind);
    }
  });

  it("returns null for wrong prefix", () => {
    expect(parseRendezvousNs("wrong:prefix:model")).toBeNull();
  });

  it("returns null for invalid kind", () => {
    expect(parseRendezvousNs("openclaw:market:invalid")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseRendezvousNs("")).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(parseRendezvousNs(null as never)).toBeNull();
    expect(parseRendezvousNs(undefined as never)).toBeNull();
  });
});

describe("DEFAULT_DHT_KEY_PREFIX", () => {
  it("equals /openclaw/resource", () => {
    expect(DEFAULT_DHT_KEY_PREFIX).toBe("/openclaw/resource");
  });
});
