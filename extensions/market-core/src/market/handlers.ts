import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { Hex } from "viem";
import type { MarketPluginConfig } from "../config.js";
import type { MarketStateStore } from "../state/store.js";
import { EvmAnchorAdapter, type AnchorResult } from "./chain.js";
import { createDeliveryCredentialsStore } from "./credentials.js";
import { EscrowAdapter } from "./escrow.js";
import { canonicalize, hashCanonical } from "./hash.js";
import type {
  MarketLedgerEntry,
  MarketLedgerFilter,
  MarketLedgerSummary,
  MarketLease,
  MarketLeaseStatus,
  MarketResource,
  MarketResourceKind,
  MarketResourceStatus,
} from "./resources.js";
import { executeRevocation } from "./revocation.js";
import {
  assertDeliveryTransition,
  assertLeaseTransition,
  assertOfferTransition,
  assertOrderTransition,
  assertResourceTransition,
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
  requireBigNumberishString,
  requireDeliveryPayload,
  requireDeliveryType,
  requireEnum,
  requireLimit,
  requireNumber,
  requireOptionalEnum,
  requireOptionalIsoTimestamp,
  requireOptionalPositiveInt,
  requireOptionalStringArray,
  requirePositiveInt,
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

const RESOURCE_PRICE_UNITS: Record<
  MarketResourceKind,
  Array<"token" | "call" | "query" | "gb_day" | "put" | "get">
> = {
  model: ["token", "call"],
  search: ["query"],
  storage: ["gb_day", "put", "get"],
};

function formatGatewayError(err: unknown, fallback = "E_INTERNAL"): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith("E_")) {
    return message;
  }

  const normalized = message.toLowerCase();

  if (normalized.includes("actorid is required")) {
    return `E_AUTH_REQUIRED: ${message}`;
  }
  if (
    normalized.includes("access denied") ||
    normalized.includes("forbidden") ||
    normalized.includes("not allowed") ||
    normalized.includes("does not match") ||
    normalized.includes("mismatch")
  ) {
    return `E_FORBIDDEN: ${message}`;
  }
  if (normalized.includes("not found")) {
    return `E_NOT_FOUND: ${message}`;
  }
  if (normalized.includes("expired")) {
    return `E_EXPIRED: ${message}`;
  }
  if (normalized.includes("revoked")) {
    return `E_REVOKED: ${message}`;
  }
  if (
    normalized.includes("conflict") ||
    normalized.includes("already") ||
    normalized.includes("not published") ||
    normalized.includes("transition")
  ) {
    return `E_CONFLICT: ${message}`;
  }
  if (
    normalized.includes("invalid") ||
    normalized.includes("must") ||
    normalized.includes("required") ||
    normalized.includes("missing") ||
    normalized.includes("exceeds")
  ) {
    return `E_INVALID_ARGUMENT: ${message}`;
  }
  return `${fallback}: ${message}`;
}

function hashAccessToken(token: string): string {
  const digest = createHash("sha256").update(token).digest("hex");
  return `sha256:${digest}`;
}

function parsePriceAmount(amount: string): number {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    throw new Error("E_INVALID_ARGUMENT: price.amount must be numeric");
  }
  return parsed;
}

