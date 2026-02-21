/**
 * Unit tests for index signature verification.
 * Tests Ed25519 signature validation for resource index entries.
 */

import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import type { ResourceIndexEntry } from "../state/store.js";
import { Web3StateStore } from "../state/store.js";
import { verifyIndexSignature, verifyIndexEntries } from "./signature-verification.js";

describe("Index Signature Verification", () => {
  let tempDir: string;
  let store: Web3StateStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "web3-sig-test-"));
    store = new Web3StateStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createSignedEntry(): ResourceIndexEntry {
    const signingKey = store.getIndexSigningKey();
    const entry: ResourceIndexEntry = {
      providerId: `provider-${randomBytes(4).toString("hex")}`,
      endpoint: "https://example.test",
      resources: [
        {
          resourceId: "res-1",
          kind: "storage",
          label: "Test Storage",
          tags: ["test"],
        },
      ],
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    };

    // Sign using the same logic as indexer
    const { createHash, createPrivateKey, sign } = require("node:crypto");

    function stableStringify(value: unknown): string {
      if (value === null || value === undefined) {
        return "null";
      }
      if (Array.isArray(value)) {
        return `[${value.map((item: unknown) => stableStringify(item)).join(",")}]`;
      }
      if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        return `{${keys
          .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
          .join(",")}}`;
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
    const privateKey = createPrivateKey({
      key: Buffer.from(signingKey.privateKey, "base64"),
      format: "der",
      type: "pkcs8",
    });
    const signature = sign(null, Buffer.from(payloadHash, "utf-8"), privateKey);

    return {
      ...entry,
      signature: {
        scheme: "ed25519",
        publicKey: signingKey.publicKey,
        signature: signature.toString("base64"),
        payloadHash,
        signedAt: entry.updatedAt,
      },
    };
  }

  it("verifies a valid Ed25519 signature", () => {
    const entry = createSignedEntry();
    const result = verifyIndexSignature(entry);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("rejects entry without signature", () => {
    const entry = createSignedEntry();
    delete entry.signature;
    const result = verifyIndexSignature(entry);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature missing");
  });

  it("rejects entry with tampered payload", () => {
    const entry = createSignedEntry();
    // Tamper with the data
    entry.resources[0]!.label = "Tampered Label";
    const result = verifyIndexSignature(entry);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("payload hash mismatch");
  });

  it("rejects entry with invalid signature", () => {
    const entry = createSignedEntry();
    // Corrupt the signature
    entry.signature!.signature = Buffer.from("invalid").toString("base64");
    const result = verifyIndexSignature(entry);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("signature verification failed");
  });

  it("rejects entry with wrong public key", () => {
    const entry = createSignedEntry();
    // Replace with a different public key
    const { generateKeyPairSync } = require("node:crypto");
    const { publicKey } = generateKeyPairSync("ed25519");
    entry.signature!.publicKey = publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");
    const result = verifyIndexSignature(entry);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("signature verification failed");
  });

  it("rejects entry with unsupported signature scheme", () => {
    const entry = createSignedEntry();
    entry.signature!.scheme = "rsa" as any;
    const result = verifyIndexSignature(entry);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("unsupported signature scheme: rsa");
  });

  it("rejects entry with incomplete signature fields", () => {
    const entry = createSignedEntry();
    delete (entry.signature as any).payloadHash;
    const result = verifyIndexSignature(entry);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("incomplete signature (missing publicKey/signature/payloadHash)");
  });

  it("filters out invalid entries from array", () => {
    const valid1 = createSignedEntry();
    const valid2 = createSignedEntry();
    const invalid = createSignedEntry();
    delete invalid.signature;

    const warnings: string[] = [];
    const verified = verifyIndexEntries([valid1, invalid, valid2], {
      logger: (msg) => warnings.push(msg),
    });

    expect(verified).toHaveLength(2);
    expect(verified).toContain(valid1);
    expect(verified).toContain(valid2);
    expect(verified).not.toContain(invalid);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("signature missing");
  });

  it("skips verification when skipVerification=true", () => {
    const invalid = createSignedEntry();
    delete invalid.signature;

    const verified = verifyIndexEntries([invalid], {
      skipVerification: true,
    });

    expect(verified).toHaveLength(1);
    expect(verified).toContain(invalid);
  });

  it("verifies signature after round-trip through store", () => {
    const entry = createSignedEntry();
    store.upsertResourceIndex(entry);

    const loaded = store.getResourceIndex().find((e) => e.providerId === entry.providerId);
    expect(loaded).toBeDefined();

    const result = verifyIndexSignature(loaded!);
    expect(result.valid).toBe(true);
  });
});
