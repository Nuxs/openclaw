/**
 * Resources, Index, Discovery & Brain domain registration.
 *
 * Commands: web3 (dashboard)
 * Hooks:    before_model_resolve, resolve_stream_fn (brain selection)
 * Gateway:  web3.resources.*, web3.index.*
 * Tools:    web3 search/storage
 * HTTP:     resource provider routes
 * Service:  web3-discovery-service
 */

import { registerPluginHttpRoute } from "openclaw/plugin-sdk/http-route";
import { resolveBrainModelOverride } from "./brain/resolve.js";
import { createWeb3StreamFn } from "./brain/stream.js";
import { createWeb3DashboardCommand } from "./dashboard/command.js";
import { createDiscoveryBackend } from "./discovery/factory.js";
import { ingestDiscoveryRecords } from "./discovery/ingest.js";
import { buildSignedDiscoveryRecord } from "./discovery/publish-record.js";
import type { DiscoveryBackend, DiscoveryRecord } from "./discovery/types.js";
import { createBrowserIngestHandler } from "./ingest/browser-handler.js";
import type { RegistrationContext } from "./register-types.js";
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
import { type ResourceIndexEntry, Web3StateStore } from "./state/store.js";

export function registerResources(ctx: RegistrationContext): void {
  const { api, store, config, pluginId } = ctx;

  // ── Command: Dashboard ──
  api.registerCommand({
    name: "web3",
    description: "One-page Web3 dashboard: identity, billing, audit, market",
    handler: createWeb3DashboardCommand(store, config),
  });

  // ── Hooks: Brain selection ──
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

  // ── Gateway: Resources ──
  api.registerGatewayMethod("web3.resources.publish", createResourcePublishHandler(config));
  api.registerGatewayMethod("web3.resources.unpublish", createResourceUnpublishHandler(config));
  api.registerGatewayMethod("web3.resources.list", createResourceListHandler(config));
  api.registerGatewayMethod("web3.resources.lease", createResourceLeaseHandler(config));
  api.registerGatewayMethod("web3.resources.revokeLease", createResourceRevokeLeaseHandler(config));
  api.registerGatewayMethod("web3.resources.status", createResourceStatusHandler(config));

  // ── Gateway: Index (with discovery callback) ──
  // discoveryBackend is set later by the discovery service; use a ref object
  // so the report callback captures the latest value.
  const discoveryRef: { backend?: DiscoveryBackend } = {};

  api.registerGatewayMethod(
    "web3.index.report",
    createResourceIndexReportHandler(store, config, {
      onReportAccepted: async (entry) => {
        if (!config.discovery.enabled) return;
        if (!discoveryRef.backend) return;
        const record = toDiscoveryRecord(entry, discoveryRef.backend, store.getIndexSigningKey());
        await discoveryRef.backend.publish(record);
      },
    }),
  );
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

  // ── Tools: Search & Storage ──
  for (const toolFn of [
    createWeb3SearchTool,
    createWeb3StoragePutTool,
    createWeb3StorageGetTool,
    createWeb3StorageListTool,
  ]) {
    const tool = toolFn(config);
    if (tool) api.registerTool(tool);
  }

  // ── Browser ingest HTTP route ──
  if (config.browserIngest.enabled) {
    registerPluginHttpRoute({
      path: config.browserIngest.ingestPath,
      pluginId,
      source: "web3-browser-ingest",
      auth: "plugin",
      handler: createBrowserIngestHandler(store, config),
    });
    api.logger.info(`Web3 browser ingest enabled at ${config.browserIngest.ingestPath}`);
  }

  // ── Resource provider HTTP routes ──
  if (config.resources.enabled && config.resources.provider.listen.enabled) {
    const modelHandler = createResourceModelChatHandler(config);
    const searchHandler = createResourceSearchQueryHandler(config);
    const storagePutHandler = createResourceStoragePutHandler(config);
    const storageGetHandler = createResourceStorageGetHandler(config);
    const storageListHandler = createResourceStorageListHandler(config);

    // Keep contract-facing routes explicit so governance inventory can statically
    // verify the exported HTTP surface after thin-entry refactors.
    registerPluginHttpRoute({
      path: "/web3/resources/model/chat",
      pluginId,
      source: "web3-resources-model",
      auth: "plugin",
      handler: modelHandler,
    });
    registerPluginHttpRoute({
      path: "/v1/chat/completions",
      pluginId,
      source: "web3-resources-model",
      auth: "plugin",
      handler: modelHandler,
    });
    registerPluginHttpRoute({
      path: "/web3/resources/search/query",
      pluginId,
      source: "web3-resources-search",
      auth: "plugin",
      handler: searchHandler,
    });
    registerPluginHttpRoute({
      path: "/web3/resources/storage/put",
      pluginId,
      source: "web3-resources-storage",
      auth: "plugin",
      handler: storagePutHandler,
    });
    registerPluginHttpRoute({
      path: "/web3/resources/storage/get",
      pluginId,
      source: "web3-resources-storage",
      auth: "plugin",
      handler: storageGetHandler,
    });
    registerPluginHttpRoute({
      path: "/web3/resources/storage/list",
      pluginId,
      source: "web3-resources-storage",
      auth: "plugin",
      handler: storageListHandler,
    });
    api.logger.info("Web3 resource provider routes enabled");
  }

  // ── Background service: MDL discovery ──
  if (config.discovery.enabled) {
    api.registerService({
      id: "web3-discovery-service",
      async start(svcCtx) {
        svcCtx.logger.info("Web3 MDL discovery service starting...");

        const signingKey = store.getIndexSigningKey();
        let backend: DiscoveryBackend;
        try {
          backend = await createDiscoveryBackend({
            config: config.discovery,
            privateKeyDer: signingKey.privateKey,
            logger: (msg) => svcCtx.logger.info(msg),
          });
        } catch (err) {
          svcCtx.logger.warn(`MDL discovery backend init failed: ${err}`);
          return;
        }

        discoveryRef.backend = backend;
        (svcCtx as Record<string, unknown>)._discoveryBackend = backend;

        const intervalMs = Math.max(config.discovery.rendezvousIntervalMs, 10_000);
        const tick = async () => {
          try {
            const providerId = store.getProviderId();
            if (providerId) {
              const entries = store.getResourceIndex().filter((e) => e.providerId === providerId);
              for (const entry of entries) {
                await backend.publish(
                  toDiscoveryRecord(entry, backend, store.getIndexSigningKey()),
                );
              }
            }
          } catch (err) {
            svcCtx.logger.warn(`MDL publish error: ${err}`);
          }

          try {
            const records = await backend.discover({});
            if (records.length > 0) {
              const result = ingestDiscoveryRecords(records, store, {
                logger: (msg) => svcCtx.logger.warn(msg),
              });
              if (result.accepted > 0) {
                svcCtx.logger.info(
                  `MDL ingested ${result.accepted} records (${result.rejected} rejected)`,
                );
              }
            }
          } catch (err) {
            svcCtx.logger.warn(`MDL discover error: ${err}`);
          }
        };

        void tick();
        const interval = setInterval(tick, intervalMs);
        (svcCtx as Record<string, unknown>)._discoveryInterval = interval;
        svcCtx.logger.info(`Web3 MDL discovery service started (interval=${intervalMs}ms)`);
      },
      async stop(svcCtx) {
        const interval = (svcCtx as Record<string, unknown>)._discoveryInterval as
          | ReturnType<typeof setInterval>
          | undefined;
        if (interval) clearInterval(interval);
        const backend = (svcCtx as Record<string, unknown>)._discoveryBackend as
          | DiscoveryBackend
          | undefined;
        if (backend) await backend.stop();
        discoveryRef.backend = undefined;
        svcCtx.logger.info("Web3 MDL discovery service stopped");
      },
    });
  }
}

// ── Helpers ──

function toDiscoveryRecord(
  entry: ResourceIndexEntry,
  backend: DiscoveryBackend,
  signingKey: ReturnType<Web3StateStore["getIndexSigningKey"]>,
): DiscoveryRecord {
  const peerId =
    entry.peerId ??
    (
      backend as unknown as { node?: { peerId?: { toString(): string } } }
    ).node?.peerId?.toString() ??
    "";
  return buildSignedDiscoveryRecord({
    entry,
    peerId,
    reachability: entry.reachability ?? "unknown",
    signingKey,
  });
}
