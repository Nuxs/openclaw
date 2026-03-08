import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { buildPrivacyReplaySummary, hashReplaySummary } from "../privacy-replay.js";
import type { Consent, PrivacyReplay } from "../types.js";
import { requireLimit, requireOptionalEnum, requireString } from "../validators.js";
import {
  assertAccess,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";

function listConsentAssets(store: MarketStateStore, consent: Consent) {
  const order = store.getOrder(consent.orderId);
  const task = order?.taskId ? store.getTask(order.taskId) : undefined;
  const offer = order ? store.getOffer(order.offerId) : undefined;
  return {
    consentId: consent.consentId,
    orderId: consent.orderId,
    taskId: task?.taskId,
    status: consent.status,
    assetId: offer?.assetId ?? `order:${consent.orderId}`,
    title: task?.title ?? offer?.assetMeta.title ?? offer?.assetId ?? consent.orderId,
    purpose: consent.scope.purpose,
    retentionUntil: consent.retentionUntil ?? consent.replayPolicy?.retainUntil ?? null,
    erasedAt: consent.erasedAt ?? null,
    revokedAt: consent.revokedAt ?? null,
  };
}

export function createConsentListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const limit = requireLimit(input, "limit", 50, 200);
      const status = requireOptionalEnum(input, "status", [
        "consent_granted",
        "consent_revoked",
      ] as const);
      const entries = store
        .listConsents()
        .filter((consent) => {
          if (typeof input.orderId === "string" && consent.orderId !== input.orderId) return false;
          if (typeof input.consentId === "string" && consent.consentId !== input.consentId)
            return false;
          if (status && consent.status !== status) return false;
          return true;
        })
        .sort((a, b) => Date.parse(b.grantedAt) - Date.parse(a.grantedAt))
        .slice(0, limit);
      respond(true, { count: entries.length, consents: entries });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createConsentGetHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const consentId = requireString(input.consentId, "consentId");
      const consent = store.getConsent(consentId);
      if (!consent) {
        throw new Error("E_NOT_FOUND: consent not found");
      }
      respond(true, { consent });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createPrivacyAssetListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const limit = requireLimit(input, "limit", 50, 200);
      const assets = store
        .listConsents()
        .map((consent) => listConsentAssets(store, consent))
        .filter((entry) => {
          if (typeof input.status === "string" && entry.status !== input.status) return false;
          if (typeof input.taskId === "string" && entry.taskId !== input.taskId) return false;
          if (typeof input.assetId === "string" && entry.assetId !== input.assetId) return false;
          return true;
        })
        .slice(0, limit);
      respond(true, { count: assets.length, assets });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createPrivacyReplayGenerateHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const consent = store.getConsent(requireString(input.consentId, "consentId"));
      if (!consent) {
        throw new Error("E_NOT_FOUND: consent not found");
      }
      const order = store.getOrder(consent.orderId);
      const task = order?.taskId ? store.getTask(order.taskId) : undefined;
      const offer = order ? store.getOffer(order.offerId) : undefined;
      const deliveries = store
        .listDeliveries()
        .filter((entry) => entry.orderId === consent.orderId);
      const refIds = new Set([
        consent.consentId,
        consent.orderId,
        task?.taskId,
        ...deliveries.map((entry) => entry.deliveryId),
      ]);
      const audit = store.readAuditEvents(500).filter((entry) => refIds.has(entry.refId));
      const summary = buildPrivacyReplaySummary({ consent, order, offer, task, deliveries, audit });
      const generatedAt = nowIso();
      const replay: PrivacyReplay = {
        replayId: randomUUID(),
        consentId: consent.consentId,
        orderId: consent.orderId,
        taskId: task?.taskId,
        actorId,
        status: "replay_generated",
        summary,
        replayHash: "",
        generatedAt,
        updatedAt: generatedAt,
      };
      replay.replayHash = hashReplaySummary(summary);
      store.savePrivacyReplay(replay);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "privacy_replay_generated",
        refId: replay.replayId,
        hash: replay.replayHash,
        anchorId: `privacy-replay:${replay.replayId}`,
        actor: actorId,
        details: { consentId: consent.consentId, orderId: consent.orderId },
      });
      respond(true, {
        replayId: replay.replayId,
        status: replay.status,
        replayHash: replay.replayHash,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createPrivacyReplayListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const status = requireOptionalEnum(input, "status", [
        "replay_generated",
        "replay_viewed",
        "replay_erased",
      ] as const);
      const markViewed = input.markViewed === true;
      const viewedAt = markViewed ? nowIso() : undefined;
      const limit = requireLimit(input, "limit", 50, 200);
      const replays = store
        .listPrivacyReplays()
        .filter((entry) => {
          if (typeof input.replayId === "string" && entry.replayId !== input.replayId) return false;
          if (typeof input.consentId === "string" && entry.consentId !== input.consentId)
            return false;
          if (typeof input.orderId === "string" && entry.orderId !== input.orderId) return false;
          if (status && entry.status !== status) return false;
          return true;
        })
        .map((entry) => {
          if (
            markViewed &&
            typeof input.replayId === "string" &&
            entry.replayId === input.replayId &&
            entry.status === "replay_generated" &&
            viewedAt
          ) {
            entry.status = "replay_viewed";
            entry.updatedAt = viewedAt;
            store.savePrivacyReplay(entry);
          }
          return entry;
        })
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, limit);
      respond(true, { count: replays.length, replays });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createPrivacyEraseHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const consent = store.getConsent(requireString(input.consentId, "consentId"));
      if (!consent) {
        throw new Error("E_NOT_FOUND: consent not found");
      }
      const erasedAt = nowIso();
      const reason =
        typeof input.reason === "string" ? input.reason.trim() : "privacy erasure requested";
      consent.erasedAt = erasedAt;
      consent.eraseReason = reason;
      if (consent.status === "consent_granted") {
        consent.status = "consent_revoked";
        consent.revokedAt = erasedAt;
        consent.revokeReason = reason;
      }
      const updated: string[] = [];
      await store.runInTransaction(() => {
        store.saveConsent(consent);
        for (const replay of store.listPrivacyReplays()) {
          if (replay.consentId !== consent.consentId) {
            continue;
          }
          replay.status = "replay_erased";
          replay.updatedAt = erasedAt;
          replay.erasedAt = erasedAt;
          replay.eraseReason = reason;
          store.savePrivacyReplay(replay);
          updated.push(replay.replayId);
        }
      });
      await recordAuditWithAnchor({
        store,
        config,
        kind: "privacy_erasure_requested",
        refId: consent.consentId,
        hash: consent.revokeHash ?? consent.consentHash,
        anchorId: `privacy-erase:${consent.consentId}`,
        actor: actorId,
        details: { reason, replayIds: updated },
      });
      respond(true, {
        consentId: consent.consentId,
        erasedAt,
        replayCount: updated.length,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
