import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentWalletConfig } from "./config.js";
import {
  loadTonWalletRecord,
  loadWalletRecord,
  saveTonWalletRecord,
  saveWalletRecord,
  type TonWalletIdentity,
  type WalletIdentity,
} from "./store.js";

let tmpDir: string;
let config: AgentWalletConfig;

function makeConfig(overrides?: Partial<AgentWalletConfig>): AgentWalletConfig {
  return {
    enabled: true,
    storePath: path.join(tmpDir, "wallet.json"),
    encryptionKey: "test-secret-key-32chars-abcdef!",
    chain: { network: "base" },
    ...overrides,
  };
}

const EVM_IDENTITY: WalletIdentity = {
  version: 1,
  address: "0x1234567890abcdef1234567890abcdef12345678",
  publicKey: "04abcdef",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const EVM_PK: `0x${string}` = "0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678";

const TON_IDENTITY: TonWalletIdentity = {
  address: "EQBxyz123tonaddress",
  publicKey: "aabbccdd",
  createdAt: "2026-01-02T00:00:00.000Z",
};

const TON_MNEMONIC = "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-wallet-test-"));
  config = makeConfig();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("store: EVM wallet CRUD", () => {
  it("returns null when no record exists", async () => {
    const result = await loadWalletRecord(config);
    expect(result).toBeNull();
  });

  it("saves and loads an EVM wallet record (v1)", async () => {
    await saveWalletRecord(config, EVM_IDENTITY, EVM_PK);

    const loaded = await loadWalletRecord(config);
    expect(loaded).not.toBeNull();
    expect(loaded!.identity.address).toBe(EVM_IDENTITY.address);
    expect(loaded!.identity.version).toBe(1);
    expect(loaded!.privateKey).toBe(EVM_PK);
  });

  it("encrypts private key on disk", async () => {
    await saveWalletRecord(config, EVM_IDENTITY, EVM_PK);

    const raw = await fs.readFile(config.storePath!, "utf8");
    expect(raw).not.toContain(EVM_PK);
    expect(raw).toContain("aes-256-gcm");
  });
});

describe("store: TON wallet (v2 upgrade)", () => {
  it("rejects TON save without base EVM record", async () => {
    await expect(saveTonWalletRecord(config, TON_IDENTITY, TON_MNEMONIC)).rejects.toThrow(
      "base record missing",
    );
  });

  it("upgrades v1 to v2 when saving TON wallet", async () => {
    await saveWalletRecord(config, EVM_IDENTITY, EVM_PK);
    await saveTonWalletRecord(config, TON_IDENTITY, TON_MNEMONIC);

    const raw = JSON.parse(await fs.readFile(config.storePath!, "utf8"));
    expect(raw.version).toBe(2);
    expect(raw.ton).toBeDefined();
    expect(raw.ton.address).toBe(TON_IDENTITY.address);
  });

  it("loads TON wallet after upgrade", async () => {
    await saveWalletRecord(config, EVM_IDENTITY, EVM_PK);
    await saveTonWalletRecord(config, TON_IDENTITY, TON_MNEMONIC);

    const tonLoaded = await loadTonWalletRecord(config);
    expect(tonLoaded).not.toBeNull();
    expect(tonLoaded!.identity.address).toBe(TON_IDENTITY.address);
    expect(tonLoaded!.mnemonic).toBe(TON_MNEMONIC);
  });

  it("preserves EVM access after TON upgrade", async () => {
    await saveWalletRecord(config, EVM_IDENTITY, EVM_PK);
    await saveTonWalletRecord(config, TON_IDENTITY, TON_MNEMONIC);

    const evmLoaded = await loadWalletRecord(config);
    expect(evmLoaded).not.toBeNull();
    expect(evmLoaded!.identity.address).toBe(EVM_IDENTITY.address);
    expect(evmLoaded!.privateKey).toBe(EVM_PK);
  });

  it("returns null for TON on v1 record", async () => {
    await saveWalletRecord(config, EVM_IDENTITY, EVM_PK);

    const tonLoaded = await loadTonWalletRecord(config);
    expect(tonLoaded).toBeNull();
  });

  it("preserves TON section when re-saving EVM wallet on v2", async () => {
    await saveWalletRecord(config, EVM_IDENTITY, EVM_PK);
    await saveTonWalletRecord(config, TON_IDENTITY, TON_MNEMONIC);

    // Re-save EVM with updated address
    const updatedIdentity = { ...EVM_IDENTITY, address: "0xnewaddress" };
    await saveWalletRecord(config, updatedIdentity, EVM_PK);

    // TON section should be preserved
    const tonLoaded = await loadTonWalletRecord(config);
    expect(tonLoaded).not.toBeNull();
    expect(tonLoaded!.identity.address).toBe(TON_IDENTITY.address);
  });
});

describe("store: version guard", () => {
  it("rejects file with invalid version", async () => {
    const target = config.storePath!;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify({ data: "no version" }), "utf8");

    await expect(loadWalletRecord(config)).rejects.toThrow("invalid agent-wallet record");
  });

  it("accepts version: 0 as a valid number type (does not reject as invalid record)", async () => {
    // version 0 is technically a number, our guard should accept it as a valid
    // structure (even though no real record uses version 0). The decryption will
    // fail on the fake payload, but the error should be a crypto error, NOT
    // "invalid agent-wallet record".
    const target = config.storePath!;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      JSON.stringify({
        version: 0,
        address: "0xtest",
        createdAt: "2026-01-01T00:00:00.000Z",
        encryptedPrivateKey: {
          version: 1,
          alg: "aes-256-gcm",
          iv: "AAAA",
          tag: "BBBB",
          data: "CCCC",
        },
      }),
      "utf8",
    );

    try {
      await loadWalletRecord(config);
    } catch (err) {
      // We expect a crypto error (invalid auth tag), NOT "invalid agent-wallet record"
      expect((err as Error).message).not.toContain("invalid agent-wallet record");
    }
  });
});
