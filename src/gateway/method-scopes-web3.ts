/**
 * Web3/Market gateway method scope registrations.
 *
 * Overlay file — keeps web3-specific method entries out of the
 * upstream method-scopes.ts to minimise merge conflicts.
 *
 * Consumed by method-scopes.ts via a single import + spread.
 */

import type { OperatorScope } from "./method-scopes.js";

type ScopeEntries = { scope: OperatorScope; methods: readonly string[] };

export const WEB3_READ_METHODS: readonly string[] = [
  "market.status.summary",
  "market.metrics.snapshot",
  "market.resource.get",
  "market.resource.list",
  "market.lease.get",
  "market.lease.list",
  "market.ledger.list",
  "market.ledger.summary",
  "market.dispute.get",
  "market.dispute.list",
  "market.service.proof.get",
  "market.service.proof.list",
  "market.settlement.status",
  "market.reward.get",
  "market.reward.list",
  "market.audit.query",
  "market.transparency.summary",
  "market.transparency.trace",
  "market.task.list",
  "market.bridge.routes",
  "market.tokenEconomy.summary",
  "market.reputation.summary",
  "market.consent.list",
  "market.privacy.assets",
  "market.privacy.replay.list",
  "web3.market.status.summary",
  "web3.market.metrics.snapshot",
  "web3.market.resource.get",
  "web3.market.resource.list",
  "web3.market.lease.get",
  "web3.market.lease.list",
  "web3.market.ledger.list",
  "web3.market.ledger.summary",
  "web3.market.dispute.get",
  "web3.market.dispute.list",
  "web3.market.service.proof.get",
  "web3.market.service.proof.list",
  "web3.reward.get",
  "web3.reward.list",
  "web3.monitor.snapshot",
  "web3.billing.status",
  "web3.billing.summary",
  "web3.billing.paymentTrace.query",
  "web3.audit.query",
  "web3.market.reconciliation.summary",
  "web3.market.consent.list",
  "web3.market.task.list",
  "web3.market.bridge.routes",
  "web3.market.tokenEconomy.summary",
  "web3.market.reputation.summary",
  "web3.market.privacy.assets",
  "web3.market.privacy.replay.list",
  "web3.status.summary",
] as const;

export const WEB3_WRITE_METHODS: readonly string[] = [
  "market.offer.create",
  "market.offer.publish",
  "market.offer.update",
  "market.offer.close",
  "market.resource.publish",
  "market.resource.unpublish",
  "market.order.create",
  "market.order.cancel",
  "market.settlement.lock",
  "market.settlement.release",
  "market.settlement.refund",
  "market.reward.create",
  "market.reward.issueClaim",
  "market.reward.updateStatus",
  "market.consent.grant",
  "market.consent.revoke",
  "market.delivery.issue",
  "market.delivery.revoke",
  "market.delivery.complete",
  "market.service.proof.submit",
  "market.lease.issue",
  "market.lease.revoke",
  "market.lease.expireSweep",
  "market.ledger.append",
  "market.dispute.open",
  "market.dispute.submitEvidence",
  "market.dispute.resolve",
  "market.dispute.reject",
  "market.repair.retry",
  "market.revocation.retry",
  "web3.market.resource.publish",
  "web3.market.resource.unpublish",
  "web3.market.lease.issue",
  "web3.market.lease.revoke",
  "web3.market.lease.expireSweep",
  "web3.market.service.proof.submit",
  "web3.reward.claim",
  "web3.reward.updateStatus",
] as const;

/**
 * All web3/market scope entries grouped by scope, ready for
 * merging into the main METHOD_SCOPE_GROUPS.
 */
export const WEB3_SCOPE_ENTRIES: ScopeEntries[] = [
  { scope: "operator.read" as OperatorScope, methods: WEB3_READ_METHODS },
  { scope: "operator.write" as OperatorScope, methods: WEB3_WRITE_METHODS },
];
