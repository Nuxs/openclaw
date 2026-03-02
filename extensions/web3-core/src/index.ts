/**
 * OpenClaw Web3 Core Plugin
 *
 * Registers:
 * - Commands:  /bind_wallet, /unbind_wallet, /whoami_web3, /credits, /pay_status, /audit_status
 * - Hooks:     llm_input, llm_output, after_tool_call, session_end (audit trail)
 *              before_tool_call (billing guard)
 * - Gateway:   web3.siwe.challenge, web3.siwe.verify, web3.audit.query, web3.billing.status
 * - Service:   background anchor retry & archive flush
 */

import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
  OpenClawPluginDefinition,
} from "openclaw/plugin-sdk";
import { registerPluginHttpRoute } from "openclaw/plugin-sdk";
import { createAuditHooks, flushPendingAnchors, flushPendingArchives } from "./audit/hooks.js";
import { createCreditsCommand, createPayStatusCommand } from "./billing/commands.js";
import {
  createBillingGuard,
  createBillingLlmUsageHook,
  resolveSessionHash,
} from "./billing/guard.js";
import { flushPendingSettlements } from "./billing/settlement.js";
import { resolveBrainModelOverride } from "./brain/resolve.js";
import { createWeb3StreamFn } from "./brain/stream.js";
import {
  createCapabilitiesDescribeHandler,
  createCapabilitiesListHandler,
} from "./capabilities/handlers.js";
import { resolveConfig } from "./config.js";
import { createWeb3DashboardCommand } from "./dashboard/command.js";
import {
  createDisputeGetHandler,
  createDisputeListHandler,
  createDisputeOpenHandler,
  createDisputeRejectHandler,
  createDisputeResolveHandler,
  createDisputeSubmitEvidenceHandler,
} from "./disputes/handlers.js";
import { formatWeb3GatewayErrorResponse } from "./errors.js";
import {
  createBindWalletCommand,
  createUnbindWalletCommand,
  createWhoamiCommand,
} from "./identity/commands.js";
import { createEnsResolveHandler, createEnsReverseHandler } from "./identity/ens.js";
import { createSiweChallengeHandler, createSiweVerifyHandler } from "./identity/gateway.js";
import { createBrowserIngestHandler } from "./ingest/browser-handler.js";
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
  createMarketResourcePublishHandler,
  createMarketResourceUnpublishHandler,
  createMarketStatusSummaryHandler,
  createMarketDisputeGetHandler,
  createMarketDisputeListHandler,
  createMarketDisputeOpenHandler,
  createMarketDisputeSubmitEvidenceHandler,
  createMarketDisputeResolveHandler,
  createMarketDisputeRejectHandler,
} from "./market/handlers.js";
import { createWeb3MarketCommand } from "./market/web3-market-command.js";
import { createWeb3MarketStatusTool } from "./market/web3-market-status-tool.js";
import {
  createWeb3MetricsSnapshotHandler,
  createWeb3MonitorSnapshotHandler,
} from "./metrics/metrics.js";
import {
  createAlertsCommand,
  createAlertAcknowledgeCommand,
  createAlertResolveCommand,
  createHealthCommand,
} from "./monitor/commands.js";
import {
  createAlertsListHandler,
  createAlertGetHandler,
  createAlertAcknowledgeHandler,
  createAlertResolveHandler,
  createMonitorMetricsHandler,
  createHealthCheckHandler,
} from "./monitor/handlers.js";
import {
  createResourceModelChatHandler,
  createResourceSearchQueryHandler,
  createResourceStorageGetHandler,
  createResourceStorageListHandler,
  createResourceStoragePutHandler,
} from "./resources/http.js";
import {
  createResourceIndexGossipHandler,
  createResourceIndexHeartbeatHandler,
  createResourceIndexListHandler,
  createResourceIndexPeersListHandler,
  createResourceIndexReportHandler,
  createResourceIndexStatsHandler,
} from "./resources/indexer.js";
import { getConsumerLeaseAccess } from "./resources/leases.js";
import {
  createWeb3MarketIndexListTool,
  createWeb3MarketLedgerListTool,
  createWeb3MarketLedgerSummaryTool,
  createWeb3MarketLeaseTool,
  createWeb3MarketPublishTool,
  createWeb3MarketRevokeLeaseTool,
  createWeb3MarketUnpublishTool,
} from "./resources/market-tools.js";
import {
  createResourceLeaseHandler,
  createResourceListHandler,
  createResourcePublishHandler,
  createResourceRevokeLeaseHandler,
  createResourceStatusHandler,
  createResourceUnpublishHandler,
} from "./resources/registry.js";
import {
  createWeb3SearchTool,
  createWeb3StorageGetTool,
  createWeb3StorageListTool,
  createWeb3StoragePutTool,
} from "./resources/tools.js";
import {
  createWeb3RewardClaimHandler,
  createWeb3RewardGetHandler,
  createWeb3RewardListHandler,
  createWeb3RewardUpdateStatusHandler,
} from "./rewards/handlers.js";
import { Web3StateStore } from "./state/store.js";
import { createWeb3StatusSummaryHandler } from "./status/summary-handler.js";

