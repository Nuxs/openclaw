import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import { assertOfferTransition } from "../state-machine.js";
import type { Offer } from "../types.js";
import {
  requireAssetType,
  requireDeliveryType,
  requireNumber,
  requireString,
  requireUsageScope,
} from "../validators.js";
import {
  assertAccess,
  assertActorMatch,
  formatGatewayErrorResponse,
  nowIso,
  randomUUID,
  recordAudit,
  recordAuditWithAnchor,
  requireActorId,
} from "./_shared.js";

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
      respond(false, formatGatewayErrorResponse(err));
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
      respond(false, formatGatewayErrorResponse(err));
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
      respond(false, formatGatewayErrorResponse(err));
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
      respond(false, formatGatewayErrorResponse(err));
    }
  };
}