function requireOptionalAddress(params: Record<string, unknown>, key: string): string | undefined {
  const raw = params[key];
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  try {
    return requireAddress(raw, key);
  } catch {
    throw new Error(`E_INVALID_ARGUMENT: ${key} is invalid`);
  }
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

      const existingSettlement = store.getSettlementByOrder(orderId);
      if (existingSettlement && existingSettlement.status !== "settlement_refunded") {
        throw new Error("settlement already exists for order");
      }

      let txHash: string | undefined;
      if (config.settlement.mode === "contract") {
        const escrow = new EscrowAdapter(config.chain, config.settlement);
        txHash = await escrow.lock(order.orderHash, payer, amount);
      }

      order.status = "payment_locked";
      order.updatedAt = nowIso();
      order.paymentTxHash = txHash;
      store.saveOrder(order);

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

export function createSettlementStatusHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const actorId = requireActorId(opts, config, input);
      const orderId = typeof input.orderId === "string" ? input.orderId : undefined;
      const settlementId = typeof input.settlementId === "string" ? input.settlementId : undefined;

      if (!orderId && !settlementId) {
        throw new Error("orderId or settlementId is required");
      }

      let settlement = settlementId ? store.getSettlement(settlementId) : undefined;
      if (!settlement && orderId) {
        settlement = store.getSettlementByOrder(orderId);
      }
      if (!settlement) throw new Error("settlement not found");

      const resolvedOrderId = orderId ?? settlement.orderId;
      const order = store.getOrder(resolvedOrderId);
      const offer = order ? store.getOffer(order.offerId) : undefined;

      if (actorId && order) {
        const buyerMatch = normalizeBuyerId(actorId) === normalizeBuyerId(order.buyerId ?? "");
        const sellerMatch = offer ? actorId === offer.sellerId : false;
        if (!buyerMatch && !sellerMatch) {
          throw new Error("actorId does not match buyerId or sellerId");
        }
      }

      respond(true, {
        orderId: resolvedOrderId,
        orderStatus: order?.status ?? null,
        settlementId: settlement.settlementId,
        status: settlement.status ?? null,
        amount: settlement.amount ?? null,
        tokenAddress: settlement.tokenAddress ?? null,
        lockTxHash: settlement.lockTxHash ?? null,
        releaseTxHash: settlement.releaseTxHash ?? null,
        refundTxHash: settlement.refundTxHash ?? null,
        lockedAt: settlement.lockedAt ?? null,
        releasedAt: settlement.releasedAt ?? null,
        refundedAt: settlement.refundedAt ?? null,
      });
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

export function createResourcePublishHandler(
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

      const resourceInput = (input.resource ?? {}) as Record<string, unknown>;
      const kind = requireEnum(resourceInput, "kind", ["model", "search", "storage"]);
      const label = requireString(resourceInput.label, "label");
      if (label.length > 80) {
        throw new Error("E_INVALID_ARGUMENT: label too long");
      }
      const description =
        typeof resourceInput.description === "string"
          ? resourceInput.description.trim()
          : undefined;
      if (description && description.length > 400) {
        throw new Error("E_INVALID_ARGUMENT: description too long");
      }
      const tags = requireOptionalStringArray(resourceInput, "tags", {
        maxItems: 12,
        maxLen: 32,
        unique: true,
      });

      const priceInput = (resourceInput.price ?? {}) as Record<string, unknown>;
      const unit = requireEnum(priceInput, "unit", RESOURCE_PRICE_UNITS[kind]);
      const amount = requireBigNumberishString(priceInput, "amount", { allowZero: false });
      const currency = requireString(priceInput.currency, "currency");
      const tokenAddress = requireOptionalAddress(priceInput, "tokenAddress");

      let policy: MarketResource["policy"] | undefined;
      if (resourceInput.policy !== undefined) {
        if (!resourceInput.policy || typeof resourceInput.policy !== "object") {
          throw new Error("E_INVALID_ARGUMENT: policy must be an object");
        }
        const policyInput = resourceInput.policy as Record<string, unknown>;
        const candidate: MarketResource["policy"] = {
          maxConcurrent: requireOptionalPositiveInt(policyInput, "maxConcurrent", {
            min: 1,
            max: 1000,
          }),
          maxTokens: requireOptionalPositiveInt(policyInput, "maxTokens", {
            min: 1,
            max: 200_000,
          }),
          maxBytes: requireOptionalPositiveInt(policyInput, "maxBytes", {
            min: 1,
            max: 1024 * 1024 * 1024,
          }),
          allowTools:
            typeof policyInput.allowTools === "boolean" ? policyInput.allowTools : undefined,
          allowMime: requireOptionalStringArray(policyInput, "allowMime", {
            maxItems: 64,
            maxLen: 64,
            unique: true,
          }),
        };
        if (Object.values(candidate).some((value) => value !== undefined)) {
          policy = candidate;
        }
      }

      const offerInput = (resourceInput.offer ?? {}) as Record<string, unknown>;
      const assetId = requireString(offerInput.assetId, "assetId");
      const assetType = requireAssetType(offerInput.assetType);
      const offerCurrency = requireString(offerInput.currency, "currency");
      if (offerCurrency !== currency) {
        throw new Error("E_INVALID_ARGUMENT: offer.currency must match price.currency");
      }
      const usageScope = requireUsageScope(offerInput.usageScope);
      const deliveryType = requireDeliveryType(offerInput.deliveryType);
      const assetMeta = (offerInput.assetMeta ?? {}) as Offer["assetMeta"];

      const requestedResourceId =
        typeof resourceInput.resourceId === "string" ? resourceInput.resourceId.trim() : "";
      const existingResource = requestedResourceId
        ? store.getResource(requestedResourceId)
        : undefined;
      const resourceId = existingResource?.resourceId || requestedResourceId || randomUUID();

      if (existingResource) {
        assertActorMatch(
          config,
          actorId,
          existingResource.providerActorId,
          "resource.providerActorId",
        );
        assertResourceTransition(existingResource.status, "resource_published");
      }

      const offerId = existingResource?.offerId ?? randomUUID();
      const existingOffer = store.getOffer(offerId);
      if (existingOffer?.status === "offer_closed") {
        throw new Error("E_CONFLICT: offer is closed");
      }

      const priceNumber = parsePriceAmount(amount);
      const now = nowIso();
      const offerPayload = {
        offerId,
        sellerId: actorId,
        assetId,
        assetType,
        assetMeta,
        price: priceNumber,
        currency: offerCurrency,
        usageScope,
        deliveryType,
      };
      const offerHash = hashCanonical(offerPayload);
      const offer: Offer = {
        ...offerPayload,
        status: "offer_published",
        offerHash,
        createdAt: existingOffer?.createdAt ?? now,
        updatedAt: now,
      };

      const version = existingResource ? existingResource.version + 1 : 1;
      const resource: MarketResource = {
        resourceId,
        kind,
        status: "resource_published",
        providerActorId: actorId,
        offerId,
        offerHash,
        label,
        description,
        tags,
        price: { unit, amount, currency, tokenAddress },
        policy,
        version,
        createdAt: existingResource?.createdAt ?? now,
        updatedAt: now,
      };

      store.saveOffer(offer);
      store.saveResource(resource);

      const resourceHash = hashCanonical({
        resourceId,
        kind,
        status: resource.status,
        providerActorId: actorId,
        offerId,
        offerHash,
        label,
        description,
        tags,
        price: resource.price,
        policy,
        version,
      });
      await recordAuditWithAnchor({
        store,
        config,
        kind: "resource_published",
        refId: resourceId,
        hash: resourceHash,
        anchorId: `resource:${resourceId}`,
        actor: actorId,
      });

      respond(true, { resourceId, offerId, offerHash, status: resource.status });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
  };
}

