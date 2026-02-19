import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { createDeliveryCredentialsStore } from "../credentials.js";
import { canonicalize, hashCanonical } from "../hash.js";
import type { MarketLease, MarketLeaseStatus } from "../resources.js";
import { executeRevocation } from "../revocation.js";
import {
  assertDeliveryTransition,
  assertLeaseTransition,
  assertOrderTransition,
} from "../state-machine.js";
import type { Consent, Delivery, Order } from "../types.js";
import {
  normalizeBuyerId,
  requireAddress,
  requireBigNumberishString,
  requireLimit,
  requireOptionalEnum,
  requireOptionalIsoTimestamp,
  requirePositiveInt,
  requireString,
  requireUsageScope,
} from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  createRevocationJob,
  formatGatewayError,
  hashAccessToken,
  nowIso,
  randomBytes,
  randomUUID,
  recordAudit,
  recordAuditWithAnchor,
  requireOptionalAddress,
  resolveDeliveryPayloadForRevocation,
} from "./_shared.js";

export function createLeaseIssueHandler(
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
      const resourceId = requireString(input.resourceId, "resourceId");
      const consumerActorId = requireAddress(input.consumerActorId, "consumerActorId");
      const ttlMs = requirePositiveInt(input, "ttlMs", {
        min: 10_000,
        max: 7 * 24 * 60 * 60 * 1000,
      });
      const maxCost =
        input.maxCost !== undefined
          ? requireBigNumberishString(input, "maxCost", { allowZero: true })
          : undefined;

      const resource = store.getResource(resourceId);
      if (!resource) {
        throw new Error("E_NOT_FOUND: resource not found");
      }
      if (resource.status !== "resource_published") {
        throw new Error("E_CONFLICT: resource not published");
      }
      const offer = store.getOffer(resource.offerId);
      if (!offer) {
        throw new Error("E_NOT_FOUND: offer not found");
      }
      assertActorMatch(
        config,
        normalizeBuyerId(actorId),
        normalizeBuyerId(consumerActorId),
        "consumerActorId",
      );

      const now = nowIso();
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      const orderId = randomUUID();
      const orderHash = hashCanonical({
        orderId,
        offerId: offer.offerId,
        buyerId: consumerActorId,
        quantity: 1,
        price: offer.price,
        currency: offer.currency,
      });
      const order: Order = {
        orderId,
        offerId: offer.offerId,
        buyerId: consumerActorId,
        quantity: 1,
        status: "order_created",
        orderHash,
        createdAt: now,
        updatedAt: now,
      };
      assertOrderTransition(order.status, "payment_locked");
      order.status = "payment_locked";
      assertOrderTransition(order.status, "consent_granted");
      order.status = "consent_granted";
      assertOrderTransition(order.status, "delivery_ready");
      order.status = "delivery_ready";
      order.updatedAt = now;

      const consentId = randomUUID();
      const consentMessage = canonicalize({
        orderId,
        offerId: offer.offerId,
        buyerId: consumerActorId,
        scope: offer.usageScope,
      });
      const consentHash = hashCanonical(consentMessage);
      const consent: Consent = {
        consentId,
        orderId,
        scope: {
          purpose: offer.usageScope.purpose,
          durationDays: offer.usageScope.durationDays,
        },
        signature: "lease_issue",
        status: "consent_granted",
        consentHash,
        grantedAt: now,
      };

      const accessToken = `tok_${randomBytes(32).toString("base64url")}`;
      const accessTokenHash = hashAccessToken(accessToken);
      const deliveryId = randomUUID();
      const credentialsStore = createDeliveryCredentialsStore(config.credentials);
      const payloadRef = credentialsStore
        ? await credentialsStore.putDeliveryPayload(deliveryId, {
            type: "api",
            accessToken,
          })
        : undefined;

      const deliveryHash = hashCanonical({
        deliveryId,
        orderId,
        deliveryType: "api",
        issuedAt: now,
        payloadRef: payloadRef?.ref ?? null,
      });
      const delivery: Delivery = {
        deliveryId,
        orderId,
        deliveryType: "api",
        status: "delivery_ready",
        deliveryHash,
        issuedAt: now,
        payloadRef: payloadRef ?? undefined,
      };

      const leaseId = randomUUID();
      const lease: MarketLease = {
        leaseId,
        resourceId,
        kind: resource.kind,
        providerActorId: resource.providerActorId,
        consumerActorId,
        orderId,
        consentId,
        deliveryId,
        accessTokenHash,
        accessRef: payloadRef ? { store: "credentials", ref: payloadRef.ref } : undefined,
        status: "lease_active",
        issuedAt: now,
        expiresAt,
        maxCost,
      };

      // Atomic: order + consent + delivery + lease must persist together
      store.runInTransaction(() => {
        store.saveOrder(order);
        store.saveConsent(consent);
        store.saveDelivery(delivery);
        store.saveLease(lease);
      });

      await recordAuditWithAnchor({
        store,
        config,
        kind: "lease_issued",
        refId: leaseId,
        hash: accessTokenHash,
        anchorId: `lease:${leaseId}`,
        actor: actorId,
        details: {
          resourceId,
          orderId,
          deliveryId,
          accessTokenHash,
        },
      });

      respond(true, {
        leaseId,
        orderId,
        consentId,
        deliveryId,
        expiresAt,
        accessToken,
      });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
  };
}

