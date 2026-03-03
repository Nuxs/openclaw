/**
 * Local state persistence for the web3-core plugin.
 * All plugin state is stored under `stateDir` (typically ~/.openclaw).
 *
 * Files:
 *   web3/bindings.json            — wallet bindings
 *   web3/audit-log.jsonl          — local audit event log (append-only)
 *   web3/usage.json               — billing / quota state
 *   web3/resource-index.json      — resource index entries
 *   web3/p2p-peers.json           — P2P peer gossip table (internal)
 *   web3/pending-settlements.json — settlement retry queue
 *   web3/payment-required.json    — x402 idempotency records
 *   web3/pending-tx.json          — pending chain transactions (retry queue)
 */

import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditEvent } from "../audit/types.js";
import type { PaymentResumeToken, PaymentTraceRef, UsageRecord } from "../billing/types.js";
import type { SiweChallenge, WalletBinding } from "../identity/types.js";
import type { AlertEvent } from "../monitor/types.js";

export type PendingAnchor = {
  anchorId: string;
  payloadHash: string;
  createdAt: string;
  attempts?: number;
  lastError?: string;
};

export type PendingArchive = {
  event: AuditEvent;
  createdAt: string;
  attempts?: number;
  lastError?: string;
};

export type PendingSettlement = {
  sessionIdHash: string;
  createdAt: string;
  orderId?: string;
  payer?: string;
  amount?: string;
  actorId?: string;
  attempts?: number;
  lastError?: string;
};

export type PaymentRequiredRecord = {
  idempotencyKey: string;
  requestId?: string;
  toolName?: string;
  invoiceHash: string;
  resumeToken: PaymentResumeToken;
  createdAt: string;
  maxRetries?: number;
};

export type X402AutopayStats = {
  attempts: number;
  successes: number;
  failures: number;
  retryCount: number;
  circuitBreakerTrips: number;
  updatedAt: string;
};

export type IndexedResourceKind = "model" | "search" | "storage";

export type IndexedResource = {
  resourceId: string;
  kind: IndexedResourceKind;
  label?: string;
  description?: string;
  tags?: string[];
  price?: string;
  unit?: string;
  metadata?: Record<string, unknown>;
};

export type ResourceIndexEntry = {
  providerId: string;
  endpoint?: string;
  resources: IndexedResource[];
  updatedAt: string;
  expiresAt?: string;
  lastHeartbeatAt?: string;
  meta?: Record<string, unknown>;
  signature?: IndexSignature;
  /** MDL: libp2p peer identifier (present when discovered via DHT/Rendezvous) */
  peerId?: string;
  /** MDL: how the provider can be reached */
  reachability?: "direct" | "relay" | "unknown";
};

export type IndexSignature = {
  scheme: "ed25519";
  publicKey: string;
  signature: string;
  payloadHash: string;
  signedAt: string;
  /** MDL: signature payload version (2 = includes peerId/reachability) */
  payloadVersion?: number;
};

export type IndexSigningKey = {
  scheme: "ed25519";
  publicKey: string;
  privateKey: string;
  createdAt: string;
};

export type P2pPeerRecord = {
  peerId: string;
  transport: "gossip" | "dht" | "pubsub" | "mdns" | "static";
  address?: string;
  lastSeenAt: string;
  source?: string;
};

export type AnchorReceipt = {
  anchorId: string;
  tx: string;
  network: string;
  block?: number;
  updatedAt: string;
};

