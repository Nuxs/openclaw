import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk";
import { resolveConfig } from "./config.js";
import {
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
  createPricingModelHandler,
  getPricingModelHandler,
  calculatePriceHandler,
  getPriceHistoryHandler,
  getMarketStatisticsHandler,
  createOrderBookEntryHandler,
  getOrderBookHandler,
} from "./market/handlers.js";
import { MarketStateStore } from "./state/store.js";

const plugin: OpenClawPluginDefinition = {
  id: "market-core",
  name: "Market Core",
  description:
    "Decentralized marketplace for data/service/assets with on-chain settlement and audit",
  version: "2026.2.16",

  register(api) {
    const config = resolveConfig(api.pluginConfig);
    const stateDir = api.runtime.state.resolveStateDir();
    const store = new MarketStateStore(stateDir, config);

    // ---- Gateway methods ----
    api.registerGatewayMethod("market.offer.create", createOfferCreateHandler(store, config));
    api.registerGatewayMethod("market.offer.publish", createOfferPublishHandler(store, config));
    api.registerGatewayMethod("market.offer.update", createOfferUpdateHandler(store, config));
    api.registerGatewayMethod("market.offer.close", createOfferCloseHandler(store, config));

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

    api.registerGatewayMethod("market.order.create", createOrderCreateHandler(store, config));
    api.registerGatewayMethod("market.order.cancel", createOrderCancelHandler(store, config));

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
      "market.status.summary",
      createMarketStatusSummaryHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.metrics.snapshot",
      createMarketMetricsSnapshotHandler(store, config),
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

    // ---- Dynamic Pricing methods ----
    api.registerGatewayMethod("market.pricing.setModel", createPricingModelHandler(store, config));
    api.registerGatewayMethod("market.pricing.getModel", getPricingModelHandler(store, config));
    api.registerGatewayMethod("market.pricing.calculate", calculatePriceHandler(store, config));
    api.registerGatewayMethod("market.pricing.history", getPriceHistoryHandler(store, config));
    api.registerGatewayMethod(
      "market.pricing.statistics",
      getMarketStatisticsHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.orderbook.create",
      createOrderBookEntryHandler(store, config),
    );
    api.registerGatewayMethod("market.orderbook.get", getOrderBookHandler(store, config));

    api.logger.info("Market Core plugin registered");
  },
};

export default plugin;
