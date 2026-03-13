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
import {
  filterBridgeTransfers,
  filterLeases,
  filterLedgerEntries,
  filterPrivacyReplays,
  filterResources,
  filterServiceProofs,
  filterSettlementOperations,
  filterTaskBids,
  filterTaskReceipts,
  filterTaskResults,
  filterTasks,
  summarizeLedgerEntries,
} from "./filter-utils.js";
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
    const resources = Object.values(this.readMap<MarketResource>(this.resourcesPath));
    return filterResources(resources, filter);
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
    const tasks = Object.values(this.readMap<TaskOrder>(this.tasksPath));
    return filterTasks(tasks, filter);
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
    const bids = Object.values(this.readMap<TaskBid>(this.taskBidsPath));
    return filterTaskBids(bids, filter);
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
    const results = Object.values(this.readMap<TaskResult>(this.taskResultsPath));
    return filterTaskResults(results, filter);
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
    const receipts = Object.values(this.readMap<TaskReceipt>(this.taskReceiptsPath));
    return filterTaskReceipts(receipts, filter);
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
    const replays = Object.values(this.readMap<PrivacyReplay>(this.privacyReplaysPath));
    return filterPrivacyReplays(replays, filter);
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
    const operations = Object.values(
      this.readMap<SettlementOperation>(this.settlementOperationsPath),
    );
    return filterSettlementOperations(operations, filter);
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
    const proofs = Object.values(this.readMap<ServiceProof>(this.serviceProofsPath));
    return filterServiceProofs(proofs, filter);
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
    const leases = Object.values(this.readMap<MarketLease>(this.leasesPath));
    return filterLeases(leases, filter);
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
    const entries = lines
      .map((line) => {
        try {
          return JSON.parse(line) as MarketLedgerEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is MarketLedgerEntry => Boolean(entry));
    return filterLedgerEntries(entries, filter);
  }

  summarizeLedger(filter?: MarketLedgerFilter): MarketLedgerSummary {
    return summarizeLedgerEntries(this.listLedger(filter));
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
    const transfers = Object.values(this.readMap<BridgeTransfer>(this.bridgeTransfersPath));
    return filterBridgeTransfers(transfers, filter);
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
