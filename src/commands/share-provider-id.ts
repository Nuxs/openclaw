/**
 * Provider ID store — minimal standalone extraction.
 *
 * Replaces the direct `import { Web3StateStore } from extensions/web3-core/…`
 * in share.ts so the core CLI has zero cross-boundary imports into extensions.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export class ProviderIdStore {
  private readonly filePath: string;

  constructor(stateDir: string) {
    const dir = join(stateDir, "web3");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.filePath = join(dir, "provider-id.json");
  }

  getProviderId(): string | null {
    if (!existsSync(this.filePath)) {
      return null;
    }
    try {
      const stored = JSON.parse(readFileSync(this.filePath, "utf-8")) as {
        providerId?: string;
      };
      return stored.providerId ?? null;
    } catch {
      return null;
    }
  }

  saveProviderId(providerId: string): void {
    writeFileSync(this.filePath, JSON.stringify({ providerId }, null, 2));
  }

  ensureProviderId(): string {
    const existing = this.getProviderId();
    if (existing) {
      return existing;
    }
    const next = `provider-${randomBytes(6).toString("hex")}`;
    this.saveProviderId(next);
    return next;
  }
}
