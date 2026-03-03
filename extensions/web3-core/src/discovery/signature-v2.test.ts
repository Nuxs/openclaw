import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyIndexSignature } from "../resources/signature-verification.js";
import type { IndexSignature, ResourceIndexEntry } from "../state/store.js";
import { buildSignaturePayloadV2, signEntryV2 } from "./signature-v2.js";
import type { SignableV2Entry } from "./signature-v2.js";

/** Generate a fresh Ed25519 keypair for testing. */
function genKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyDer: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKeyDer: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

function makeEntry(overrides?: Partial<SignableV2Entry>): SignableV2Entry {
  return {
    providerId: "provider-test",
    endpoint: "https://example.com",
    resources: [{ resourceId: "res-1", kind: "model", label: "GPT-4o" }],
    updatedAt: "2026-03-01T00:00:00.000Z",
    expiresAt: "2026-03-02T00:00:00.000Z",
    lastHeartbeatAt: "2026-03-01T00:00:00.000Z",
    meta: { region: "us" },
    peerId: "12D3KooWTest",
    reachability: "relay",
    ...overrides,
  };
}

describe("buildSignaturePayloadV2", () => {
  it("produces deterministic output", () => {
    const entry = makeEntry();
    const p1 = buildSignaturePayloadV2(entry);
    const p2 = buildSignaturePayloadV2(entry);
    expect(p1).toBe(p2);
  });

  it("includes peerId, reachability, and payloadVersion in payload", () => {
    const entry = makeEntry();
    const payload = buildSignaturePayloadV2(entry);
    expect(payload).toContain('"peerId"');
    expect(payload).toContain('"reachability"');
    expect(payload).toContain('"payloadVersion"');
    expect(payload).toContain("12D3KooWTest");
    expect(payload).toContain('"relay"');
  });

  it("different peerId produces different payload", () => {
    const p1 = buildSignaturePayloadV2(makeEntry({ peerId: "peer-A" }));
    const p2 = buildSignaturePayloadV2(makeEntry({ peerId: "peer-B" }));
    expect(p1).not.toBe(p2);
  });

  it("different reachability produces different payload", () => {
    const p1 = buildSignaturePayloadV2(makeEntry({ reachability: "direct" }));
    const p2 = buildSignaturePayloadV2(makeEntry({ reachability: "relay" }));
    expect(p1).not.toBe(p2);
  });

  it("handles null-ish optional fields gracefully", () => {
    const entry = makeEntry({
      endpoint: undefined,
      meta: undefined,
      expiresAt: undefined,
      lastHeartbeatAt: undefined,
    });
    const payload = buildSignaturePayloadV2(entry);
    expect(payload).toContain('"endpoint":null');
    expect(payload).toContain('"meta":null');
  });
});

describe("signEntryV2", () => {
  it("produces a valid v2 signature", () => {
    const keys = genKeys();
    const entry = makeEntry();
    const sig = signEntryV2(entry, keys.privateKeyDer, keys.publicKeyDer);

    expect(sig.scheme).toBe("ed25519");
    expect(sig.payloadVersion).toBe(2);
    expect(sig.publicKey).toBe(keys.publicKeyDer);
    expect(sig.payloadHash).toBeTruthy();
    expect(sig.signature).toBeTruthy();
    expect(sig.signedAt).toBeTruthy();
  });

  it("payloadHash matches sha256 of v2 payload", () => {
    const keys = genKeys();
    const entry = makeEntry();
    const sig = signEntryV2(entry, keys.privateKeyDer, keys.publicKeyDer);

    const expectedPayload = buildSignaturePayloadV2(entry);
    const expectedHash = createHash("sha256").update(expectedPayload).digest("hex");
    expect(sig.payloadHash).toBe(expectedHash);
  });
});

