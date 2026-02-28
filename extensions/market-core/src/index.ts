/**
 * Market Core Plugin
 *
 * This plugin is the internal market authority for Web3 resource sharing:
 * - Registers low-level `market.*` gateway methods (primarily for web3-core + trusted operators)
 * - web3-core exposes user-facing `web3.*` / `web3.market.*` methods and commands
 *
 * Security posture:
 * - `market.*` is intended to be access-controlled via market-core `access.*` config
 * - Sensitive data must never leak (tokens, endpoints, real file paths)
 */

import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk";
import { resolveConfig, type MarketPluginConfig } from "./config.js";
import { createMarketFacade } from "./facade.js";
import {
  createBridgeListHandler,
  createBridgeRequestHandler,
  createBridgeRoutesHandler,
  createBridgeStatusHandler,
  createBridgeUpdateHandler,
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
  createReputationSummaryHandler,
  createTokenEconomyBurnHandler,
  createTokenEconomyConfigureHandler,
  createTokenEconomyGovernanceUpdateHandler,
  createTokenEconomyMintHandler,
  createTokenEconomySummaryHandler,
  createRewardCreateHandler,
  createRewardGetHandler,
  createRewardIssueClaimHandler,
  createRewardListHandler,
  createRewardUpdateStatusHandler,
  createSettlementLockHandler,
  createSettlementRefundHandler,
  createSettlementReleaseHandler,
  createSettlementStatusHandler,
} from "./market/handlers/index.js";
import { MarketStateStore } from "./state/store.js";

// Re-export facade types for web3-core to use (optional inter-plugin API)
export type { MarketFacade } from "./facade.js";
export { createMarketFacade } from "./facade.js";