const plugin: OpenClawPluginDefinition = {
  id: "web3-core",
  name: "Web3 Core",
  description:
    "Decentralized storage, wallet identity, audit anchoring, billing & marketplace for OpenClaw",
  version: "2026.2.16",

  register(api) {
    const config = resolveConfig(api.pluginConfig);
    const stateDir = api.runtime.state.resolveStateDir();
    const store = new Web3StateStore(stateDir);

    // ---- Commands ----
    api.registerCommand({
      name: "bind_wallet",
      description: "Bind an EVM wallet address to your identity",
      acceptsArgs: true,
      handler: createBindWalletCommand(store, config),
    });
    api.registerCommand({
      name: "unbind_wallet",
      description: "Remove a bound wallet address",
      acceptsArgs: true,
      handler: createUnbindWalletCommand(store),
    });
    api.registerCommand({
      name: "whoami_web3",
      description: "Show your bound wallets and Web3 identity",
      handler: createWhoamiCommand(store),
    });
    api.registerCommand({
      name: "credits",
      description: "Check your usage credits and quota",
      handler: createCreditsCommand(store, config),
    });
    api.registerCommand({
      name: "pay_status",
      description: "Check payment and billing status",
      handler: createPayStatusCommand(store, {
        stateDir,
        config,
        marketConfig: api.config.plugins?.entries?.["market-core"]?.config as
          | Record<string, unknown>
          | undefined,
      }),
    });
    api.registerCommand({
      name: "audit_status",
      description: "Show recent audit anchoring events",
      handler: createAuditStatusCommand(store),
    });
    api.registerCommand({
      name: "alerts",
      description: "Show recent alerts and monitoring status",
      handler: createAlertsCommand(store, config),
    });
    api.registerCommand({
      name: "alert_ack",
      description: "Acknowledge an alert by ID",
      acceptsArgs: true,
      handler: createAlertAcknowledgeCommand(store, config),
    });
    api.registerCommand({
      name: "alert_resolve",
      description: "Resolve an alert by ID with optional note",
      acceptsArgs: true,
      handler: createAlertResolveCommand(store, config),
    });
    api.registerCommand({
      name: "health",
      description: "Check Web3 service health status",
      handler: createHealthCommand(store, config),
    });

    api.registerCommand({
      name: "web3",
      description: "One-page Web3 dashboard: identity, billing, audit, market",
      handler: createWeb3DashboardCommand(store, config),
    });

    api.registerCommand({
      name: "web3-market",
      description: "Show Web3 Market status or print enable steps",
      acceptsArgs: true,
      handler: createWeb3MarketCommand(config),
    });

    // ---- Hooks: Brain selection ----
    const brainStreamFn = createWeb3StreamFn(config);
    api.on("before_model_resolve", () => resolveBrainModelOverride(config), { priority: 10 });
    api.on(
      "resolve_stream_fn",
      (event) => {
        if (!brainStreamFn) return;
        if (event.provider !== config.brain.providerId) return;
        if (config.resources.enabled && config.resources.consumer.enabled) {
          const lease = getConsumerLeaseAccess(event.modelId);
          if (!lease) return;
        }
        return { streamFn: brainStreamFn };
      },
      { priority: 10 },
    );

    // ---- Hooks: Audit trail ----
    const auditHooks = createAuditHooks(store, config);
    api.on("llm_input", auditHooks.onLlmInput);
    api.on("llm_output", auditHooks.onLlmOutput);
    api.on("after_tool_call", auditHooks.onAfterToolCall);
    api.on("session_end", auditHooks.onSessionEnd);

    // ---- Hooks: Billing guard ----
    if (config.billing.enabled) {
      api.on("before_tool_call", createBillingGuard(store, config));
      api.on("llm_output", createBillingLlmUsageHook(store, config));
    }

    // ---- Gateway methods ----
    api.registerGatewayMethod("web3.capabilities.list", createCapabilitiesListHandler(config));
    api.registerGatewayMethod(
      "web3.capabilities.describe",
      createCapabilitiesDescribeHandler(config),
    );
    api.registerGatewayMethod("web3.siwe.challenge", createSiweChallengeHandler(store, config));
    api.registerGatewayMethod("web3.siwe.verify", createSiweVerifyHandler(store, config));
    api.registerGatewayMethod("web3.identity.resolveEns", createEnsResolveHandler(store, config));
    api.registerGatewayMethod("web3.identity.reverseEns", createEnsReverseHandler(store, config));
    api.registerGatewayMethod("web3.audit.query", createAuditQueryHandler(store));
    api.registerGatewayMethod("web3.billing.status", createBillingStatusHandler(store, config));
    api.registerGatewayMethod("web3.billing.summary", createBillingSummaryHandler(store, config));
    api.registerGatewayMethod("web3.status.summary", createWeb3StatusSummaryHandler(store, config));

    api.registerGatewayMethod("web3.reward.get", createWeb3RewardGetHandler(config));
    api.registerGatewayMethod("web3.reward.list", createWeb3RewardListHandler(config));
    api.registerGatewayMethod("web3.reward.claim", createWeb3RewardClaimHandler(config));
    api.registerGatewayMethod(
      "web3.reward.updateStatus",
      createWeb3RewardUpdateStatusHandler(config),
    );

    api.registerGatewayMethod("web3.resources.publish", createResourcePublishHandler(config));
    api.registerGatewayMethod("web3.resources.unpublish", createResourceUnpublishHandler(config));
    api.registerGatewayMethod("web3.resources.list", createResourceListHandler(config));
    api.registerGatewayMethod("web3.resources.lease", createResourceLeaseHandler(config));
    api.registerGatewayMethod(
      "web3.resources.revokeLease",
      createResourceRevokeLeaseHandler(config),
    );
    api.registerGatewayMethod("web3.resources.status", createResourceStatusHandler(config));

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
    api.registerGatewayMethod("web3.market.lease.issue", createMarketLeaseIssueHandler(config));
    api.registerGatewayMethod("web3.market.lease.revoke", createMarketLeaseRevokeHandler(config));
    api.registerGatewayMethod("web3.market.lease.get", createMarketLeaseGetHandler(config));
    api.registerGatewayMethod("web3.market.lease.list", createMarketLeaseListHandler(config));
    api.registerGatewayMethod(
      "web3.market.lease.expireSweep",
      createMarketLeaseExpireSweepHandler(config),
    );
    api.registerGatewayMethod("web3.market.ledger.list", createMarketLedgerListHandler(config));
    api.registerGatewayMethod(
      "web3.market.ledger.summary",
      createMarketLedgerSummaryHandler(config),
    );
    api.registerGatewayMethod(
      "web3.market.reputation.summary",
      createMarketReputationSummaryHandler(config),
    );
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
    api.registerGatewayMethod("web3.market.bridge.routes", createMarketBridgeRoutesHandler(config));
    api.registerGatewayMethod(
      "web3.market.bridge.request",
      createMarketBridgeRequestHandler(config),
    );
    api.registerGatewayMethod("web3.market.bridge.update", createMarketBridgeUpdateHandler(config));
    api.registerGatewayMethod("web3.market.bridge.status", createMarketBridgeStatusHandler(config));
    api.registerGatewayMethod("web3.market.bridge.list", createMarketBridgeListHandler(config));
    api.registerGatewayMethod(
      "web3.market.metrics.snapshot",
      createMarketMetricsSnapshotHandler(config),
    );
    api.registerGatewayMethod(
      "web3.market.reconciliation.summary",
      createMarketReconciliationSummaryHandler(store, config),
    );
    api.registerGatewayMethod(
      "web3.market.status.summary",
      createMarketStatusSummaryHandler(config),
    );
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
    api.registerGatewayMethod(
      "web3.market.dispute.reject",
      createMarketDisputeRejectHandler(config),
    );
    api.registerGatewayMethod("web3.dispute.open", createMarketDisputeOpenHandler(config));
    api.registerGatewayMethod(
      "web3.dispute.submitEvidence",
      createMarketDisputeSubmitEvidenceHandler(config),
    );
    api.registerGatewayMethod("web3.dispute.resolve", createMarketDisputeResolveHandler(config));
    api.registerGatewayMethod("web3.dispute.reject", createMarketDisputeRejectHandler(config));
    api.registerGatewayMethod("web3.dispute.get", createMarketDisputeGetHandler(config));
    api.registerGatewayMethod("web3.dispute.list", createMarketDisputeListHandler(config));

    api.registerGatewayMethod("web3.index.report", createResourceIndexReportHandler(store, config));
    api.registerGatewayMethod("web3.index.list", createResourceIndexListHandler(store, config));
    api.registerGatewayMethod("web3.index.gossip", createResourceIndexGossipHandler(store, config));
    api.registerGatewayMethod(
      "web3.index.peers.list",
      createResourceIndexPeersListHandler(store, config),
    );
    api.registerGatewayMethod(
      "web3.index.heartbeat",
      createResourceIndexHeartbeatHandler(store, config),
    );
    api.registerGatewayMethod("web3.index.stats", createResourceIndexStatsHandler(store, config));

    api.registerGatewayMethod(
      "web3.metrics.snapshot",
      createWeb3MetricsSnapshotHandler(store, config),
    );
    api.registerGatewayMethod(
      "web3.monitor.snapshot",
      createWeb3MonitorSnapshotHandler(store, config),
    );
    api.registerGatewayMethod("web3.monitor.alerts.list", createAlertsListHandler(store, config));
    api.registerGatewayMethod("web3.monitor.alerts.get", createAlertGetHandler(store, config));
    api.registerGatewayMethod(
      "web3.monitor.alerts.acknowledge",
      createAlertAcknowledgeHandler(store, config),
    );
    api.registerGatewayMethod(
      "web3.monitor.alerts.resolve",
      createAlertResolveHandler(store, config),
    );
    api.registerGatewayMethod("web3.monitor.metrics", createMonitorMetricsHandler(store, config));
    api.registerGatewayMethod("web3.monitor.health", createHealthCheckHandler(store, config));

    const web3SearchTool = createWeb3SearchTool(config);
    if (web3SearchTool) {
      api.registerTool(web3SearchTool);
    }
    const web3StoragePutTool = createWeb3StoragePutTool(config);
    if (web3StoragePutTool) {
      api.registerTool(web3StoragePutTool);
    }
    const web3StorageGetTool = createWeb3StorageGetTool(config);
    if (web3StorageGetTool) {
      api.registerTool(web3StorageGetTool);
    }
    const web3StorageListTool = createWeb3StorageListTool(config);
    if (web3StorageListTool) {
      api.registerTool(web3StorageListTool);
    }

    api.registerTool(createWeb3MarketStatusTool(config));

    // Web3 Market orchestration tools (redacted by default).
    for (const tool of [
      createWeb3MarketIndexListTool(config),
      createWeb3MarketLeaseTool(config),
      createWeb3MarketRevokeLeaseTool(config),
      createWeb3MarketPublishTool(config),
      createWeb3MarketUnpublishTool(config),
      createWeb3MarketLedgerSummaryTool(config),
      createWeb3MarketLedgerListTool(config),
    ]) {
      if (tool) {
        api.registerTool(tool);
      }
    }

    // ---- Browser ingest HTTP route ----
    if (config.browserIngest.enabled) {
      registerPluginHttpRoute({
        path: config.browserIngest.ingestPath,
        pluginId: plugin.id,
        source: "web3-browser-ingest",
        handler: createBrowserIngestHandler(store, config),
      });
      api.logger.info(`Web3 browser ingest enabled at ${config.browserIngest.ingestPath}`);
    }

    // ---- Resource provider HTTP routes ----
    if (config.resources.enabled && config.resources.provider.listen.enabled) {
      const modelHandler = createResourceModelChatHandler(config);
      const searchHandler = createResourceSearchQueryHandler(config);
      const storagePutHandler = createResourceStoragePutHandler(config);
      const storageGetHandler = createResourceStorageGetHandler(config);
      const storageListHandler = createResourceStorageListHandler(config);
      registerPluginHttpRoute({
        path: "/web3/resources/model/chat",
        pluginId: plugin.id,
        source: "web3-resources-model",
        handler: modelHandler,
      });
      registerPluginHttpRoute({
        path: "/v1/chat/completions",
        pluginId: plugin.id,
        source: "web3-resources-model",
        handler: modelHandler,
      });
      registerPluginHttpRoute({
        path: "/web3/resources/search/query",
        pluginId: plugin.id,
        source: "web3-resources-search",
        handler: searchHandler,
      });
      registerPluginHttpRoute({
        path: "/web3/resources/storage/put",
        pluginId: plugin.id,
        source: "web3-resources-storage",
        handler: storagePutHandler,
      });
      registerPluginHttpRoute({
        path: "/web3/resources/storage/get",
        pluginId: plugin.id,
        source: "web3-resources-storage",
        handler: storageGetHandler,
      });
      registerPluginHttpRoute({
        path: "/web3/resources/storage/list",
        pluginId: plugin.id,
        source: "web3-resources-storage",
        handler: storageListHandler,
      });
      api.logger.info("Web3 resource provider routes enabled");
    }

    // ---- Background service: anchor retry & archive flush ----
    api.registerService({
      id: "web3-anchor-service",
      async start(ctx) {
        ctx.logger.info("Web3 anchor service started");
        // Retry pending archives + anchors periodically
        const interval = setInterval(async () => {
          try {
            await flushPendingArchives(store, config);
          } catch (err) {
            ctx.logger.warn(`Archive flush error: ${err}`);
          }

          try {
            await flushPendingAnchors(store, config);
          } catch (err) {
            ctx.logger.warn(`Anchor retry error: ${err}`);
          }

          try {
            await flushPendingSettlements(store, config);
          } catch (err) {
            ctx.logger.warn(`Settlement retry error: ${err}`);
          }
        }, 60_000); // every 60s

        // Store interval handle for cleanup (attached to ctx for stop())
        (ctx as any)._anchorInterval = interval;
      },
      stop(ctx) {
        const interval = (ctx as any)._anchorInterval;
        if (interval) clearInterval(interval);
        ctx.logger.info("Web3 anchor service stopped");
      },
    });

    api.logger.info("Web3 Core plugin registered");
  },
};

