/**
 * Market handlers barrel — re-exports all handler factories.
 *
 * Each domain-specific module lives in its own file to keep
 * individual files well under the ~500-700 LOC guideline.
 */

export {
  createOfferCreateHandler,
  createOfferPublishHandler,
  createOfferUpdateHandler,
  createOfferCloseHandler,
} from "./offer.js";
export {
  createRewardCreateHandler,
  createRewardGetHandler,
  createRewardIssueClaimHandler,
  createRewardListHandler,
  createRewardUpdateStatusHandler,
} from "./reward.js";
export {
  createOrderCreateHandler,
  createOrderCancelHandler,
  createOrderListHandler,
} from "./order.js";
export {
  createSettlementLockHandler,
  createSettlementReleaseHandler,
  createSettlementRefundHandler,
  createSettlementStatusHandler,
  createSettlementQueryHandler,
} from "./settlement.js";
export { createConsentGrantHandler, createConsentRevokeHandler } from "./consent.js";
export {
  createDeliveryIssueHandler,
  createDeliveryRevokeHandler,
  createDeliveryCompleteHandler,
} from "./delivery.js";
export {
  createServiceProofSubmitHandler,
  createServiceProofGetHandler,
  createServiceProofListHandler,
} from "./service-proof.js";
export {
  createResourcePublishHandler,
  createResourceUnpublishHandler,
  createResourceGetHandler,
  createResourceListHandler,
} from "./resource.js";
export {
  createLeaseIssueHandler,
  createLeaseRevokeHandler,
  createLeaseGetHandler,
  createLeaseListHandler,
  createLeaseExpireSweepHandler,
} from "./lease.js";
export {
  createLedgerAppendHandler,
  createLedgerListHandler,
  createLedgerSummaryHandler,
} from "./ledger.js";
export {
  createDisputeEvidenceHandler,
  createDisputeGetHandler,
  createDisputeListHandler,
  createDisputeOpenHandler,
  createDisputeRejectHandler,
  createDisputeResolveHandler,
} from "./dispute.js";
export { createMarketMetricsSnapshotHandler } from "./metrics.js";
export {
  createMarketStatusSummaryHandler,
  createMarketAuditQueryHandler,
  createMarketTransparencySummaryHandler,
  createMarketTransparencyTraceHandler,
} from "./transparency.js";
export { createMarketRepairRetryHandler, createMarketRevocationRetryHandler } from "./repair.js";
export { createReputationSummaryHandler } from "./reputation.js";
export {
  createBridgeListHandler,
  createBridgeRequestHandler,
  createBridgeRoutesHandler,
  createBridgeStatusHandler,
  createBridgeUpdateHandler,
} from "./bridge.js";
export {
  createTokenEconomyBurnHandler,
  createTokenEconomyConfigureHandler,
  createTokenEconomyGovernanceUpdateHandler,
  createTokenEconomyMintHandler,
  createTokenEconomySummaryHandler,
} from "./token-economy.js";
export {
  createPricingModelHandler,
  getPricingModelHandler,
  calculatePriceHandler,
  getPriceHistoryHandler,
  getMarketStatisticsHandler,
  createOrderBookEntryHandler,
  getOrderBookHandler,
} from "./pricing.js";

// ── Task Market handlers ──
export {
  createTaskPublishHandler,
  createTaskGetHandler,
  createTaskListHandler,
  createTaskCancelHandler,
  createTaskExpireSweepHandler,
} from "./task-order.js";
export {
  createTaskBidPlaceHandler,
  createTaskBidListHandler,
  createTaskBidAwardHandler,
} from "./task-bid.js";
export {
  createTaskResultSubmitHandler,
  createTaskResultListHandler,
  createTaskResultReviewHandler,
  createTaskReceiptGetHandler,
  createTaskReceiptListHandler,
} from "./task-result.js";

// ── Privacy / Consent Replay handlers ──
export {
  createConsentListHandler,
  createConsentGetHandler,
  createPrivacyAssetListHandler,
  createPrivacyReplayGenerateHandler,
  createPrivacyReplayListHandler,
  createPrivacyEraseHandler,
} from "./privacy.js";