export function createLeaseRevokeHandler(
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
      const leaseId = requireString(input.leaseId, "leaseId");
      const reason =
        typeof input.reason === "string" && input.reason.trim().length > 0
          ? input.reason.trim()
          : undefined;

      const lease = store.getLease(leaseId);
      if (!lease) {
        throw new Error("E_NOT_FOUND: lease not found");
      }
      if (lease.status === "lease_expired") {
        throw new Error("E_EXPIRED: lease already expired");
      }
      const actorMatchesProvider =
        normalizeBuyerId(actorId) === normalizeBuyerId(lease.providerActorId);
      const actorMatchesConsumer =
        normalizeBuyerId(actorId) === normalizeBuyerId(lease.consumerActorId);
      if (!actorMatchesProvider && !actorMatchesConsumer) {
        throw new Error("E_FORBIDDEN: actorId does not match provider or consumer");
      }

      assertLeaseTransition(lease.status, "lease_revoked");
      const revokedAt = nowIso();
      lease.status = "lease_revoked";
      lease.revokedAt = revokedAt;

      const delivery = lease.deliveryId ? store.getDelivery(lease.deliveryId) : undefined;
      const order = store.getOrder(lease.orderId);
      const offer = order ? store.getOffer(order.offerId) : undefined;
      const consent = lease.consentId ? store.getConsent(lease.consentId) : undefined;

      // Atomic: lease + delivery revocation must persist together
      store.runInTransaction(() => {
        store.saveLease(lease);
        if (
          delivery &&
          delivery.status !== "delivery_completed" &&
          delivery.status !== "delivery_revoked"
        ) {
          assertDeliveryTransition(delivery.status, "delivery_revoked");
          delivery.status = "delivery_revoked";
          delivery.revokedAt = revokedAt;
          delivery.revokeReason = reason ?? "lease_revoked";
          delivery.revokeHash = hashCanonical({
            deliveryId: delivery.deliveryId,
            orderId: delivery.orderId,
            revokedAt,
            reason: delivery.revokeReason,
          });
          store.saveDelivery(delivery);
        }
      });

      if (delivery && delivery.status === "delivery_revoked") {
        const deliveryPayload = await resolveDeliveryPayloadForRevocation(config, delivery);
        const revokeResult = await executeRevocation(config, {
          delivery: deliveryPayload ? { ...delivery, payload: deliveryPayload } : delivery,
          order: order ?? undefined,
          offer,
          consent,
          reason: delivery.revokeReason,
        });
        if (!revokeResult.ok) {
          const job = createRevocationJob({
            config,
            delivery,
            order: order ?? undefined,
            offer,
            consent,
            reason: delivery.revokeReason,
            error: revokeResult.error,
          });
          store.saveRevocation(job);
          recordAudit(store, "revocation_retry", job.jobId, job.payloadHash, undefined, {
            deliveryId: delivery.deliveryId,
            attempts: job.attempts,
            nextAttemptAt: job.nextAttemptAt,
          });
        }
      }

      recordAudit(store, "lease_revoked", leaseId, lease.accessTokenHash, actorId, {
        resourceId: lease.resourceId,
        reason,
      });
      respond(true, { leaseId, status: lease.status, revokedAt });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
  };
}

export function createLeaseGetHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = typeof input.actorId === "string" ? input.actorId.trim() : "";
      const leaseId = requireString(input.leaseId, "leaseId");
      const lease = store.getLease(leaseId) ?? null;
      if (!lease) {
        respond(true, { lease: null });
        return;
      }
      if (actorId) {
        const actorMatchesProvider =
          normalizeBuyerId(actorId) === normalizeBuyerId(lease.providerActorId);
        const actorMatchesConsumer =
          normalizeBuyerId(actorId) === normalizeBuyerId(lease.consumerActorId);
        if (!actorMatchesProvider && !actorMatchesConsumer) {
          throw new Error("E_FORBIDDEN: actorId does not match provider or consumer");
        }
      }
      respond(true, { lease });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
  };
}

export function createLeaseListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const providerActorId = requireOptionalAddress(input, "providerActorId");
      const consumerActorId = requireOptionalAddress(input, "consumerActorId");
      const resourceId = typeof input.resourceId === "string" ? input.resourceId.trim() : undefined;
      const status = requireOptionalEnum(input, "status", [
        "lease_active",
        "lease_revoked",
        "lease_expired",
      ] as MarketLeaseStatus[]);
      const limit = requireLimit(input, "limit", 50, 200);
      const leases = store.listLeases({
        providerActorId,
        consumerActorId,
        resourceId,
        status,
        limit,
      });
      respond(true, { leases });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
  };
}

export function createLeaseExpireSweepHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const nowParam = requireOptionalIsoTimestamp(input, "now");
      const now = nowParam ? Date.parse(nowParam) : Date.now();
      const dryRun = input.dryRun === true;
      const limit = requireLimit(input, "limit", 200, 1000);

      const activeLeases = store
        .listLeases({ status: "lease_active" })
        .filter((lease) => Date.parse(lease.expiresAt) <= now)
        .slice(0, limit);

      let processed = 0;
      let expired = 0;
      let skipped = 0;
      let errors = 0;

      for (const lease of activeLeases) {
        processed += 1;
        try {
          if (!dryRun) {
            assertLeaseTransition(lease.status, "lease_expired");
            lease.status = "lease_expired";
            store.saveLease(lease);
          }
          expired += 1;
          recordAudit(store, "lease_expired", lease.leaseId, lease.accessTokenHash, undefined, {
            resourceId: lease.resourceId,
            dryRun,
          });
        } catch {
          errors += 1;
          skipped += 1;
        }
      }

      respond(true, { processed, expired, skipped, errors });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
  };
}