export function createResourceUnpublishHandler(
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
      const resourceId = requireString(input.resourceId, "resourceId");
      const resource = store.getResource(resourceId);
      if (!resource) {
        throw new Error("E_NOT_FOUND: resource not found");
      }
      assertActorMatch(config, actorId, resource.providerActorId, "resource.providerActorId");
      assertResourceTransition(resource.status, "resource_unpublished");
      const now = nowIso();
      resource.status = "resource_unpublished";
      resource.updatedAt = now;
      store.saveResource(resource);

      const offer = store.getOffer(resource.offerId);
      if (offer && offer.status !== "offer_closed") {
        assertOfferTransition(offer.status, "offer_closed");
        offer.status = "offer_closed";
        offer.updatedAt = now;
        store.saveOffer(offer);
      }

      recordAudit(
        store,
        "resource_unpublished",
        resourceId,
        resource.offerHash,
        actorId || undefined,
      );
      respond(true, { resourceId, status: resource.status });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
  };
}

export function createResourceGetHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const resourceId = requireString(input.resourceId, "resourceId");
      const resource = store.getResource(resourceId) ?? null;
      respond(true, { resource });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
  };
}

export function createResourceListHandler(
  store: MarketStateStore,
  config: MarketPluginConfig,
): GatewayRequestHandler {
  return (opts: GatewayRequestHandlerOptions) => {
    const { params, respond } = opts;
    try {
      assertAccess(opts, config, "read");
      const input = (params ?? {}) as Record<string, unknown>;
      const kind = requireOptionalEnum(input, "kind", ["model", "search", "storage"]);
      const status = requireOptionalEnum(input, "status", [
        "resource_draft",
        "resource_published",
        "resource_unpublished",
      ]);
      const providerActorId = requireOptionalAddress(input, "providerActorId");
      const tag = typeof input.tag === "string" ? input.tag.trim() : undefined;
      const limit = requireLimit(input, "limit", 50, 200);
      const resources = store.listResources({ kind, status, providerActorId, tag, limit });
      respond(true, { resources });
    } catch (err) {
      respond(false, { error: formatGatewayError(err) });
    }
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

      store.saveOrder(order);
      store.saveConsent(consent);
      store.saveDelivery(delivery);
      store.saveLease(lease);

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
      store.saveLease(lease);

      const delivery = lease.deliveryId ? store.getDelivery(lease.deliveryId) : undefined;
      const order = store.getOrder(lease.orderId);
      const offer = order ? store.getOffer(order.offerId) : undefined;
      const consent = lease.consentId ? store.getConsent(lease.consentId) : undefined;

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
      const entry: MarketLedgerEntry = {
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
      respond(false, { error: formatGatewayError(err) });
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
      respond(false, { error: formatGatewayError(err) });
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
      respond(false, { error: formatGatewayError(err) });
    }
  };
}

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
      const maxAttempts = requireOptionalPositiveInt(input, "maxAttempts", { min: 1, max: 1000 });
      const attemptLimit = maxAttempts ? Math.min(limit, maxAttempts) : limit;

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
      respond(false, { error: formatGatewayError(err) });
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
