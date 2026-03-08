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
  PrivacyReplay,
  PrivacyReplayFilter,
  RevocationJob,
  RewardGrant,
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

export type MarketStore = {
  listOffers: () => Offer[];
  getOffer: (offerId: string) => Offer | undefined;
  saveOffer: (offer: Offer) => void;
  listResources: (filter?: MarketResourceFilter) => MarketResource[];
  getResource: (resourceId: string) => MarketResource | undefined;
  saveResource: (resource: MarketResource) => void;
  listOrders: () => Order[];
  getOrder: (orderId: string) => Order | undefined;
  saveOrder: (order: Order) => void;
  listConsents: () => Consent[];
  getConsent: (consentId: string) => Consent | undefined;
  saveConsent: (consent: Consent) => void;
  listTasks: (filter?: TaskOrderFilter) => TaskOrder[];
  getTask: (taskId: string) => TaskOrder | undefined;
  saveTask: (task: TaskOrder) => void;
  listTaskBids: (filter?: TaskBidFilter) => TaskBid[];
  getTaskBid: (bidId: string) => TaskBid | undefined;
  saveTaskBid: (bid: TaskBid) => void;
  listTaskResults: (filter?: TaskResultFilter) => TaskResult[];
  getTaskResult: (resultId: string) => TaskResult | undefined;
  saveTaskResult: (result: TaskResult) => void;
  listTaskReceipts: (filter?: TaskReceiptFilter) => TaskReceipt[];
  getTaskReceipt: (receiptId: string) => TaskReceipt | undefined;
  saveTaskReceipt: (receipt: TaskReceipt) => void;
  listPrivacyReplays: (filter?: PrivacyReplayFilter) => PrivacyReplay[];
  getPrivacyReplay: (replayId: string) => PrivacyReplay | undefined;
  savePrivacyReplay: (replay: PrivacyReplay) => void;
  listDeliveries: () => Delivery[];
  getDelivery: (deliveryId: string) => Delivery | undefined;
  saveDelivery: (delivery: Delivery) => void;
  listSettlements: () => Settlement[];
  getSettlement: (settlementId: string) => Settlement | undefined;
  getSettlementByOrder: (orderId: string) => Settlement | undefined;
  saveSettlement: (settlement: Settlement) => void;
  listSettlementOperations: (filter?: SettlementOperationFilter) => SettlementOperation[];
  getSettlementOperation: (operationId: string) => SettlementOperation | undefined;
  getSettlementOperationByIdempotencyKey: (
    idempotencyKey: string,
  ) => SettlementOperation | undefined;
  saveSettlementOperation: (operation: SettlementOperation) => void;
  listDisputes: () => Dispute[];
  getDispute: (disputeId: string) => Dispute | undefined;
  getDisputeByOrder: (orderId: string) => Dispute | undefined;
  saveDispute: (dispute: Dispute) => void;
  listServiceProofs: (filter?: ServiceProofFilter) => ServiceProof[];
  getServiceProof: (proofId: string) => ServiceProof | undefined;
  getServiceProofByOrder: (orderId: string) => ServiceProof | undefined;
  saveServiceProof: (proof: ServiceProof) => void;
  listLeases: (filter?: MarketLeaseFilter) => MarketLease[];
  getLease: (leaseId: string) => MarketLease | undefined;
  saveLease: (lease: MarketLease) => void;
  appendLedger: (entry: MarketLedgerEntry) => void;
  listLedger: (filter?: MarketLedgerFilter) => MarketLedgerEntry[];
  summarizeLedger: (filter?: MarketLedgerFilter) => MarketLedgerSummary;
  listRevocations: () => RevocationJob[];
  getRevocation: (jobId: string) => RevocationJob | undefined;
  saveRevocation: (job: RevocationJob) => void;
  removeRevocation: (jobId: string) => void;
  getTokenEconomy: () => TokenEconomyState | undefined;
  saveTokenEconomy: (state: TokenEconomyState) => void;
  listBridgeTransfers: (filter?: BridgeTransferFilter) => BridgeTransfer[];
  getBridgeTransfer: (bridgeId: string) => BridgeTransfer | undefined;
  saveBridgeTransfer: (transfer: BridgeTransfer) => void;
  listRewards: () => RewardGrant[];
  getReward: (rewardId: string) => RewardGrant | undefined;
  saveReward: (reward: RewardGrant) => void;
  listRewardNonces: () => RewardNonceRecord[];
  getRewardNonce: (nonceId: string) => RewardNonceRecord | undefined;
  saveRewardNonce: (record: RewardNonceRecord) => void;
  appendAuditEvent: (event: AuditEvent) => void;
  readAuditEvents: (limit?: number) => AuditEvent[];
  hasAnyData?: () => boolean;
  /** Run multiple writes atomically (SQLite: BEGIN/COMMIT/ROLLBACK; File: directory lock). */
  runInTransaction: (fn: () => void | Promise<void>) => Promise<void>;
};
