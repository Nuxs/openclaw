import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
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
import { issueLeaseForApprovedOrder } from "./lease-issue-flow.js";

function resolvePendingApprovalConsent(
  store: MarketStateStore,
  consentId: string | undefined,
): Consent | undefined {
  if (!consentId) {
    return undefined;
  }
  const consent = store.getConsent(consentId);
  if (!consent || consent.status !== "consent_pending" || !consent.approvalContext) {
    return undefined;
  }
  return consent;
}

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
      const pendingConsent = resolvePendingApprovalConsent(
        store,
        typeof input.consentId === "string" ? input.consentId.trim() : undefined,
      );

      if (pendingConsent?.approvalContext?.kind === "lease_issue") {
        const order = store.getOrder(pendingConsent.orderId);
        if (!order) {
          throw new Error("E_NOT_FOUND: order not found");
        }
        const resourceId = pendingConsent.approvalContext.resourceId;
        if (typeof resourceId !== "string" || resourceId.trim().length === 0) {
          throw new Error("E_CONFLICT: pending consent missing resourceId");
        }
        const resource = store.getResource(resourceId);
        if (!resource) {
          throw new Error("E_NOT_FOUND: resource not found");
        }
        const offer = store.getOffer(order.offerId);
        if (!offer) {
          throw new Error("E_NOT_FOUND: offer not found");
        }
        assertActorMatch(
          config,
          normalizeBuyerId(actorId),
          normalizeBuyerId(order.buyerId),
          "order.buyerId",
        );
        const ttlMs = pendingConsent.approvalContext.ttlMs;
        if (typeof ttlMs !== "number" || !Number.isFinite(ttlMs) || ttlMs <= 0) {
          throw new Error("E_CONFLICT: pending consent missing ttlMs");
        }
        const issued = await issueLeaseForApprovedOrder({
          store,
          config,
          actorId,
          resource,
          offer,
          order,
          consumerActorId: order.buyerId,
          ttlMs,
          maxCost:
            typeof pendingConsent.approvalContext.maxCost === "string"
              ? pendingConsent.approvalContext.maxCost
              : undefined,
          existingConsent: pendingConsent,
          signature:
            typeof input.signature === "string" && input.signature.trim().length > 0
              ? input.signature.trim()
              : "policy_approved",
          approvalId:
            typeof input.approvalId === "string" && input.approvalId.trim().length > 0
              ? input.approvalId.trim()
              : pendingConsent.approvalContext.approval?.approvalId,
          approverId: actorId,
        });
        await recordAuditWithAnchor({
          store,
          config,
          kind: "consent_granted",
          refId: pendingConsent.consentId,
          hash: issued.consent.consentHash,
          anchorId: `consent:${pendingConsent.consentId}`,
          actor: actorId,
          details: {
            orderId: order.orderId,
            resourceId,
            leaseId: issued.lease.leaseId,
            deliveryId: issued.delivery.deliveryId,
            approvalKind: pendingConsent.approvalContext.kind,
          },
        });
        respond(true, {
          consentId: pendingConsent.consentId,
          status: issued.consent.status,
          orderId: order.orderId,
          leaseId: issued.lease.leaseId,
          deliveryId: issued.delivery.deliveryId,
          expiresAt: issued.expiresAt,
          approvalStatus: "approved",
        });
        return;
      }

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
      if (consent.status === "consent_revoked") throw new Error("consent already revoked");

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
      if (
        order &&
        consent.approvalContext?.kind === "lease_issue" &&
        order.status === "order_created"
      ) {
        assertOrderTransition(order.status, "order_cancelled");
        order.status = "order_cancelled";
        order.updatedAt = revokedAt;
        store.saveOrder(order);
      }

      if (consent.approvalContext?.kind !== "lease_issue") {
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
      }

      await recordAuditWithAnchor({
        store,
        config,
        kind: "consent_revoked",
        refId: consentId,
        hash: revokeHash,
        anchorId: `revoke:${consentId}`,
        actor: actorId || order?.buyerId,
        details: {
          reason: reason ?? null,
          approvalKind: consent.approvalContext?.kind ?? null,
        },
      });
      respond(true, {
        consentId,
        revokedAt,
        revokeHash,
        approvalStatus: consent.approvalContext ? "rejected" : undefined,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
