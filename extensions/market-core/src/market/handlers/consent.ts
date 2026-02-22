import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Hex } from "viem";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { canonicalize, hashCanonical } from "../hash.js";
import { executeRevocation } from "../revocation.js";
import { assertDeliveryTransition, assertOrderTransition } from "../state-machine.js";
import type { Consent } from "../types.js";
import { normalizeBuyerId, requireAddress, requireString } from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  createRevocationJob,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAudit,
  recordAuditWithAnchor,
  requireActorId,
  resolveDeliveryPayloadForRevocation,
} from "./_shared.js";

export function createConsentGrantHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const orderId = requireString(input.orderId, "orderId");
      const signature = requireString(input.signature, "signature");
      if (!signature.startsWith("0x")) {
        throw new Error("consent signature must be hex (0x-prefixed)");
      }
      const signatureHex = signature as Hex;
      const scope = (input.consentScope ?? {}) as Consent["scope"];
      if (!scope.purpose || typeof scope.purpose !== "string") {
        throw new Error("consentScope.purpose is required");
      }

      const order = store.getOrder(orderId);
      if (!order) throw new Error("order not found");
      assertOrderTransition(order.status, "consent_granted");

      const offer = store.getOffer(order.offerId);
      if (!offer) throw new Error("offer not found");
      if (offer.usageScope.purpose !== scope.purpose) {
        throw new Error("consentScope.purpose must match offer.usageScope.purpose");
      }
      if (
        offer.usageScope.durationDays !== undefined &&
        scope.durationDays !== undefined &&
        scope.durationDays > offer.usageScope.durationDays
      ) {
        throw new Error("consentScope.durationDays exceeds offer.usageScope.durationDays");
      }

      const buyerAddress = requireAddress(order.buyerId, "buyerId");
      if (actorId) {
        assertActorMatch(
          config,
          normalizeBuyerId(actorId),
          normalizeBuyerId(buyerAddress),
          "buyerId",
        );
      }
      const consentMessage = canonicalize({
        orderId,
        offerId: order.offerId,
        buyerId: buyerAddress,
        scope,
      });
      const { verifyMessage } = await import("viem");
      const signatureOk = await verifyMessage({
        message: consentMessage,
        signature: signatureHex,
        address: buyerAddress,
      });
      if (!signatureOk) throw new Error("consent signature invalid");

      const consentId = randomUUID();
      const consentHash = hashCanonical(consentMessage);

      const consent: Consent = {
        consentId,
        orderId,
        scope,
        signature,
        status: "consent_granted",
        consentHash,
        grantedAt: nowIso(),
      };

      store.saveConsent(consent);
      order.status = "consent_granted";
      order.updatedAt = nowIso();
      store.saveOrder(order);

      await recordAuditWithAnchor({
        store,
        config,
        kind: "consent_granted",
        refId: consentId,
        hash: consentHash,
        anchorId: `consent:${consentId}`,
        actor: order.buyerId,
        details: { scope },
      });
      respond(true, { consentId, consentHash, status: consent.status });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createConsentRevokeHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const consentId = requireString(input.consentId, "consentId");
      const reason =
        typeof input.reason === "string" && input.reason.trim().length > 0
          ? input.reason
          : undefined;
      const consent = store.getConsent(consentId);
      if (!consent) throw new Error("consent not found");
      if (consent.status !== "consent_granted") throw new Error("consent already revoked");

      const revokedAt = nowIso();
      const revokePayload: Record<string, unknown> = {
        consentId,
        revokedAt,
        scope: consent.scope,
      };
      if (reason) revokePayload.reason = reason;
      const revokeHash = hashCanonical(revokePayload);

      consent.status = "consent_revoked";
      consent.revokedAt = revokedAt;
      consent.revokeReason = reason;
      consent.revokeHash = revokeHash;
      store.saveConsent(consent);

      const order = store.getOrder(consent.orderId);
      if (order && actorId) {
        assertActorMatch(
          config,
          normalizeBuyerId(actorId),
          normalizeBuyerId(order.buyerId),
          "buyerId",
        );
      }
      if (order) {
        assertOrderTransition(order.status, "consent_revoked");
        order.status = "consent_revoked";
        order.updatedAt = revokedAt;
        store.saveOrder(order);
      }

      for (const delivery of store.listDeliveries()) {
        if (delivery.orderId !== consent.orderId) continue;
        if (delivery.status === "delivery_completed" || delivery.status === "delivery_revoked") {
          continue;
        }
        assertDeliveryTransition(delivery.status, "delivery_revoked");
        const revokeReason = reason ?? "consent_revoked";
        delivery.status = "delivery_revoked";
        delivery.revokedAt = revokedAt;
        delivery.revokeReason = revokeReason;
        delivery.revokeHash = hashCanonical({
          deliveryId: delivery.deliveryId,
          orderId: delivery.orderId,
          revokedAt,
          reason: revokeReason,
        });
        store.saveDelivery(delivery);

        const offer = order ? store.getOffer(order.offerId) : undefined;
        const deliveryPayload = await resolveDeliveryPayloadForRevocation(config, delivery);
        const revokeResult = await executeRevocation(config, {
          delivery: deliveryPayload ? { ...delivery, payload: deliveryPayload } : delivery,
          order: order ?? undefined,
          offer,
          consent,
          reason: revokeReason,
        });

        if (!revokeResult.ok) {
          const job = createRevocationJob({
            config,
            delivery,
            order: order ?? undefined,
            offer,
            consent,
            reason: revokeReason,
            error: revokeResult.error,
          });
          store.saveRevocation(job);
          recordAudit(store, "revocation_retry", job.jobId, job.payloadHash, undefined, {
            deliveryId: delivery.deliveryId,
            attempts: job.attempts,
            nextAttemptAt: job.nextAttemptAt,
          });
        }

        recordAudit(
          store,
          "delivery_revoked",
          delivery.deliveryId,
          delivery.revokeHash,
          actorId || order?.buyerId,
          {
            deliveryHash: delivery.deliveryHash,
            revokeReason,
            revokeOk: revokeResult.ok,
            revokeStatus: revokeResult.status,
            revokeError: revokeResult.error,
          },
        );
      }

      await recordAuditWithAnchor({
        store,
        config,
        kind: "consent_revoked",
        refId: consentId,
        hash: revokeHash,
        anchorId: `revoke:${consentId}`,
        actor: actorId || order?.buyerId,
        details: reason ? { reason } : undefined,
      });
      respond(true, { consentId, revokedAt, revokeHash });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
