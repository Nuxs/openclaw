import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { createDeliveryCredentialsStore } from "../credentials.js";
import { canonicalize, hashCanonical } from "../hash.js";
import type { MarketLease, MarketResource } from "../resources.js";
import { assertOrderTransition } from "../state-machine.js";
import type { Consent, ConsentApprovalContext, Delivery, Offer, Order } from "../types.js";
import {
  hashAccessToken,
  nowIso,
  randomBytes,
  randomUUID,
  recordAuditWithAnchor,
} from "./_shared.js";

export function createDraftOrder(params: {
  offer: Offer;
  buyerId: string;
  quantity?: number;
  createdAt?: string;
}): Order {
  const quantity = Math.max(1, Math.floor(params.quantity ?? 1));
  const createdAt = params.createdAt ?? nowIso();
  const orderId = randomUUID();
  const orderHash = hashCanonical({
    orderId,
    offerId: params.offer.offerId,
    buyerId: params.buyerId,
    quantity,
    price: params.offer.price,
    currency: params.offer.currency,
  });
  return {
    orderId,
    offerId: params.offer.offerId,
    buyerId: params.buyerId,
    quantity,
    status: "order_created",
    orderHash,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createPendingLeaseApprovalConsent(params: {
  order: Order;
  offer: Offer;
  actorId: string;
  resource: MarketResource;
  consumerActorId: string;
  ttlMs: number;
  maxCost?: string;
  approvalContext: ConsentApprovalContext;
}): Consent {
  const consentId = randomUUID();
  const grantedAt = params.approvalContext.requestedAt;
  const consentHash = hashCanonical({
    kind: "lease_issue_approval",
    consentId,
    orderId: params.order.orderId,
    actorId: params.actorId,
    resourceId: params.resource.resourceId,
    ttlMs: params.ttlMs,
    maxCost: params.maxCost ?? null,
    approvalContext: params.approvalContext,
  });
  return {
    consentId,
    orderId: params.order.orderId,
    scope: {
      purpose: params.offer.usageScope.purpose,
      durationDays: params.offer.usageScope.durationDays,
    },
    signature: "approval_pending",
    status: "consent_pending",
    consentHash,
    grantedAt,
    approvalContext: params.approvalContext,
  };
}

export async function issueLeaseForApprovedOrder(params: {
  store: MarketStateStore;
  config: MarketPluginConfig;
  actorId: string;
  resource: MarketResource;
  offer: Offer;
  order: Order;
  consumerActorId: string;
  ttlMs: number;
  maxCost?: string;
  existingConsent?: Consent;
  signature?: string;
  approvalId?: string;
  approverId?: string;
}): Promise<{
  lease: MarketLease;
  consent: Consent;
  delivery: Delivery;
  expiresAt: string;
}> {
  const now = nowIso();
  const expiresAt = new Date(Date.now() + params.ttlMs).toISOString();

  assertOrderTransition(params.order.status, "payment_locked");
  params.order.status = "payment_locked";
  assertOrderTransition(params.order.status, "consent_granted");
  params.order.status = "consent_granted";
  assertOrderTransition(params.order.status, "delivery_ready");
  params.order.status = "delivery_ready";
  params.order.updatedAt = now;

  const consentMessage = canonicalize({
    orderId: params.order.orderId,
    offerId: params.offer.offerId,
    buyerId: params.consumerActorId,
    scope: params.offer.usageScope,
  });
  const consentHash = hashCanonical(consentMessage);
  const consent: Consent = params.existingConsent
    ? {
        ...params.existingConsent,
        scope: {
          purpose: params.offer.usageScope.purpose,
          durationDays: params.offer.usageScope.durationDays,
        },
        signature: params.signature ?? "policy_approved",
        status: "consent_granted",
        consentHash,
        approvedAt: now,
        approvedBy: params.approverId,
        approvalId: params.approvalId,
        approvalContext: {
          ...params.existingConsent.approvalContext,
          approval: {
            ...params.existingConsent.approvalContext?.approval,
            approvalId:
              params.approvalId ?? params.existingConsent.approvalContext?.approval?.approvalId,
            approverId:
              params.approverId ?? params.existingConsent.approvalContext?.approval?.approverId,
            decidedAt: now,
          },
        },
      }
    : {
        consentId: randomUUID(),
        orderId: params.order.orderId,
        scope: {
          purpose: params.offer.usageScope.purpose,
          durationDays: params.offer.usageScope.durationDays,
        },
        signature: params.signature ?? "lease_issue",
        status: "consent_granted",
        consentHash,
        grantedAt: now,
        approvedAt: now,
        approvedBy: params.approverId,
        approvalId: params.approvalId,
      };

  const accessToken = `tok_${randomBytes(32).toString("base64url")}`;
  const accessTokenHash = hashAccessToken(accessToken);
  const deliveryId = randomUUID();
  const credentialsStore = createDeliveryCredentialsStore(params.config.credentials);
  const payload = { type: "api", accessToken } as const;
  const payloadRef = credentialsStore
    ? await credentialsStore.putDeliveryPayload(deliveryId, payload)
    : undefined;

  const deliveryHash = hashCanonical({
    deliveryId,
    orderId: params.order.orderId,
    deliveryType: "api",
    issuedAt: now,
    payloadRef: payloadRef?.ref ?? null,
  });
  const delivery: Delivery = {
    deliveryId,
    orderId: params.order.orderId,
    deliveryType: "api",
    status: "delivery_ready",
    deliveryHash,
    issuedAt: now,
    payload: payloadRef ? undefined : payload,
    payloadRef: payloadRef ?? undefined,
  };

  const leaseId = randomUUID();
  const lease: MarketLease = {
    leaseId,
    resourceId: params.resource.resourceId,
    kind: params.resource.kind,
    providerActorId: params.resource.providerActorId,
    consumerActorId: params.consumerActorId,
    orderId: params.order.orderId,
    consentId: consent.consentId,
    deliveryId,
    accessTokenHash,
    accessRef: payloadRef ? { store: "credentials", ref: payloadRef.ref } : undefined,
    status: "lease_active",
    issuedAt: now,
    expiresAt,
    maxCost: params.maxCost,
  };

  try {
    await params.store.runInTransaction(() => {
      params.store.saveOrder(params.order);
      params.store.saveConsent(consent);
      params.store.saveDelivery(delivery);
      params.store.saveLease(lease);
    });
  } catch (err) {
    if (payloadRef && credentialsStore) {
      await credentialsStore.removeDeliveryPayload(payloadRef);
    }
    throw err;
  }

  await recordAuditWithAnchor({
    store: params.store,
    config: params.config,
    kind: "lease_issued",
    refId: leaseId,
    hash: accessTokenHash,
    anchorId: `lease:${leaseId}`,
    actor: params.actorId,
    details: {
      resourceId: params.resource.resourceId,
      orderId: params.order.orderId,
      deliveryId,
      accessTokenHash,
      approvalId: params.approvalId ?? null,
    },
  });

  return { lease, consent, delivery, expiresAt };
}
