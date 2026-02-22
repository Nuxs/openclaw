import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import { executeRevocation } from "../revocation.js";
import { assertDeliveryTransition, assertLeaseTransition } from "../state-machine.js";
import { requireLimit, requireOptionalPositiveInt } from "../validators.js";
import {
  assertAccess,
  formatGatewayErrorResponse,
  maxAttempts,
  nextAttemptAt,
  nowIso,
  recordAudit,
  resolveDeliveryPayloadForRevocation,
} from "./_shared.js";

export function createMarketRepairRetryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const dryRun = input.dryRun === true;
      const limit = requireLimit(input, "limit", 200, 1000);
      const maxAttemptsParam = requireOptionalPositiveInt(input, "maxAttempts", {
        min: 1,
        max: 1000,
      });
      const attemptLimit = maxAttemptsParam ? Math.min(limit, maxAttemptsParam) : limit;

      const leases = store.listLeases();
      const candidates = leases.filter((lease) => {
        const resource = store.getResource(lease.resourceId);
        const order = store.getOrder(lease.orderId);
        const delivery = lease.deliveryId ? store.getDelivery(lease.deliveryId) : undefined;
        const expired = Date.parse(lease.expiresAt) <= Date.now();
        if (lease.status === "lease_active" && expired) return true;
        if (!resource || !order) return true;
        if (lease.deliveryId && !delivery) return true;
        return false;
      });

      let processed = 0;
      let succeeded = 0;
      let failed = 0;
      const slice = candidates.slice(0, Math.max(0, attemptLimit));

      for (const lease of slice) {
        processed += 1;
        try {
          const resource = store.getResource(lease.resourceId);
          const order = store.getOrder(lease.orderId);
          const delivery = lease.deliveryId ? store.getDelivery(lease.deliveryId) : undefined;
          const expired = Date.parse(lease.expiresAt) <= Date.now();
          const orphan = !resource || !order || (lease.deliveryId ? !delivery : false);

          if (!dryRun) {
            if (expired && lease.status === "lease_active") {
              assertLeaseTransition(lease.status, "lease_expired");
              lease.status = "lease_expired";
              store.saveLease(lease);
            } else if (orphan && lease.status !== "lease_revoked") {
              assertLeaseTransition(lease.status, "lease_revoked");
              lease.status = "lease_revoked";
              lease.revokedAt = nowIso();
              store.saveLease(lease);
            }

            if (
              delivery &&
              delivery.status !== "delivery_completed" &&
              delivery.status !== "delivery_revoked"
            ) {
              assertDeliveryTransition(delivery.status, "delivery_revoked");
              delivery.status = "delivery_revoked";
              delivery.revokedAt = nowIso();
              delivery.revokeReason = "repair_orphan";
              delivery.revokeHash = hashCanonical({
                deliveryId: delivery.deliveryId,
                orderId: delivery.orderId,
                revokedAt: delivery.revokedAt,
                reason: delivery.revokeReason,
              });
              store.saveDelivery(delivery);
            }
          }

          recordAudit(store, "repair_retry", lease.leaseId, lease.accessTokenHash, undefined, {
            resourceId: lease.resourceId,
            orderId: lease.orderId,
            deliveryId: lease.deliveryId,
            expired,
            orphan,
            dryRun,
          });
          succeeded += 1;
        } catch {
          failed += 1;
        }
      }

      const pending = Math.max(0, candidates.length - processed);
      respond(true, { processed, succeeded, failed, pending });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createMarketRevocationRetryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const now = Date.now();
      const limit = maxAttempts(config);
      const pending = store
        .listRevocations()
        .filter((job) => job.status === "pending" && Date.parse(job.nextAttemptAt) <= now);

      let processed = 0;
      let succeeded = 0;
      let failed = 0;

      for (const job of pending) {
        processed += 1;
        const delivery = store.getDelivery(job.deliveryId);
        if (!delivery) {
          job.status = "failed";
          job.lastError = "delivery not found";
          job.updatedAt = nowIso();
          store.saveRevocation(job);
          recordAudit(store, "revocation_failed", job.jobId, job.payloadHash, undefined, {
            lastError: job.lastError,
          });
          failed += 1;
          continue;
        }

        const order = job.orderId ? store.getOrder(job.orderId) : store.getOrder(delivery.orderId);
        const offer = order ? store.getOffer(order.offerId) : undefined;
        const consent = job.consentId ? store.getConsent(job.consentId) : undefined;
        const deliveryPayload = await resolveDeliveryPayloadForRevocation(config, delivery);

        const result = await executeRevocation(config, {
          delivery: deliveryPayload ? { ...delivery, payload: deliveryPayload } : delivery,
          order: order ?? undefined,
          offer,
          consent,
          reason: job.reason ?? "retry",
        });

        if (result.ok) {
          store.removeRevocation(job.jobId);
          recordAudit(store, "revocation_succeeded", job.jobId, job.payloadHash, undefined, {
            deliveryId: delivery.deliveryId,
          });
          succeeded += 1;
          continue;
        }

        job.attempts += 1;
        job.lastError = result.error;
        job.updatedAt = nowIso();
        if (job.attempts >= limit) {
          job.status = "failed";
          store.saveRevocation(job);
          recordAudit(store, "revocation_failed", job.jobId, job.payloadHash, undefined, {
            attempts: job.attempts,
            lastError: job.lastError,
          });
          failed += 1;
          continue;
        }

        job.nextAttemptAt = nextAttemptAt(config);
        store.saveRevocation(job);
        recordAudit(store, "revocation_retry", job.jobId, job.payloadHash, undefined, {
          attempts: job.attempts,
          nextAttemptAt: job.nextAttemptAt,
          lastError: job.lastError,
        });
      }

      respond(true, { processed, succeeded, failed, pending: pending.length });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
