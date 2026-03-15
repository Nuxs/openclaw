/**
 * Market domain registration — the largest domain.
 *
 * Commands: web3-market
 * Gateway:  web3.market.resource.*, web3.market.order.*, web3.market.settlement.*,
 *           web3.market.lease.*, web3.market.service.proof.*, web3.market.ledger.*,
 *           web3.market.reputation.*, web3.market.tokenEconomy.*, web3.market.bridge.*,
 *           web3.market.metrics.*, web3.market.reconciliation.*, web3.market.status.*,
 *           web3.market.dispute.*, web3.market.task.*, web3.market.consent.*,
 *           web3.market.privacy.*
 * Tools:    web3-market-status + 7 orchestration tools
 */

import {
  createMarketConsentGrantHandler,
  createMarketConsentRevokeHandler,
  createMarketDeliveryCompleteHandler,
  createMarketDeliveryIssueHandler,
  createMarketDeliveryRevokeHandler,
  createMarketOfferCloseHandler,
  createMarketOfferCreateHandler,
  createMarketOfferPublishHandler,
  createMarketOfferUpdateHandler,
  createMarketOrderCancelHandler,
  createMarketOrderCreateHandler,
} from "./market/commerce-handlers.js";
import {
  createMarketBridgeListHandler,
  createMarketBridgeRequestHandler,
  createMarketBridgeRoutesHandler,
  createMarketBridgeStatusHandler,
  createMarketBridgeUpdateHandler,
  createMarketLedgerListHandler,
  createMarketLedgerSummaryHandler,
  createMarketLeaseExpireSweepHandler,
  createMarketLeaseGetHandler,
  createMarketLeaseIssueHandler,
  createMarketLeaseListHandler,
  createMarketLeaseRevokeHandler,
  createMarketMetricsSnapshotHandler,
  createMarketReconciliationSummaryHandler,
  createMarketReputationSummaryHandler,
  createMarketTokenEconomyBurnHandler,
  createMarketTokenEconomyConfigureHandler,
  createMarketTokenEconomyGovernanceUpdateHandler,
  createMarketTokenEconomyMintHandler,
  createMarketTokenEconomySummaryHandler,
  createMarketResourceGetHandler,
  createMarketResourceListHandler,
  createMarketOrderListHandler,
  createMarketOfferQuoteHandler,
  createMarketOfferCompareHandler,
  createMarketSettlementQueryHandler,
  createMarketResourcePublishHandler,
  createMarketResourceUnpublishHandler,
  createMarketServiceProofSubmitHandler,
  createMarketServiceProofGetHandler,
  createMarketServiceProofListHandler,
  createMarketProofSubmitHandler,
  createMarketProofVerifyHandler,
  createMarketAcceptanceSignHandler,
  createMarketAcceptanceRejectHandler,
  createMarketExecutionStatusHandler,
  createMarketStatusSummaryHandler,
  createMarketDisputeGetHandler,
  createMarketDisputeListHandler,
  createMarketDisputeOpenHandler,
  createMarketDisputeSubmitEvidenceHandler,
  createMarketDisputeResolveHandler,
  createMarketDisputeRejectHandler,
} from "./market/handlers.js";
import {
  createMarketPresetPreviewHandler,
  createMarketPresetVerifyHandler,
} from "./market/preset-handlers.js";
import {
  createMarketTaskPublishHandler,
  createMarketTaskGetHandler,
  createMarketTaskListHandler,
  createMarketTaskCancelHandler,
  createMarketTaskExpireSweepHandler,
  createMarketTaskBidPlaceHandler,
  createMarketTaskBidListHandler,
  createMarketTaskBidAwardHandler,
  createMarketTaskResultSubmitHandler,
  createMarketTaskResultListHandler,
  createMarketTaskResultReviewHandler,
  createMarketTaskReceiptGetHandler,
  createMarketTaskReceiptListHandler,
  createMarketConsentListHandler,
  createMarketConsentGetHandler,
  createMarketPrivacyAssetsHandler,
  createMarketPrivacyReplayGenerateHandler,
  createMarketPrivacyReplayListHandler,
  createMarketPrivacyEraseHandler,
} from "./market/task-handlers.js";
import { createWeb3MarketCommand } from "./market/web3-market-command.js";
import { createWeb3MarketStatusTool } from "./market/web3-market-status-tool.js";
import type { RegistrationContext } from "./register-types.js";
import { createWeb3MarketStewardBuyTool } from "./resources/market-steward-tools.js";
import {
  createWeb3MarketBuyTool,
  createWeb3MarketCompareTool,
  createWeb3MarketIndexListTool,
  createWeb3MarketLedgerListTool,
  createWeb3MarketLedgerSummaryTool,
  createWeb3MarketLeaseTool,
  createWeb3MarketOrderCreateTool,
  createWeb3MarketPublishTool,
  createWeb3MarketQuoteTool,
  createWeb3MarketRevokeLeaseTool,
  createWeb3MarketUnpublishTool,
} from "./resources/market-tools.js";

