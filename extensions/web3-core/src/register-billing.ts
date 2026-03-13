/**
 * Billing, Audit & Capabilities domain registration.
 *
 * Commands: credits, pay_status, audit_status
 * Hooks:    audit trail (llm_input/output, after_tool_call, session_end),
 *           billing guard (before_tool_call, llm_output)
 * Gateway:  web3.capabilities.*, web3.audit.*, web3.billing.*, web3.status.summary,
 *           web3.reward.*
 */

import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import { createAuditHooks } from "./audit/hooks.js";
import { createCreditsCommand, createPayStatusCommand } from "./billing/commands.js";
import {
  createBillingGuard,
  createBillingLlmUsageHook,
  resolveSessionHash,
} from "./billing/guard.js";
import {
  createBillingConsumePaymentRequiredHandler,
  createBillingHandlePaymentRequiredHandler,
} from "./billing/payment-required.js";
import { createBillingPaymentTraceQueryHandler } from "./billing/payment-trace.js";
import {
  createCapabilitiesDescribeHandler,
  createCapabilitiesListHandler,
} from "./capabilities/handlers.js";
import type { Web3PluginConfig } from "./config.js";
import { formatWeb3GatewayErrorResponse } from "./errors.js";
import type { RegistrationContext } from "./register-types.js";
import {
  createWeb3RewardClaimHandler,
  createWeb3RewardGetHandler,
  createWeb3RewardListHandler,
  createWeb3RewardUpdateStatusHandler,
} from "./rewards/handlers.js";
import type { Web3StateStore } from "./state/store.js";
import { createWeb3StatusSummaryHandler } from "./status/summary-handler.js";

export function registerBilling({ api, store, config, stateDir }: RegistrationContext): void {
  // ── Commands ──
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

  // ── Hooks: Audit trail ──
  const auditHooks = createAuditHooks(store, config);
  api.on("llm_input", auditHooks.onLlmInput);
  api.on("llm_output", auditHooks.onLlmOutput);
  api.on("after_tool_call", auditHooks.onAfterToolCall);
  api.on("session_end", auditHooks.onSessionEnd);

  // ── Hooks: Billing guard ──
  if (config.billing.enabled) {
    api.on("before_tool_call", createBillingGuard(store, config));
    api.on("llm_output", createBillingLlmUsageHook(store, config));
  }

  // ── Gateway: Capabilities ──
  api.registerGatewayMethod("web3.capabilities.list", createCapabilitiesListHandler(config));
  api.registerGatewayMethod(
    "web3.capabilities.describe",
    createCapabilitiesDescribeHandler(config),
  );

  // ── Gateway: Audit ──
  api.registerGatewayMethod("web3.audit.query", createAuditQueryHandler(store));

  // ── Gateway: Billing ──
  api.registerGatewayMethod("web3.billing.status", createBillingStatusHandler(store, config));
  api.registerGatewayMethod("web3.billing.summary", createBillingSummaryHandler(store, config));
  api.registerGatewayMethod(
    "web3.billing.paymentTrace.query",
    createBillingPaymentTraceQueryHandler(store),
  );
  api.registerGatewayMethod(
    "web3.billing.handlePaymentRequired",
    createBillingHandlePaymentRequiredHandler(store, config),
  );
  api.registerGatewayMethod(
    "web3.billing.consumePaymentRequired",
    createBillingConsumePaymentRequiredHandler(store),
  );

  // ── Gateway: Status ──
  api.registerGatewayMethod("web3.status.summary", createWeb3StatusSummaryHandler(store, config));

  // ── Gateway: Rewards ──
  api.registerGatewayMethod("web3.reward.get", createWeb3RewardGetHandler(config));
  api.registerGatewayMethod("web3.reward.list", createWeb3RewardListHandler(config));
  api.registerGatewayMethod("web3.reward.claim", createWeb3RewardClaimHandler(config));
  api.registerGatewayMethod(
    "web3.reward.updateStatus",
    createWeb3RewardUpdateStatusHandler(config),
  );
}

// ── Local handler factories (previously inlined in index.ts) ──

function createAuditQueryHandler(store: Web3StateStore): GatewayRequestHandler {
  return ({ params, respond }: GatewayRequestHandlerOptions) => {
    const { limit } = (params ?? {}) as { limit?: number };
    const events = store.readAuditEvents(limit ?? 50);
    respond(true, { events, count: events.length });
  };
}

function createBillingStatusHandler(
  store: Web3StateStore,
  config: Web3PluginConfig,
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
  config: Web3PluginConfig,
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
