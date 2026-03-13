/**
 * Audit sub-store — append-only audit log, archive receipts and encryption key.
 *
 * Split from the monolithic `Web3StateStore` to honour single-responsibility.
 */

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditEvent } from "../audit/types.js";
import type { ArchiveReceipt, PendingArchive } from "./store-types.js";

export class AuditStore {
  constructor(private readonly dir: string) {}

  // ── Audit log (append-only JSONL) ────────────────────────────────

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

  // ── Archive receipts ─────────────────────────────────────────────

  private get archiveReceiptPath() {
    return join(this.dir, "archive-receipt.json");
  }

  getArchiveReceipt(): ArchiveReceipt | null {
    if (!existsSync(this.archiveReceiptPath)) return null;
    return JSON.parse(readFileSync(this.archiveReceiptPath, "utf-8")) as ArchiveReceipt;
  }

  saveArchiveReceipt(receipt: ArchiveReceipt): void {
    writeFileSync(this.archiveReceiptPath, JSON.stringify(receipt, null, 2));
  }

  // ── Archive encryption key ───────────────────────────────────────

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

  // ── Pending archives (retry queue) ───────────────────────────────

  private get pendingArchivePath() {
    return join(this.dir, "pending-archive.json");
  }

  getPendingArchives(): PendingArchive[] {
    if (!existsSync(this.pendingArchivePath)) return [];
    return JSON.parse(readFileSync(this.pendingArchivePath, "utf-8"));
  }

  savePendingArchives(items: PendingArchive[]): void {
    writeFileSync(this.pendingArchivePath, JSON.stringify(items, null, 2));
  }

  upsertPendingArchive(item: PendingArchive): void {
    const list = this.getPendingArchives();
    const index = list.findIndex((entry) => entry.event.id === item.event.id);
    if (index >= 0) {
      list[index] = item;
    } else {
      list.push(item);
    }
    this.savePendingArchives(list);
  }

  removePendingArchive(eventId: string): void {
    const list = this.getPendingArchives().filter((entry) => entry.event.id !== eventId);
    this.savePendingArchives(list);
  }
}
