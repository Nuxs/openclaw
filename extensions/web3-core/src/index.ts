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
import { hashString } from "./audit/canonicalize.js";
import { createAuditHooks } from "./audit/hooks.js";
import { createCreditsCommand, createPayStatusCommand } from "./billing/commands.js";
import { createBillingGuard, createBillingLlmUsageHook } from "./billing/guard.js";
import { resolveConfig } from "./config.js";
import {
  createBindWalletCommand,
  createUnbindWalletCommand,
  createWhoamiCommand,
} from "./identity/commands.js";
import { createSiweChallengeHandler, createSiweVerifyHandler } from "./identity/gateway.js";
import { Web3StateStore } from "./state/store.js";

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
      handler: createBindWalletCommand(store),
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
      handler: createCreditsCommand(store),
    });
    api.registerCommand({
      name: "pay_status",
      description: "Check payment and billing status",
      handler: createPayStatusCommand(store),
    });
    api.registerCommand({
      name: "audit_status",
      description: "Show recent audit anchoring events",
      handler: createAuditStatusCommand(store),
    });

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
    api.registerGatewayMethod("web3.siwe.challenge", createSiweChallengeHandler(store, config));
    api.registerGatewayMethod("web3.siwe.verify", createSiweVerifyHandler(store, config));
    api.registerGatewayMethod("web3.audit.query", createAuditQueryHandler(store));
    api.registerGatewayMethod("web3.billing.status", createBillingStatusHandler(store, config));
    api.registerGatewayMethod("web3.billing.summary", createBillingSummaryHandler(store, config));
    api.registerGatewayMethod("web3.status.summary", createWeb3StatusSummaryHandler(store, config));

    // ---- Background service: anchor retry & archive flush ----
    api.registerService({
      id: "web3-anchor-service",
      async start(ctx) {
        ctx.logger.info("Web3 anchor service started");
        // Retry pending anchors periodically
        const interval = setInterval(async () => {
          const pending = store.getPendingTxs();
          if (pending.length === 0) return;

          if (!config.chain.privateKey) return;

          try {
            const { EvmChainAdapter } = await import("./chain/evm/adapter.js");
            const chain = new EvmChainAdapter(config.chain);
            for (const tx of pending) {
              try {
                const result = await chain.anchorHash({
                  anchorId: tx.anchorId,
                  payloadHash: tx.payloadHash,
                });
                ctx.logger.info(`Anchored ${tx.anchorId} → tx ${result.tx}`);
              } catch (err) {
                ctx.logger.warn(`Anchor retry failed for ${tx.anchorId}: ${err}`);
              }
            }
            // Clear successful ones (simplified: clear all; real impl tracks per-item)
            store.savePendingTxs([]);
          } catch (err) {
            ctx.logger.warn(`Anchor service error: ${err}`);
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
      respond(false, { error: "sessionIdHash is required" });
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
    const resolvedHash =
      input.sessionIdHash ??
      hashString(input.sessionKey ?? input.sessionId ?? input.senderId ?? "unknown");
    const usage = store.getUsage(resolvedHash);
    respond(true, {
      enabled: config.billing.enabled,
      sessionIdHash: resolvedHash,
      usage: usage ?? null,
    });
  };
}

function createWeb3StatusSummaryHandler(
  store: Web3StateStore,
  config: import("./config.js").Web3PluginConfig,
): GatewayRequestHandler {
  return ({ respond }: GatewayRequestHandlerOptions) => {
    const events = store.readAuditEvents(50);
    const pending = store.getPendingTxs();
    const lastEvent = events.at(-1);
    const lastArchived = [...events]
      .reverse()
      .find((event) => event.archivePointer?.cid || event.archivePointer?.uri);
    const lastAnchored = [...events].reverse().find((event) => event.chainRef?.tx);
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    const recentCount = events.filter((event) => {
      const ts = Date.parse(event.timestamp);
      return !Number.isNaN(ts) && ts >= cutoffMs;
    }).length;

    respond(true, {
      auditEventsRecent: recentCount,
      auditLastAt: lastEvent?.timestamp ?? null,
      archiveProvider: config.storage.provider ?? null,
      archiveLastCid:
        lastArchived?.archivePointer?.cid ?? lastArchived?.archivePointer?.uri ?? null,
      anchorNetwork: config.chain.network ?? null,
      anchorLastTx: lastAnchored?.chainRef?.tx ?? null,
      pendingAnchors: pending.length,
      anchoringEnabled: Boolean(config.chain.privateKey),
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
