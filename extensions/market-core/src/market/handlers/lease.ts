import type {
  GatewayRequestHandler,
  GatewayRequestHandlerOptions,
} from "openclaw/plugin-sdk/gateway-types";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { summarizeProviderReputation } from "../provider-reputation.js";
import type { MarketResource } from "../resources.js";
import { executeRevocation } from "../revocation.js";
import { assertDeliveryTransition, assertLeaseTransition } from "../state-machine.js";
import { evaluateMarketStewardPolicy, parseMarketStewardPolicyInput } from "../steward-policy.js";
import type { Consent, ConsentApprovalContext, Delivery, Offer } from "../types.js";
import {
  normalizeBuyerId,
  requireAddress,
  requireBigNumberishString,
  requireLimit,
  requireOptionalEnum,
  requireOptionalIsoTimestamp,
  requirePositiveInt,
  requireString,
} from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  createRevocationJob,
  formatGatewayErrorResponse,
  hashAccessToken,
  nowIso,
  recordAudit,
  recordAuditWithAnchor,
  requireOptionalAddress,
  resolveDeliveryPayloadForRevocation,
} from "./_shared.js";
import {
  createDraftOrder,
  createPendingLeaseApprovalConsent,
  issueLeaseForApprovedOrder,
} from "./lease-issue-flow.js";

function buildApprovalContext(params: {
  actorId: string;
  resource: MarketResource;
  offer: Offer;
  consumerActorId: string;
  ttlMs: number;
  maxCost?: string;
  policyDecision: ReturnType<typeof evaluateMarketStewardPolicy>;
}): ConsentApprovalContext {
  return {
    kind: "lease_issue",
    requesterActorId: params.actorId,
    resourceId: params.resource.resourceId,
    offerId: params.offer.offerId,
    consumerActorId: params.consumerActorId,
    quantity: 1,
    ttlMs: params.ttlMs,
    maxCost: params.maxCost,
    candidate: {
      resourceId: params.policyDecision.candidate.resourceId,
      label: params.policyDecision.candidate.label,
      providerActorId: params.policyDecision.candidate.providerActorId,
      kind: params.policyDecision.candidate.kind,
      proofRequired: params.policyDecision.candidate.proofRequired,
      proofTypes: params.policyDecision.candidate.proofTypes,
      estimatedTotal: params.policyDecision.candidate.estimatedTotal,
      priceAmount: params.policyDecision.candidate.priceAmount,
      currency: params.policyDecision.candidate.currency,
    },
    budgetDecision: params.policyDecision.plan.budget
      ? {
          status: params.policyDecision.plan.budget.status,
          reason: params.policyDecision.plan.budget.reason,
          requiresApproval: params.policyDecision.plan.budget.requiresApproval,
          amount: params.policyDecision.plan.budget.amount,
          currency: params.policyDecision.plan.budget.currency,
          policyApplied: params.policyDecision.plan.budget.policyApplied,
        }
      : null,
    riskDecision: params.policyDecision.plan.risk
      ? {
          status: params.policyDecision.plan.risk.status,
          reason: params.policyDecision.plan.risk.reason,
          requiresApproval: params.policyDecision.plan.risk.requiresApproval,
          riskLevel: params.policyDecision.plan.risk.riskLevel,
          policyApplied: params.policyDecision.plan.risk.policyApplied,
        }
      : null,
    providerDecision: params.policyDecision.providerDecision,
    requestedAt: nowIso(),
    approval: params.policyDecision.plan.status === "approval_required" ? {} : undefined,
  };
}

