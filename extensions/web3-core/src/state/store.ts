/**
 * Local state persistence for the web3-core plugin.
 *
 * This file is now a **facade** that delegates to single-responsibility
 * sub-stores.  All public method signatures and exported types remain
 * identical so that the 42+ consumer files require zero import changes.
 *
 * Sub-stores:
 *   IdentityStore   — wallet bindings, SIWE challenges, provider ID, signing key
 *   AuditStore      — audit log, archive receipts/key, pending archives
 *   BillingStore    — usage, x402 payment-required, autopay stats
 *   ResourceStore   — resource index, P2P peers, discovery identity map
 *   SettlementStore — pending settlements, anchor receipts, pending txs
 *   MonitorStore    — alerts
 *
 * Files on disk (unchanged):
 *   web3/bindings.json            — wallet bindings
 *   web3/audit-log.jsonl          — local audit event log (append-only)
 *   web3/usage.json               — billing / quota state
 *   web3/resource-index.json      — resource index entries
 *   web3/p2p-peers.json           — P2P peer gossip table (internal)
 *   web3/pending-settlements.json — settlement retry queue
 *   web3/payment-required.json    — x402 idempotency records
 *   web3/pending-tx.json          — pending chain transactions (retry queue)
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AuditEvent } from "../audit/types.js";
import type { PaymentTraceRef, UsageRecord } from "../billing/types.js";
import type { SiweChallenge, WalletBinding } from "../identity/types.js";
import type { AlertEvent } from "../monitor/types.js";
import { AuditStore } from "./audit-store.js";
import { BillingStore } from "./billing-store.js";
import { IdentityStore } from "./identity-store.js";
import { MonitorStore } from "./monitor-store.js";
import { ResourceStore } from "./resource-store.js";
import { SettlementStore } from "./settlement-store.js";
import type {
  AnchorReceipt,
  ArchiveReceipt,
  DiscoveryIdentityRecord,
  IndexSigningKey,
  IndexedResource,
  P2pPeerRecord,
  PaymentRequiredRecord,
  PendingAnchor,
  PendingArchive,
  PendingSettlement,
  ResourceIndexEntry,
  X402AutopayStats,
} from "./store-types.js";

// ── Re-export every type so existing `import { … } from "../state/store.js"`
//    statements continue to work without changes. ──
export type {
  AnchorReceipt,
  ArchiveReceipt,
  DiscoveryIdentityRecord,
  IndexSigningKey,
  IndexedResource,
  P2pPeerRecord,
  PaymentRequiredRecord,
  PendingAnchor,
  PendingArchive,
  PendingSettlement,
  ResourceIndexEntry,
  X402AutopayStats,
} from "./store-types.js";

export type { IndexedResourceKind, IndexSignature } from "./store-types.js";

/**
 * Unified facade that delegates to domain-specific sub-stores.
 *
 * Every public method signature is **identical** to the original monolithic
 * class so that no consumer code needs to change.  Sub-stores are created
 * lazily via getters so construction cost is negligible.
 */
export class Web3StateStore {
  private readonly dir: string;

  // Sub-store instances (created once, cached)
  private _identity?: IdentityStore;
  private _audit?: AuditStore;
  private _billing?: BillingStore;
  private _resource?: ResourceStore;
  private _settlement?: SettlementStore;
  private _monitor?: MonitorStore;