export function registerMarket({ api, store, config }: RegistrationContext): void {
  // ── Command ──
  api.registerCommand({
    name: "web3-market",
    description: "Show Web3 Market status or manage compatibility presets",
    acceptsArgs: true,
    handler: createWeb3MarketCommand(config),
  });

  // ── Gateway: Market commerce ──
  api.registerGatewayMethod("web3.market.offer.create", createMarketOfferCreateHandler(config));
  api.registerGatewayMethod("web3.market.offer.publish", createMarketOfferPublishHandler(config));
  api.registerGatewayMethod("web3.market.offer.update", createMarketOfferUpdateHandler(config));
  api.registerGatewayMethod("web3.market.offer.close", createMarketOfferCloseHandler(config));
  api.registerGatewayMethod("web3.market.order.create", createMarketOrderCreateHandler(config));
  api.registerGatewayMethod("web3.market.order.cancel", createMarketOrderCancelHandler(config));
  api.registerGatewayMethod("web3.market.consent.grant", createMarketConsentGrantHandler(config));
  api.registerGatewayMethod("web3.market.consent.revoke", createMarketConsentRevokeHandler(config));
  api.registerGatewayMethod("web3.market.delivery.issue", createMarketDeliveryIssueHandler(config));
  api.registerGatewayMethod(
    "web3.market.delivery.revoke",
    createMarketDeliveryRevokeHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.delivery.complete",
    createMarketDeliveryCompleteHandler(config),
  );

  // ── Gateway: Market resources ──
  api.registerGatewayMethod(
    "web3.market.resource.publish",
    createMarketResourcePublishHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.resource.unpublish",
    createMarketResourceUnpublishHandler(config),
  );
  api.registerGatewayMethod("web3.market.resource.get", createMarketResourceGetHandler(config));
  api.registerGatewayMethod("web3.market.resource.list", createMarketResourceListHandler(config));
  api.registerGatewayMethod("web3.market.order.list", createMarketOrderListHandler(config));
  api.registerGatewayMethod("web3.market.offer.quote", createMarketOfferQuoteHandler(config));
  api.registerGatewayMethod("web3.market.offer.compare", createMarketOfferCompareHandler(config));
  api.registerGatewayMethod(
    "web3.market.settlement.query",
    createMarketSettlementQueryHandler(config),
  );

  // ── Gateway: Market leases ──
  api.registerGatewayMethod("web3.market.lease.issue", createMarketLeaseIssueHandler(config));
  api.registerGatewayMethod("web3.market.lease.revoke", createMarketLeaseRevokeHandler(config));
  api.registerGatewayMethod("web3.market.lease.get", createMarketLeaseGetHandler(config));
  api.registerGatewayMethod("web3.market.lease.list", createMarketLeaseListHandler(config));
  api.registerGatewayMethod(
    "web3.market.lease.expireSweep",
    createMarketLeaseExpireSweepHandler(config),
  );

  // ── Gateway: Service proofs ──
  api.registerGatewayMethod(
    "web3.market.service.proof.submit",
    createMarketServiceProofSubmitHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.service.proof.get",
    createMarketServiceProofGetHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.service.proof.list",
    createMarketServiceProofListHandler(config),
  );
  api.registerGatewayMethod("web3.market.proof.submit", createMarketProofSubmitHandler(config));
  api.registerGatewayMethod("web3.market.proof.verify", createMarketProofVerifyHandler(config));
  api.registerGatewayMethod(
    "web3.market.acceptance.sign",
    createMarketAcceptanceSignHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.acceptance.reject",
    createMarketAcceptanceRejectHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.execution.status",
    createMarketExecutionStatusHandler(config),
  );

  // ── Gateway: Ledger ──
  api.registerGatewayMethod("web3.market.ledger.list", createMarketLedgerListHandler(config));
  api.registerGatewayMethod("web3.market.ledger.summary", createMarketLedgerSummaryHandler(config));

  // ── Gateway: Reputation ──
  api.registerGatewayMethod(
    "web3.market.reputation.summary",
    createMarketReputationSummaryHandler(store, config),
  );

  // ── Gateway: Token economy ──
  api.registerGatewayMethod(
    "web3.market.tokenEconomy.summary",
    createMarketTokenEconomySummaryHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.tokenEconomy.configure",
    createMarketTokenEconomyConfigureHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.tokenEconomy.mint",
    createMarketTokenEconomyMintHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.tokenEconomy.burn",
    createMarketTokenEconomyBurnHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.tokenEconomy.governance.update",
    createMarketTokenEconomyGovernanceUpdateHandler(config),
  );

  // ── Gateway: Bridge ──
  api.registerGatewayMethod("web3.market.bridge.routes", createMarketBridgeRoutesHandler(config));
  api.registerGatewayMethod("web3.market.bridge.request", createMarketBridgeRequestHandler(config));
  api.registerGatewayMethod("web3.market.bridge.update", createMarketBridgeUpdateHandler(config));
  api.registerGatewayMethod("web3.market.bridge.status", createMarketBridgeStatusHandler(config));
  api.registerGatewayMethod("web3.market.bridge.list", createMarketBridgeListHandler(config));

  // ── Gateway: Market metrics & reconciliation ──
  api.registerGatewayMethod(
    "web3.market.metrics.snapshot",
    createMarketMetricsSnapshotHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.reconciliation.summary",
    createMarketReconciliationSummaryHandler(store, config),
  );
  api.registerGatewayMethod("web3.market.status.summary", createMarketStatusSummaryHandler(config));
  api.registerGatewayMethod("web3.market.preset.preview", createMarketPresetPreviewHandler(config));
  api.registerGatewayMethod("web3.market.preset.verify", createMarketPresetVerifyHandler(config));

  // ── Gateway: Disputes ──
  api.registerGatewayMethod("web3.market.dispute.get", createMarketDisputeGetHandler(config));
  api.registerGatewayMethod("web3.market.dispute.list", createMarketDisputeListHandler(config));
  api.registerGatewayMethod("web3.market.dispute.open", createMarketDisputeOpenHandler(config));
  api.registerGatewayMethod(
    "web3.market.dispute.submitEvidence",
    createMarketDisputeSubmitEvidenceHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.dispute.resolve",
    createMarketDisputeResolveHandler(config),
  );
  api.registerGatewayMethod("web3.market.dispute.reject", createMarketDisputeRejectHandler(config));

  // ── Gateway: Task market ──
  api.registerGatewayMethod("web3.market.task.publish", createMarketTaskPublishHandler(config));
  api.registerGatewayMethod("web3.market.task.get", createMarketTaskGetHandler(config));
  api.registerGatewayMethod("web3.market.task.list", createMarketTaskListHandler(config));
  api.registerGatewayMethod("web3.market.task.cancel", createMarketTaskCancelHandler(config));
  api.registerGatewayMethod(
    "web3.market.task.expireSweep",
    createMarketTaskExpireSweepHandler(config),
  );
  api.registerGatewayMethod("web3.market.task.bid.place", createMarketTaskBidPlaceHandler(config));
  api.registerGatewayMethod("web3.market.task.bid.list", createMarketTaskBidListHandler(config));
  api.registerGatewayMethod("web3.market.task.bid.award", createMarketTaskBidAwardHandler(config));
  api.registerGatewayMethod(
    "web3.market.task.result.submit",
    createMarketTaskResultSubmitHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.task.result.list",
    createMarketTaskResultListHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.task.result.review",
    createMarketTaskResultReviewHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.task.receipt.get",
    createMarketTaskReceiptGetHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.task.receipt.list",
    createMarketTaskReceiptListHandler(config),
  );

  // ── Gateway: Privacy / Consent ──
  api.registerGatewayMethod("web3.market.consent.list", createMarketConsentListHandler(config));
  api.registerGatewayMethod("web3.market.consent.get", createMarketConsentGetHandler(config));
  api.registerGatewayMethod("web3.market.privacy.assets", createMarketPrivacyAssetsHandler(config));
  api.registerGatewayMethod(
    "web3.market.privacy.replay.generate",
    createMarketPrivacyReplayGenerateHandler(config),
  );
  api.registerGatewayMethod(
    "web3.market.privacy.replay.list",
    createMarketPrivacyReplayListHandler(config),
  );
  api.registerGatewayMethod("web3.market.privacy.erase", createMarketPrivacyEraseHandler(config));

  // ── Tools ──
  api.registerTool(createWeb3MarketStatusTool(config));
  for (const tool of [
    createWeb3MarketIndexListTool(config),
    createWeb3MarketQuoteTool(config),
    createWeb3MarketCompareTool(config),
    createWeb3MarketOrderCreateTool(config),
    createWeb3MarketLeaseTool(config),
    createWeb3MarketBuyTool(config),
    createWeb3MarketStewardBuyTool(config),
    createWeb3MarketRevokeLeaseTool(config),
    createWeb3MarketPublishTool(config),
    createWeb3MarketUnpublishTool(config),
    createWeb3MarketLedgerSummaryTool(config),
    createWeb3MarketLedgerListTool(config),
  ]) {
    if (tool) api.registerTool(tool);
  }
}
