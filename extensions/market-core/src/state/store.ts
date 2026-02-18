import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MarketPluginConfig } from "../config.js";
import type {
  AuditEvent,
  Consent,
  Delivery,
  Offer,
  Order,
  RevocationJob,
  Settlement,
} from "../market/types.js";

type MarketStore = {
  listOffers: () => Offer[];
  getOffer: (offerId: string) => Offer | undefined;
  saveOffer: (offer: Offer) => void;
  listOrders: () => Order[];
  getOrder: (orderId: string) => Order | undefined;
  saveOrder: (order: Order) => void;
  listConsents: () => Consent[];
  getConsent: (consentId: string) => Consent | undefined;
  saveConsent: (consent: Consent) => void;
  listDeliveries: () => Delivery[];
  getDelivery: (deliveryId: string) => Delivery | undefined;
  saveDelivery: (delivery: Delivery) => void;
  listSettlements: () => Settlement[];
  getSettlement: (settlementId: string) => Settlement | undefined;
  getSettlementByOrder: (orderId: string) => Settlement | undefined;
  saveSettlement: (settlement: Settlement) => void;
  listRevocations: () => RevocationJob[];
  getRevocation: (jobId: string) => RevocationJob | undefined;
  saveRevocation: (job: RevocationJob) => void;
  removeRevocation: (jobId: string) => void;
  appendAuditEvent: (event: AuditEvent) => void;
  readAuditEvents: (limit?: number) => AuditEvent[];
  hasAnyData?: () => boolean;
};

class MarketFileStore implements MarketStore {
  private readonly dir: string;

  constructor(stateDir: string) {
    this.dir = join(stateDir, "market");
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  private readMap<T>(fileName: string): Record<string, T> {
    const path = join(this.dir, fileName);
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, T>;
  }

  private writeMap<T>(fileName: string, data: Record<string, T>): void {
    const path = join(this.dir, fileName);
    writeFileSync(path, JSON.stringify(data, null, 2));
  }

  private get offersPath() {
    return "offers.json";
  }

  listOffers(): Offer[] {
    return Object.values(this.readMap<Offer>(this.offersPath));
  }

  getOffer(offerId: string): Offer | undefined {
    return this.readMap<Offer>(this.offersPath)[offerId];
  }

  saveOffer(offer: Offer): void {
    const map = this.readMap<Offer>(this.offersPath);
    map[offer.offerId] = offer;
    this.writeMap(this.offersPath, map);
  }

  private get ordersPath() {
    return "orders.json";
  }

  listOrders(): Order[] {
    return Object.values(this.readMap<Order>(this.ordersPath));
  }

  getOrder(orderId: string): Order | undefined {
    return this.readMap<Order>(this.ordersPath)[orderId];
  }

  saveOrder(order: Order): void {
    const map = this.readMap<Order>(this.ordersPath);
    map[order.orderId] = order;
    this.writeMap(this.ordersPath, map);
  }

  private get consentsPath() {
    return "consents.json";
  }

  listConsents(): Consent[] {
    return Object.values(this.readMap<Consent>(this.consentsPath));
  }

  getConsent(consentId: string): Consent | undefined {
    return this.readMap<Consent>(this.consentsPath)[consentId];
  }

  saveConsent(consent: Consent): void {
    const map = this.readMap<Consent>(this.consentsPath);
    map[consent.consentId] = consent;
    this.writeMap(this.consentsPath, map);
  }

  private get deliveriesPath() {
    return "deliveries.json";
  }

  listDeliveries(): Delivery[] {
    return Object.values(this.readMap<Delivery>(this.deliveriesPath));
  }

  getDelivery(deliveryId: string): Delivery | undefined {
    return this.readMap<Delivery>(this.deliveriesPath)[deliveryId];
  }

  saveDelivery(delivery: Delivery): void {
    const map = this.readMap<Delivery>(this.deliveriesPath);
    map[delivery.deliveryId] = delivery;
    this.writeMap(this.deliveriesPath, map);
  }

  private get settlementsPath() {
    return "settlements.json";
  }

  listSettlements(): Settlement[] {
    return Object.values(this.readMap<Settlement>(this.settlementsPath));
  }

  getSettlement(settlementId: string): Settlement | undefined {
    return this.readMap<Settlement>(this.settlementsPath)[settlementId];
  }

  getSettlementByOrder(orderId: string): Settlement | undefined {
    return this.listSettlements().find((entry) => entry.orderId === orderId);
  }

  saveSettlement(settlement: Settlement): void {
    const map = this.readMap<Settlement>(this.settlementsPath);
    map[settlement.settlementId] = settlement;
    this.writeMap(this.settlementsPath, map);
  }

  private get revocationsPath() {
    return "revocations.json";
  }

  listRevocations(): RevocationJob[] {
    return Object.values(this.readMap<RevocationJob>(this.revocationsPath));
  }

  getRevocation(jobId: string): RevocationJob | undefined {
    return this.readMap<RevocationJob>(this.revocationsPath)[jobId];
  }

  saveRevocation(job: RevocationJob): void {
    const map = this.readMap<RevocationJob>(this.revocationsPath);
    map[job.jobId] = job;
    this.writeMap(this.revocationsPath, map);
  }

  removeRevocation(jobId: string): void {
    const map = this.readMap<RevocationJob>(this.revocationsPath);
    delete map[jobId];
    this.writeMap(this.revocationsPath, map);
  }

  private get auditLogPath() {
    return join(this.dir, "audit-log.jsonl");
  }

  appendAuditEvent(event: AuditEvent): void {
    appendFileSync(this.auditLogPath, JSON.stringify(event) + "\n");
  }

  readAuditEvents(limit = 100): AuditEvent[] {
    if (!existsSync(this.auditLogPath)) return [];
    const raw = readFileSync(this.auditLogPath, "utf-8").trim();
    if (!raw) return [];
    const lines = raw.split("\n");
    return lines.slice(-limit).map((line) => JSON.parse(line) as AuditEvent);
  }

  hasAnyData(): boolean {
    return (
      this.listOffers().length > 0 ||
      this.listOrders().length > 0 ||
      this.listConsents().length > 0 ||
      this.listDeliveries().length > 0 ||
      this.listSettlements().length > 0 ||
      this.listRevocations().length > 0 ||
      this.readAuditEvents(1_000_000).length > 0
    );
  }
}

class MarketSqliteStore implements MarketStore {
  private readonly db: DatabaseSync;

