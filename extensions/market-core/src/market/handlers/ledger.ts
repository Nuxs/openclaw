import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import type { MarketLedgerFilter, MarketResourceKind } from "../resources.js";
import {
  normalizeBuyerId,
  requireAddress,
  requireBigNumberishString,
  requireEnum,
  requireLimit,
  requireOptionalIsoTimestamp,
  requireString,
} from "../validators.js";
import {
  assertAccess,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAudit,
  requireOptionalAddress,
} from "./_shared.js";

export function createLedgerAppendHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = typeof input.actorId === "string" ? input.actorId.trim() : "";
      if (!actorId) {
        throw new Error("E_AUTH_REQUIRED: actorId is required");
      }
      const entryInput = (input.entry ?? {}) as Record<string, unknown>;
      const leaseId = requireString(entryInput.leaseId, "entry.leaseId");
      const resourceId = requireString(entryInput.resourceId, "entry.resourceId");
      const kind = requireEnum(entryInput, "kind", [
        "model",
        "search",
        "storage",
      ] as MarketResourceKind[]);
      const providerActorId = requireAddress(entryInput.providerActorId, "entry.providerActorId");
      const consumerActorId = requireAddress(entryInput.consumerActorId, "entry.consumerActorId");
      const unit = requireEnum(entryInput, "unit", ["token", "call", "query", "byte"]);
      const quantity = requireBigNumberishString(entryInput, "quantity", { allowZero: true });
      const cost = requireBigNumberishString(entryInput, "cost", { allowZero: true });
      const currency = requireString(entryInput.currency, "currency");
      const tokenAddress = requireOptionalAddress(entryInput, "tokenAddress");
      const sessionId = typeof entryInput.sessionId === "string" ? entryInput.sessionId : undefined;
      const runId = typeof entryInput.runId === "string" ? entryInput.runId : undefined;

      if (normalizeBuyerId(actorId) !== normalizeBuyerId(providerActorId)) {
        throw new Error("E_FORBIDDEN: actorId must match providerActorId");
      }

      const lease = store.getLease(leaseId);
      if (!lease) {
        throw new Error("E_NOT_FOUND: lease not found");
      }
      if (lease.status !== "lease_active") {
        throw new Error("E_REVOKED: lease not active");
      }
      if (Date.parse(lease.expiresAt) <= Date.now()) {
        throw new Error("E_EXPIRED: lease expired");
      }
      if (lease.resourceId !== resourceId || lease.kind !== kind) {
        throw new Error("E_CONFLICT: lease/resource mismatch");
      }
      if (
        normalizeBuyerId(lease.providerActorId) !== normalizeBuyerId(providerActorId) ||
        normalizeBuyerId(lease.consumerActorId) !== normalizeBuyerId(consumerActorId)
      ) {
        throw new Error("E_CONFLICT: lease actor mismatch");
      }

      const resource = store.getResource(resourceId);
      if (!resource || resource.status !== "resource_published") {
        throw new Error("E_CONFLICT: resource not published");
      }

      const timestamp = nowIso();
      const entryHash = hashCanonical({
        leaseId,
        resourceId,
        kind,
        providerActorId,
        consumerActorId,
        unit,
        quantity,
        cost,
        currency,
        tokenAddress,
        sessionId,
        runId,
        timestamp,
      });
      const entry = {
        ledgerId: randomUUID(),
        timestamp,
        leaseId,
        resourceId,
        kind,
        providerActorId,
        consumerActorId,
        unit,
        quantity,
        cost,
        currency,
        tokenAddress,
        sessionId,
        runId,
        entryHash,
      };
      store.appendLedger(entry);
      recordAudit(store, "ledger_appended", entry.ledgerId, entryHash, actorId, {
        leaseId,
        resourceId,
        unit,
        quantity,
        cost,
        currency,
      });
      respond(true, { ledgerId: entry.ledgerId, entryHash });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createLedgerListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const leaseId = typeof input.leaseId === "string" ? input.leaseId.trim() : undefined;
      const resourceId = typeof input.resourceId === "string" ? input.resourceId.trim() : undefined;
      const providerActorId = requireOptionalAddress(input, "providerActorId");
      const consumerActorId = requireOptionalAddress(input, "consumerActorId");
      const since = requireOptionalIsoTimestamp(input, "since");
      const until = requireOptionalIsoTimestamp(input, "until");
      if (since && until && Date.parse(since) > Date.parse(until)) {
        throw new Error("E_INVALID_ARGUMENT: since after until");
      }
      const limit = requireLimit(input, "limit", 200, 1000);
      const entries = store.listLedger({
        leaseId,
        resourceId,
        providerActorId,
        consumerActorId,
        since,
        until,
        limit,
      } as MarketLedgerFilter);
      respond(true, { entries });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createLedgerSummaryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const leaseId = typeof input.leaseId === "string" ? input.leaseId.trim() : undefined;
      const resourceId = typeof input.resourceId === "string" ? input.resourceId.trim() : undefined;
      const providerActorId = requireOptionalAddress(input, "providerActorId");
      const consumerActorId = requireOptionalAddress(input, "consumerActorId");
      const since = requireOptionalIsoTimestamp(input, "since");
      const until = requireOptionalIsoTimestamp(input, "until");
      if (since && until && Date.parse(since) > Date.parse(until)) {
        throw new Error("E_INVALID_ARGUMENT: since after until");
      }
      const summary = store.summarizeLedger({
        leaseId,
        resourceId,
        providerActorId,
        consumerActorId,
        since,
        until,
      } as MarketLedgerFilter);
      respond(true, { summary });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
