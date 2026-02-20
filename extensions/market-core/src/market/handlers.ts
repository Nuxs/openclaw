/**
 * Market handlers — thin re-export barrel.
 *
 * All handler implementations have been split into domain-specific modules
 * under `./handlers/` for maintainability. This file preserves the original
 * import path (`./market/handlers.js`) used by `../index.ts` and tests.
 */

export {
  createConsentGrantHandler,
  createConsentRevokeHandler,
  createDeliveryCompleteHandler,
  createDeliveryIssueHandler,
  createDeliveryRevokeHandler,
  createDisputeEvidenceHandler,
  createDisputeGetHandler,
  createDisputeListHandler,
  createDisputeOpenHandler,
  createDisputeRejectHandler,
  createDisputeResolveHandler,
  createLedgerAppendHandler,
  createLedgerListHandler,
  createLedgerSummaryHandler,
  createLeaseExpireSweepHandler,
  createLeaseGetHandler,
  createLeaseIssueHandler,
  createLeaseListHandler,
  createLeaseRevokeHandler,
  createMarketAuditQueryHandler,
  createMarketMetricsSnapshotHandler,
  createMarketRepairRetryHandler,
  createMarketRevocationRetryHandler,
  createMarketStatusSummaryHandler,
  createMarketTransparencySummaryHandler,
  createMarketTransparencyTraceHandler,
  createOfferCloseHandler,
  createOfferCreateHandler,
  createOfferPublishHandler,
  createOfferUpdateHandler,
  createOrderCancelHandler,
  createOrderCreateHandler,
  createResourceGetHandler,
  createResourceListHandler,
  createResourcePublishHandler,
  createResourceUnpublishHandler,
  createSettlementLockHandler,
  createSettlementRefundHandler,
  createSettlementReleaseHandler,
  createSettlementStatusHandler,
} from "./handlers/index.js";
