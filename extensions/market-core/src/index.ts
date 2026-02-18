import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk";
import { resolveConfig } from "./config.js";
import {
  createConsentGrantHandler,
  createConsentRevokeHandler,
  createDeliveryCompleteHandler,
  createDeliveryIssueHandler,
  createDeliveryRevokeHandler,
  createMarketAuditQueryHandler,
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
  createSettlementLockHandler,
  createSettlementRefundHandler,
  createSettlementReleaseHandler,
  createSettlementStatusHandler,
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
    api.registerGatewayMethod(
      "market.revocation.retry",
      createMarketRevocationRetryHandler(store, config),
    );

    api.logger.info("Market Core plugin registered");
  },
};

export default plugin;