// ---- Gateway handler helpers ----

function createAuditQueryHandler(store: Web3StateStore): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    const { limit } = (params ?? {}) as { limit?: number };
    const events = store.readAuditEvents(limit ?? 50);
    respond(true, { events, count: events.length });
  };
}

function createBillingStatusHandler(
  store: Web3StateStore,
  config: import("./config.js").Web3PluginConfig,
): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    const { sessionIdHash } = (params ?? {}) as { sessionIdHash?: string };
    if (!sessionIdHash) {
      respond(false, formatWeb3GatewayErrorResponse("sessionIdHash is required"));
      return;
    }
    const usage = store.getUsage(sessionIdHash);
    respond(true, {
      enabled: config.billing.enabled,
      sessionIdHash,
      usage: usage ?? null,
    });
  };
}

function createBillingSummaryHandler(
  store: Web3StateStore,
  config: import("./config.js").Web3PluginConfig,
): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    const input = (params ?? {}) as {
      sessionKey?: string;
      sessionId?: string;
      senderId?: string;
      sessionIdHash?: string;
    };
    const resolvedHash = input.sessionIdHash ?? resolveSessionHash(input);
    const usage = store.getUsage(resolvedHash);
    respond(true, {
      enabled: config.billing.enabled,
      sessionIdHash: resolvedHash,
      usage: usage ?? null,
    });
  };
}

function createAuditStatusCommand(store: Web3StateStore) {
  return async () => {
    const events = store.readAuditEvents(10);
    if (events.length === 0) return { text: "No audit events recorded yet." };
    const lines = events.map(
      (e) => `[${e.timestamp}] ${e.kind} seq=${e.seq} hash=${e.payloadHash.slice(0, 12)}...`,
    );
    return { text: `Recent audit events:\n${lines.join("\n")}` };
  };
}

export default plugin;