  constructor(stateDir: string, config: MarketPluginConfig, fileFallback: MarketFileStore) {
    const dir = join(stateDir, "market");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const dbPath = config.store.dbPath ?? join(dir, "market.db");
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
        "CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS consents (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS settlements (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS revocations (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, data TEXT NOT NULL);" +
        "CREATE INDEX IF NOT EXISTS audit_ts ON audit(timestamp);",
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
      this.countRows("orders") === 0 &&
      this.countRows("consents") === 0 &&
      this.countRows("deliveries") === 0 &&
      this.countRows("settlements") === 0 &&
      this.countRows("revocations") === 0 &&
      this.countRows("audit") === 0
    );
  }

  private maybeMigrateFromFile(fileStore: MarketFileStore) {
    if (!this.isEmpty() || !fileStore.hasAnyData?.()) {
      return;
    }

    for (const offer of fileStore.listOffers()) this.saveOffer(offer);
    for (const order of fileStore.listOrders()) this.saveOrder(order);
    for (const consent of fileStore.listConsents()) this.saveConsent(consent);
    for (const delivery of fileStore.listDeliveries()) this.saveDelivery(delivery);
    for (const settlement of fileStore.listSettlements()) this.saveSettlement(settlement);
    for (const revocation of fileStore.listRevocations()) this.saveRevocation(revocation);
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
}

export class MarketStateStore {
  private readonly store: MarketStore;

  constructor(stateDir: string, config: MarketPluginConfig) {
    const fileStore = new MarketFileStore(stateDir);
    if (config.store.mode === "sqlite") {
      this.store = new MarketSqliteStore(stateDir, config, fileStore);
    } else {
      this.store = fileStore;
    }
  }

  listOffers(): Offer[] {
    return this.store.listOffers();
  }

  getOffer(offerId: string): Offer | undefined {
    return this.store.getOffer(offerId);
  }

  saveOffer(offer: Offer): void {
    this.store.saveOffer(offer);
  }

  listOrders(): Order[] {
    return this.store.listOrders();
  }

  getOrder(orderId: string): Order | undefined {
    return this.store.getOrder(orderId);
  }

  saveOrder(order: Order): void {
    this.store.saveOrder(order);
  }

  listConsents(): Consent[] {
    return this.store.listConsents();
  }

  getConsent(consentId: string): Consent | undefined {
    return this.store.getConsent(consentId);
  }

  saveConsent(consent: Consent): void {
    this.store.saveConsent(consent);
  }

  listDeliveries(): Delivery[] {
    return this.store.listDeliveries();
  }

  getDelivery(deliveryId: string): Delivery | undefined {
    return this.store.getDelivery(deliveryId);
  }

  saveDelivery(delivery: Delivery): void {
    this.store.saveDelivery(delivery);
  }

  listSettlements(): Settlement[] {
    return this.store.listSettlements();
  }

  getSettlement(settlementId: string): Settlement | undefined {
    return this.store.getSettlement(settlementId);
  }

  getSettlementByOrder(orderId: string): Settlement | undefined {
    return this.store.getSettlementByOrder(orderId);
  }

  saveSettlement(settlement: Settlement): void {
    this.store.saveSettlement(settlement);
  }

  listRevocations(): RevocationJob[] {
    return this.store.listRevocations();
  }

  getRevocation(jobId: string): RevocationJob | undefined {
    return this.store.getRevocation(jobId);
  }

  saveRevocation(job: RevocationJob): void {
    this.store.saveRevocation(job);
  }

  removeRevocation(jobId: string): void {
    this.store.removeRevocation(jobId);
  }

  appendAuditEvent(event: AuditEvent): void {
    this.store.appendAuditEvent(event);
  }

  readAuditEvents(limit = 100): AuditEvent[] {
    return this.store.readAuditEvents(limit);
  }
}
