/**
 * Settlement sub-store — pending settlements, anchor receipts and
 * pending chain transactions (retry queues).
 *
 * Split from the monolithic `Web3StateStore` to honour single-responsibility.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnchorReceipt, PendingAnchor, PendingSettlement } from "./store-types.js";

export class SettlementStore {
  constructor(private readonly dir: string) {}

  // ── Pending settlements (retry queue) ────────────────────────────

  private get pendingSettlementsPath() {
    return join(this.dir, "pending-settlements.json");
  }

  getPendingSettlements(): PendingSettlement[] {
    if (!existsSync(this.pendingSettlementsPath)) return [];
    return JSON.parse(readFileSync(this.pendingSettlementsPath, "utf-8"));
  }

  savePendingSettlements(items: PendingSettlement[]): void {
    writeFileSync(this.pendingSettlementsPath, JSON.stringify(items, null, 2));
  }

  upsertPendingSettlement(item: PendingSettlement): void {
    const list = this.getPendingSettlements();
    const index = list.findIndex((entry) => entry.sessionIdHash === item.sessionIdHash);
    if (index >= 0) {
      list[index] = item;
    } else {
      list.push(item);
    }
    this.savePendingSettlements(list);
  }

  removePendingSettlement(sessionIdHash: string): void {
    const list = this.getPendingSettlements().filter(
      (entry) => entry.sessionIdHash !== sessionIdHash,
    );
    this.savePendingSettlements(list);
  }

  // ── Anchor receipts ──────────────────────────────────────────────

  private get anchorReceiptsPath() {
    return join(this.dir, "anchor-receipts.json");
  }

  getAnchorReceipt(anchorId: string): AnchorReceipt | undefined {
    if (!existsSync(this.anchorReceiptsPath)) return undefined;
    const map = JSON.parse(readFileSync(this.anchorReceiptsPath, "utf-8")) as Record<
      string,
      AnchorReceipt
    >;
    return map[anchorId];
  }

  getLastAnchorReceipt(): AnchorReceipt | null {
    if (!existsSync(this.anchorReceiptsPath)) return null;
    const map = JSON.parse(readFileSync(this.anchorReceiptsPath, "utf-8")) as Record<
      string,
      AnchorReceipt
    >;
    const entries = Object.values(map);
    if (entries.length === 0) return null;
    return entries.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  }

  saveAnchorReceipt(receipt: AnchorReceipt): void {
    let map: Record<string, AnchorReceipt> = {};
    if (existsSync(this.anchorReceiptsPath)) {
      map = JSON.parse(readFileSync(this.anchorReceiptsPath, "utf-8")) as Record<
        string,
        AnchorReceipt
      >;
    }
    map[receipt.anchorId] = receipt;
    writeFileSync(this.anchorReceiptsPath, JSON.stringify(map, null, 2));
  }

  // ── Pending transactions (retry queue) ───────────────────────────

  private get pendingTxPath() {
    return join(this.dir, "pending-tx.json");
  }

  getPendingTxs(): PendingAnchor[] {
    if (!existsSync(this.pendingTxPath)) return [];
    return JSON.parse(readFileSync(this.pendingTxPath, "utf-8"));
  }

  savePendingTxs(txs: PendingAnchor[]): void {
    writeFileSync(this.pendingTxPath, JSON.stringify(txs, null, 2));
  }

  upsertPendingTx(tx: PendingAnchor): void {
    const list = this.getPendingTxs();
    const index = list.findIndex((entry) => entry.anchorId === tx.anchorId);
    if (index >= 0) {
      list[index] = tx;
    } else {
      list.push(tx);
    }
    this.savePendingTxs(list);
  }

  removePendingTx(anchorId: string): void {
    const list = this.getPendingTxs().filter((entry) => entry.anchorId !== anchorId);
    this.savePendingTxs(list);
  }
}
