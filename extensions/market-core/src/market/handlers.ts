import { randomUUID } from "node:crypto";
import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Hex } from "viem";
import type { MarketPluginConfig } from "../config.js";
import type { MarketStateStore } from "../state/store.js";
import { EvmAnchorAdapter, type AnchorResult } from "./chain.js";
import { createDeliveryCredentialsStore } from "./credentials.js";
import { EscrowAdapter } from "./escrow.js";
import { canonicalize, hashCanonical } from "./hash.js";
import { executeRevocation } from "./revocation.js";
import {
  assertDeliveryTransition,
  assertOfferTransition,
  assertOrderTransition,
} from "./state-machine.js";
import type {
  Consent,
  Delivery,
  DeliveryPayload,
  Offer,
  Order,
  RevocationJob,
  Settlement,
} from "./types.js";
import type { AuditEvent, AuditEventKind } from "./types.js";
import {
  normalizeBuyerId,
  requireAddress,
  requireAssetType,
  requireDeliveryPayload,
  requireDeliveryType,
  requireNumber,
  requireString,
  requireUsageScope,
} from "./validators.js";

function nowIso() {
  return new Date().toISOString();
}

function nextAttemptAt(config: MarketPluginConfig): string {
  const delay = config.revocation.retryDelayMs ?? 60_000;
  return new Date(Date.now() + delay).toISOString();
}

function maxAttempts(config: MarketPluginConfig): number {
  return config.revocation.maxAttempts ?? 3;
}

