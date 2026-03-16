/* eslint-disable @typescript-eslint/no-explicit-any */
// src/commands/market-browse.ts
/**
 * Market Browse CLI 命令
 *
 * 提供服务发现和浏览功能
 */

import { Command } from "commander";

export const marketBrowseCommand = new Command("browse")
  .description("Browse available services in the market")
  .option(
    "--category <category>",
    "Filter by category: search|data|inference|automation|code-review",
  )
  .option("--max-price <price>", "Maximum price filter")
  .option("--delivery <mode>", "Delivery mode filter: sync|async|scheduled")
  .option("--sort <field>", "Sort by: price|rating|popularity", "rating")
  .option("--limit <n>", "Limit results", "20")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const { callGateway } = await import("../gateway/call.js");
    const { table } = await import("../terminal/table.js");
    const { progress } = await import("../cli/progress.js");

    const spinner = progress.spinner("Searching services...");

    try {
      const result = await callGateway("web3.market.browse", [
        {
          category: options.category,
          maxPrice: options.maxPrice,
          deliveryMode: options.delivery,
          sortBy: options.sort,
          limit: parseInt(options.limit),
        },
      ]);

      spinner.success(`Found ${result.length} services`);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.length === 0) {
        console.log("\nNo services found matching your criteria.");
        console.log("Try broadening your search or check back later.\n");
        return;
      }

      console.log(
        "\n" +
          table([
            ["#", "ID", "Name", "Price", "Rating", "Delivery"],
            ...result.map(
              (
                s: {
                  id: string;
                  name?: string;
                  pricing?: {
                    type: string;
                    amount?: string;
                    currency?: string;
                    unitPrice?: string;
                    unit?: string;
                  };
                  rating?: number;
                  deliveryMode?: string;
                },
                i: number,
              ) => [
                String(i + 1),
                s.id.slice(0, 10),
                s.name?.slice(0, 25) || "N/A",
                formatPrice(s.pricing),
                `★ ${s.rating?.toFixed(1) || "N/A"}`,
                s.deliveryMode || "sync",
              ],
            ),
          ]),
      );

      console.log("\nTo view details:");
      console.log("  openclaw market show <service-id>");
      console.log("\nTo purchase:");
      console.log("  openclaw market order create <service-id>");
      console.log();
    } catch (error) {
      spinner.error("Failed to browse services");
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

export const marketShowCommand = new Command("show")
  .description("Show service details")
  .argument("<service-id>", "Service ID")
  .option("--json", "Output as JSON")
  .action(async (serviceId, options) => {
    const { callGateway } = await import("../gateway/call.js");

    try {
      const result = await callGateway("web3.market.offer.get", [serviceId]);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log("\n┌─────────────────────────────────────────────┐");
      console.log(`│ Service: ${result.offerId.slice(0, 35).padEnd(35)}│`);
      console.log("└─────────────────────────────────────────────┘");

      console.log("\n  Overview");
      console.log("  ─────────");
      console.log(`  Title: ${result.assetMeta?.title || "N/A"}`);
      console.log(`  Description: ${result.assetMeta?.description || "N/A"}`);
      console.log(`  Type: ${result.assetType}`);
      console.log(`  Status: ${result.status}`);

      console.log("\n  Pricing");
      console.log("  ─────────");
      console.log(`  Price: ${result.price} ${result.currency}`);
      console.log(`  Supply: ${result.supply || "Unlimited"}`);

      console.log("\n  Delivery");
      console.log("  ─────────");
      console.log(`  Mode: ${result.deliveryType}`);
      console.log(`  Proof Type: ${result.proofType || "tlsnotary"}`);

      console.log("\n  Provider");
      console.log("  ─────────");
      console.log(`  ID: ${result.sellerId?.slice(0, 20) || "N/A"}...`);

      console.log("\n  Timeline");
      console.log("  ─────────");
      console.log(`  Created: ${new Date(result.createdAt).toLocaleString()}`);
      if (result.publishedAt) {
        console.log(`  Published: ${new Date(result.publishedAt).toLocaleString()}`);
      }

      console.log("\n  Actions");
      console.log("  ─────────");
      console.log("  Get quote:   openclaw market quote " + serviceId);
      console.log("  Purchase:    openclaw market order create " + serviceId);
      console.log();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

export const marketQuoteCommand = new Command("quote")
  .description("Get a price quote for a service")
  .argument("<service-id>", "Service ID")
  .option("--quantity <n>", "Quantity", "1")
  .action(async (serviceId, options) => {
    const { callGateway } = await import("../gateway/call.js");

    try {
      const result = await callGateway("web3.market.offer.quote", [
        serviceId,
        parseInt(options.quantity),
      ]);

      console.log("\n  Quote Details");
      console.log("  ─────────────");
      console.log(`  Service: ${result.offerId}`);
      console.log(`  Quantity: ${result.quantity}`);
      console.log(`  Unit Price: ${result.unitPrice} ${result.currency}`);
      console.log(`  Total: ${result.totalAmount} ${result.currency}`);
      console.log(`  Valid Until: ${new Date(result.validUntil).toLocaleString()}`);
      console.log();

      if (result.estimatedDelivery) {
        console.log(`  Estimated Delivery: ${result.estimatedDelivery}`);
      }

      console.log("\n  To purchase:");
      console.log(`  openclaw market order create ${serviceId} --quantity ${options.quantity}`);
      console.log();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// ── Helper Functions ───────────────────────────────────────────────────────────

function formatPrice(
  pricing: {
    type?: string;
    amount?: string;
    currency?: string;
    unitPrice?: string;
    unit?: string;
  } | null,
): string {
  if (!pricing) {
    return "N/A";
  }

  if (pricing.type === "fixed") {
    return `${pricing.amount} ${pricing.currency}`;
  } else if (pricing.type === "metered") {
    return `${pricing.unitPrice}/${pricing.unit || "unit"}`;
  }

  return `${pricing.amount || pricing.unitPrice || "N/A"} ${pricing.currency || ""}`;
}
