import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import type { MarketLedgerFilter, MarketResourceKind } from "../resources.js";
import type { Settlement } from "../types.js";
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
import { releaseSettlementIncremental } from "./settlement.js";

function parseIntString(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`E_INVALID_ARGUMENT: ${field} must be integer string`);
  }
  return BigInt(value);
}

export function createLedgerAppendHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
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
      // maxCost check + append must be atomic to prevent TOCTOU races
      await store.runInTransaction(() => {
        if (lease.maxCost) {
          const maxCost = parseIntString(lease.maxCost, "lease.maxCost");
          const currentCost = parseIntString(
            store.summarizeLedger({ leaseId }).totalCost,
            "ledger.totalCost",
          );
          const appendCost = parseIntString(cost, "entry.cost");
          if (currentCost + appendCost > maxCost) {
            throw new Error("E_QUOTA_EXCEEDED: lease maxCost exceeded");
          }
        }
        store.appendLedger(entry);
        recordAudit(store, "ledger_appended", entry.ledgerId, entryHash, actorId, {
          leaseId,
          resourceId,
          unit,
          quantity,
          cost,
          currency,
        });
      });

      let settlementRelease:
        | {
            settlementId: string;
            releasedAmount: string;
            remainingAmount: string;
            completed: boolean;
          }
        | undefined;
      let settlementReleaseError: string | undefined;
      let settlement: Settlement | undefined;

      try {
        settlement = store.getSettlementByOrder(lease.orderId);
        const strategy = settlement?.strategy ?? "one-shot";
        const releasedAmount = settlement?.releasedAmount ?? "0";

        if (settlement && settlement.status === "settlement_locked" && strategy === "metered") {
          const entryCost = parseIntString(cost, "entry.cost");
          const totalAmount = parseIntString(settlement.amount, "settlement.amount");
          const alreadyReleased = parseIntString(releasedAmount, "settlement.releasedAmount");
          const remaining = totalAmount - alreadyReleased;
          if (entryCost > 0n && remaining > 0n) {
            const amountToRelease = entryCost > remaining ? remaining : entryCost;
            const releaseResult = await releaseSettlementIncremental({
              store,
              config,
              orderId: lease.orderId,
              actorId,
              releaseAmount: amountToRelease.toString(),
              payees: [{ address: lease.providerActorId, amount: amountToRelease.toString() }],
            });
            settlementRelease = {
              settlementId: releaseResult.settlementId,
              releasedAmount: releaseResult.releasedAmount,
              remainingAmount: releaseResult.remainingAmount,
              completed: releaseResult.completed,
            };
          }
        }
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err);
        settlementReleaseError = rawMsg.startsWith("E_")
          ? rawMsg
          : "E_SETTLEMENT_RELEASE_FAILED: settlement release failed";
        if (settlement && settlement.strategy === "metered") {
          const downgraded: Settlement = { ...settlement, strategy: "one-shot" };
          store.saveSettlement(downgraded);
          settlementReleaseError = `${settlementReleaseError}; downgraded to one-shot`;
        }
      }

      respond(true, {
        ledgerId: entry.ledgerId,
        entryHash,
        settlementRelease,
        settlementReleaseError,
      });
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