function createRevocationJob(input: {
  config: MarketPluginConfig;
  delivery: Delivery;
  order?: Order;
  offer?: Offer;
  consent?: Consent;
  reason?: string;
  error?: string;
}): RevocationJob {
  return {
    jobId: randomUUID(),
    deliveryId: input.delivery.deliveryId,
    orderId: input.order?.orderId,
    offerId: input.offer?.offerId,
    consentId: input.consent?.consentId,
    reason: input.reason,
    payloadHash: hashCanonical({
      deliveryId: input.delivery.deliveryId,
      orderId: input.order?.orderId,
      offerId: input.offer?.offerId,
      consentId: input.consent?.consentId,
      reason: input.reason,
    }),
    attempts: 1,
    status: "pending",
    lastError: input.error,
    nextAttemptAt: nextAttemptAt(input.config),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function recordAudit(
  store: MarketStateStore,
  kind: AuditEventKind,
  refId: string,
  hash?: string,
  actor?: string,
  details?: Record<string, unknown>,
) {
  const event: AuditEvent = {
    id: randomUUID(),
    kind,
    refId,
    hash,
    actor,
    timestamp: nowIso(),
    details,
  };
  store.appendAuditEvent(event);
}

async function tryAnchor(config: MarketPluginConfig, anchorId: string, payloadHash: string) {
  if (!config.chain.privateKey) return null;
  const chain = new EvmAnchorAdapter(config.chain);
  return await chain.anchorHash(anchorId, payloadHash);
}

async function recordAuditWithAnchor(input: {
  store: MarketStateStore;
  config: MarketPluginConfig;
  kind: AuditEventKind;
  refId: string;
  hash: string;
  anchorId: string;
  actor?: string;
  details?: Record<string, unknown>;
}) {
  let anchorResult: AnchorResult | null = null;
  let anchorError: string | undefined;

  try {
    anchorResult = await tryAnchor(input.config, input.anchorId, input.hash);
  } catch (err) {
    anchorError = String(err);
  }

  const mergedDetails: Record<string, unknown> = {
    ...(input.details ?? {}),
  };

  if (anchorResult) {
    mergedDetails.anchor = anchorResult;
  }

  if (anchorError) {
    mergedDetails.anchorError = anchorError;
  }

  recordAudit(
    input.store,
    input.kind,
    input.refId,
    input.hash,
    input.actor,
    Object.keys(mergedDetails).length > 0 ? mergedDetails : undefined,
  );
}

const DEFAULT_READ_SCOPES = ["operator.read", "operator.write"];
const DEFAULT_WRITE_SCOPES = ["operator.write"];

function assertAccess(
  opts: GatewayRequestHandlerOptions,
  config: MarketPluginConfig,
  action: "read" | "write",
) {
  const access = config.access;
  if (access.mode === "open") return;

  const client = opts.client?.connect;
  if (!client) throw new Error("market access denied: client missing");

  if (access.allowClientIds && access.allowClientIds.length > 0) {
    if (!access.allowClientIds.includes(client.client.id)) {
      throw new Error("market access denied: client not allowed");
    }
  }

  if (access.allowRoles && access.allowRoles.length > 0) {
    if (!client.role || !access.allowRoles.includes(client.role)) {
      throw new Error("market access denied: role not allowed");
    }
  }

  if (access.allowScopes && access.allowScopes.length > 0) {
    const scopes = client.scopes ?? [];
    const match = access.allowScopes.some((scope) => scopes.includes(scope));
    if (!match) {
      throw new Error("market access denied: scope not allowed");
    }
  }

  const requiredScopes =
    action === "read"
      ? (access.readScopes ?? DEFAULT_READ_SCOPES)
      : (access.writeScopes ?? DEFAULT_WRITE_SCOPES);
  if (requiredScopes.length > 0) {
    const scopes = client.scopes ?? [];
    const match = requiredScopes.some((scope) => scopes.includes(scope));
    if (!match) {
      throw new Error(`market access denied: missing ${action} scope`);
    }
  }
}

function resolveActorId(
  opts: GatewayRequestHandlerOptions,
  config: MarketPluginConfig,
  input: Record<string, unknown>,
): string | undefined {
  const actorSource = config.access.actorSource ?? "param";
  const actorParam = typeof input.actorId === "string" ? input.actorId.trim() : "";
  const clientActor = opts.client?.connect?.client?.id?.trim() ?? "";

  if (actorSource === "param") {
    return actorParam || undefined;
  }
  if (actorSource === "client") {
    return clientActor || undefined;
  }
  if (actorParam && clientActor && actorParam !== clientActor) {
    throw new Error("actorId mismatch between params and client");
  }
  return actorParam || clientActor || undefined;
}

function requireActorId(
  opts: GatewayRequestHandlerOptions,
  config: MarketPluginConfig,
  input: Record<string, unknown>,
): string {
  if (!config.access.requireActor) return "";
  const actorId = resolveActorId(opts, config, input);
  if (!actorId) {
    throw new Error("actorId is required for market access");
  }
  return actorId;
}

function assertActorMatch(
  config: MarketPluginConfig,
  actorId: string,
  expected: string,
  label: string,
) {
  if (!config.access.requireActorMatch) return;
  if (!expected) return;
  if (actorId !== expected) {
    throw new Error(`actorId does not match ${label}`);
  }
}

async function resolveDeliveryPayloadForRevocation(
  config: MarketPluginConfig,
  delivery: Delivery,
): Promise<DeliveryPayload | undefined> {
  if (delivery.payload) return delivery.payload;
  if (!delivery.payloadRef) return undefined;

  const store = createDeliveryCredentialsStore(config.credentials);
  if (!store) return undefined;
  return await store.getDeliveryPayload(delivery.payloadRef);
}

export function createOfferCreateHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const sellerId = actorId || requireString(input.sellerId, "sellerId");
      const assetId = requireString(input.assetId, "assetId");
      const assetType = requireAssetType(input.assetType);
      const price = requireNumber(input.price, "price");
      if (price <= 0) throw new Error("price must be greater than 0");
      const currency = requireString(input.currency, "currency");
      const usageScope = requireUsageScope(input.usageScope);
      const deliveryType = requireDeliveryType(input.deliveryType);
      const assetMeta = (input.assetMeta ?? {}) as Offer["assetMeta"];
      const offerId = randomUUID();
      const createdAt = nowIso();

      const offerPayload = {
        offerId,
        sellerId,
        assetId,
        assetType,
        assetMeta,
        price,
        currency,
        usageScope,
        deliveryType,
      };
      const offerHash = hashCanonical(offerPayload);

      const offer: Offer = {
        ...offerPayload,
        status: "offer_created",
        offerHash,
        createdAt,
        updatedAt: createdAt,
      };

      store.saveOffer(offer);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "offer_created",
        refId: offerId,
        hash: offerHash,
        anchorId: `offer:${offerId}`,
        actor: actorId || sellerId,
      });

      respond(true, { offerId, offerHash, status: offer.status });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createOfferPublishHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const offerId = requireString(input.offerId, "offerId");
      const offer = store.getOffer(offerId);
      if (!offer) throw new Error("offer not found");
      assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      assertOfferTransition(offer.status, "offer_published");
      offer.status = "offer_published";
      offer.updatedAt = nowIso();
      store.saveOffer(offer);
      recordAudit(store, "offer_published", offerId, offer.offerHash, actorId || undefined);
      respond(true, { offerId, status: offer.status });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createOfferUpdateHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const offerId = requireString(input.offerId, "offerId");
      const offer = store.getOffer(offerId);
      if (!offer) throw new Error("offer not found");
      assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      if (offer.status === "offer_closed") throw new Error("offer is closed");

      if (input.price !== undefined) {
        const price = requireNumber(input.price, "price");
        if (price <= 0) throw new Error("price must be greater than 0");
        offer.price = price;
      }
      if (input.usageScope !== undefined) {
        offer.usageScope = requireUsageScope(input.usageScope);
      }
      if (input.deliveryType !== undefined) {
        offer.deliveryType = requireDeliveryType(input.deliveryType);
      }
      if (input.assetMeta !== undefined) {
        offer.assetMeta = input.assetMeta as Offer["assetMeta"];
      }

      const offerHash = hashCanonical({
        offerId: offer.offerId,
        sellerId: offer.sellerId,
        assetId: offer.assetId,
        assetType: offer.assetType,
        assetMeta: offer.assetMeta,
        price: offer.price,
        currency: offer.currency,
        usageScope: offer.usageScope,
        deliveryType: offer.deliveryType,
      });

      offer.offerHash = offerHash;
      offer.updatedAt = nowIso();
      store.saveOffer(offer);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "offer_updated",
        refId: offerId,
        hash: offerHash,
        anchorId: `offer:${offerId}`,
        actor: actorId || undefined,
      });
      respond(true, { offerId, offerHash, status: offer.status });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createOfferCloseHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const offerId = requireString(input.offerId, "offerId");
      const offer = store.getOffer(offerId);
      if (!offer) throw new Error("offer not found");
      assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      assertOfferTransition(offer.status, "offer_closed");
      offer.status = "offer_closed";
      offer.updatedAt = nowIso();
      store.saveOffer(offer);
      recordAudit(store, "offer_closed", offerId, offer.offerHash, actorId || undefined);
      respond(true, { offerId, status: offer.status });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createOrderCreateHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const offerId = requireString(input.offerId, "offerId");
      const offer = store.getOffer(offerId);
      if (!offer) throw new Error("offer not found");
      if (offer.status !== "offer_published") throw new Error("offer is not published");
      const buyerId = requireAddress(input.buyerId, "buyerId");
      if (actorId) {
        assertActorMatch(config, normalizeBuyerId(actorId), normalizeBuyerId(buyerId), "buyerId");
      }
      const quantity = input.quantity === undefined ? 1 : requireNumber(input.quantity, "quantity");
      if (quantity <= 0) throw new Error("quantity must be greater than 0");

      const orderId = randomUUID();
      const createdAt = nowIso();
      const orderHash = hashCanonical({
        orderId,
        offerId,
        buyerId,
        quantity,
        price: offer.price,
        currency: offer.currency,
      });

      const order: Order = {
        orderId,
        offerId,
        buyerId,
        quantity,
        status: "order_created",
        orderHash,
        createdAt,
        updatedAt: createdAt,
      };

      store.saveOrder(order);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "order_created",
        refId: orderId,
        hash: orderHash,
        anchorId: `order:${orderId}`,
        actor: buyerId,
      });
      respond(true, { orderId, orderHash, status: order.status });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createOrderCancelHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const orderId = requireString(input.orderId, "orderId");
      const order = store.getOrder(orderId);
      if (!order) throw new Error("order not found");
      if (actorId) {
        assertActorMatch(
          config,
          normalizeBuyerId(actorId),
          normalizeBuyerId(order.buyerId),
          "buyerId",
        );
      }
      assertOrderTransition(order.status, "order_cancelled");
      order.status = "order_cancelled";
      order.updatedAt = nowIso();
      store.saveOrder(order);
      recordAudit(store, "order_cancelled", orderId, order.orderHash, actorId || order.buyerId);
      respond(true, { orderId, status: order.status });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createSettlementLockHandler(
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
      const amount = requireString(input.amount, "amount");
      const payer = requireString(input.payer, "payer");
      const order = store.getOrder(orderId);
      if (!order) throw new Error("order not found");
      if (actorId) {
        assertActorMatch(config, normalizeBuyerId(actorId), normalizeBuyerId(payer), "payer");
        assertActorMatch(
          config,
          normalizeBuyerId(actorId),
          normalizeBuyerId(order.buyerId),
          "buyerId",
        );
      }
      assertOrderTransition(order.status, "payment_locked");

      let txHash: string | undefined;
      if (config.settlement.mode === "contract") {
        const escrow = new EscrowAdapter(config.chain, config.settlement);
        txHash = await escrow.lock(order.orderHash, payer, amount);
      }

      order.status = "payment_locked";
      order.updatedAt = nowIso();
      order.paymentTxHash = txHash;
      store.saveOrder(order);

      const existingSettlement = store.getSettlementByOrder(orderId);
      if (existingSettlement && existingSettlement.status !== "settlement_refunded") {
        throw new Error("settlement already exists for order");
      }

      const settlementId = existingSettlement?.settlementId ?? randomUUID();
      const settlement: Settlement = {
        settlementId,
        orderId,
        status: "settlement_locked",
        amount,
        tokenAddress: config.settlement.tokenAddress,
        lockedAt: nowIso(),
        lockTxHash: txHash,
      };
      store.saveSettlement(settlement);
      recordAudit(store, "payment_locked", orderId, order.orderHash, actorId || payer, {
        amount,
        txHash,
      });

      respond(true, { orderId, status: order.status, txHash, settlementId });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
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
      respond(false, { error: String(err) });
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
      respond(false, { error: String(err) });
    }
  };
}

