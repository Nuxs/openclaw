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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  OpenClawPluginDefinition,
  OpenClawPluginServiceContext,
} from "openclaw/plugin-sdk/plugin-definition";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version: pkgVersion } = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
) as { version: string };
import { resolveConfig, type MarketPluginConfig } from "./config.js";
import { createMarketFacade } from "./facade.js";
import { createMarketAssistantCommand } from "./market/assistant-command.js";
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
  createOrderListHandler,
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
  createServiceProofSubmitHandler,
  createServiceProofGetHandler,
  createServiceProofListHandler,
  createProofSubmitHandler,
  createProofVerifyHandler,
  createAcceptanceSignHandler,
  createAcceptanceRejectHandler,
  createExecutionGetHandler,
  createSettlementLockHandler,
  createSettlementQueryHandler,
  createSettlementRefundHandler,
  createSettlementReleaseHandler,
  createSettlementStatusHandler,
} from "./market/handlers/index.js";
import {
  createTaskPublishHandler,
  createTaskGetHandler,
  createTaskListHandler,
  createTaskCancelHandler,
  createTaskExpireSweepHandler,
  createTaskBidPlaceHandler,
  createTaskBidListHandler,
  createTaskBidAwardHandler,
  createTaskResultSubmitHandler,
  createTaskResultListHandler,
  createTaskResultReviewHandler,
  createTaskReceiptGetHandler,
  createTaskReceiptListHandler,
  createConsentListHandler,
  createConsentGetHandler,
  createPrivacyAssetListHandler,
  createPrivacyReplayGenerateHandler,
  createPrivacyReplayListHandler,
  createPrivacyEraseHandler,
} from "./market/handlers/index.js";
import { flushPendingRewards } from "./market/reward/poller.js";
import { flushPendingSettlementOperations } from "./market/settlement/poller.js";
import { MarketStateStore } from "./state/store.js";

type MarketBackgroundServiceContext = OpenClawPluginServiceContext & {
  _rewardInterval?: ReturnType<typeof setInterval>;
  _settlementInterval?: ReturnType<typeof setInterval>;
};

function asMarketBackgroundServiceContext(
  ctx: OpenClawPluginServiceContext,
): MarketBackgroundServiceContext {
  return ctx as MarketBackgroundServiceContext;
}

// Re-export facade types for web3-core to use (optional inter-plugin API)
export type { MarketFacade } from "./facade.js";
export { createMarketFacade } from "./facade.js";

