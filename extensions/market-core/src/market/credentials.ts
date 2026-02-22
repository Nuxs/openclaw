import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withFileLock } from "openclaw/plugin-sdk";
import type { CredentialsConfig } from "../config.js";
import type { DeliveryPayload, DeliveryPayloadRef } from "./types.js";

const DEFAULT_LOCK_OPTIONS = {
  retries: {
    retries: 6,
    factor: 1.6,
    minTimeout: 40,
    maxTimeout: 800,
    randomize: true,
  },
  stale: 15_000,
};

type EncryptedPayload = {
  version: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

function resolveStorePath(config: CredentialsConfig): string {
  if (config.storePath && config.storePath.trim().length > 0) {
    return config.storePath;
  }
  return path.join(os.homedir(), ".openclaw", "credentials", "market-core");
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encrypt(payload: DeliveryPayload, secret: string): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function decrypt(payload: EncryptedPayload, secret: string): DeliveryPayload {
  if (payload.alg !== "aes-256-gcm") {
    throw new Error(`unsupported credentials cipher: ${payload.alg}`);
  }
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as DeliveryPayload;
}

function ensureExternalConfig(config: CredentialsConfig): { storePath: string; key: string } {
  if (config.mode !== "external") {
    throw new Error("credentials.mode must be external to access delivery payload store");
  }
  if (!config.encryptionKey || config.encryptionKey.trim().length === 0) {
    throw new Error("credentials.encryptionKey is required when credentials.mode is external");
  }
  return { storePath: resolveStorePath(config), key: config.encryptionKey };
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export class DeliveryCredentialsStore {
  private readonly storePath: string;
  private readonly encryptionKey: string;
  private readonly lockOptions: typeof DEFAULT_LOCK_OPTIONS;

  constructor(config: CredentialsConfig) {
    const { storePath, key } = ensureExternalConfig(config);
    this.storePath = storePath;
    this.encryptionKey = key;
    const timeout = Math.max(2000, config.lockTimeoutMs ?? DEFAULT_LOCK_OPTIONS.stale);
    this.lockOptions = {
      ...DEFAULT_LOCK_OPTIONS,
      stale: timeout,
    };
  }

  private deliveryPath(ref: string): string {
    return path.join(this.storePath, "deliveries", ref);
  }

  async putDeliveryPayload(
    deliveryId: string,
    payload: DeliveryPayload,
  ): Promise<DeliveryPayloadRef> {
    const ref = `${deliveryId}.json`;
    const target = this.deliveryPath(ref);
    await ensureDir(path.dirname(target));
    await withFileLock(target, this.lockOptions, async () => {
      const encrypted = encrypt(payload, this.encryptionKey);
      await fs.writeFile(target, JSON.stringify(encrypted, null, 2), "utf8");
    });
    return { store: "credentials", ref };
  }

  async getDeliveryPayload(ref: DeliveryPayloadRef): Promise<DeliveryPayload> {
    const target = this.deliveryPath(ref.ref);
    const raw = await withFileLock(target, this.lockOptions, async () =>
      fs.readFile(target, "utf8"),
    );
    const parsed = JSON.parse(raw) as EncryptedPayload;
    return decrypt(parsed, this.encryptionKey);
  }

  async removeDeliveryPayload(ref: DeliveryPayloadRef): Promise<void> {
    const target = this.deliveryPath(ref.ref);
    await withFileLock(target, this.lockOptions, async () => {
      await fs.rm(target, { force: true });
    });
  }
}

export function createDeliveryCredentialsStore(
  config: CredentialsConfig,
): DeliveryCredentialsStore | null {
  if (config.mode !== "external") return null;
  return new DeliveryCredentialsStore(config);
}
