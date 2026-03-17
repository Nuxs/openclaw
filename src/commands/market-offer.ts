import { Command } from "commander";
import {
  asRecord,
  asString,
  buildAssetMeta,
  callCliGateway,
  optionalNumberOption,
  parseCsv,
  printJson,
  promptConfirm,
  readJsonObjectFile,
  requireStringOption,
} from "./market-shared.js";

type OfferCreateParams = {
  actorId: string;
  assetId: string;
  assetType: "data" | "api" | "service";
  price: number;
  currency: string;
  usageScope: { purpose: string };
  deliveryType: "download" | "api" | "service";
  assetMeta?: Record<string, unknown>;
};

type OfferUpdateParams = {
  actorId: string;
  offerId: string;
  price?: number;
  usageScope?: { purpose: string };
  deliveryType?: "download" | "api" | "service";
  assetMeta?: Record<string, unknown>;
};

export const marketOfferCommand = new Command("offer")
  .description("Manage provider offer drafts and lifecycle state")
  .addCommand(createOfferCommand())
  .addCommand(updateOfferCommand())
  .addCommand(publishOfferCommand())
  .addCommand(closeOfferCommand());

function createOfferCommand(): Command {
  return new Command("create")
    .description("Create a provider offer draft")
    .option("-f, --file <path>", "JSON file with the offer payload")
    .option("--actor-id <actorId>", "Provider actor ID")
    .option("--asset-id <assetId>", "Stable asset identifier")
    .option("--asset-type <assetType>", "Asset type: data|api|service", "service")
    .option("--price <price>", "Positive unit price")
    .option("--currency <currency>", "Settlement currency", "USDC")
    .option("--usage-purpose <purpose>", "Usage scope purpose")
    .option("--delivery-type <deliveryType>", "Delivery type: download|api|service", "service")
    .option("--title <title>", "Display title")
    .option("--description <description>", "Redacted description")
    .option("--tags <csv>", "Comma-separated redacted tags")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const params = buildCreateParams(options);
        const result = await callCliGateway("web3.market.offer.create", params);
        if (options.json) {
          printJson(result);
          return;
        }
        console.log("Offer draft created.");
        console.log(`Offer ID: ${asString(result.offerId) ?? "n/a"}`);
        console.log(`Status: ${asString(result.status) ?? "n/a"}`);
        console.log(`Hash: ${asString(result.offerHash) ?? "n/a"}`);
        console.log("Next steps:");
        console.log(
          `- Update pricing/metadata: openclaw market offer update ${asString(result.offerId) ?? "<offer-id>"} --actor-id ${params.actorId}`,
        );
        console.log(
          `- Publish draft: openclaw market offer publish ${asString(result.offerId) ?? "<offer-id>"} --actor-id ${params.actorId}`,
        );
        console.log(
          "- Publish the backing resource via the provider workflow so buyers can discover it.",
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function updateOfferCommand(): Command {
  return new Command("update")
    .description("Update a provider offer draft or published offer")
    .argument("<offer-id>", "Offer ID")
    .option("-f, --file <path>", "JSON file with fields to update")
    .option("--actor-id <actorId>", "Provider actor ID")
    .option("--price <price>", "Updated price")
    .option("--usage-purpose <purpose>", "Updated usage purpose")
    .option("--delivery-type <deliveryType>", "Updated delivery type")
    .option("--title <title>", "Updated title")
    .option("--description <description>", "Updated description")
    .option("--tags <csv>", "Updated tags")
    .option("--json", "Output as JSON")
    .action(async (offerId, options) => {
      try {
        const params = buildUpdateParams(offerId, options);
        const result = await callCliGateway("web3.market.offer.update", params);
        if (options.json) {
          printJson(result);
          return;
        }
        console.log(`Offer updated: ${asString(result.offerId) ?? offerId}`);
        console.log(`Status: ${asString(result.status) ?? "n/a"}`);
        console.log(`Hash: ${asString(result.offerHash) ?? "n/a"}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function publishOfferCommand(): Command {
  return new Command("publish")
    .description("Publish an existing provider offer")
    .argument("<offer-id>", "Offer ID")
    .option("--actor-id <actorId>", "Provider actor ID")
    .option("--json", "Output as JSON")
    .action(async (offerId, options) => {
      try {
        const actorId = requireStringOption(options.actorId, "actor-id");
        const result = await callCliGateway("web3.market.offer.publish", {
          actorId,
          offerId,
        });
        if (options.json) {
          printJson(result);
          return;
        }
        console.log(`Offer published: ${asString(result.offerId) ?? offerId}`);
        console.log(`Status: ${asString(result.status) ?? "n/a"}`);
        console.log(
          "Next step: publish or refresh the backing resource so buyers can discover the offer.",
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function closeOfferCommand(): Command {
  return new Command("close")
    .description("Close an offer without deleting its audit trail")
    .argument("<offer-id>", "Offer ID")
    .option("--actor-id <actorId>", "Provider actor ID")
    .option("-y, --yes", "Skip confirmation", false)
    .option("--json", "Output as JSON")
    .action(async (offerId, options) => {
      try {
        const actorId = requireStringOption(options.actorId, "actor-id");
        if (!options.yes) {
          const confirmed = await promptConfirm(`Close offer ${offerId}?`);
          if (!confirmed) {
            console.log("Cancelled.");
            return;
          }
        }
        const result = await callCliGateway("web3.market.offer.close", {
          actorId,
          offerId,
        });
        if (options.json) {
          printJson(result);
          return;
        }
        console.log(`Offer closed: ${asString(result.offerId) ?? offerId}`);
        console.log(`Status: ${asString(result.status) ?? "n/a"}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function buildCreateParams(options: Record<string, unknown>): OfferCreateParams {
  const fileInput = options.file
    ? readJsonObjectFile(requireStringOption(options.file, "file"))
    : {};
  const assetMetaInput = asRecord(fileInput.assetMeta);
  const tags = parseCsv(asString(options.tags) ?? "");
  const price = optionalNumberOption(options.price ?? fileInput.price, "price");
  if (price === undefined || price <= 0) {
    throw new Error("price must be greater than 0");
  }
  return {
    actorId: requireStringOption(options.actorId ?? fileInput.actorId, "actor-id"),
    assetId: requireStringOption(options.assetId ?? fileInput.assetId, "asset-id"),
    assetType: requireAssetType(options.assetType ?? fileInput.assetType ?? "service"),
    price,
    currency: requireStringOption(options.currency ?? fileInput.currency ?? "USDC", "currency"),
    usageScope: {
      purpose: requireStringOption(
        options.usagePurpose ?? asRecord(fileInput.usageScope)?.purpose,
        "usage-purpose",
      ),
    },
    deliveryType: requireDeliveryType(options.deliveryType ?? fileInput.deliveryType ?? "service"),
    assetMeta: buildAssetMeta({
      existing: assetMetaInput,
      title: asString(options.title),
      description: asString(options.description),
      tags,
    }),
  };
}

function buildUpdateParams(offerId: string, options: Record<string, unknown>): OfferUpdateParams {
  const fileInput = options.file
    ? readJsonObjectFile(requireStringOption(options.file, "file"))
    : {};
  const assetMetaInput = asRecord(fileInput.assetMeta);
  const tags = parseCsv(asString(options.tags) ?? "");
  const price = optionalNumberOption(options.price ?? fileInput.price, "price");
  const usagePurpose =
    asString(options.usagePurpose) ?? asString(asRecord(fileInput.usageScope)?.purpose);
  const deliveryTypeRaw = options.deliveryType ?? fileInput.deliveryType;
  const assetMeta = buildAssetMeta({
    existing: assetMetaInput,
    title: asString(options.title),
    description: asString(options.description),
    tags,
  });
  if (
    price === undefined &&
    !usagePurpose &&
    deliveryTypeRaw === undefined &&
    assetMeta === undefined
  ) {
    throw new Error("At least one mutable field is required for update.");
  }
  return {
    actorId: requireStringOption(options.actorId ?? fileInput.actorId, "actor-id"),
    offerId,
    price,
    usageScope: usagePurpose ? { purpose: usagePurpose } : undefined,
    deliveryType: deliveryTypeRaw !== undefined ? requireDeliveryType(deliveryTypeRaw) : undefined,
    assetMeta,
  };
}

function requireAssetType(value: unknown): "data" | "api" | "service" {
  const normalized = requireStringOption(value, "asset-type");
  if (normalized === "data" || normalized === "api" || normalized === "service") {
    return normalized;
  }
  throw new Error("asset-type must be one of: data, api, service");
}

function requireDeliveryType(value: unknown): "download" | "api" | "service" {
  const normalized = requireStringOption(value, "delivery-type");
  if (normalized === "download" || normalized === "api" || normalized === "service") {
    return normalized;
  }
  throw new Error("delivery-type must be one of: download, api, service");
}
