/**
 * Local state persistence for the web3-core plugin.
 * All plugin state is stored under `stateDir` (typically ~/.openclaw).
 *
 * Files:
 *   web3/bindings.json   — wallet bindings
 *   web3/audit-log.jsonl — local audit event log (append-only)
 *   web3/usage.json      — billing / quota state
 *   web3/pending-tx.json — pending chain transactions (retry queue)
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditEvent } from "../audit/types.js";
import type { UsageRecord } from "../billing/types.js";
import type { WalletBinding } from "../identity/types.js";

export class Web3StateStore {
  private readonly dir: string;

  constructor(stateDir: string) {
    this.dir = join(stateDir, "web3");
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  // ---- Wallet bindings ----

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

  // ---- Audit log (append-only JSONL) ----

  private get auditLogPath() {
    return join(this.dir, "audit-log.jsonl");
  }

  appendAuditEvent(event: AuditEvent): void {
    appendFileSync(this.auditLogPath, JSON.stringify(event) + "\n");
  }

  readAuditEvents(limit = 100): AuditEvent[] {
    if (!existsSync(this.auditLogPath)) return [];
    const lines = readFileSync(this.auditLogPath, "utf-8").trim().split("\n");
    return lines.slice(-limit).map((l) => JSON.parse(l) as AuditEvent);
  }

  // ---- Archive encryption key ----

  private get archiveKeyPath() {
    return join(this.dir, "archive-key.json");
  }

  getArchiveKey(): Buffer {
    if (existsSync(this.archiveKeyPath)) {
      const stored = JSON.parse(readFileSync(this.archiveKeyPath, "utf-8")) as { key?: string };
      if (stored.key) return Buffer.from(stored.key, "base64");
    }
    const key = randomBytes(32);
    writeFileSync(this.archiveKeyPath, JSON.stringify({ key: key.toString("base64") }, null, 2));
    return key;
  }

  // ---- Usage / billing ----

  private get usagePath() {
    return join(this.dir, "usage.json");
  }

  getUsage(sessionIdHash: string): UsageRecord | undefined {
    if (!existsSync(this.usagePath)) return undefined;
    const map = JSON.parse(readFileSync(this.usagePath, "utf-8")) as Record<string, UsageRecord>;
    return map[sessionIdHash];
  }

  saveUsage(record: UsageRecord): void {
    let map: Record<string, UsageRecord> = {};
    if (existsSync(this.usagePath)) {
      map = JSON.parse(readFileSync(this.usagePath, "utf-8")) as Record<string, UsageRecord>;
    }
    map[record.sessionIdHash] = record;
    writeFileSync(this.usagePath, JSON.stringify(map, null, 2));
  }

  // ---- Pending transactions (retry queue) ----

  private get pendingTxPath() {
    return join(this.dir, "pending-tx.json");
  }

  getPendingTxs(): Array<{ anchorId: string; payloadHash: string; createdAt: string }> {
    if (!existsSync(this.pendingTxPath)) return [];
    return JSON.parse(readFileSync(this.pendingTxPath, "utf-8"));
  }

  savePendingTxs(txs: Array<{ anchorId: string; payloadHash: string; createdAt: string }>): void {
    writeFileSync(this.pendingTxPath, JSON.stringify(txs, null, 2));
  }
}
