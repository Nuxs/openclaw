import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
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
import { runFileStoreTransaction } from "./file-store-transaction.js";
import type { MarketStore } from "./store-types.js";

export class MarketFileStore implements MarketStore {
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

  private readObject<T>(fileName: string): T | undefined {
    const path = join(this.dir, fileName);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  }

  private writeObject<T>(fileName: string, value: T): void {
    const path = join(this.dir, fileName);
    writeFileSync(path, JSON.stringify(value, null, 2));
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

  private get resourcesPath() {
    return "resources.json";
  }

  listResources(filter?: MarketResourceFilter): MarketResource[] {
    let resources = Object.values(this.readMap<MarketResource>(this.resourcesPath));
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
    return this.readMap<MarketResource>(this.resourcesPath)[resourceId];
  }

  saveResource(resource: MarketResource): void {
    const map = this.readMap<MarketResource>(this.resourcesPath);
    map[resource.resourceId] = resource;
    this.writeMap(this.resourcesPath, map);
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

  // ── Task Market (file-backed) ──

  private get tasksPath() {
    return "tasks.json";
  }

  listTasks(filter?: TaskOrderFilter): TaskOrder[] {
    let tasks = Object.values(this.readMap<TaskOrder>(this.tasksPath));
    if (filter?.taskId) tasks = tasks.filter((t) => t.taskId === filter.taskId);
    if (filter?.creatorActorId)
      tasks = tasks.filter((t) => t.creatorActorId === filter.creatorActorId);
    if (filter?.status) tasks = tasks.filter((t) => t.status === filter.status);
    if (filter?.limit !== undefined) tasks = tasks.slice(0, Math.max(0, filter.limit));
    return tasks;
  }

  getTask(taskId: string): TaskOrder | undefined {
    return this.readMap<TaskOrder>(this.tasksPath)[taskId];
  }

  saveTask(task: TaskOrder): void {
    const map = this.readMap<TaskOrder>(this.tasksPath);
    map[task.taskId] = task;
    this.writeMap(this.tasksPath, map);
  }

  private get taskBidsPath() {
    return "task-bids.json";
  }

  listTaskBids(filter?: TaskBidFilter): TaskBid[] {
    let bids = Object.values(this.readMap<TaskBid>(this.taskBidsPath));
    if (filter?.taskId) bids = bids.filter((b) => b.taskId === filter.taskId);
    if (filter?.bidderActorId) bids = bids.filter((b) => b.bidderActorId === filter.bidderActorId);
    if (filter?.status) bids = bids.filter((b) => b.status === filter.status);
    if (filter?.limit !== undefined) bids = bids.slice(0, Math.max(0, filter.limit));
    return bids;
  }

  getTaskBid(bidId: string): TaskBid | undefined {
    return this.readMap<TaskBid>(this.taskBidsPath)[bidId];
  }

  saveTaskBid(bid: TaskBid): void {
    const map = this.readMap<TaskBid>(this.taskBidsPath);
    map[bid.bidId] = bid;
    this.writeMap(this.taskBidsPath, map);
  }

  private get taskResultsPath() {
    return "task-results.json";
  }

  listTaskResults(filter?: TaskResultFilter): TaskResult[] {
    let results = Object.values(this.readMap<TaskResult>(this.taskResultsPath));
    if (filter?.taskId) results = results.filter((r) => r.taskId === filter.taskId);
    if (filter?.bidId) results = results.filter((r) => r.bidId === filter.bidId);
    if (filter?.delivererActorId)
      results = results.filter((r) => r.delivererActorId === filter.delivererActorId);
    if (filter?.status) results = results.filter((r) => r.status === filter.status);
    if (filter?.limit !== undefined) results = results.slice(0, Math.max(0, filter.limit));
    return results;
  }

  getTaskResult(resultId: string): TaskResult | undefined {
    return this.readMap<TaskResult>(this.taskResultsPath)[resultId];
  }

  saveTaskResult(result: TaskResult): void {
    const map = this.readMap<TaskResult>(this.taskResultsPath);
    map[result.resultId] = result;
    this.writeMap(this.taskResultsPath, map);
  }

  private get taskReceiptsPath() {
    return "task-receipts.json";
  }

  listTaskReceipts(filter?: TaskReceiptFilter): TaskReceipt[] {
    let receipts = Object.values(this.readMap<TaskReceipt>(this.taskReceiptsPath));
    if (filter?.taskId) receipts = receipts.filter((r) => r.taskId === filter.taskId);
    if (filter?.bidId) receipts = receipts.filter((r) => r.bidId === filter.bidId);
    if (filter?.payerActorId)
      receipts = receipts.filter((r) => r.payerActorId === filter.payerActorId);
    if (filter?.payeeActorId)
      receipts = receipts.filter((r) => r.payeeActorId === filter.payeeActorId);
    if (filter?.settlementId)
      receipts = receipts.filter((r) => r.settlementId === filter.settlementId);
    if (filter?.status) receipts = receipts.filter((r) => r.status === filter.status);
    if (filter?.limit !== undefined) receipts = receipts.slice(0, Math.max(0, filter.limit));
    return receipts;
  }

  getTaskReceipt(receiptId: string): TaskReceipt | undefined {
    return this.readMap<TaskReceipt>(this.taskReceiptsPath)[receiptId];
  }

  saveTaskReceipt(receipt: TaskReceipt): void {
    const map = this.readMap<TaskReceipt>(this.taskReceiptsPath);
    map[receipt.receiptId] = receipt;
    this.writeMap(this.taskReceiptsPath, map);
  }

  // ── Privacy Replay (file-backed) ──

  private get privacyReplaysPath() {
    return "privacy-replays.json";
  }

  listPrivacyReplays(filter?: PrivacyReplayFilter): PrivacyReplay[] {
    let replays = Object.values(this.readMap<PrivacyReplay>(this.privacyReplaysPath));
    if (filter?.consentId) replays = replays.filter((r) => r.consentId === filter.consentId);
    if (filter?.orderId) replays = replays.filter((r) => r.orderId === filter.orderId);
    if (filter?.actorId) replays = replays.filter((r) => r.actorId === filter.actorId);
    if (filter?.status) replays = replays.filter((r) => r.status === filter.status);
    if (filter?.limit !== undefined) replays = replays.slice(0, Math.max(0, filter.limit));
    return replays;
  }

  getPrivacyReplay(replayId: string): PrivacyReplay | undefined {
    return this.readMap<PrivacyReplay>(this.privacyReplaysPath)[replayId];
  }

  savePrivacyReplay(replay: PrivacyReplay): void {
    const map = this.readMap<PrivacyReplay>(this.privacyReplaysPath);
    map[replay.replayId] = replay;
    this.writeMap(this.privacyReplaysPath, map);
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

  private get settlementOperationsPath() {
    return "settlement-operations.json";
  }

  listSettlementOperations(filter?: SettlementOperationFilter): SettlementOperation[] {
    let operations = Object.values(
      this.readMap<SettlementOperation>(this.settlementOperationsPath),
    ).sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));

    if (filter?.orderId) {
      operations = operations.filter((entry) => entry.orderId === filter.orderId);
    }
    if (filter?.status) {
      operations = operations.filter((entry) => entry.status === filter.status);
    }
    if (filter?.dueBefore) {
      const dueBefore = Date.parse(filter.dueBefore);
      if (!Number.isNaN(dueBefore)) {
        operations = operations.filter((entry) => Date.parse(entry.nextAttemptAt) <= dueBefore);
      }
    }
    if (filter?.limit !== undefined) {
      operations = operations.slice(0, Math.max(0, filter.limit));
    }
    return operations;
  }

  getSettlementOperation(operationId: string): SettlementOperation | undefined {
    return this.readMap<SettlementOperation>(this.settlementOperationsPath)[operationId];
  }

  getSettlementOperationByIdempotencyKey(idempotencyKey: string): SettlementOperation | undefined {
    return this.listSettlementOperations().find((entry) => entry.idempotencyKey === idempotencyKey);
  }

  saveSettlementOperation(operation: SettlementOperation): void {
    const map = this.readMap<SettlementOperation>(this.settlementOperationsPath);
    map[operation.operationId] = operation;
    this.writeMap(this.settlementOperationsPath, map);
  }

  private get disputesPath() {
    return "disputes.json";
  }

  listDisputes(): Dispute[] {
    return Object.values(this.readMap<Dispute>(this.disputesPath));
  }

  getDispute(disputeId: string): Dispute | undefined {
    return this.readMap<Dispute>(this.disputesPath)[disputeId];
  }

  getDisputeByOrder(orderId: string): Dispute | undefined {
    return this.listDisputes().find((entry) => entry.orderId === orderId);
  }

  saveDispute(dispute: Dispute): void {
    const map = this.readMap<Dispute>(this.disputesPath);
    map[dispute.disputeId] = dispute;
    this.writeMap(this.disputesPath, map);
  }

  private get serviceProofsPath() {
    return "service-proofs.json";
  }

  listServiceProofs(filter?: ServiceProofFilter): ServiceProof[] {
    let proofs = Object.values(this.readMap<ServiceProof>(this.serviceProofsPath));
    if (filter?.orderId) {
      proofs = proofs.filter((entry) => entry.orderId === filter.orderId);
    }
    if (filter?.limit !== undefined) {
      proofs = proofs.slice(0, Math.max(0, filter.limit));
    }
    return proofs;
  }

  getServiceProof(proofId: string): ServiceProof | undefined {
    return this.readMap<ServiceProof>(this.serviceProofsPath)[proofId];
  }

  getServiceProofByOrder(orderId: string): ServiceProof | undefined {
    return this.listServiceProofs({ orderId }).at(0);
  }

  saveServiceProof(proof: ServiceProof): void {
    const map = this.readMap<ServiceProof>(this.serviceProofsPath);
    map[proof.proofId] = proof;
    this.writeMap(this.serviceProofsPath, map);
  }

  private get leasesPath() {
    return "leases.json";
  }

  listLeases(filter?: MarketLeaseFilter): MarketLease[] {
    let leases = Object.values(this.readMap<MarketLease>(this.leasesPath));
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
    return this.readMap<MarketLease>(this.leasesPath)[leaseId];
  }

  saveLease(lease: MarketLease): void {
    const map = this.readMap<MarketLease>(this.leasesPath);
    map[lease.leaseId] = lease;
    this.writeMap(this.leasesPath, map);
  }

  private get ledgerPath() {
    return join(this.dir, "ledger.jsonl");
  }

  appendLedger(entry: MarketLedgerEntry): void {
    appendFileSync(this.ledgerPath, JSON.stringify(entry) + "\n");
  }

  listLedger(filter?: MarketLedgerFilter): MarketLedgerEntry[] {
    if (!existsSync(this.ledgerPath)) return [];
    const raw = readFileSync(this.ledgerPath, "utf-8").trim();
    if (!raw) return [];
    const lines = raw.split("\n");
    let entries = lines
      .map((line) => {
        try {
          return JSON.parse(line) as MarketLedgerEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is MarketLedgerEntry => Boolean(entry));
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

  private get tokenEconomyPath() {
    return "token-economy.json";
  }

  getTokenEconomy(): TokenEconomyState | undefined {
    return this.readObject<TokenEconomyState>(this.tokenEconomyPath);
  }

  saveTokenEconomy(state: TokenEconomyState): void {
    this.writeObject(this.tokenEconomyPath, state);
  }

  private get bridgeTransfersPath() {
    return "bridge-transfers.json";
  }

  private get rewardsPath() {
    return "rewards.json";
  }

  listRewards(): RewardGrant[] {
    return Object.values(this.readMap<RewardGrant>(this.rewardsPath));
  }

  getReward(rewardId: string): RewardGrant | undefined {
    return this.readMap<RewardGrant>(this.rewardsPath)[rewardId];
  }

  saveReward(reward: RewardGrant): void {
    const map = this.readMap<RewardGrant>(this.rewardsPath);
    map[reward.rewardId] = reward;
    this.writeMap(this.rewardsPath, map);
  }

  private get rewardNoncesPath() {
    return "reward-nonces.json";
  }

  listRewardNonces(): RewardNonceRecord[] {
    return Object.values(this.readMap<RewardNonceRecord>(this.rewardNoncesPath));
  }

  getRewardNonce(nonceId: string): RewardNonceRecord | undefined {
    return this.readMap<RewardNonceRecord>(this.rewardNoncesPath)[nonceId];
  }

  saveRewardNonce(record: RewardNonceRecord): void {
    const map = this.readMap<RewardNonceRecord>(this.rewardNoncesPath);
    map[record.nonceId] = record;
    this.writeMap(this.rewardNoncesPath, map);
  }

  listBridgeTransfers(filter?: BridgeTransferFilter): BridgeTransfer[] {
    let transfers = Object.values(this.readMap<BridgeTransfer>(this.bridgeTransfersPath));
    if (filter?.orderId) {
      transfers = transfers.filter((entry) => entry.orderId === filter.orderId);
    }
    if (filter?.settlementId) {
      transfers = transfers.filter((entry) => entry.settlementId === filter.settlementId);
    }
    if (filter?.status) {
      transfers = transfers.filter((entry) => entry.status === filter.status);
    }
    if (filter?.fromChain) {
      transfers = transfers.filter((entry) => entry.fromChain === filter.fromChain);
    }
    if (filter?.toChain) {
      transfers = transfers.filter((entry) => entry.toChain === filter.toChain);
    }
    if (filter?.assetSymbol) {
      transfers = transfers.filter((entry) => entry.assetSymbol === filter.assetSymbol);
    }
    transfers.sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
    if (filter?.limit !== undefined) {
      transfers = transfers.slice(-Math.max(0, filter.limit));
    }
    return transfers;
  }

  getBridgeTransfer(bridgeId: string): BridgeTransfer | undefined {
    return this.readMap<BridgeTransfer>(this.bridgeTransfersPath)[bridgeId];
  }

  saveBridgeTransfer(transfer: BridgeTransfer): void {
    const map = this.readMap<BridgeTransfer>(this.bridgeTransfersPath);
    map[transfer.bridgeId] = transfer;
    this.writeMap(this.bridgeTransfersPath, map);
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
      this.listResources().length > 0 ||
      this.listOrders().length > 0 ||
      this.listConsents().length > 0 ||
      this.listTasks({ limit: 1 }).length > 0 ||
      this.listTaskBids({ limit: 1 }).length > 0 ||
      this.listTaskResults({ limit: 1 }).length > 0 ||
      this.listTaskReceipts({ limit: 1 }).length > 0 ||
      this.listPrivacyReplays({ limit: 1 }).length > 0 ||
      this.listDeliveries().length > 0 ||
      this.listSettlements().length > 0 ||
      this.listSettlementOperations({ limit: 1 }).length > 0 ||
      this.listDisputes().length > 0 ||
      this.listServiceProofs({ limit: 1 }).length > 0 ||
      this.listLeases().length > 0 ||
      this.listLedger({ limit: 1 }).length > 0 ||
      this.listRevocations().length > 0 ||
      this.getTokenEconomy() !== undefined ||
      this.listBridgeTransfers({ limit: 1 }).length > 0 ||
      this.listRewards().length > 0 ||
      this.listRewardNonces().length > 0 ||
      (existsSync(this.auditLogPath) && statSync(this.auditLogPath).size > 0)
    );
  }

  async runInTransaction(fn: () => void | Promise<void>): Promise<void> {
    await runFileStoreTransaction(this.dir, fn);
  }
}