export function createDeliveryIssueHandler(
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
      const order = store.getOrder(orderId);
      if (!order) throw new Error("order not found");
      assertOrderTransition(order.status, "delivery_ready");

      const offer = store.getOffer(order.offerId);
      if (!offer) throw new Error("offer not found");
      if (actorId) {
        assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      }

      const payload = requireDeliveryPayload(offer.deliveryType, input.payload);
      const deliveryId = randomUUID();
      const issuedAt = nowIso();
      const deliveryHash = hashCanonical({
        deliveryId,
        orderId,
        deliveryType: offer.deliveryType,
        issuedAt,
        payload,
      });

      const credentialsStore = createDeliveryCredentialsStore(config.credentials);
      const payloadRef =
        credentialsStore && payload
          ? await credentialsStore.putDeliveryPayload(deliveryId, payload)
          : undefined;
      const storedPayload = payloadRef ? undefined : payload;

      const delivery: Delivery = {
        deliveryId,
        orderId,
        deliveryType: offer.deliveryType,
        status: "delivery_ready",
        deliveryHash,
        issuedAt,
        payload: storedPayload,
        payloadRef,
      };

      store.saveDelivery(delivery);
      order.status = "delivery_ready";
      order.updatedAt = issuedAt;
      store.saveOrder(order);

      await recordAuditWithAnchor({
        store,
        config,
        kind: "delivery_issued",
        refId: deliveryId,
        hash: deliveryHash,
        anchorId: `delivery:${deliveryId}`,
        actor: actorId || offer.sellerId,
        details: {
          deliveryType: delivery.deliveryType,
          payloadRef: payloadRef?.ref,
        },
      });
      respond(true, { deliveryId, deliveryHash, status: delivery.status, payload });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createDeliveryRevokeHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return async (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const deliveryId = requireString(input.deliveryId, "deliveryId");
      const reason =
        typeof input.reason === "string" && input.reason.trim().length > 0
          ? input.reason
          : undefined;
      const delivery = store.getDelivery(deliveryId);
      if (!delivery) throw new Error("delivery not found");
      assertDeliveryTransition(delivery.status, "delivery_revoked");

      const revokedAt = nowIso();
      const revokeReason = reason ?? "manual_revoke";
      delivery.status = "delivery_revoked";
      delivery.revokedAt = revokedAt;
      delivery.revokeReason = revokeReason;
      const revokeHash = hashCanonical({
        deliveryId: delivery.deliveryId,
        orderId: delivery.orderId,
        revokedAt,
        reason: revokeReason,
      });
      delivery.revokeHash = revokeHash;
      store.saveDelivery(delivery);

      const order = store.getOrder(delivery.orderId);
      const offer = order ? store.getOffer(order.offerId) : undefined;
      if (offer && actorId) {
        assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      }
      const deliveryPayload = await resolveDeliveryPayloadForRevocation(config, delivery);
      const revokeResult = await executeRevocation(config, {
        delivery: deliveryPayload ? { ...delivery, payload: deliveryPayload } : delivery,
        order: order ?? undefined,
        offer,
        reason: revokeReason,
      });

      if (!revokeResult.ok) {
        const job = createRevocationJob({
          config,
          delivery,
          order: order ?? undefined,
          offer,
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

      await recordAuditWithAnchor({
        store,
        config,
        kind: "delivery_revoked",
        refId: deliveryId,
        hash: revokeHash,
        anchorId: `revoke:${deliveryId}`,
        actor: actorId || offer?.sellerId,
        details: {
          deliveryHash: delivery.deliveryHash,
          revokeReason,
          revokeOk: revokeResult.ok,
          revokeStatus: revokeResult.status,
          revokeError: revokeResult.error,
        },
      });
      respond(true, { deliveryId, revokedAt, revokeResult });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createDeliveryCompleteHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "write");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const deliveryId = requireString(input.deliveryId, "deliveryId");
      const delivery = store.getDelivery(deliveryId);
      if (!delivery) throw new Error("delivery not found");
      assertDeliveryTransition(delivery.status, "delivery_completed");

      delivery.status = "delivery_completed";
      store.saveDelivery(delivery);

      const order = store.getOrder(delivery.orderId);
      const offer = order ? store.getOffer(order.offerId) : undefined;
      if (offer && actorId) {
        assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      }
      if (order) {
        assertOrderTransition(order.status, "delivery_completed");
        order.status = "delivery_completed";
        order.updatedAt = nowIso();
        store.saveOrder(order);
      }

      recordAudit(
        store,
        "delivery_completed",
        deliveryId,
        delivery.deliveryHash,
        actorId || offer?.sellerId,
      );
      respond(true, { deliveryId, status: delivery.status });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createSettlementReleaseHandler(
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
      const payees = (input.payees ?? []) as { address: string; amount: string }[];
      if (payees.length === 0) throw new Error("payees is required");

      const order = store.getOrder(orderId);
      if (!order) throw new Error("order not found");
      const offer = store.getOffer(order.offerId);
      if (!offer) throw new Error("offer not found");
      if (actorId) {
        assertActorMatch(config, actorId, offer.sellerId, "offer.sellerId");
      }
      assertOrderTransition(order.status, "settlement_completed");

      let txHash: string | undefined;
      if (config.settlement.mode === "contract") {
        const escrow = new EscrowAdapter(config.chain, config.settlement);
        txHash = await escrow.release(order.orderHash, payees);
      }

      order.status = "settlement_completed";
      order.updatedAt = nowIso();
      store.saveOrder(order);

      const existingSettlement = store.getSettlementByOrder(orderId);
      const settlementId = existingSettlement?.settlementId ?? randomUUID();
      const settlementHash = hashCanonical({ orderId, payees, txHash });
      const settlement: Settlement = {
        settlementId,
        orderId,
        status: "settlement_released",
        amount: payees.reduce((sum, p) => sum + BigInt(p.amount), 0n).toString(),
        tokenAddress: config.settlement.tokenAddress,
        lockedAt: existingSettlement?.lockedAt,
        lockTxHash: existingSettlement?.lockTxHash,
        releasedAt: nowIso(),
        releaseTxHash: txHash,
        settlementHash,
      };

      store.saveSettlement(settlement);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "settlement_released",
        refId: settlementId,
        hash: settlementHash,
        anchorId: `settlement:${settlementId}`,
        actor: actorId || offer.sellerId,
        details: { payees, txHash },
      });
      respond(true, { orderId, status: order.status, txHash, settlementId, settlementHash });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createSettlementRefundHandler(
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
      const payer = requireString(input.payer, "payer");
      const reason =
        typeof input.reason === "string" && input.reason.trim().length > 0
          ? input.reason
          : undefined;

      const order = store.getOrder(orderId);
      if (!order) throw new Error("order not found");
      if (actorId) {
        assertActorMatch(config, normalizeBuyerId(actorId), normalizeBuyerId(payer), "payer");
        assertActorMatch(
          config,
          normalizeBuyerId(actorId),
          normalizeBuyerId(order.buyerId),
          "buyerId",
        );
      }
      assertOrderTransition(order.status, "settlement_cancelled");

      let txHash: string | undefined;
      if (config.settlement.mode === "contract") {
        const escrow = new EscrowAdapter(config.chain, config.settlement);
        txHash = await escrow.refund(order.orderHash, payer);
      }

      order.status = "settlement_cancelled";
      order.updatedAt = nowIso();
      store.saveOrder(order);

      const existingSettlement = store.getSettlementByOrder(orderId);
      const settlementId = existingSettlement?.settlementId ?? randomUUID();
      const settlementPayload: Record<string, unknown> = { orderId, payer, txHash };
      if (reason) settlementPayload.reason = reason;
      const settlementHash = hashCanonical(settlementPayload);
      const settlement: Settlement = {
        settlementId,
        orderId,
        status: "settlement_refunded",
        amount: existingSettlement?.amount ?? "0",
        tokenAddress: config.settlement.tokenAddress,
        lockedAt: existingSettlement?.lockedAt,
        lockTxHash: existingSettlement?.lockTxHash,
        refundedAt: nowIso(),
        refundReason: reason,
        refundTxHash: txHash,
        settlementHash,
      };

      store.saveSettlement(settlement);
      await recordAuditWithAnchor({
        store,
        config,
        kind: "settlement_refunded",
        refId: settlementId,
        hash: settlementHash,
        anchorId: `settlement:${settlementId}`,
        actor: actorId || payer,
        details: reason ? { payer, txHash, reason } : { payer, txHash },
      });
      respond(true, { orderId, status: order.status, txHash, settlementId });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createMarketStatusSummaryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const offers = store.listOffers();
      const orders = store.listOrders();
      const deliveries = store.listDeliveries();
      const settlements = store.listSettlements();

      const countBy = <T extends { status: string }>(items: T[]) =>
        items.reduce(
          (acc, item) => {
            acc[item.status] = (acc[item.status] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

      respond(true, {
        offers: countBy(offers),
        orders: countBy(orders),
        deliveries: countBy(deliveries),
        settlements: countBy(settlements),
        totals: {
          offers: offers.length,
          orders: orders.length,
          deliveries: deliveries.length,
          settlements: settlements.length,
        },
      });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createMarketAuditQueryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const { limit } = (params ?? {}) as { limit?: number };
      const events = store.readAuditEvents(limit ?? 100);
      respond(true, { events, count: events.length });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createMarketTransparencySummaryHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const { limit } = (params ?? {}) as { limit?: number };
      const offers = store.listOffers();
      const orders = store.listOrders();
      const consents = store.listConsents();
      const deliveries = store.listDeliveries();
      const settlements = store.listSettlements();
      const revocations = store.listRevocations();
      const events = store.readAuditEvents(limit ?? 200);

      const countBy = <T extends { status: string }>(items: T[]) =>
        items.reduce(
          (acc, item) => {
            acc[item.status] = (acc[item.status] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

      const purposes = offers.reduce(
        (acc, offer) => {
          const purpose = offer.usageScope.purpose;
          acc[purpose] = (acc[purpose] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const assets = offers.reduce(
        (acc, offer) => {
          acc[offer.assetId] = (acc[offer.assetId] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const revokeFailures = events.filter(
        (event) =>
          event.kind === "delivery_revoked" && event.details && event.details.revokeOk === false,
      ).length;

      const anchorFailures = events.filter(
        (event) => event.details && typeof event.details.anchorError === "string",
      ).length;

      respond(true, {
        totals: {
          offers: offers.length,
          orders: orders.length,
          consents: consents.length,
          deliveries: deliveries.length,
          settlements: settlements.length,
          revocations: revocations.length,
        },
        statuses: {
          offers: countBy(offers),
          orders: countBy(orders),
          deliveries: countBy(deliveries),
          settlements: countBy(settlements),
          consents: countBy(consents),
        },
        revocation: {
          pending: revocations.filter((job) => job.status === "pending").length,
          failed: revocations.filter((job) => job.status === "failed").length,
        },
        purposes,
        assets,
        audit: {
          events: events.slice(-Math.min(events.length, limit ?? 200)),
          count: events.length,
          revokeFailures,
          anchorFailures,
        },
      });
    } catch (err) {
      respond(false, { error: String(err) });
    }
  };
}

export function createMarketTransparencyTraceHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as {
        offerId?: string;
        orderId?: string;
        buyerId?: string;
        assetId?: string;
        deliveryId?: string;
        consentId?: string;
        settlementId?: string;
        limit?: number;
      };

      const offers = store.listOffers().filter((offer) => {
        if (input.offerId && offer.offerId !== input.offerId) return false;
        if (input.assetId && offer.assetId !== input.assetId) return false;
        return true;
      });

      const orders = store.listOrders().filter((order) => {
        if (input.orderId && order.orderId !== input.orderId) return false;
        if (input.offerId && order.offerId !== input.offerId) return false;
        if (input.buyerId && order.buyerId !== input.buyerId) return false;
        if (input.assetId) {
          const offer = offers.find((entry) => entry.offerId === order.offerId);
          if (!offer) return false;
        }
        return true;
      });

      const consents = store.listConsents().filter((consent) => {
        if (input.consentId && consent.consentId !== input.consentId) return false;
        if (input.orderId && consent.orderId !== input.orderId) return false;
        if (orders.length > 0 && !orders.find((order) => order.orderId === consent.orderId)) {
          return false;
        }
        return true;
      });

      const deliveries = store.listDeliveries().filter((delivery) => {
        if (input.deliveryId && delivery.deliveryId !== input.deliveryId) return false;
        if (input.orderId && delivery.orderId !== input.orderId) return false;
        if (orders.length > 0 && !orders.find((order) => order.orderId === delivery.orderId)) {
          return false;
        }
        return true;
      });

      const settlements = store.listSettlements().filter((settlement) => {
        if (input.settlementId && settlement.settlementId !== input.settlementId) return false;
        if (input.orderId && settlement.orderId !== input.orderId) return false;
        if (orders.length > 0 && !orders.find((order) => order.orderId === settlement.orderId)) {
          return false;
        }
        return true;
      });

      const refIds = new Set([
        ...offers.map((offer) => offer.offerId),
        ...orders.map((order) => order.orderId),
        ...consents.map((consent) => consent.consentId),
        ...deliveries.map((delivery) => delivery.deliveryId),
        ...settlements.map((settlement) => settlement.settlementId),
      ]);

      const events = store
        .readAuditEvents(input.limit ?? 300)
        .filter((event) => refIds.has(event.refId));

      respond(true, {
        offers,
        orders,
        consents,
        deliveries,
        settlements,
        audit: {
          events,
          count: events.length,
        },
      });
    } catch (err) {
      respond(false, { error: String(err) });
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
      respond(false, { error: String(err) });
    }
  };
}
