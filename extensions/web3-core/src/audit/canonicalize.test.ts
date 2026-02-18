import { describe, it, expect } from "vitest";
import { hashPayload, hashString } from "./canonicalize.js";

describe("canonicalize", () => {
  it("should produce deterministic hash regardless of key order", () => {
    const a = hashPayload({ b: 2, a: 1 });
    const b = hashPayload({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it("should redact sensitive fields", () => {
    const withSecret = hashPayload({ name: "test", apiKey: "sk-123" });
    const withRedacted = hashPayload({ name: "test", apiKey: "[REDACTED]" });
    expect(withSecret).toBe(withRedacted);
  });

  it("should redact custom fields", () => {
    const hash1 = hashPayload({ name: "test", myField: "sensitive" }, ["myField"]);
    const hash2 = hashPayload({ name: "test", myField: "[REDACTED]" }, ["myField"]);
    expect(hash1).toBe(hash2);
  });

  it("should produce a 64-char hex SHA-256 digest", () => {
    const h = hashPayload({ hello: "world" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashString", () => {
  it("should hash a string to SHA-256 hex", () => {
    const h = hashString("test-session-id");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should be deterministic", () => {
    expect(hashString("foo")).toBe(hashString("foo"));
  });

  it("should differ for different inputs", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});