export type ArchiveReceipt = {
  cid?: string;
  uri?: string;
  updatedAt: string;
};

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

  // ---- SIWE challenges ----

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

  // ---- Archive receipts ----

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

  listUsageRecords(): UsageRecord[] {
    if (!existsSync(this.usagePath)) return [];
    const map = JSON.parse(readFileSync(this.usagePath, "utf-8")) as Record<string, UsageRecord>;
    return Object.values(map);
  }

  // ---- Provider identity ----

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

  // ---- Index signing ----

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

  // ---- Resource index ----

  private get resourceIndexPath() {
    return join(this.dir, "resource-index.json");
  }

  getResourceIndex(): ResourceIndexEntry[] {
    if (!existsSync(this.resourceIndexPath)) return [];
    return JSON.parse(readFileSync(this.resourceIndexPath, "utf-8")) as ResourceIndexEntry[];
  }

  saveResourceIndex(entries: ResourceIndexEntry[]): void {
    writeFileSync(this.resourceIndexPath, JSON.stringify(entries, null, 2));
  }

  upsertResourceIndex(entry: ResourceIndexEntry): void {
    const list = this.getResourceIndex();
    const index = list.findIndex((item) => item.providerId === entry.providerId);
    if (index >= 0) {
      list[index] = entry;
    } else {
      list.push(entry);
    }
    this.saveResourceIndex(list);
  }

  removeResourceIndex(providerId: string): void {
    const list = this.getResourceIndex().filter((item) => item.providerId !== providerId);
    this.saveResourceIndex(list);
  }

  // ---- P2P peers ----

  private get p2pPeersPath() {
    return join(this.dir, "p2p-peers.json");
  }

  getP2pPeers(): P2pPeerRecord[] {
    if (!existsSync(this.p2pPeersPath)) return [];
    return JSON.parse(readFileSync(this.p2pPeersPath, "utf-8")) as P2pPeerRecord[];
  }

  saveP2pPeers(entries: P2pPeerRecord[]): void {
    writeFileSync(this.p2pPeersPath, JSON.stringify(entries, null, 2));
  }

  upsertP2pPeer(entry: P2pPeerRecord): void {
    const list = this.getP2pPeers();
    const index = list.findIndex((item) => item.peerId === entry.peerId);
    if (index >= 0) {
      list[index] = entry;
    } else {
      list.push(entry);
    }
    this.saveP2pPeers(list);
  }

  pruneP2pPeers(maxAgeMs: number): number {
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return 0;
    const cutoff = Date.now() - maxAgeMs;
    const list = this.getP2pPeers();
    const filtered = list.filter((entry) => Date.parse(entry.lastSeenAt) > cutoff);
    if (filtered.length !== list.length) {
      this.saveP2pPeers(filtered);
    }
    return list.length - filtered.length;
  }

  // ---- Pending settlements (retry queue) ----

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

  // ---- Payment required (x402 idempotency) ----

  private get paymentRequiredPath() {
    return join(this.dir, "payment-required.json");
  }

  private get x402AutopayStatsPath() {
    return join(this.dir, "x402-autopay-stats.json");
  }

  getPaymentRequired(idempotencyKey: string): PaymentRequiredRecord | undefined {
    if (!existsSync(this.paymentRequiredPath)) return undefined;
    const map = JSON.parse(readFileSync(this.paymentRequiredPath, "utf-8")) as Record<
      string,
      PaymentRequiredRecord
    >;
    return map[idempotencyKey];
  }

  listPaymentRequiredRecords(): PaymentRequiredRecord[] {
    if (!existsSync(this.paymentRequiredPath)) return [];
    const map = JSON.parse(readFileSync(this.paymentRequiredPath, "utf-8")) as Record<
      string,
      PaymentRequiredRecord
    >;
    return Object.values(map);
  }

  listPaymentTraceRefs(limit = 50): PaymentTraceRef[] {
    const records = this.listPaymentRequiredRecords();
    return records
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.floor(limit)))
      .map((record) => ({
        requestId: record.requestId,
        idempotencyKey: record.idempotencyKey,
        invoiceId: record.resumeToken.invoiceId,
        paymentReceiptId: record.resumeToken.paymentReceiptId,
        txHash: record.resumeToken.txHash,
        toolName: record.toolName,
        createdAt: record.createdAt,
      }));
  }

  savePaymentRequired(record: PaymentRequiredRecord): void {
    let map: Record<string, PaymentRequiredRecord> = {};
    if (existsSync(this.paymentRequiredPath)) {
      map = JSON.parse(readFileSync(this.paymentRequiredPath, "utf-8")) as Record<
        string,
        PaymentRequiredRecord
      >;
    }
    map[record.idempotencyKey] = record;
    writeFileSync(this.paymentRequiredPath, JSON.stringify(map, null, 2));
  }

  getX402AutopayStats(): X402AutopayStats {
    if (!existsSync(this.x402AutopayStatsPath)) {
      return {
        attempts: 0,
        successes: 0,
        failures: 0,
        retryCount: 0,
        circuitBreakerTrips: 0,
        updatedAt: new Date(0).toISOString(),
      };
    }
    const stored = JSON.parse(readFileSync(this.x402AutopayStatsPath, "utf-8")) as
      | Partial<X402AutopayStats>
      | undefined;
    return {
      attempts: Number.isFinite(stored?.attempts) ? Math.max(0, Math.floor(stored!.attempts!)) : 0,
      successes: Number.isFinite(stored?.successes)
        ? Math.max(0, Math.floor(stored!.successes!))
        : 0,
      failures: Number.isFinite(stored?.failures) ? Math.max(0, Math.floor(stored!.failures!)) : 0,
      retryCount: Number.isFinite(stored?.retryCount)
        ? Math.max(0, Math.floor(stored!.retryCount!))
        : 0,
      circuitBreakerTrips: Number.isFinite(stored?.circuitBreakerTrips)
        ? Math.max(0, Math.floor(stored!.circuitBreakerTrips!))
        : 0,
      updatedAt:
        typeof stored?.updatedAt === "string" && stored.updatedAt.length > 0
          ? stored.updatedAt
          : new Date(0).toISOString(),
    };
  }

  saveX402AutopayStats(stats: X402AutopayStats): void {
    writeFileSync(this.x402AutopayStatsPath, JSON.stringify(stats, null, 2));
  }

  updateX402AutopayStats(
    delta: Partial<
      Pick<
        X402AutopayStats,
        "attempts" | "successes" | "failures" | "retryCount" | "circuitBreakerTrips"
      >
    >,
  ): X402AutopayStats {
    const current = this.getX402AutopayStats();
    const next: X402AutopayStats = {
      attempts: current.attempts + (delta.attempts ?? 0),
      successes: current.successes + (delta.successes ?? 0),
      failures: current.failures + (delta.failures ?? 0),
      retryCount: current.retryCount + (delta.retryCount ?? 0),
      circuitBreakerTrips: current.circuitBreakerTrips + (delta.circuitBreakerTrips ?? 0),
      updatedAt: new Date().toISOString(),
    };
    this.saveX402AutopayStats(next);
    return next;
  }

  // ---- Pending archives (retry queue) ----

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

  // ---- Anchor receipts ----

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

  // ---- Pending transactions (retry queue) ----

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

  // ---- Alerts ----

  private get alertsPath() {
    return join(this.dir, "alerts.jsonl");
  }

  appendAlert(alert: AlertEvent): void {
    appendFileSync(this.alertsPath, JSON.stringify(alert) + "\n");
  }

  getAlerts(limit = 1000): AlertEvent[] {
    if (!existsSync(this.alertsPath)) return [];
    const lines = readFileSync(this.alertsPath, "utf-8")
      .trim()
      .split("\n")
      .filter((l) => l);
    return lines.slice(-limit).map((l) => JSON.parse(l) as AlertEvent);
  }

  updateAlert(alert: AlertEvent): void {
    const alerts = this.getAlerts();
    const index = alerts.findIndex((a) => a.id === alert.id);
    if (index < 0) {
      throw new Error(`Alert not found: ${alert.id}`);
    }
    alerts[index] = alert;
    // Rewrite entire file (for JSONL we need to update)
    // In production, consider using a database for updates
    writeFileSync(this.alertsPath, alerts.map((a) => JSON.stringify(a)).join("\n") + "\n");
  }
}
