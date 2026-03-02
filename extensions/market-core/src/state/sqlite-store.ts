import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { MarketPluginConfig } from "../config.js";
import type {
  MarketLedgerEntry,
  MarketLedgerFilter,
  MarketLedgerSummary,
  MarketLease,
  MarketLeaseFilter,
  MarketResource,
  MarketResourceFilter,
} from "../market/resources.js";
import type {
  AuditEvent,
  BridgeTransfer,
  BridgeTransferFilter,
  Consent,
  Delivery,
  Dispute,
  Offer,
  Order,
  RevocationJob,
  RewardGrant,
  RewardNonceRecord,
  Settlement,
  TokenEconomyState,
} from "../market/types.js";
import { MarketFileStore } from "./file-store.js";
import { requireNodeSqlite } from "./require-node-sqlite.js";
import type { MarketStore } from "./store-types.js";

const tokenEconomyId = "token_economy";

export class MarketSqliteStore implements MarketStore {
  private readonly db: DatabaseSync;

  constructor(stateDir: string, config: MarketPluginConfig, fileFallback: MarketFileStore) {
    const dir = join(stateDir, "market");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const dbPath = config.store.dbPath ?? join(dir, "market.db");

    const { DatabaseSync } = requireNodeSqlite();
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode=WAL;");
    this.db.exec("PRAGMA busy_timeout=5000;");
    this.ensureSchema();
    if (config.store.migrateFromFile ?? true) {
      this.maybeMigrateFromFile(fileFallback);
    }
  }

