import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/core";
import type { Web3PluginConfig } from "../config.js";
import {
  callGatewayMethod,
  errorResult,
  requireTrimmedString,
  safeResult,
} from "./market-tools-shared.js";

const OfferAssetMetaSchema = Type.Optional(
  Type.Object(
    {},
    {
      additionalProperties: true,
      description: "Offer metadata passed through to market.offer.*. Do not include secrets.",
    },
  ),
);

const OfferCreateSchema = Type.Object(
  {
    actorId: Type.String({ description: "Provider actor ID authorizing the offer." }),
    assetId: Type.String({ description: "Asset or runtime identifier referenced by the offer." }),
    assetType: Type.String({ description: "Asset type, e.g. service, model, dataset." }),
    price: Type.Number({ exclusiveMinimum: 0, description: "Positive unit price." }),
    currency: Type.String({ description: "Settlement currency symbol, e.g. USDC." }),
    usageScope: Type.String({ description: "Usage scope, e.g. single_use, session, perpetual." }),
    deliveryType: Type.String({ description: "Delivery type, e.g. api, download, stream." }),
    assetMeta: OfferAssetMetaSchema,
  },
  { additionalProperties: false },
);

type OfferCreateParams = {
  actorId: string;
  assetId: string;
  assetType: string;
  price: number;
  currency: string;
  usageScope: string;
  deliveryType: string;
  assetMeta?: Record<string, unknown>;
};

const OfferUpdateSchema = Type.Object(
  {
    actorId: Type.String({ description: "Provider actor ID authorizing the update." }),
    offerId: Type.String({ description: "Offer ID to update." }),
    price: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
    usageScope: Type.Optional(Type.String()),
    deliveryType: Type.Optional(Type.String()),
    assetMeta: OfferAssetMetaSchema,
  },
  { additionalProperties: false },
);

type OfferUpdateParams = {
  actorId: string;
  offerId: string;
  price?: number;
  usageScope?: string;
  deliveryType?: string;
  assetMeta?: Record<string, unknown>;
};

const OfferLifecycleSchema = Type.Object(
  {
    actorId: Type.String({ description: "Provider actor ID authorizing the lifecycle change." }),
    offerId: Type.String({ description: "Offer ID to publish or close." }),
  },
  { additionalProperties: false },
);

type OfferLifecycleParams = {
  actorId: string;
  offerId: string;
};

// Validation helpers imported from market-tools-shared.ts

export function createWeb3MarketOfferCreateTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled || !config.resources.advertiseToMarket) {
    return null;
  }
  return {
    name: "web3.market.offer.create",
    label: "Web3 Market Offer Create",
    description:
      "Create a provider offer draft for onboarding. Use before publish to establish seller-side pricing and delivery terms.",
    parameters: OfferCreateSchema,
    execute: async (_toolCallId, params: OfferCreateParams) => {
      try {
        const result = await callGatewayMethod(config, "web3.market.offer.create", {
          actorId: requireTrimmedString(params.actorId, "actorId"),
          assetId: requireTrimmedString(params.assetId, "assetId"),
          assetType: requireTrimmedString(params.assetType, "assetType"),
          price: params.price,
          currency: requireTrimmedString(params.currency, "currency"),
          usageScope: requireTrimmedString(params.usageScope, "usageScope"),
          deliveryType: requireTrimmedString(params.deliveryType, "deliveryType"),
          assetMeta: params.assetMeta,
        });
        return safeResult({
          onboardingStage: "offer_draft",
          nextAction: "Review the draft, then publish the offer and publish the backing resource.",
          result,
        });
      } catch (err) {
        return errorResult(err, {
          fields: [
            "actorId",
            "assetId",
            "assetType",
            "price",
            "currency",
            "usageScope",
            "deliveryType",
          ],
        });
      }
    },
  } as AnyAgentTool;
}

export function createWeb3MarketOfferUpdateTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled || !config.resources.advertiseToMarket) {
    return null;
  }
  return {
    name: "web3.market.offer.update",
    label: "Web3 Market Offer Update",
    description:
      "Update offer pricing, usage scope, delivery type, or redacted metadata before the next publish step.",
    parameters: OfferUpdateSchema,
    execute: async (_toolCallId, params: OfferUpdateParams) => {
      try {
        const actorId = requireTrimmedString(params.actorId, "actorId");
        const offerId = requireTrimmedString(params.offerId, "offerId");
        if (
          params.price === undefined &&
          params.usageScope === undefined &&
          params.deliveryType === undefined &&
          params.assetMeta === undefined
        ) {
          return errorResult("at least one mutable offer field is required", {
            fields: ["price", "usageScope", "deliveryType", "assetMeta"],
          });
        }
        const result = await callGatewayMethod(config, "web3.market.offer.update", {
          actorId,
          offerId,
          price: params.price,
          usageScope: params.usageScope?.trim(),
          deliveryType: params.deliveryType?.trim(),
          assetMeta: params.assetMeta,
        });
        return safeResult({
          onboardingStage: "offer_updated",
          nextAction:
            "Re-run verify if pricing or delivery posture changed, then publish the offer.",
          result,
        });
      } catch (err) {
        return errorResult(err, {
          fields: ["actorId", "offerId", "price", "usageScope", "deliveryType", "assetMeta"],
        });
      }
    },
  } as AnyAgentTool;
}

function createOfferLifecycleTool(params: {
  config: Web3PluginConfig;
  name: "web3.market.offer.publish" | "web3.market.offer.close";
  label: string;
  description: string;
  method: "web3.market.offer.publish" | "web3.market.offer.close";
  onboardingStage: "offer_published" | "offer_closed";
  nextAction: string;
}): AnyAgentTool | null {
  if (!params.config.resources.enabled || !params.config.resources.advertiseToMarket) {
    return null;
  }
  return {
    name: params.name,
    label: params.label,
    description: params.description,
    parameters: OfferLifecycleSchema,
    execute: async (_toolCallId, raw: OfferLifecycleParams) => {
      try {
        const actorId = requireTrimmedString(raw.actorId, "actorId");
        const offerId = requireTrimmedString(raw.offerId, "offerId");
        const result = await callGatewayMethod(params.config, params.method, { actorId, offerId });
        return safeResult({
          onboardingStage: params.onboardingStage,
          nextAction: params.nextAction,
          result,
        });
      } catch (err) {
        return errorResult(err, { fields: ["actorId", "offerId"] });
      }
    },
  } as AnyAgentTool;
}

export function createWeb3MarketOfferPublishTool(config: Web3PluginConfig): AnyAgentTool | null {
  return createOfferLifecycleTool({
    config,
    name: "web3.market.offer.publish",
    label: "Web3 Market Offer Publish",
    description:
      "Publish an offer after the provider onboarding checks are green enough to expose it.",
    method: "web3.market.offer.publish",
    onboardingStage: "offer_published",
    nextAction: "Publish or refresh the resource listing so buyers can discover the updated offer.",
  });
}

export function createWeb3MarketOfferCloseTool(config: Web3PluginConfig): AnyAgentTool | null {
  return createOfferLifecycleTool({
    config,
    name: "web3.market.offer.close",
    label: "Web3 Market Offer Close",
    description: "Close an existing offer without deleting the audit trail.",
    method: "web3.market.offer.close",
    onboardingStage: "offer_closed",
    nextAction: "Unpublish any linked resources if the offer should disappear from discovery.",
  });
}
