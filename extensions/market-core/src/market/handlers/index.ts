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
export { createOrderCreateHandler, createOrderCancelHandler } from "./order.js";
export {
  createSettlementLockHandler,
  createSettlementReleaseHandler,
  createSettlementRefundHandler,
  createSettlementStatusHandler,
} from "./settlement.js";
export { createConsentGrantHandler, createConsentRevokeHandler } from "./consent.js";
export {
  createDeliveryIssueHandler,
  createDeliveryRevokeHandler,
  createDeliveryCompleteHandler,
} from "./delivery.js";
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