  private ensureSchema() {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS consents (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS settlements (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS disputes (id TEXT PRIMARY KEY, order_id TEXT, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS revocations (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS token_economy (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS bridge_transfers (id TEXT PRIMARY KEY, order_id TEXT, settlement_id TEXT, status TEXT, updated_at TEXT, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS rewards (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS reward_nonces (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, data TEXT NOT NULL);" +
        "CREATE INDEX IF NOT EXISTS ledger_ts ON ledger(timestamp);" +
        "CREATE INDEX IF NOT EXISTS audit_ts ON audit(timestamp);" +
        "CREATE INDEX IF NOT EXISTS disputes_order ON disputes(order_id);" +
        "CREATE INDEX IF NOT EXISTS bridge_order ON bridge_transfers(order_id);" +
        "CREATE INDEX IF NOT EXISTS bridge_settlement ON bridge_transfers(settlement_id);" +
        "CREATE INDEX IF NOT EXISTS bridge_status ON bridge_transfers(status);",
    );
  }

  private countRows(table: string): number {
    const row = this.db.prepare(`SELECT COUNT(1) as count FROM ${table}`).get() as
      | { count: number }
      | undefined;
    return Number(row?.count ?? 0);
  }

  private isEmpty(): boolean {
    return (
      this.countRows("offers") === 0 &&
      this.countRows("resources") === 0 &&
      this.countRows("orders") === 0 &&
      this.countRows("consents") === 0 &&
      this.countRows("deliveries") === 0 &&
      this.countRows("settlements") === 0 &&
      this.countRows("disputes") === 0 &&
      this.countRows("leases") === 0 &&
      this.countRows("revocations") === 0 &&
      this.countRows("ledger") === 0 &&
      this.countRows("token_economy") === 0 &&
      this.countRows("bridge_transfers") === 0 &&
      this.countRows("rewards") === 0 &&
      this.countRows("reward_nonces") === 0 &&
      this.countRows("audit") === 0
    );
  }

  private maybeMigrateFromFile(fileStore: MarketFileStore) {
    if (!this.isEmpty() || !fileStore.hasAnyData?.()) {
      return;
    }

    for (const offer of fileStore.listOffers()) this.saveOffer(offer);
    for (const resource of fileStore.listResources()) this.saveResource(resource);
    for (const order of fileStore.listOrders()) this.saveOrder(order);
    for (const consent of fileStore.listConsents()) this.saveConsent(consent);
    for (const delivery of fileStore.listDeliveries()) this.saveDelivery(delivery);
    for (const settlement of fileStore.listSettlements()) this.saveSettlement(settlement);
    for (const dispute of fileStore.listDisputes()) this.saveDispute(dispute);
    for (const lease of fileStore.listLeases()) this.saveLease(lease);
    for (const entry of fileStore.listLedger({ limit: 1_000_000 })) this.appendLedger(entry);
    for (const revocation of fileStore.listRevocations()) this.saveRevocation(revocation);
    const tokenEconomy = fileStore.getTokenEconomy();
    if (tokenEconomy) {
      this.saveTokenEconomy(tokenEconomy);
    }
    for (const transfer of fileStore.listBridgeTransfers({ limit: 1_000_000 })) {
      this.saveBridgeTransfer(transfer);
    }
    for (const reward of fileStore.listRewards()) this.saveReward(reward);
    for (const nonce of fileStore.listRewardNonces()) this.saveRewardNonce(nonce);
    for (const event of fileStore.readAuditEvents(1_000_000)) this.appendAuditEvent(event);
  }

  private listFrom<T>(table: string): T[] {
    const rows = this.db.prepare(`SELECT data FROM ${table}`).all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  private getFrom<T>(table: string, id: string): T | undefined {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id) as
      | { data: string }
      | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }

  private saveTo<T>(table: string, id: string, value: T): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`)
      .run(id, JSON.stringify(value));
  }

  listOffers(): Offer[] {
    return this.listFrom<Offer>("offers");
  }

  getOffer(offerId: string): Offer | undefined {
    return this.getFrom<Offer>("offers", offerId);
  }

  saveOffer(offer: Offer): void {
    this.saveTo("offers", offer.offerId, offer);
  }

  listResources(filter?: MarketResourceFilter): MarketResource[] {
    let resources = this.listFrom<MarketResource>("resources");
    if (filter?.kind) {
      resources = resources.filter((entry) => entry.kind === filter.kind);
    }
    if (filter?.providerActorId) {
      resources = resources.filter((entry) => entry.providerActorId === filter.providerActorId);
    }
    if (filter?.status) {
      resources = resources.filter((entry) => entry.status === filter.status);
    }
    if (filter?.tag) {
      resources = resources.filter((entry) => entry.tags?.includes(filter.tag ?? "") ?? false);
    }
    if (filter?.limit !== undefined) {
      resources = resources.slice(0, Math.max(0, filter.limit));
    }
    return resources;
  }

  getResource(resourceId: string): MarketResource | undefined {
    return this.getFrom<MarketResource>("resources", resourceId);
  }

  saveResource(resource: MarketResource): void {
    this.saveTo("resources", resource.resourceId, resource);
  }

  listOrders(): Order[] {
    return this.listFrom<Order>("orders");
  }

  getOrder(orderId: string): Order | undefined {
    return this.getFrom<Order>("orders", orderId);
  }

  saveOrder(order: Order): void {
    this.saveTo("orders", order.orderId, order);
  }

  listConsents(): Consent[] {
    return this.listFrom<Consent>("consents");
  }

  getConsent(consentId: string): Consent | undefined {
    return this.getFrom<Consent>("consents", consentId);
  }

  saveConsent(consent: Consent): void {
    this.saveTo("consents", consent.consentId, consent);
  }

  listDeliveries(): Delivery[] {
    return this.listFrom<Delivery>("deliveries");
  }

  getDelivery(deliveryId: string): Delivery | undefined {
    return this.getFrom<Delivery>("deliveries", deliveryId);
  }

  saveDelivery(delivery: Delivery): void {
    this.saveTo("deliveries", delivery.deliveryId, delivery);
  }

  listSettlements(): Settlement[] {
    return this.listFrom<Settlement>("settlements");
  }

  getSettlement(settlementId: string): Settlement | undefined {
    return this.getFrom<Settlement>("settlements", settlementId);
  }

  getSettlementByOrder(orderId: string): Settlement | undefined {
    return this.listSettlements().find((entry) => entry.orderId === orderId);
  }

  saveSettlement(settlement: Settlement): void {
    this.saveTo("settlements", settlement.settlementId, settlement);
  }

  listDisputes(): Dispute[] {
    return this.listFrom<Dispute>("disputes");
  }

  getDispute(disputeId: string): Dispute | undefined {
    return this.getFrom<Dispute>("disputes", disputeId);
  }

  getDisputeByOrder(orderId: string): Dispute | undefined {
    const row = this.db.prepare("SELECT data FROM disputes WHERE order_id = ?").get(orderId) as
      | { data: string }
      | undefined;
    return row ? (JSON.parse(row.data) as Dispute) : undefined;
  }

  saveDispute(dispute: Dispute): void {
    this.db
      .prepare("INSERT OR REPLACE INTO disputes (id, order_id, data) VALUES (?, ?, ?)")
      .run(dispute.disputeId, dispute.orderId, JSON.stringify(dispute));
  }

  listLeases(filter?: MarketLeaseFilter): MarketLease[] {
    let leases = this.listFrom<MarketLease>("leases");
    if (filter?.resourceId) {
      leases = leases.filter((entry) => entry.resourceId === filter.resourceId);
    }
    if (filter?.providerActorId) {
      leases = leases.filter((entry) => entry.providerActorId === filter.providerActorId);
    }
    if (filter?.consumerActorId) {
      leases = leases.filter((entry) => entry.consumerActorId === filter.consumerActorId);
    }
    if (filter?.status) {
      leases = leases.filter((entry) => entry.status === filter.status);
    }
    if (filter?.limit !== undefined) {
      leases = leases.slice(0, Math.max(0, filter.limit));
    }
    return leases;
  }

  getLease(leaseId: string): MarketLease | undefined {
    return this.getFrom<MarketLease>("leases", leaseId);
  }

  saveLease(lease: MarketLease): void {
    this.saveTo("leases", lease.leaseId, lease);
  }

  appendLedger(entry: MarketLedgerEntry): void {
    this.db
      .prepare("INSERT OR REPLACE INTO ledger (id, timestamp, data) VALUES (?, ?, ?)")
      .run(entry.ledgerId, entry.timestamp, JSON.stringify(entry));
  }

  listLedger(filter?: MarketLedgerFilter): MarketLedgerEntry[] {
    let entries = this.listFrom<MarketLedgerEntry>("ledger");
    if (filter?.leaseId) {
      entries = entries.filter((entry) => entry.leaseId === filter.leaseId);
    }
    if (filter?.resourceId) {
      entries = entries.filter((entry) => entry.resourceId === filter.resourceId);
    }
    if (filter?.providerActorId) {
      entries = entries.filter((entry) => entry.providerActorId === filter.providerActorId);
    }
    if (filter?.consumerActorId) {
      entries = entries.filter((entry) => entry.consumerActorId === filter.consumerActorId);
    }
    if (filter?.since) {
      const since = Date.parse(filter.since);
      if (!Number.isNaN(since)) {
        entries = entries.filter((entry) => Date.parse(entry.timestamp) >= since);
      }
    }
    if (filter?.until) {
      const until = Date.parse(filter.until);
      if (!Number.isNaN(until)) {
        entries = entries.filter((entry) => Date.parse(entry.timestamp) <= until);
      }
    }
    entries.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    if (filter?.limit !== undefined) {
      entries = entries.slice(-Math.max(0, filter.limit));
    }
    return entries;
  }

  summarizeLedger(filter?: MarketLedgerFilter): MarketLedgerSummary {
    const entries = this.listLedger(filter);
    const byUnit: Record<string, { quantity: string; cost: string }> = {};
    let totalCost = 0n;
    let currency = "";
    for (const entry of entries) {
      if (!currency) {
        currency = entry.currency;
      }
      const unitBucket = byUnit[entry.unit] ?? { quantity: "0", cost: "0" };
      const nextQuantity = BigInt(unitBucket.quantity) + BigInt(entry.quantity);
      const nextCost = BigInt(unitBucket.cost) + BigInt(entry.cost);
      unitBucket.quantity = nextQuantity.toString();
      unitBucket.cost = nextCost.toString();
      byUnit[entry.unit] = unitBucket;
      totalCost += BigInt(entry.cost);
    }
    return { byUnit, totalCost: totalCost.toString(), currency };
  }

  listRevocations(): RevocationJob[] {
    return this.listFrom<RevocationJob>("revocations");
  }

  getRevocation(jobId: string): RevocationJob | undefined {
    return this.getFrom<RevocationJob>("revocations", jobId);
  }

  saveRevocation(job: RevocationJob): void {
    this.saveTo("revocations", job.jobId, job);
  }

  removeRevocation(jobId: string): void {
    this.db.prepare("DELETE FROM revocations WHERE id = ?").run(jobId);
  }

  getTokenEconomy(): TokenEconomyState | undefined {
    return this.getFrom<TokenEconomyState>("token_economy", tokenEconomyId);
  }

  saveTokenEconomy(state: TokenEconomyState): void {
    this.saveTo("token_economy", tokenEconomyId, state);
  }

  listBridgeTransfers(filter?: BridgeTransferFilter): BridgeTransfer[] {
    // Build parameterized WHERE clause to leverage indexed columns (order_id, settlement_id, status)
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter?.orderId) {
      conditions.push("order_id = ?");
      params.push(filter.orderId);
    }
    if (filter?.settlementId) {
      conditions.push("settlement_id = ?");
      params.push(filter.settlementId);
    }
    if (filter?.status) {
      conditions.push("status = ?");
      params.push(filter.status);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT data FROM bridge_transfers${where} ORDER BY updated_at ASC`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = this.db.prepare(sql).all(...(params as any[])) as Array<{ data: string }>;
    let transfers = rows.map((row) => JSON.parse(row.data) as BridgeTransfer);

    // Remaining filters without dedicated columns — applied in JS
    if (filter?.fromChain) {
      transfers = transfers.filter((entry) => entry.fromChain === filter.fromChain);
    }
    if (filter?.toChain) {
      transfers = transfers.filter((entry) => entry.toChain === filter.toChain);
    }
    if (filter?.assetSymbol) {
      transfers = transfers.filter((entry) => entry.assetSymbol === filter.assetSymbol);
    }
    if (filter?.limit !== undefined) {
      transfers = transfers.slice(-Math.max(0, filter.limit));
    }
    return transfers;
  }

  getBridgeTransfer(bridgeId: string): BridgeTransfer | undefined {
    return this.getFrom<BridgeTransfer>("bridge_transfers", bridgeId);
  }

  saveBridgeTransfer(transfer: BridgeTransfer): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO bridge_transfers (id, order_id, settlement_id, status, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        transfer.bridgeId,
        transfer.orderId ?? null,
        transfer.settlementId ?? null,
        transfer.status,
        transfer.updatedAt,
        JSON.stringify(transfer),
      );
  }

  listRewards(): RewardGrant[] {
    return this.listFrom<RewardGrant>("rewards");
  }

  getReward(rewardId: string): RewardGrant | undefined {
    return this.getFrom<RewardGrant>("rewards", rewardId);
  }

  saveReward(reward: RewardGrant): void {
    this.saveTo("rewards", reward.rewardId, reward);
  }

  listRewardNonces(): RewardNonceRecord[] {
    return this.listFrom<RewardNonceRecord>("reward_nonces");
  }

  getRewardNonce(nonceId: string): RewardNonceRecord | undefined {
    return this.getFrom<RewardNonceRecord>("reward_nonces", nonceId);
  }

  saveRewardNonce(record: RewardNonceRecord): void {
    this.saveTo("reward_nonces", record.nonceId, record);
  }

  appendAuditEvent(event: AuditEvent): void {
    this.db
      .prepare("INSERT OR REPLACE INTO audit (id, timestamp, data) VALUES (?, ?, ?)")
      .run(event.id, event.timestamp, JSON.stringify(event));
  }

  readAuditEvents(limit = 100): AuditEvent[] {
    const rows = this.db
      .prepare("SELECT data FROM audit ORDER BY timestamp DESC LIMIT ?")
      .all(limit) as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as AuditEvent).reverse();
  }

  async runInTransaction(fn: () => void | Promise<void>): Promise<void> {
    this.db.exec("BEGIN");
    try {
      await fn();
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
}