const plugin: OpenClawPluginDefinition = {
  id: "market-core",
  name: "Market Core",
  description:
    "Internal marketplace engine for decentralized resource trading (accessed via web3.market.*)",
  version: pkgVersion,

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

    api.registerCommand({
      name: "market-assistant",
      description: "Natural-language assistant for market operations",
      acceptsArgs: true,
      handler: createMarketAssistantCommand(),
    });

    // Register internal gateway methods (market.*). These are expected by web3-core proxies.
    api.registerGatewayMethod("market.offer.create", createOfferCreateHandler(store, config));
    api.registerGatewayMethod("market.offer.publish", createOfferPublishHandler(store, config));
    api.registerGatewayMethod("market.offer.update", createOfferUpdateHandler(store, config));
    api.registerGatewayMethod("market.offer.close", createOfferCloseHandler(store, config));

    api.registerGatewayMethod("market.order.create", createOrderCreateHandler(store, config));
    api.registerGatewayMethod("market.order.cancel", createOrderCancelHandler(store, config));
    api.registerGatewayMethod("market.order.list", createOrderListHandler(store, config));

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
    api.registerGatewayMethod(
      "market.settlement.query",
      createSettlementQueryHandler(store, config),
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
      "market.service.proof.submit",
      createServiceProofSubmitHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.service.proof.get",
      createServiceProofGetHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.service.proof.list",
      createServiceProofListHandler(store, config),
    );
    api.registerGatewayMethod("market.proof.submit", createProofSubmitHandler(store, config));
    api.registerGatewayMethod("market.proof.verify", createProofVerifyHandler(store, config));
    api.registerGatewayMethod("market.acceptance.sign", createAcceptanceSignHandler(store, config));
    api.registerGatewayMethod(
      "market.acceptance.reject",
      createAcceptanceRejectHandler(store, config),
    );
    api.registerGatewayMethod("market.execution.get", createExecutionGetHandler(store, config));

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

    // ── Task Market ──
    api.registerGatewayMethod("market.task.publish", createTaskPublishHandler(store, config));
    api.registerGatewayMethod("market.task.get", createTaskGetHandler(store, config));
    api.registerGatewayMethod("market.task.list", createTaskListHandler(store, config));
    api.registerGatewayMethod("market.task.cancel", createTaskCancelHandler(store, config));
    api.registerGatewayMethod(
      "market.task.expireSweep",
      createTaskExpireSweepHandler(store, config),
    );
    api.registerGatewayMethod("market.task.bid.place", createTaskBidPlaceHandler(store, config));
    api.registerGatewayMethod("market.task.bid.list", createTaskBidListHandler(store, config));
    api.registerGatewayMethod("market.task.bid.award", createTaskBidAwardHandler(store, config));
    api.registerGatewayMethod(
      "market.task.result.submit",
      createTaskResultSubmitHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.task.result.list",
      createTaskResultListHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.task.result.review",
      createTaskResultReviewHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.task.receipt.get",
      createTaskReceiptGetHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.task.receipt.list",
      createTaskReceiptListHandler(store, config),
    );

    // ── Privacy / Consent Replay ──
    api.registerGatewayMethod("market.consent.list", createConsentListHandler(store, config));
    api.registerGatewayMethod("market.consent.get", createConsentGetHandler(store, config));
    api.registerGatewayMethod(
      "market.privacy.assets",
      createPrivacyAssetListHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.privacy.replay.generate",
      createPrivacyReplayGenerateHandler(store, config),
    );
    api.registerGatewayMethod(
      "market.privacy.replay.list",
      createPrivacyReplayListHandler(store, config),
    );
    api.registerGatewayMethod("market.privacy.erase", createPrivacyEraseHandler(store, config));

    // ---- Background service: Reward polling & Cleanup ----
    api.registerService({
      id: "market-reward-poller",
      async start(ctx) {
        ctx.logger.info("Market reward poller service started");
        const interval = setInterval(async () => {
          try {
            await flushPendingRewards(store, config);
          } catch (err) {
            ctx.logger.warn(`Reward poll error: ${err}`);
          }
        }, 60_000); // Check every minute
        asMarketBackgroundServiceContext(ctx)._rewardInterval = interval;
      },
      stop(ctx) {
        const interval = asMarketBackgroundServiceContext(ctx)._rewardInterval;
        if (interval) clearInterval(interval);
        ctx.logger.info("Market reward poller service stopped");
      },
    });

    api.registerService({
      id: "market-settlement-poller",
      async start(ctx) {
        ctx.logger.info("Market settlement poller service started");
        const interval = setInterval(async () => {
          try {
            await flushPendingSettlementOperations(store, config);
          } catch (err) {
            ctx.logger.warn(`Settlement poll error: ${err}`);
          }
        }, 30_000);
        asMarketBackgroundServiceContext(ctx)._settlementInterval = interval;
      },
      stop(ctx) {
        const interval = asMarketBackgroundServiceContext(ctx)._settlementInterval;
        if (interval) clearInterval(interval);
        ctx.logger.info("Market settlement poller service stopped");
      },
    });

    api.logger.info("Market Core engine initialized");
  },
};

export default plugin;

export { resolveTreasuryRoute } from "./market/treasury-router.js";

// Re-export dual-stack payment types for cross-plugin consumption (e.g. web3-core)
export type {
  PaymentChain,
  PaymentConfirmationStatus,
  PaymentIntent,
  PaymentMode,
  PaymentRail,
  PaymentReceipt,
  FXQuote,
  PayoutPreference,
  ReconciliationSummary,
  TreasuryRoute,
} from "./market/types.js";
