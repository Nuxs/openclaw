import { randomBytes } from "node:crypto";
import { describe, it, expect } from "vitest";
import { encryptPayload, decryptPayload } from "./archive.js";

describe("archive encryption", () => {
  it("should encrypt and decrypt round-trip", () => {
    const key = randomBytes(32);
    const plaintext = new TextEncoder().encode("Hello, decentralized world!");

    const encrypted = encryptPayload(plaintext, key);
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.tag).toBeTruthy();
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);

    const decrypted = decryptPayload(encrypted, key);
    expect(new TextDecoder().decode(decrypted)).toBe("Hello, decentralized world!");
  });

  it("should fail to decrypt with wrong key", () => {
    const key1 = randomBytes(32);
    const key2 = randomBytes(32);
    const plaintext = new TextEncoder().encode("secret data");

    const encrypted = encryptPayload(plaintext, key1);
    expect(() => decryptPayload(encrypted, key2)).toThrow();
  });
});
