/**
 * Settlement handlers — thin barrel re-export.
 *
 * Implementation split by domain:
 *   settlement-lock.ts    — escrow lock handler
 *   settlement-release.ts — incremental release logic + handler
 *   settlement-refund.ts  — refund handler
 *   settlement-query.ts   — status & list query handlers
 *   settlement-shared.ts  — shared utilities (parseAmount, sumPayees, etc.)
 */

export { createSettlementLockHandler } from "./settlement-lock.js";
export {
  releaseSettlementIncremental,
  createSettlementReleaseHandler,
} from "./settlement-release.js";
export { createSettlementRefundHandler } from "./settlement-refund.js";
export { createSettlementStatusHandler, createSettlementQueryHandler } from "./settlement-query.js";
