import type { Web3PluginConfig } from "../../config.js";
import type { CapabilityDescriptor } from "../types.js";
import { availability } from "./shared.js";

function marketSellerAvailability(config: Web3PluginConfig) {
  return availability(
    config.resources.enabled && config.resources.advertiseToMarket,
    !config.resources.enabled ? "resources disabled" : "resources advertise disabled",
  );
}

function marketBuyerAvailability(config: Web3PluginConfig) {
  return availability(
    config.resources.enabled && config.resources.consumer.enabled,
    !config.resources.enabled ? "resources disabled" : "resources consumer disabled",
  );
}

export function marketCommerceCapabilities(config: Web3PluginConfig): CapabilityDescriptor[] {
  const sellerAvailable = marketSellerAvailability(config);
  const buyerAvailable = marketBuyerAvailability(config);

  return [
    {
      name: "web3.market.offer.create",
      summary: "Create a seller offer for a market asset before publication.",
      kind: "gateway",
      group: "market",
      availability: sellerAvailable,
      stability: "experimental",
      permissions: { requiresIdentity: true },
      risk: { level: "medium", notes: ["Creates a draft offer visible only after publish."] },
      prerequisites: ["resources enabled", "advertiseToMarket enabled", "seller actor identity"],
      paramsSchema: {
        type: "object",
        required: [
          "actorId",
          "assetId",
          "assetType",
          "price",
          "currency",
          "usageScope",
          "deliveryType",
        ],
        properties: {
          actorId: { type: "string", description: "Seller actor ID." },
          assetId: { type: "string", description: "Seller-defined asset identifier." },
          assetType: {
            type: "string",
            description: "Asset type, such as model, search, data or workflow.",
          },
          price: { type: "number", minimum: 0.0000001, description: "Unit price for the offer." },
          currency: { type: "string", description: "Settlement currency code or token symbol." },
          usageScope: {
            type: "object",
            description: "Allowed usage scope, purpose and retention window.",
          },
          deliveryType: {
            type: "string",
            description: "Delivery mode, such as api, file or credential.",
          },
          assetMeta: {
            type: "object",
            description: "Non-secret metadata shown to buyers. Do not include credentials.",
          },
        },
      },
      returns: "Returns offerId, offerHash and the new offer status.",
    },
    {
      name: "web3.market.offer.publish",
      summary: "Publish a draft seller offer so buyers can order it.",
      kind: "gateway",
      group: "market",
      availability: sellerAvailable,
      stability: "experimental",
      permissions: { requiresIdentity: true },
      risk: { level: "medium", notes: ["Makes the offer available to buyers."] },
      prerequisites: ["Offer already created", "seller actor identity"],
      paramsSchema: {
        type: "object",
        required: ["actorId", "offerId"],
        properties: {
          actorId: { type: "string" },
          offerId: { type: "string" },
        },
      },
      returns: "Returns offerId and the published status.",
    },
    {
      name: "web3.market.offer.update",
      summary: "Update price, usage scope, delivery type or metadata of an existing offer.",
      kind: "gateway",
      group: "market",
      availability: sellerAvailable,
      stability: "experimental",
      permissions: { requiresIdentity: true },
      risk: { level: "medium", notes: ["Changing offer terms affects future orders."] },
      prerequisites: ["Offer already created", "seller actor identity"],
      paramsSchema: {
        type: "object",
        required: ["actorId", "offerId"],
        properties: {
          actorId: { type: "string" },
          offerId: { type: "string" },
          price: { type: "number", minimum: 0.0000001 },
          usageScope: { type: "object" },
          deliveryType: { type: "string" },
          assetMeta: { type: "object" },
        },
      },
      returns: "Returns offerId, updated offerHash and the current status.",
    },
    {
      name: "web3.market.offer.close",
      summary: "Close an offer and prevent future orders from using it.",
      kind: "gateway",
      group: "market",
      availability: sellerAvailable,
      stability: "experimental",
      permissions: { requiresIdentity: true },
      risk: { level: "medium", notes: ["Closing an offer is a seller-side availability change."] },
      paramsSchema: {
        type: "object",
        required: ["actorId", "offerId"],
        properties: {
          actorId: { type: "string" },
          offerId: { type: "string" },
        },
      },
      returns: "Returns offerId and the closed status.",
    },
    {
      name: "web3.market.order.create",
      summary: "Create a buyer order against a published offer.",
      kind: "gateway",
      group: "market",
      availability: buyerAvailable,
      stability: "experimental",
      permissions: { requiresIdentity: true },
      risk: {
        level: "high",
        notes: ["Creates a commercial order that may later lock payment or grant access."],
      },
      prerequisites: ["resources consumer enabled", "published offer", "buyer actor identity"],
      paramsSchema: {
        type: "object",
        required: ["actorId", "offerId", "buyerId"],
        properties: {
          actorId: { type: "string", description: "Actor authorizing the order." },
          offerId: { type: "string", description: "Published offer ID." },
          buyerId: { type: "string", description: "Buyer wallet / actor address." },
          quantity: {
            type: "number",
            minimum: 1,
            description: "Optional quantity; defaults to 1.",
          },
        },
      },
      returns: "Returns orderId, orderHash and the initial order status.",
    },
    {
      name: "web3.market.order.cancel",
      summary: "Cancel an existing buyer order before the terminal settlement path completes.",
      kind: "gateway",
      group: "market",
      availability: buyerAvailable,
      stability: "experimental",
      permissions: { requiresIdentity: true },
      risk: { level: "medium", notes: ["Cancels buyer-side commercial intent."] },
      paramsSchema: {
        type: "object",
        required: ["actorId", "orderId"],
        properties: {
          actorId: { type: "string" },
          orderId: { type: "string" },
        },
      },
      returns: "Returns orderId and the cancelled status.",
    },
    {
      name: "web3.market.consent.grant",
      summary: "Grant buyer consent for an order with a signed scope payload.",
      kind: "gateway",
      group: "market",
      availability: buyerAvailable,
      stability: "experimental",
      permissions: { requiresIdentity: true },
      risk: {
        level: "high",
        notes: ["Grants usage authorization and advances the order toward delivery."],
      },
      paramsSchema: {
        type: "object",
        required: ["actorId", "orderId", "signature", "consentScope"],
        properties: {
          actorId: { type: "string" },
          orderId: { type: "string" },
          signature: {
            type: "string",
            description: "0x-prefixed signature of the consent message.",
          },
          consentScope: { type: "object", description: "Purpose, duration and retention scope." },
        },
      },
      returns: "Returns consentId, consentHash and the granted status.",
    },
    {
      name: "web3.market.consent.revoke",
      summary:
        "Revoke previously granted buyer consent and trigger downstream delivery revocation when required.",
      kind: "gateway",
      group: "market",
      availability: buyerAvailable,
      stability: "experimental",
      permissions: { requiresIdentity: true },
      risk: {
        level: "high",
        notes: ["Revocation can deactivate downstream delivery access and spawn retry jobs."],
      },
      paramsSchema: {
        type: "object",
        required: ["actorId", "consentId"],
        properties: {
          actorId: { type: "string" },
          consentId: { type: "string" },
          reason: { type: "string" },
        },
      },
      returns: "Returns consentId, revokedAt and revokeHash.",
    },
    {
      name: "web3.market.delivery.issue",
      summary:
        "Issue seller delivery payload for an order after consent and settlement preconditions are met.",
      kind: "gateway",
      group: "market",
      availability: sellerAvailable,
      stability: "experimental",
      permissions: { requiresIdentity: true },
      risk: {
        level: "high",
        notes: ["Delivery may place credentials into the secure credentials store."],
      },
      prerequisites: ["seller actor identity", "order in a delivery-ready transition path"],
      paramsSchema: {
        type: "object",
        required: ["actorId", "orderId", "payload"],
        properties: {
          actorId: { type: "string" },
          orderId: { type: "string" },
          payload: {
            type: "object",
            description: "Delivery payload. Sensitive secrets will be stored securely.",
          },
        },
      },
      returns: "Returns deliveryId, deliveryHash and the ready status.",
    },
    {
      name: "web3.market.delivery.revoke",
      summary:
        "Revoke previously issued delivery and enqueue retry work if downstream revocation fails.",
      kind: "gateway",
      group: "market",
      availability: sellerAvailable,
      stability: "experimental",
      permissions: { requiresIdentity: true },
      risk: {
        level: "high",
        notes: ["May create revocation retry jobs and change buyer access state."],
      },
      paramsSchema: {
        type: "object",
        required: ["actorId", "deliveryId"],
        properties: {
          actorId: { type: "string" },
          deliveryId: { type: "string" },
          reason: { type: "string" },
        },
      },
      returns: "Returns deliveryId, revokedAt and downstream revoke status metadata.",
    },
    {
      name: "web3.market.delivery.complete",
      summary:
        "Mark delivery as completed so the order can advance to final acceptance and settlement release.",
      kind: "gateway",
      group: "market",
      availability: sellerAvailable,
      stability: "experimental",
      permissions: { requiresIdentity: true },
      risk: { level: "medium", notes: ["Moves delivery and order state into completed status."] },
      paramsSchema: {
        type: "object",
        required: ["actorId", "deliveryId"],
        properties: {
          actorId: { type: "string" },
          deliveryId: { type: "string" },
        },
      },
      returns: "Returns deliveryId and the completed status.",
    },
  ];
}
