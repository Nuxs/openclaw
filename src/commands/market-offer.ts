/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unused-vars */
// src/commands/market-offer.ts
/**
 * Market Offer CLI 命令
 *
 * 提供服务报价的创建、编辑、发布、下架等操作
 */

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import * as readline from "readline";
import { Command } from "commander";

export const marketOfferCommand = new Command("offer")
  .description("Manage service offers as a provider")
  .addCommand(createOfferCommand())
  .addCommand(editOfferCommand())
  .addCommand(publishOfferCommand())
  .addCommand(unpublishOfferCommand())
  .addCommand(closeOfferCommand())
  .addCommand(listOfferCommand())
  .addCommand(showOfferCommand());

/**
 * openclaw market offer create
 */
function createOfferCommand(): Command {
  return new Command("create")
    .description("Create a new service offer")
    .option("-f, --file <path>", "Offer definition file (JSON)")
    .option("--name <name>", "Service name")
    .option("--description <desc>", "Service description")
    .option("--price <price>", "Price (e.g., 0.01)")
    .option("--currency <currency>", "Currency (e.g., USDC)", "USDC")
    .option("--supply <supply>", "Supply limit (or 'unlimited')", "unlimited")
    .option("--delivery <mode>", "Delivery mode: sync|async|scheduled", "sync")
    .option("--proof <type>", "Proof type: tlsnotary|signed_receipt|api_response", "tlsnotary")
    .option("--interactive", "Use interactive mode", false)
    .action(async (options) => {
      const { callGateway } = await import("../gateway/call.js");
      const { progress } = await import("../cli/progress.js");

      let input: CreateOfferInput;

      if (options.file) {
        // 从文件读取
        const filePath = options.file.startsWith("~")
          ? options.file.replace("~", homedir())
          : options.file;

        if (!existsSync(filePath)) {
          console.error(`Error: File not found: ${filePath}`);
          process.exit(1);
        }

        input = JSON.parse(readFileSync(filePath, "utf-8"));
      } else if (options.interactive || !options.name) {
        // 交互式创建
        input = await interactiveCreateOffer(options);
      } else {
        // 从命令行参数创建
        input = buildOfferInput(options);
      }

      const spinner = progress.spinner("Creating offer...");

      try {
        const result = await callGateway("web3.market.offer.create", [input]);
        spinner.success("Offer created");

        console.log("");
        console.log(`  Offer ID: ${result.offerId}`);
        console.log(`  Status: ${result.status}`);
        console.log("");
        console.log("Next steps:");
        console.log(`  1. Review: openclaw market offer show ${result.offerId}`);
        console.log(`  2. Publish: openclaw market offer publish ${result.offerId}`);
      } catch (error) {
        spinner.error("Failed to create offer");
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * openclaw market offer edit
 */
function editOfferCommand(): Command {
  return new Command("edit")
    .description("Edit an existing offer")
    .argument("<offer-id>", "Offer ID")
    .option("--price <price>", "New price")
    .option("--supply <supply>", "New supply limit")
    .option("--description <desc>", "New description")
    .option("--metadata <json>", "Metadata updates (JSON)")
    .action(async (offerId, options) => {
      const { callGateway } = await import("../gateway/call.js");

      const updates: Partial<ServiceOffer> = {};

      if (options.price) {
        updates.price = parseFloat(options.price);
      }
      if (options.supply) {
        updates.supply = options.supply === "unlimited" ? "unlimited" : parseInt(options.supply);
      }
      if (options.description) {
        updates.description = options.description;
      }
      if (options.metadata) {
        updates.metadata = JSON.parse(options.metadata);
      }

      if (Object.keys(updates).length === 0) {
        console.error("Error: No updates specified");
        process.exit(1);
      }

      try {
        const result = await callGateway("web3.market.offer.edit", [offerId, updates]);
        console.log(`Offer ${offerId} updated`);
        console.log(`Status: ${result.status}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * openclaw market offer publish
 */
function publishOfferCommand(): Command {
  return new Command("publish")
    .description("Publish a draft offer")
    .argument("<offer-id>", "Offer ID")
    .option("--force", "Skip validation checks", false)
    .action(async (offerId, options) => {
      const { callGateway } = await import("../gateway/call.js");
      const { progress } = await import("../cli/progress.js");

      const spinner = progress.spinner(`Publishing offer ${offerId}...`);

      try {
        const result = await callGateway("web3.market.offer.publish", [
          offerId,
          { force: options.force },
        ]);
        spinner.success("Offer published");

        console.log("");
        console.log(`  Offer ID: ${result.offerId}`);
        console.log(`  Status: ${result.status}`);
        console.log(`  Published at: ${result.publishedAt}`);
      } catch (error) {
        spinner.error("Failed to publish offer");
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * openclaw market offer unpublish
 */
function unpublishOfferCommand(): Command {
  return new Command("unpublish")
    .description("Unpublish a published offer")
    .argument("<offer-id>", "Offer ID")
    .option("-y, --yes", "Skip confirmation", false)
    .action(async (offerId, options) => {
      const { callGateway } = await import("../gateway/call.js");

      if (!options.yes) {
        const confirm = await promptConfirm(`Unpublish offer ${offerId}?`);
        if (!confirm) {
          console.log("Cancelled");
          return;
        }
      }

      try {
        const result = await callGateway("web3.market.offer.unpublish", [offerId]);
        console.log(`Offer ${offerId} unpublished`);
        console.log(`Status: ${result.status}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * openclaw market offer close
 */
function closeOfferCommand(): Command {
  return new Command("close")
    .description("Permanently close an offer")
    .argument("<offer-id>", "Offer ID")
    .option("-y, --yes", "Skip confirmation", false)
    .option("--reason <reason>", "Close reason")
    .action(async (offerId, options) => {
      const { callGateway } = await import("../gateway/call.js");

      if (!options.yes) {
        const confirm = await promptConfirm(
          `Permanently close offer ${offerId}? This cannot be undone.`,
        );
        if (!confirm) {
          console.log("Cancelled");
          return;
        }
      }

      try {
        const result = await callGateway("web3.market.offer.close", [
          offerId,
          { reason: options.reason },
        ]);
        console.log(`Offer ${offerId} closed`);
        console.log(`Status: ${result.status}`);
        console.log(`Closed at: ${result.closedAt}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * openclaw market offer list
 */
function listOfferCommand(): Command {
  return new Command("list")
    .description("List your offers")
    .option("--status <status>", "Filter by status: draft|published|unpublished|closed")
    .option("--limit <n>", "Limit results", "20")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const { callGateway } = await import("../gateway/call.js");
      const { table } = await import("../terminal/table.js");

      try {
        const result = await callGateway("web3.market.offer.list", [
          {
            status: options.status,
            limit: parseInt(options.limit),
          },
        ]);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.length === 0) {
          console.log("No offers found");
          return;
        }

        console.log(
          table([
            ["ID", "Name", "Price", "Status", "Created"],
            ...result.map((o: any) => [
              o.offerId.slice(0, 12),
              o.assetMeta?.title || o.assetId.slice(0, 20),
              `${o.price} ${o.currency}`,
              o.status.replace("offer_", ""),
              new Date(o.createdAt).toLocaleDateString(),
            ]),
          ]),
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * openclaw market offer show
 */
function showOfferCommand(): Command {
  return new Command("show")
    .description("Show offer details")
    .argument("<offer-id>", "Offer ID")
    .option("--json", "Output as JSON")
    .action(async (offerId, options) => {
      const { callGateway } = await import("../gateway/call.js");

      try {
        const result = await callGateway("web3.market.offer.get", [offerId]);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(`\n  Offer: ${result.offerId}`);
        console.log(`  Status: ${result.status}`);
        console.log(`\n  Asset:`);
        console.log(`    Type: ${result.assetType}`);
        console.log(`    Title: ${result.assetMeta?.title || "N/A"}`);
        console.log(`    Description: ${result.assetMeta?.description || "N/A"}`);
        console.log(`\n  Pricing:`);
        console.log(`    Price: ${result.price} ${result.currency}`);
        console.log(`    Supply: ${result.supply || "unlimited"}`);
        console.log(`\n  Delivery:`);
        console.log(`    Type: ${result.deliveryType}`);
        console.log(`\n  Timeline:`);
        console.log(`    Created: ${result.createdAt}`);
        if (result.publishedAt) {
          console.log(`    Published: ${result.publishedAt}`);
        }
        if (result.closedAt) {
          console.log(`    Closed: ${result.closedAt}`);
        }
        console.log();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

// ── Helper Functions ───────────────────────────────────────────────────────────

async function interactiveCreateOffer(options: any): Promise<CreateOfferInput> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string, defaultVal?: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(`${prompt}${defaultVal ? ` (${defaultVal})` : ""}: `, (answer) => {
        resolve(answer || defaultVal || "");
      });
    });
  };

  const select = async (
    prompt: string,
    choices: string[],
    defaultVal?: string,
  ): Promise<string> => {
    console.log(`\n${prompt}`);
    choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
    const answer = await question("Select", defaultVal);
    const idx = parseInt(answer) - 1;
    return choices[idx] ?? choices[0] ?? "";
  };

  console.log("\n=== Create New Offer ===\n");

  const serviceType = await select(
    "What type of service are you offering?",
    [
      "Search",
      "Data Enrichment",
      "Model Inference",
      "Automation",
      "Code Review",
      "Security Review",
    ],
    "1",
  );

  const name = await question("Service name", options.name);
  const description = await question("Description");

  const pricingType = await select("Pricing model", ["Fixed price", "Metered (pay per unit)"], "1");

  const price = await question("Price (USDC)", options.price || "0.01");
  const currency = await question("Currency", "USDC");

  const delivery = await select("Delivery mode", ["sync", "async", "scheduled"], "1");

  const proof = await select("Proof type", ["tlsnotary", "signed_receipt", "api_response"], "1");

  const supplyAnswer = await question("Supply limit (or 'unlimited')", "unlimited");

  rl.close();

  return {
    assetType: mapServiceTypeToAssetType(serviceType),
    assetMeta: {
      title: name,
      description,
      tags: [serviceType.toLowerCase().replace(" ", "-")],
    },
    price: parseFloat(price),
    currency,
    deliveryType: delivery as DeliveryType,
    supply: supplyAnswer === "unlimited" ? undefined : parseInt(supplyAnswer),
    usageScope: {
      purpose: description,
    },
  };
}

function buildOfferInput(options: any): CreateOfferInput {
  return {
    assetType: "service",
    assetMeta: {
      title: options.name,
      description: options.description,
    },
    price: parseFloat(options.price),
    currency: options.currency,
    deliveryType: options.delivery as DeliveryType,
    supply: options.supply === "unlimited" ? undefined : parseInt(options.supply),
    usageScope: {
      purpose: options.description || options.name,
    },
  };
}

function mapServiceTypeToAssetType(serviceType: string): AssetType {
  const mapping: Record<string, AssetType> = {
    search: "service",
    "data enrichment": "data",
    "model inference": "service",
    automation: "service",
    "code review": "service",
    "security review": "service",
  };
  return mapping[serviceType.toLowerCase()] || "service";
}

async function promptConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AssetType = "data" | "api" | "service";
type DeliveryType = "download" | "api" | "service";

interface CreateOfferInput {
  assetType: AssetType;
  assetMeta?: {
    title?: string;
    description?: string;
    tags?: string[];
  };
  price: number;
  currency: string;
  deliveryType: DeliveryType;
  supply?: number;
  usageScope: {
    purpose: string;
    region?: string;
    durationDays?: number;
  };
}

interface ServiceOffer {
  offerId: string;
  status: string;
  price: number;
  currency: string;
  supply?: number;
  assetType: AssetType;
  assetMeta?: {
    title?: string;
    description?: string;
  };
  deliveryType: DeliveryType;
  createdAt: string;
  publishedAt?: string;
  closedAt?: string;
}