  constructor(stateDir: string) {
    this.dir = join(stateDir, "web3");
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  // ── Sub-store accessors (lazy singletons) ────────────────────────

  get identity(): IdentityStore {
    return (this._identity ??= new IdentityStore(this.dir));
  }

  get audit(): AuditStore {
    return (this._audit ??= new AuditStore(this.dir));
  }

  get billing(): BillingStore {
    return (this._billing ??= new BillingStore(this.dir));
  }

  get resource(): ResourceStore {
    return (this._resource ??= new ResourceStore(this.dir));
  }

  get settlement(): SettlementStore {
    return (this._settlement ??= new SettlementStore(this.dir));
  }

  get monitor(): MonitorStore {
    return (this._monitor ??= new MonitorStore(this.dir));
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Delegation layer — every method mirrors the original API
  // ═══════════════════════════════════════════════════════════════════

  // ── Identity ─────────────────────────────────────────────────────

  getBindings(): WalletBinding[] {
    return this.identity.getBindings();
  }
  saveBindings(bindings: WalletBinding[]): void {
    this.identity.saveBindings(bindings);
  }
  addBinding(binding: WalletBinding): void {
    this.identity.addBinding(binding);
  }
  removeBinding(address: string): void {
    this.identity.removeBinding(address);
  }

  getSiweChallenge(nonce: string): SiweChallenge | undefined {
    return this.identity.getSiweChallenge(nonce);
  }
  saveSiweChallenge(challenge: SiweChallenge): void {
    this.identity.saveSiweChallenge(challenge);
  }
  deleteSiweChallenge(nonce: string): void {
    this.identity.deleteSiweChallenge(nonce);
  }
  pruneSiweChallenges(now = Date.now()): void {
    this.identity.pruneSiweChallenges(now);
  }

  getProviderId(): string | null {
    return this.identity.getProviderId();
  }
  saveProviderId(providerId: string): void {
    this.identity.saveProviderId(providerId);
  }
  ensureProviderId(): string {
    return this.identity.ensureProviderId();
  }

  getIndexSigningKey(): IndexSigningKey {
    return this.identity.getIndexSigningKey();
  }

  // ── Audit ────────────────────────────────────────────────────────

  appendAuditEvent(event: AuditEvent): void {
    this.audit.appendAuditEvent(event);
  }
  readAuditEvents(limit = 100): AuditEvent[] {
    return this.audit.readAuditEvents(limit);
  }

  getArchiveReceipt(): ArchiveReceipt | null {
    return this.audit.getArchiveReceipt();
  }
  saveArchiveReceipt(receipt: ArchiveReceipt): void {
    this.audit.saveArchiveReceipt(receipt);
  }

  getArchiveKey(): Buffer {
    return this.audit.getArchiveKey();
  }

  getPendingArchives(): PendingArchive[] {
    return this.audit.getPendingArchives();
  }
  savePendingArchives(items: PendingArchive[]): void {
    this.audit.savePendingArchives(items);
  }
  upsertPendingArchive(item: PendingArchive): void {
    this.audit.upsertPendingArchive(item);
  }
  removePendingArchive(eventId: string): void {
    this.audit.removePendingArchive(eventId);
  }

  // ── Billing ──────────────────────────────────────────────────────

  getUsage(sessionIdHash: string): UsageRecord | undefined {
    return this.billing.getUsage(sessionIdHash);
  }
  saveUsage(record: UsageRecord): void {
    this.billing.saveUsage(record);
  }
  listUsageRecords(): UsageRecord[] {
    return this.billing.listUsageRecords();
  }

  getPaymentRequired(idempotencyKey: string): PaymentRequiredRecord | undefined {
    return this.billing.getPaymentRequired(idempotencyKey);
  }
  listPaymentRequiredRecords(): PaymentRequiredRecord[] {
    return this.billing.listPaymentRequiredRecords();
  }
  listPaymentTraceRefs(limit = 50): PaymentTraceRef[] {
    return this.billing.listPaymentTraceRefs(limit);
  }
  savePaymentRequired(record: PaymentRequiredRecord): void {
    this.billing.savePaymentRequired(record);
  }
  removePaymentRequired(idempotencyKey: string): void {
    this.billing.removePaymentRequired(idempotencyKey);
  }

  getX402AutopayStats(): X402AutopayStats {
    return this.billing.getX402AutopayStats();
  }
  saveX402AutopayStats(stats: X402AutopayStats): void {
    this.billing.saveX402AutopayStats(stats);
  }
  updateX402AutopayStats(
    delta: Partial<
      Pick<
        X402AutopayStats,
        | "attempts"
        | "successes"
        | "failures"
        | "retryCount"
        | "circuitBreakerTrips"
        | "lastCircuitBreakerTripAt"
        | "cooldownUntil"
      >
    > & {
      attemptEventAt?: string;
      failureEventAt?: string;
    },
  ): X402AutopayStats {
    return this.billing.updateX402AutopayStats(delta);
  }

  // ── Resources ────────────────────────────────────────────────────

  getResourceIndex(): ResourceIndexEntry[] {
    return this.resource.getResourceIndex();
  }
  saveResourceIndex(entries: ResourceIndexEntry[]): void {
    this.resource.saveResourceIndex(entries);
  }
  upsertResourceIndex(entry: ResourceIndexEntry): void {
    this.resource.upsertResourceIndex(entry);
  }
  removeResourceIndex(providerId: string): void {
    this.resource.removeResourceIndex(providerId);
  }

  getP2pPeers(): P2pPeerRecord[] {
    return this.resource.getP2pPeers();
  }
  saveP2pPeers(entries: P2pPeerRecord[]): void {
    this.resource.saveP2pPeers(entries);
  }
  upsertP2pPeer(entry: P2pPeerRecord): void {
    this.resource.upsertP2pPeer(entry);
  }
  pruneP2pPeers(maxAgeMs: number): number {
    return this.resource.pruneP2pPeers(maxAgeMs);
  }

  getDiscoveryIdentityMap(): DiscoveryIdentityRecord[] {
    return this.resource.getDiscoveryIdentityMap();
  }
  saveDiscoveryIdentityMap(entries: DiscoveryIdentityRecord[]): void {
    this.resource.saveDiscoveryIdentityMap(entries);
  }
  upsertDiscoveryIdentity(entry: DiscoveryIdentityRecord): void {
    this.resource.upsertDiscoveryIdentity(entry);
  }

  // ── Settlement ───────────────────────────────────────────────────

  getPendingSettlements(): PendingSettlement[] {
    return this.settlement.getPendingSettlements();
  }
  savePendingSettlements(items: PendingSettlement[]): void {
    this.settlement.savePendingSettlements(items);
  }
  upsertPendingSettlement(item: PendingSettlement): void {
    this.settlement.upsertPendingSettlement(item);
  }
  removePendingSettlement(sessionIdHash: string): void {
    this.settlement.removePendingSettlement(sessionIdHash);
  }

  getAnchorReceipt(anchorId: string): AnchorReceipt | undefined {
    return this.settlement.getAnchorReceipt(anchorId);
  }
  getLastAnchorReceipt(): AnchorReceipt | null {
    return this.settlement.getLastAnchorReceipt();
  }
  saveAnchorReceipt(receipt: AnchorReceipt): void {
    this.settlement.saveAnchorReceipt(receipt);
  }

  getPendingTxs(): PendingAnchor[] {
    return this.settlement.getPendingTxs();
  }
  savePendingTxs(txs: PendingAnchor[]): void {
    this.settlement.savePendingTxs(txs);
  }
  upsertPendingTx(tx: PendingAnchor): void {
    this.settlement.upsertPendingTx(tx);
  }
  removePendingTx(anchorId: string): void {
    this.settlement.removePendingTx(anchorId);
  }

  // ── Monitor ──────────────────────────────────────────────────────

  appendAlert(alert: AlertEvent): void {
    this.monitor.appendAlert(alert);
  }
  getAlerts(limit = 1000): AlertEvent[] {
    return this.monitor.getAlerts(limit);
  }
  updateAlert(alert: AlertEvent): void {
    this.monitor.updateAlert(alert);
  }
}