const plugin: OpenClawPluginDefinition = {
  id: "market-core",
  name: "Market Core",
  description:
    "Internal marketplace engine for decentralized resource trading (accessed via web3.market.*)",
  version: "2026.2.21",

  register(api) {
    const config = resolveConfig(api.pluginConfig);
    const stateDir = api.runtime.state.resolveStateDir();
    const store = new MarketStateStore(stateDir, config);

    // Optional: expose a facade for in-process consumers.
    const facade = createMarketFacade(store, config);
    const runtime = api.runtime as unknown as { plugins?: Record<string, unknown> };
    if (!runtime.plugins) {
      runtime.plugins = {};
    }
    runtime.plugins._marketCoreFacade = facade;

    // Register internal gateway methods (market.*). These are expected by web3-core proxies.
    api.registerGatewayMethod("market.offer.create", createOfferCreateHandler(store, config));
    api.registerGatewayMethod("market.offer.publish", createOfferPublishHandler(store, config));
    api.registerGatewayMethod("market.offer.update", createOfferUpdateHandler(store, config));
    api.registerGatewayMethod("market.offer.close", createOfferCloseHandler(store, config));

    api.registerGatewayMethod("market.order.create", createOrderCreateHandler(store, config));
    api.registerGatewayMethod("market.order.cancel", createOrderCancelHandler(store, config));

    api.registerGatewayMethod(
      "market.resource.publish",
      createResourcePublishHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.resource.unpublish",
      createResourceUnpublishHandler(store, config),
    );
    api.registerGatewayMethod("market.resource.get", createResourceGetHandler(store, config));
    api.registerGatewayMethod("market.resource.list", createResourceListHandler(store, config));

    api.registerGatewayMethod("market.lease.issue", createLeaseIssueHandler(store, config));
    api.registerGatewayMethod("market.lease.revoke", createLeaseRevokeHandler(store, config));
    api.registerGatewayMethod("market.lease.get", createLeaseGetHandler(store, config));
    api.registerGatewayMethod("market.lease.list", createLeaseListHandler(store, config));
    api.registerGatewayMethod(
      "market.lease.expireSweep",
      createLeaseExpireSweepHandler(store, config),
    );

    api.registerGatewayMethod("market.ledger.append", createLedgerAppendHandler(store, config));
    api.registerGatewayMethod("market.ledger.list", createLedgerListHandler(store, config));
    api.registerGatewayMethod("market.ledger.summary", createLedgerSummaryHandler(store, config));

    api.registerGatewayMethod(
      "market.reputation.summary",
      createReputationSummaryHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.tokenEconomy.summary",
      createTokenEconomySummaryHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.tokenEconomy.configure",
      createTokenEconomyConfigureHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.tokenEconomy.mint",
      createTokenEconomyMintHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.tokenEconomy.burn",
      createTokenEconomyBurnHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.tokenEconomy.governance.update",
      createTokenEconomyGovernanceUpdateHandler(store, config),
    );
    api.registerGatewayMethod("market.bridge.routes", createBridgeRoutesHandler(store, config));
    api.registerGatewayMethod("market.bridge.request", createBridgeRequestHandler(store, config));
    api.registerGatewayMethod("market.bridge.update", createBridgeUpdateHandler(store, config));
    api.registerGatewayMethod("market.bridge.status", createBridgeStatusHandler(store, config));
    api.registerGatewayMethod("market.bridge.list", createBridgeListHandler(store, config));

    api.registerGatewayMethod("market.reward.create", createRewardCreateHandler(store, config));
    api.registerGatewayMethod("market.reward.get", createRewardGetHandler(store, config));
    api.registerGatewayMethod("market.reward.list", createRewardListHandler(store, config));
    api.registerGatewayMethod(
      "market.reward.issueClaim",
      createRewardIssueClaimHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.reward.updateStatus",
      createRewardUpdateStatusHandler(store, config),
    );

    api.registerGatewayMethod("market.settlement.lock", createSettlementLockHandler(store, config));
    api.registerGatewayMethod(
      "market.settlement.release",
      createSettlementReleaseHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.settlement.refund",
      createSettlementRefundHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.settlement.status",
      createSettlementStatusHandler(store, config),
    );

    api.registerGatewayMethod("market.consent.grant", createConsentGrantHandler(store, config));
    api.registerGatewayMethod("market.consent.revoke", createConsentRevokeHandler(store, config));

    api.registerGatewayMethod("market.delivery.issue", createDeliveryIssueHandler(store, config));
    api.registerGatewayMethod("market.delivery.revoke", createDeliveryRevokeHandler(store, config));
    api.registerGatewayMethod(
      "market.delivery.complete",
      createDeliveryCompleteHandler(store, config),
    );

    api.registerGatewayMethod("market.dispute.open", createDisputeOpenHandler(store, config));
    api.registerGatewayMethod(
      "market.dispute.submitEvidence",
      createDisputeEvidenceHandler(store, config),
    );
    api.registerGatewayMethod("market.dispute.resolve", createDisputeResolveHandler(store, config));
    api.registerGatewayMethod("market.dispute.reject", createDisputeRejectHandler(store, config));
    api.registerGatewayMethod("market.dispute.get", createDisputeGetHandler(store, config));
    api.registerGatewayMethod("market.dispute.list", createDisputeListHandler(store, config));

    api.registerGatewayMethod(
      "market.metrics.snapshot",
      createMarketMetricsSnapshotHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.status.summary",
      createMarketStatusSummaryHandler(store, config),
    );
    api.registerGatewayMethod("market.audit.query", createMarketAuditQueryHandler(store, config));
    api.registerGatewayMethod(
      "market.transparency.summary",
      createMarketTransparencySummaryHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.transparency.trace",
      createMarketTransparencyTraceHandler(store, config),
    );
    api.registerGatewayMethod("market.repair.retry", createMarketRepairRetryHandler(store, config));
    api.registerGatewayMethod(
      "market.revocation.retry",
      createMarketRevocationRetryHandler(store, config),
    );

    api.logger.info("Market Core engine initialized");
  },
};

export default plugin;

// Re-export dual-stack payment types for cross-plugin consumption (e.g. web3-core)
export type {
  PaymentChain,
  PaymentMode,
  PaymentIntent,
  PaymentReceipt,
  FXQuote,
  PayoutPreference,
  ReconciliationSummary,
} from "./market/types.js";
