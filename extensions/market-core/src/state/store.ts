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
import { MarketSqliteStore } from "./sqlite-store.js";
import type { MarketStore } from "./store-types.js";

export class MarketStateStore {
  private readonly store: MarketStore;

  constructor(stateDir: string, config: MarketPluginConfig) {
    const fileStore = new MarketFileStore(stateDir);
    if (config.store.mode === "sqlite") {
      try {
        this.store = new MarketSqliteStore(stateDir, config, fileStore);
      } catch (err) {
        // If the current Node runtime does not ship `node:sqlite`, fall back to the file store.
        // This keeps market-core usable in constrained/private deployments (with a clear warning).
        // eslint-disable-next-line no-console
        console.warn(
          `market-core: sqlite store unavailable; falling back to file store. ${String(err)}`,
        );
        this.store = fileStore;
      }
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

  listResources(filter?: MarketResourceFilter): MarketResource[] {
    return this.store.listResources(filter);
  }

  getResource(resourceId: string): MarketResource | undefined {
    return this.store.getResource(resourceId);
  }

  saveResource(resource: MarketResource): void {
    this.store.saveResource(resource);
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

  listDisputes(): Dispute[] {
    return this.store.listDisputes();
  }

  getDispute(disputeId: string): Dispute | undefined {
    return this.store.getDispute(disputeId);
  }

  getDisputeByOrder(orderId: string): Dispute | undefined {
    return this.store.getDisputeByOrder(orderId);
  }

  saveDispute(dispute: Dispute): void {
    this.store.saveDispute(dispute);
  }

  listLeases(filter?: MarketLeaseFilter): MarketLease[] {
    return this.store.listLeases(filter);
  }

  getLease(leaseId: string): MarketLease | undefined {
    return this.store.getLease(leaseId);
  }

  saveLease(lease: MarketLease): void {
    this.store.saveLease(lease);
  }

  appendLedger(entry: MarketLedgerEntry): void {
    this.store.appendLedger(entry);
  }

  listLedger(filter?: MarketLedgerFilter): MarketLedgerEntry[] {
    return this.store.listLedger(filter);
  }

  summarizeLedger(filter?: MarketLedgerFilter): MarketLedgerSummary {
    return this.store.summarizeLedger(filter);
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

  getTokenEconomy(): TokenEconomyState | undefined {
    return this.store.getTokenEconomy();
  }

  saveTokenEconomy(state: TokenEconomyState): void {
    this.store.saveTokenEconomy(state);
  }

  listBridgeTransfers(filter?: BridgeTransferFilter): BridgeTransfer[] {
    return this.store.listBridgeTransfers(filter);
  }

  getBridgeTransfer(bridgeId: string): BridgeTransfer | undefined {
    return this.store.getBridgeTransfer(bridgeId);
  }

  saveBridgeTransfer(transfer: BridgeTransfer): void {
    this.store.saveBridgeTransfer(transfer);
  }

  listRewards(): RewardGrant[] {
    return this.store.listRewards();
  }

  getReward(rewardId: string): RewardGrant | undefined {
    return this.store.getReward(rewardId);
  }

  saveReward(reward: RewardGrant): void {
    this.store.saveReward(reward);
  }

  listRewardNonces(): RewardNonceRecord[] {
    return this.store.listRewardNonces();
  }

  getRewardNonce(nonceId: string): RewardNonceRecord | undefined {
    return this.store.getRewardNonce(nonceId);
  }

  saveRewardNonce(record: RewardNonceRecord): void {
    this.store.saveRewardNonce(record);
  }

  appendAuditEvent(event: AuditEvent): void {
    this.store.appendAuditEvent(event);
  }

  readAuditEvents(limit = 100): AuditEvent[] {
    return this.store.readAuditEvents(limit);
  }

  async runInTransaction(fn: () => void | Promise<void>): Promise<void> {
    await this.store.runInTransaction(fn);
  }
}
