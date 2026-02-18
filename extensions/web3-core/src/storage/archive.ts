/**
 * Archive pipeline: encrypt session data → upload to decentralized storage → return CID/URI.
 * Encryption uses AES-256-GCM with a per-archive random key, wrapped by a master key derived
 * from the user's wallet or a local passphrase.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { DecentralizedStorageAdapter, PutResult } from "./types.js";

const ALGO = "aes-256-gcm";

export type EncryptedPayload = {
  /** Base64-encoded IV */
  iv: string;
  /** Base64-encoded auth tag */
  tag: string;
  /** Raw encrypted bytes */
  ciphertext: Uint8Array;
};

/**
 * Encrypt bytes with AES-256-GCM.
 * @param key 32-byte key (e.g. derived from wallet signature or passphrase via HKDF)
 */
export function encryptPayload(plaintext: Uint8Array, key: Buffer): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: new Uint8Array(encrypted),
  };
}

/** Decrypt AES-256-GCM payload. */
export function decryptPayload(payload: EncryptedPayload, key: Buffer): Uint8Array {
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
  return new Uint8Array(decrypted);
}

/**
 * Archive content: optionally encrypt, then upload to decentralized storage.
 */
export async function archiveContent(
  content: Uint8Array,
  contentType: string,
  adapter: DecentralizedStorageAdapter,
  options: { encrypt: boolean; encryptionKey?: Buffer; name?: string },
): Promise<PutResult & { encrypted: boolean }> {
  let uploadBytes = content;
  let encrypted = false;

  if (options.encrypt && options.encryptionKey) {
    const payload = encryptPayload(content, options.encryptionKey);
    // Pack iv + tag + ciphertext as a single blob (header: 12B iv + 16B tag + rest)
    const packed = Buffer.concat([
      Buffer.from(payload.iv, "base64"),
      Buffer.from(payload.tag, "base64"),
      payload.ciphertext,
    ]);
    uploadBytes = new Uint8Array(packed);
    encrypted = true;
  }

  const result = await adapter.put({ bytes: uploadBytes, contentType, name: options.name });
  return { ...result, encrypted };
}
