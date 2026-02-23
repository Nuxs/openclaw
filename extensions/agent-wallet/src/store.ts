import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withFileLock } from "openclaw/plugin-sdk";
import type { AgentWalletConfig } from "./config.js";

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

export type WalletIdentity = {
  version: 1;
  address: string;
  publicKey?: string;
  createdAt: string;
};

export type WalletRecord = WalletIdentity & {
  encryptedPrivateKey: EncryptedPayload;
};

function resolveStorePath(config: AgentWalletConfig): string {
  if (config.storePath && config.storePath.trim().length > 0) {
    return config.storePath;
  }
  return path.join(os.homedir(), ".openclaw", "credentials", "agent-wallet", "wallet.json");
}

function resolveEncryptionKey(config: AgentWalletConfig): string {
  if (!config.encryptionKey || config.encryptionKey.trim().length === 0) {
    throw new Error("agent-wallet.encryptionKey is required to initialize wallet storage");
  }
  return config.encryptionKey;
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encryptPrivateKey(privateKey: string, secret: string): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const plaintext = Buffer.from(privateKey, "utf8");
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

function decryptPrivateKey(payload: EncryptedPayload, secret: string): string {
  if (payload.alg !== "aes-256-gcm") {
    throw new Error(`unsupported wallet cipher: ${payload.alg}`);
  }
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return plaintext;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function readFileIfExists(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function loadWalletRecord(
  config: AgentWalletConfig,
): Promise<{ identity: WalletIdentity; privateKey: `0x${string}` } | null> {
  const target = resolveStorePath(config);
  const key = resolveEncryptionKey(config);

  const raw = await readFileIfExists(target);
  if (!raw) return null;

  const parsed = JSON.parse(raw) as WalletRecord;
  const decrypted = decryptPrivateKey(parsed.encryptedPrivateKey, key) as `0x${string}`;

  return {
    identity: {
      version: 1,
      address: parsed.address,
      publicKey: parsed.publicKey,
      createdAt: parsed.createdAt,
    },
    privateKey: decrypted,
  };
}

export async function saveWalletRecord(
  config: AgentWalletConfig,
  identity: WalletIdentity,
  privateKey: `0x${string}`,
): Promise<void> {
  const target = resolveStorePath(config);
  const key = resolveEncryptionKey(config);
  await ensureDir(path.dirname(target));

  const encrypted = encryptPrivateKey(privateKey, key);
  const record: WalletRecord = {
    ...identity,
    encryptedPrivateKey: encrypted,
  };

  await withFileLock(target, DEFAULT_LOCK_OPTIONS, async () => {
    await fs.writeFile(target, JSON.stringify(record, null, 2), "utf8");
  });
}
