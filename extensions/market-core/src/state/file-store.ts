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
  RewardNonceRecord,
  Settlement,
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
      this.listDeliveries().length > 0 ||
      this.listSettlements().length > 0 ||
      this.listDisputes().length > 0 ||
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
