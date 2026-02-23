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

type WalletRecordV1 = WalletIdentity & {
  encryptedPrivateKey: EncryptedPayload;
};

type TonWalletSection = {
  address: string;
  publicKey?: string;
  createdAt: string;
  encryptedMnemonic: EncryptedPayload;
};

type WalletRecordV2 = {
  version: 2;
  address: string;
  publicKey?: string;
  createdAt: string;
  encryptedPrivateKey: EncryptedPayload;
  ton?: TonWalletSection;
};

type WalletRecord = WalletRecordV1 | WalletRecordV2;

export type TonWalletIdentity = {
  address: string;
  publicKey?: string;
  createdAt: string;
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

function encryptString(plaintext: string, secret: string): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const buf = Buffer.from(plaintext, "utf8");
  const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function decryptString(payload: EncryptedPayload, secret: string): string {
  if (payload.alg !== "aes-256-gcm") {
    throw new Error(`unsupported wallet cipher: ${payload.alg}`);
  }
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
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

async function loadWalletFile(config: AgentWalletConfig): Promise<WalletRecord | null> {
  const target = resolveStorePath(config);
  const raw = await readFileIfExists(target);
  if (!raw) return null;

  const parsed = JSON.parse(raw) as WalletRecord;
  if (parsed && typeof parsed === "object" && typeof parsed.version === "number") {
    return parsed;
  }
  throw new Error("invalid agent-wallet record");
}

async function saveWalletFile(config: AgentWalletConfig, record: WalletRecord): Promise<void> {
  const target = resolveStorePath(config);
  await ensureDir(path.dirname(target));

  await withFileLock(target, DEFAULT_LOCK_OPTIONS, async () => {
    await fs.writeFile(target, JSON.stringify(record, null, 2), "utf8");
  });
}

export async function loadWalletRecord(
  config: AgentWalletConfig,
): Promise<{ identity: WalletIdentity; privateKey: `0x${string}` } | null> {
  const key = resolveEncryptionKey(config);
  const record = await loadWalletFile(config);
  if (!record) return null;

  const decrypted = decryptString(record.encryptedPrivateKey, key) as `0x${string}`;

  return {
    identity: {
      version: 1,
      address: record.address,
      publicKey: record.publicKey,
      createdAt: record.createdAt,
    },
    privateKey: decrypted,
  };
}

export async function saveWalletRecord(
  config: AgentWalletConfig,
  identity: WalletIdentity,
  privateKey: `0x${string}`,
): Promise<void> {
  const key = resolveEncryptionKey(config);

  const existing = await loadWalletFile(config);
  const encryptedPrivateKey = encryptString(privateKey, key);

  // Preserve TON section if present.
  if (existing && existing.version === 2) {
    const record: WalletRecordV2 = {
      version: 2,
      address: identity.address,
      publicKey: identity.publicKey,
      createdAt: identity.createdAt,
      encryptedPrivateKey,
      ton: existing.ton,
    };
    await saveWalletFile(config, record);
    return;
  }

  const record: WalletRecordV1 = {
    ...identity,
    encryptedPrivateKey,
  };

  await saveWalletFile(config, record);
}

export async function loadTonWalletRecord(
  config: AgentWalletConfig,
): Promise<{ identity: TonWalletIdentity; mnemonic: string } | null> {
  const key = resolveEncryptionKey(config);
  const record = await loadWalletFile(config);
  if (!record || record.version !== 2 || !record.ton) return null;

  return {
    identity: {
      address: record.ton.address,
      publicKey: record.ton.publicKey,
      createdAt: record.ton.createdAt,
    },
    mnemonic: decryptString(record.ton.encryptedMnemonic, key),
  };
}

export async function saveTonWalletRecord(
  config: AgentWalletConfig,
  identity: TonWalletIdentity,
  mnemonic: string,
): Promise<void> {
  const key = resolveEncryptionKey(config);
  const existing = await loadWalletFile(config);
  if (!existing) {
    throw new Error("agent-wallet base record missing; create EVM wallet first");
  }

  const ton: TonWalletSection = {
    address: identity.address,
    publicKey: identity.publicKey,
    createdAt: identity.createdAt,
    encryptedMnemonic: encryptString(mnemonic, key),
  };

  const record: WalletRecordV2 = {
    version: 2,
    address: existing.address,
    publicKey: existing.publicKey,
    createdAt: existing.createdAt,
    encryptedPrivateKey: existing.encryptedPrivateKey,
    ton,
  };

  await saveWalletFile(config, record);
}