function buildPolicyResponse(params: {
  decision: ReturnType<typeof evaluateMarketStewardPolicy>;
  orderId?: string;
  consentId?: string;
}) {
  return {
    status: params.decision.status,
    orderId: params.orderId ?? null,
    consentId: params.consentId ?? null,
    policy: {
      plan: params.decision.plan,
      provider: params.decision.providerDecision,
    },
  };
}

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
          ? requireBigNumberishString(input, "maxCost", {
              allowZero: true,
              allowDecimal: true,
            })
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

      const policy = parseMarketStewardPolicyInput(input);
      const policyDecision = policy
        ? evaluateMarketStewardPolicy({
            resource,
            quantity: 1,
            policy,
            reputation: (() => {
              const snapshot = summarizeProviderReputation({
                store,
                providerActorId: resource.providerActorId,
                resourceId,
                limit: 200,
              });
              return { score: snapshot.score, signals: snapshot.signals };
            })(),
          })
        : undefined;

      if (policyDecision && !policyDecision.canExecute) {
        if (policyDecision.status === "approval_required") {
          const order = createDraftOrder({ offer, buyerId: consumerActorId, quantity: 1 });
          const approvalContext = buildApprovalContext({
            actorId,
            resource,
            offer,
            consumerActorId,
            ttlMs,
            maxCost,
            policyDecision,
          });
          const consent = createPendingLeaseApprovalConsent({
            order,
            offer,
            actorId,
            resource,
            consumerActorId,
            ttlMs,
            maxCost,
            approvalContext,
          });
          await store.runInTransaction(() => {
            store.saveOrder(order);
            store.saveConsent(consent);
          });
          await recordAuditWithAnchor({
            store,
            config,
            kind: "consent_requested",
            refId: consent.consentId,
            hash: consent.consentHash,
            anchorId: `consent:${consent.consentId}`,
            actor: actorId,
            details: {
              orderId: order.orderId,
              resourceId,
              providerActorId: resource.providerActorId,
              consumerActorId,
              budgetDecision: approvalContext.budgetDecision,
              riskDecision: approvalContext.riskDecision,
              providerDecision: approvalContext.providerDecision,
            },
          });
          respond(
            true,
            buildPolicyResponse({
              decision: policyDecision,
              orderId: order.orderId,
              consentId: consent.consentId,
            }),
          );
          return;
        }
        respond(true, buildPolicyResponse({ decision: policyDecision }));
        return;
      }

      const order = createDraftOrder({ offer, buyerId: consumerActorId, quantity: 1 });
      const issued = await issueLeaseForApprovedOrder({
        store,
        config,
        actorId,
        resource,
        offer,
        order,
        consumerActorId,
        ttlMs,
        maxCost,
        approvalId: policy?.approval?.approvalId,
        approverId: policy?.approval?.approverId,
      });

      respond(true, {
        leaseId: issued.lease.leaseId,
        orderId: order.orderId,
        consentId: issued.consent.consentId,
        deliveryId: issued.delivery.deliveryId,
        expiresAt: issued.expiresAt,
        status: issued.lease.status,
        policy: policyDecision
          ? {
              plan: policyDecision.plan,
              provider: policyDecision.providerDecision,
            }
          : undefined,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
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

      await store.runInTransaction(() => {
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
          delivery.revokeHash = hashAccessToken(
            hashAccessToken(
              `${delivery.deliveryId}:${delivery.orderId}:${delivery.revokeReason}:${revokedAt}`,
            ),
          );
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
      respond(false, formatGatewayErrorResponse(err));
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
      respond(false, formatGatewayErrorResponse(err));
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
      ] as const);
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
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}

export function createLeaseExpireSweepHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const nowParam = requireOptionalIsoTimestamp(input, "now");
      const now = nowParam ? Date.parse(nowParam) : Date.now();
      const dryRun = input.dryRun === true;
      const limit = requireLimit(input, "limit", 200, 1000);

      const candidates = store
        .listLeases({ status: "lease_active" })
        .filter((lease) => Date.parse(lease.expiresAt) <= now);
      const activeLeases = candidates.slice(0, limit);

      let processed = 0;
      let expired = 0;
      let skipped = 0;
      let errors = 0;

      for (const lease of activeLeases) {
        processed += 1;
        try {
          if (!dryRun) {
            await store.runInTransaction(() => {
              assertLeaseTransition(lease.status, "lease_expired");
              lease.status = "lease_expired";
              store.saveLease(lease);
              recordAudit(store, "lease_expired", lease.leaseId, lease.accessTokenHash, undefined, {
                resourceId: lease.resourceId,
                dryRun,
              });
            });
          } else {
            recordAudit(store, "lease_expired", lease.leaseId, lease.accessTokenHash, undefined, {
              resourceId: lease.resourceId,
              dryRun,
            });
          }
          expired += 1;
        } catch {
          errors += 1;
          skipped += 1;
        }
      }

      respond(true, {
        processed,
        expired,
        skipped,
        errors,
        pending: Math.max(candidates.length - processed, 0),
        dryRun,
        limit,
      });
    } catch (err) {
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
