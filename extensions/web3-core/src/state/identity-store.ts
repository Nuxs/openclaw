/**
 * Identity sub-store — wallet bindings, SIWE challenges and provider identity.
 *
 * Split from the monolithic `Web3StateStore` to honour single-responsibility.
 * The facade class (`Web3StateStore`) delegates to this store so existing
 * consumers keep working without import changes.
 */

import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SiweChallenge, WalletBinding } from "../identity/types.js";
import type { IndexSigningKey } from "./store-types.js";

export class IdentityStore {
  constructor(private readonly dir: string) {}

  // ── Wallet bindings ──────────────────────────────────────────────

  private get bindingsPath() {
    return join(this.dir, "bindings.json");
  }

  getBindings(): WalletBinding[] {
    if (!existsSync(this.bindingsPath)) return [];
    return JSON.parse(readFileSync(this.bindingsPath, "utf-8")) as WalletBinding[];
  }

  saveBindings(bindings: WalletBinding[]): void {
    writeFileSync(this.bindingsPath, JSON.stringify(bindings, null, 2));
  }

  addBinding(binding: WalletBinding): void {
    const list = this.getBindings().filter((b) => b.address !== binding.address);
    list.push(binding);
    this.saveBindings(list);
  }

  removeBinding(address: string): void {
    this.saveBindings(this.getBindings().filter((b) => b.address !== address));
  }

  // ── SIWE challenges ──────────────────────────────────────────────

  private get siweChallengesPath() {
    return join(this.dir, "siwe-challenges.json");
  }

  getSiweChallenge(nonce: string): SiweChallenge | undefined {
    if (!existsSync(this.siweChallengesPath)) return undefined;
    const map = JSON.parse(readFileSync(this.siweChallengesPath, "utf-8")) as Record<
      string,
      SiweChallenge
    >;
    return map[nonce];
  }

  saveSiweChallenge(challenge: SiweChallenge): void {
    let map: Record<string, SiweChallenge> = {};
    if (existsSync(this.siweChallengesPath)) {
      map = JSON.parse(readFileSync(this.siweChallengesPath, "utf-8")) as Record<
        string,
        SiweChallenge
      >;
    }
    map[challenge.nonce] = challenge;
    writeFileSync(this.siweChallengesPath, JSON.stringify(map, null, 2));
  }

  deleteSiweChallenge(nonce: string): void {
    if (!existsSync(this.siweChallengesPath)) return;
    const map = JSON.parse(readFileSync(this.siweChallengesPath, "utf-8")) as Record<
      string,
      SiweChallenge
    >;
    if (!(nonce in map)) return;
    delete map[nonce];
    writeFileSync(this.siweChallengesPath, JSON.stringify(map, null, 2));
  }

  pruneSiweChallenges(now = Date.now()): void {
    if (!existsSync(this.siweChallengesPath)) return;
    const map = JSON.parse(readFileSync(this.siweChallengesPath, "utf-8")) as Record<
      string,
      SiweChallenge
    >;
    let dirty = false;
    for (const [nonce, challenge] of Object.entries(map)) {
      const expiresAt = Date.parse(challenge.expiresAt);
      if (Number.isNaN(expiresAt) || expiresAt <= now) {
        delete map[nonce];
        dirty = true;
      }
    }
    if (dirty) {
      writeFileSync(this.siweChallengesPath, JSON.stringify(map, null, 2));
    }
  }

  // ── Provider identity ────────────────────────────────────────────

  private get providerIdPath() {
    return join(this.dir, "provider-id.json");
  }

  getProviderId(): string | null {
    if (!existsSync(this.providerIdPath)) return null;
    const stored = JSON.parse(readFileSync(this.providerIdPath, "utf-8")) as {
      providerId?: string;
    };
    return stored.providerId ?? null;
  }

  saveProviderId(providerId: string): void {
    writeFileSync(this.providerIdPath, JSON.stringify({ providerId }, null, 2));
  }

  ensureProviderId(): string {
    const existing = this.getProviderId();
    if (existing) return existing;
    const next = `provider-${randomBytes(6).toString("hex")}`;
    this.saveProviderId(next);
    return next;
  }

  // ── Index signing key ────────────────────────────────────────────

  private get indexSigningKeyPath() {
    return join(this.dir, "index-signing.json");
  }

  getIndexSigningKey(): IndexSigningKey {
    if (existsSync(this.indexSigningKeyPath)) {
      return JSON.parse(readFileSync(this.indexSigningKeyPath, "utf-8")) as IndexSigningKey;
    }
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const createdAt = new Date().toISOString();
    const record: IndexSigningKey = {
      scheme: "ed25519",
      publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
      privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
      createdAt,
    };
    writeFileSync(this.indexSigningKeyPath, JSON.stringify(record, null, 2));
    return record;
  }
}
