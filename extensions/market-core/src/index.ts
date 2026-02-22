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
} from "./market/handlers.js";
import { MarketStateStore } from "./state/store.js";

// Re-export facade types for web3-core to use (optional inter-plugin API)
export type { MarketFacade } from "./facade.js";
export { createMarketFacade } from "./facade.js";

function enforceSqliteStore(
  config: MarketPluginConfig,
  logger: { warn: (message: string) => void },
): MarketPluginConfig {
  if (config.store.mode === "sqlite") return config;
  logger.warn("market-core store mode 'file' is not supported for external use; forcing sqlite");
  return {
    ...config,
    store: {
      ...config.store,
      mode: "sqlite",
    },
  };
}

const plugin: OpenClawPluginDefinition = {
  id: "market-core",
  name: "Market Core",
  description:
    "Internal marketplace engine for decentralized resource trading (accessed via web3.market.*)",
  version: "2026.2.21",

  register(api) {
    let config = resolveConfig(api.pluginConfig);
    config = enforceSqliteStore(config, api.logger);
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
