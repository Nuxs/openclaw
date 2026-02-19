import type { GatewayRequestHandler, GatewayRequestHandlerOptions } from "openclaw/plugin-sdk";
import type { MarketPluginConfig } from "../../config.js";
import type { MarketStateStore } from "../../state/store.js";
import { hashCanonical } from "../hash.js";
import type { MarketResource } from "../resources.js";
import { assertOfferTransition, assertResourceTransition } from "../state-machine.js";
import type { Offer } from "../types.js";
import {
  requireAssetType,
  requireBigNumberishString,
  requireDeliveryType,
  requireEnum,
  requireOptionalEnum,
  requireOptionalPositiveInt,
  requireOptionalStringArray,
  requireString,
  requireUsageScope,
} from "../validators.js";
import { requireLimit } from "../validators.js";
import {
  RESOURCE_PRICE_UNITS,
  assertAccess,
  assertActorMatch,
  formatGatewayError,
  nowIso,
  parsePriceAmount,
  randomUUID,
  recordAudit,
  recordAuditWithAnchor,
  requireOptionalAddress,
} from "./_shared.js";

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