describe("verifyIndexSignature (v2 round-trip)", () => {
  it("verifies a v2-signed entry successfully", () => {
    const keys = genKeys();
    const entryData = makeEntry();
    const sig = signEntryV2(entryData, keys.privateKeyDer, keys.publicKeyDer);

    const fullEntry: ResourceIndexEntry = {
      ...entryData,
      signature: sig,
    };

    const result = verifyIndexSignature(fullEntry);
    expect(result.valid).toBe(true);
  });

  it("rejects a v2-signed entry with tampered peerId", () => {
    const keys = genKeys();
    const entryData = makeEntry();
    const sig = signEntryV2(entryData, keys.privateKeyDer, keys.publicKeyDer);

    const tampered: ResourceIndexEntry = {
      ...entryData,
      peerId: "tampered-peer",
      signature: sig,
    };

    const result = verifyIndexSignature(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("payload hash mismatch");
  });

  it("rejects a v2-signed entry with tampered reachability", () => {
    const keys = genKeys();
    const entryData = makeEntry({ reachability: "direct" });
    const sig = signEntryV2(entryData, keys.privateKeyDer, keys.publicKeyDer);

    const tampered: ResourceIndexEntry = {
      ...entryData,
      reachability: "relay",
      signature: sig,
    };

    const result = verifyIndexSignature(tampered);
    expect(result.valid).toBe(false);
  });
});

describe("verifyIndexSignature (v1 regression)", () => {
  it("v1-signed entries still verify correctly", () => {
    // Simulate a v1 signature (no payloadVersion, no peerId/reachability)
    const keys = genKeys();
    const entry: ResourceIndexEntry = {
      providerId: "provider-v1",
      endpoint: "https://old.example.com",
      resources: [{ resourceId: "r1", kind: "model" }],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    // Build v1 payload manually (same logic as signature-verification.ts)
    function stableStringify(value: unknown): string {
      if (value === null || value === undefined) return "null";
      if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
      if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
      }
      return JSON.stringify(value);
    }

    const payload = stableStringify({
      providerId: entry.providerId,
      endpoint: entry.endpoint ?? null,
      resources: entry.resources,
      meta: entry.meta ?? null,
      updatedAt: entry.updatedAt,
      expiresAt: entry.expiresAt ?? null,
      lastHeartbeatAt: entry.lastHeartbeatAt ?? null,
    });

    const payloadHash = createHash("sha256").update(payload).digest("hex");
    const privKey = createPrivateKey({
      key: Buffer.from(keys.privateKeyDer, "base64"),
      format: "der",
      type: "pkcs8",
    });
    const sigBuf = sign(null, Buffer.from(payloadHash, "utf-8"), privKey);

    const v1Sig: IndexSignature = {
      scheme: "ed25519",
      publicKey: keys.publicKeyDer,
      signature: sigBuf.toString("base64"),
      payloadHash,
      signedAt: new Date().toISOString(),
      // no payloadVersion — this is v1
    };

    const signedEntry: ResourceIndexEntry = { ...entry, signature: v1Sig };
    const result = verifyIndexSignature(signedEntry);
    expect(result.valid).toBe(true);
  });

  it("v1 entry without peerId falls through to v1 path even with payloadVersion=2", () => {
    // Edge case: payloadVersion=2 but no peerId — should fall back to v1
    const keys = genKeys();
    const entry: ResourceIndexEntry = {
      providerId: "provider-edge",
      resources: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
      // NO peerId
    };

    // Sign with v1 method
    function stableStringify(value: unknown): string {
      if (value === null || value === undefined) return "null";
      if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
      if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        const k = Object.keys(record).sort();
        return `{${k.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
      }
      return JSON.stringify(value);
    }

    const payload = stableStringify({
      providerId: entry.providerId,
      endpoint: entry.endpoint ?? null,
      resources: entry.resources,
      meta: entry.meta ?? null,
      updatedAt: entry.updatedAt,
      expiresAt: entry.expiresAt ?? null,
      lastHeartbeatAt: entry.lastHeartbeatAt ?? null,
    });

    const payloadHash = createHash("sha256").update(payload).digest("hex");
    const privKey = createPrivateKey({
      key: Buffer.from(keys.privateKeyDer, "base64"),
      format: "der",
      type: "pkcs8",
    });
    const sigBuf = sign(null, Buffer.from(payloadHash, "utf-8"), privKey);

    const sigWithV2Tag: IndexSignature = {
      scheme: "ed25519",
      publicKey: keys.publicKeyDer,
      signature: sigBuf.toString("base64"),
      payloadHash,
      signedAt: new Date().toISOString(),
      payloadVersion: 2, // tagged as v2 but no peerId
    };

    const signedEntry: ResourceIndexEntry = { ...entry, signature: sigWithV2Tag };
    const result = verifyIndexSignature(signedEntry);
    // Should fall through to v1 and verify successfully
    expect(result.valid).toBe(true);
  });
});
