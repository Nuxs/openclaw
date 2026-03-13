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
  PrivacyReplay,
  PrivacyReplayFilter,
  RewardNonceRecord,
  ServiceProof,
  ServiceProofFilter,
  Settlement,
  SettlementOperation,
  SettlementOperationFilter,
  TaskBid,
  TaskBidFilter,
  TaskOrder,
  TaskOrderFilter,
  TaskReceipt,
  TaskReceiptFilter,
  TaskResult,
  TaskResultFilter,
  TokenEconomyState,
} from "../market/types.js";
import { MarketFileStore } from "./file-store.js";
import {
  filterBridgeTransfersInMemory,
  filterLeases,
  filterLedgerEntries,
  filterPrivacyReplays,
  filterResources,
  filterServiceProofs,
  filterTaskBids,
  filterTaskReceipts,
  filterTaskResults,
  filterTasks,
  summarizeLedgerEntries,
} from "./filter-utils.js";
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
        "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS task_bids (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS task_results (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS task_receipts (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS privacy_replays (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS deliveries (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS settlements (id TEXT PRIMARY KEY, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS settlement_operations (id TEXT PRIMARY KEY, order_id TEXT, status TEXT, next_attempt_at TEXT, idempotency_key TEXT, updated_at TEXT, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS disputes (id TEXT PRIMARY KEY, order_id TEXT, data TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS service_proofs (id TEXT PRIMARY KEY, order_id TEXT, data TEXT NOT NULL);" +
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
        "CREATE INDEX IF NOT EXISTS settlement_ops_order ON settlement_operations(order_id);" +
        "CREATE INDEX IF NOT EXISTS settlement_ops_status_due ON settlement_operations(status, next_attempt_at);" +
        "CREATE INDEX IF NOT EXISTS service_proofs_order ON service_proofs(order_id);" +
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
      this.countRows("tasks") === 0 &&
      this.countRows("task_bids") === 0 &&
      this.countRows("task_results") === 0 &&
      this.countRows("task_receipts") === 0 &&
      this.countRows("privacy_replays") === 0 &&
      this.countRows("deliveries") === 0 &&
      this.countRows("settlements") === 0 &&
      this.countRows("settlement_operations") === 0 &&
      this.countRows("disputes") === 0 &&
      this.countRows("service_proofs") === 0 &&
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
    for (const task of fileStore.listTasks()) this.saveTask(task);
    for (const bid of fileStore.listTaskBids()) this.saveTaskBid(bid);
    for (const result of fileStore.listTaskResults()) this.saveTaskResult(result);
    for (const receipt of fileStore.listTaskReceipts()) this.saveTaskReceipt(receipt);
    for (const replay of fileStore.listPrivacyReplays()) this.savePrivacyReplay(replay);
    for (const delivery of fileStore.listDeliveries()) this.saveDelivery(delivery);
    for (const settlement of fileStore.listSettlements()) this.saveSettlement(settlement);
    for (const operation of fileStore.listSettlementOperations({ limit: 1_000_000 })) {
      this.saveSettlementOperation(operation);
    }
    for (const dispute of fileStore.listDisputes()) this.saveDispute(dispute);
    for (const proof of fileStore.listServiceProofs({ limit: 1_000_000 })) {
      this.saveServiceProof(proof);
    }
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
    const resources = this.listFrom<MarketResource>("resources");
    return filterResources(resources, filter);
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

  listTasks(filter?: TaskOrderFilter): TaskOrder[] {
    const tasks = this.listFrom<TaskOrder>("tasks");
    return filterTasks(tasks, filter);
  }

  getTask(taskId: string): TaskOrder | undefined {
    return this.getFrom<TaskOrder>("tasks", taskId);
  }

  saveTask(task: TaskOrder): void {
    this.saveTo("tasks", task.taskId, task);
  }

  listTaskBids(filter?: TaskBidFilter): TaskBid[] {
    const bids = this.listFrom<TaskBid>("task_bids");
    return filterTaskBids(bids, filter);
  }

  getTaskBid(bidId: string): TaskBid | undefined {
    return this.getFrom<TaskBid>("task_bids", bidId);
  }

  saveTaskBid(bid: TaskBid): void {
    this.saveTo("task_bids", bid.bidId, bid);
  }

  listTaskResults(filter?: TaskResultFilter): TaskResult[] {
    const results = this.listFrom<TaskResult>("task_results");
    return filterTaskResults(results, filter);
  }

  getTaskResult(resultId: string): TaskResult | undefined {
    return this.getFrom<TaskResult>("task_results", resultId);
  }

  saveTaskResult(result: TaskResult): void {
    this.saveTo("task_results", result.resultId, result);
  }

  listTaskReceipts(filter?: TaskReceiptFilter): TaskReceipt[] {
    const receipts = this.listFrom<TaskReceipt>("task_receipts");
    return filterTaskReceipts(receipts, filter);
  }

  getTaskReceipt(receiptId: string): TaskReceipt | undefined {
    return this.getFrom<TaskReceipt>("task_receipts", receiptId);
  }

  saveTaskReceipt(receipt: TaskReceipt): void {
    this.saveTo("task_receipts", receipt.receiptId, receipt);
  }

  listPrivacyReplays(filter?: PrivacyReplayFilter): PrivacyReplay[] {
    const replays = this.listFrom<PrivacyReplay>("privacy_replays");
    return filterPrivacyReplays(replays, filter);
  }

  getPrivacyReplay(replayId: string): PrivacyReplay | undefined {
    return this.getFrom<PrivacyReplay>("privacy_replays", replayId);
  }

  savePrivacyReplay(replay: PrivacyReplay): void {
    this.saveTo("privacy_replays", replay.replayId, replay);
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

  listSettlementOperations(filter?: SettlementOperationFilter): SettlementOperation[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.orderId) {
      conditions.push("order_id = ?");
      params.push(filter.orderId);
    }
    if (filter?.status) {
      conditions.push("status = ?");
      params.push(filter.status);
    }
    if (filter?.dueBefore) {
      conditions.push("next_attempt_at <= ?");
      params.push(filter.dueBefore);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT data FROM settlement_operations${where} ORDER BY updated_at ASC`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = this.db.prepare(sql).all(...(params as any[])) as Array<{ data: string }>;
    let operations = rows.map((row) => JSON.parse(row.data) as SettlementOperation);
    if (filter?.limit !== undefined) {
      operations = operations.slice(0, Math.max(0, filter.limit));
    }
    return operations;
  }

  getSettlementOperation(operationId: string): SettlementOperation | undefined {
    return this.getFrom<SettlementOperation>("settlement_operations", operationId);
  }

  getSettlementOperationByIdempotencyKey(idempotencyKey: string): SettlementOperation | undefined {
    const row = this.db
      .prepare("SELECT data FROM settlement_operations WHERE idempotency_key = ?")
      .get(idempotencyKey) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as SettlementOperation) : undefined;
  }

  saveSettlementOperation(operation: SettlementOperation): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO settlement_operations (id, order_id, status, next_attempt_at, idempotency_key, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        operation.operationId,
        operation.orderId,
        operation.status,
        operation.nextAttemptAt,
        operation.idempotencyKey,
        operation.updatedAt,
        JSON.stringify(operation),
      );
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

  listServiceProofs(filter?: ServiceProofFilter): ServiceProof[] {
    const proofs = this.listFrom<ServiceProof>("service_proofs");
    return filterServiceProofs(proofs, filter);
  }

  getServiceProof(proofId: string): ServiceProof | undefined {
    return this.getFrom<ServiceProof>("service_proofs", proofId);
  }

  getServiceProofByOrder(orderId: string): ServiceProof | undefined {
    const row = this.db
      .prepare("SELECT data FROM service_proofs WHERE order_id = ?")
      .get(orderId) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as ServiceProof) : undefined;
  }

  saveServiceProof(proof: ServiceProof): void {
    this.db
      .prepare("INSERT OR REPLACE INTO service_proofs (id, order_id, data) VALUES (?, ?, ?)")
      .run(proof.proofId, proof.orderId, JSON.stringify(proof));
  }

  listLeases(filter?: MarketLeaseFilter): MarketLease[] {
    const leases = this.listFrom<MarketLease>("leases");
    return filterLeases(leases, filter);
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
    const entries = this.listFrom<MarketLedgerEntry>("ledger");
    return filterLedgerEntries(entries, filter);
  }

  summarizeLedger(filter?: MarketLedgerFilter): MarketLedgerSummary {
    return summarizeLedgerEntries(this.listLedger(filter));
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
    const transfers = rows.map((row) => JSON.parse(row.data) as BridgeTransfer);

    // Remaining filters without dedicated SQL columns — applied in JS
    return filterBridgeTransfersInMemory(transfers, filter);
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
