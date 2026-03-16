/* eslint-disable @typescript-eslint/no-explicit-any */
// src/commands/market-order.ts
/**
 * Market Order CLI 命令
 *
 * 提供订单创建、查询、取消等操作
 */

import { Command } from "commander";

export const marketOrderCommand = new Command("order")
  .description("Manage market orders as a buyer")
  .addCommand(createOrderCommand())
  .addCommand(listOrderCommand())
  .addCommand(showOrderCommand())
  .addCommand(cancelOrderCommand())
  .addCommand(acceptOrderCommand())
  .addCommand(rejectOrderCommand());

/**
 * openclaw market order create
 */
function createOrderCommand(): Command {
  return new Command("create")
    .description("Create a new order for an offer")
    .argument("<offer-id>", "Offer ID to purchase")
    .option("--quantity <n>", "Quantity", "1")
    .option("--budget-impact", "Show budget impact before ordering", true)
    .option("-y, --yes", "Skip confirmation", false)
    .action(async (offerId, options) => {
      const { callGateway } = await import("../gateway/call.js");
      const { progress } = await import("../cli/progress.js");

      // 获取报价
      const spinner = progress.spinner("Getting quote...");

      try {
        const quote = await callGateway("web3.market.offer.quote", [
          offerId,
          parseInt(options.quantity),
        ]);
        spinner.success("Quote received");

        console.log("\n  Quote Details:");
        console.log(`    Offer ID: ${quote.offerId}`);
        console.log(`    Quantity: ${quote.quantity}`);
        console.log(`    Unit Price: ${quote.unitPrice} ${quote.currency}`);
        console.log(`    Total: ${quote.totalAmount} ${quote.currency}`);
        console.log(`    Valid Until: ${new Date(quote.validUntil).toLocaleString()}`);
        console.log();

        if (options.budgetImpact) {
          const budget = await callGateway("web3.budget.status", []);
          console.log("  Budget Impact:");
          console.log(`    Daily Remaining: ${budget.remaining} ${budget.currency}`);
          console.log(
            `    After Order: ${parseFloat(budget.remaining) - parseFloat(quote.totalAmount)} ${budget.currency}`,
          );
          console.log();
        }

        if (!options.yes) {
          const confirm = await promptConfirm("Proceed with order?");
          if (!confirm) {
            console.log("Cancelled");
            return;
          }
        }

        const orderSpinner = progress.spinner("Creating order...");
        const result = await callGateway("web3.market.order.create", [
          {
            offerId,
            quantity: parseInt(options.quantity),
          },
        ]);
        orderSpinner.success("Order created");

        console.log("\n  Order Details:");
        console.log(`    Order ID: ${result.orderId}`);
        console.log(`    Status: ${result.status}`);
        console.log(`    Total: ${result.totalAmount} ${result.currency}`);
        console.log();
        console.log("Track your order:");
        console.log(`  openclaw market order status ${result.orderId}`);
      } catch (error) {
        spinner.error("Failed to create order");
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * openclaw market order list
 */
function listOrderCommand(): Command {
  return new Command("list")
    .description("List your orders")
    .option("--status <status>", "Filter by status")
    .option("--limit <n>", "Limit results", "20")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const { callGateway } = await import("../gateway/call.js");
      const { table } = await import("../terminal/table.js");

      try {
        const result = await callGateway("web3.market.order.list", [
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
          console.log("No orders found");
          return;
        }

        console.log(
          table([
            ["Order ID", "Offer", "Amount", "Status", "Created"],
            ...result.map(
              (o: {
                orderId: string;
                offerId: string;
                totalAmount?: string;
                price?: number;
                currency: string;
                status: string;
                createdAt: string;
              }) => [
                o.orderId.slice(0, 12),
                o.offerId.slice(0, 12),
                `${o.totalAmount || o.price} ${o.currency}`,
                o.status.replace("order_", "").replace("_", " "),
                new Date(o.createdAt).toLocaleDateString(),
              ],
            ),
          ]),
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * openclaw market order status / show
 */
function showOrderCommand(): Command {
  return new Command("status")
    .alias("show")
    .description("Show order details")
    .argument("<order-id>", "Order ID")
    .option("--json", "Output as JSON")
    .action(async (orderId, options) => {
      const { callGateway } = await import("../gateway/call.js");

      try {
        const result = await callGateway("web3.market.order.get", [orderId]);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(`\n  Order: ${result.orderId}`);
        console.log(`  Status: ${result.status}`);
        console.log(`\n  Details:`);
        console.log(`    Offer ID: ${result.offerId}`);
        console.log(`    Quantity: ${result.quantity || 1}`);
        console.log(`    Unit Price: ${result.unitPrice || result.price}`);
        console.log(`    Total: ${result.totalAmount || result.price} ${result.currency}`);
        console.log(`\n  Timeline:`);
        console.log(`    Created: ${result.createdAt}`);

        if (result.paymentTxHash) {
          console.log(`    Payment: ${result.paymentTxHash.slice(0, 20)}...`);
        }

        if (result.deliveryId) {
          console.log(`    Delivery: ${result.deliveryId}`);
        }

        if (result.settlementId) {
          console.log(`    Settlement: ${result.settlementId}`);
        }

        console.log();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * openclaw market order cancel
 */
function cancelOrderCommand(): Command {
  return new Command("cancel")
    .description("Cancel a pending order")
    .argument("<order-id>", "Order ID")
    .option("--reason <reason>", "Cancellation reason")
    .option("-y, --yes", "Skip confirmation", false)
    .action(async (orderId, options) => {
      const { callGateway } = await import("../gateway/call.js");

      if (!options.yes) {
        const confirm = await promptConfirm(`Cancel order ${orderId}?`);
        if (!confirm) {
          console.log("Cancelled");
          return;
        }
      }

      try {
        const result = await callGateway("web3.market.order.cancel", [
          orderId,
          { reason: options.reason },
        ]);
        console.log(`Order ${orderId} cancelled`);
        console.log(`Status: ${result.status}`);

        if (result.refundAmount) {
          console.log(`Refund: ${result.refundAmount} ${result.currency}`);
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * openclaw market order accept
 */
function acceptOrderCommand(): Command {
  return new Command("accept")
    .description("Accept a delivered order")
    .argument("<order-id>", "Order ID")
    .option("--note <note>", "Acceptance note")
    .action(async (orderId, options) => {
      const { callGateway } = await import("../gateway/call.js");
      const { progress } = await import("../cli/progress.js");

      const spinner = progress.spinner(`Accepting order ${orderId}...`);

      try {
        const result = await callGateway("web3.market.acceptance.sign", [
          orderId,
          { note: options.note },
        ]);
        spinner.success("Order accepted");

        console.log("\n  Acceptance recorded");
        console.log(`  Settlement: ${result.settlementId}`);
        console.log(`  Status: ${result.status}`);
      } catch (error) {
        spinner.error("Failed to accept order");
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * openclaw market order reject
 */
function rejectOrderCommand(): Command {
  return new Command("reject")
    .description("Reject a delivered order and optionally dispute")
    .argument("<order-id>", "Order ID")
    .option("--reason <reason>", "Rejection reason (required)")
    .option("--dispute", "Also open a dispute", false)
    .action(async (orderId, options) => {
      const { callGateway } = await import("../gateway/call.js");

      if (!options.reason) {
        console.error("Error: --reason is required for rejection");
        process.exit(1);
      }

      try {
        const result = await callGateway("web3.market.acceptance.reject", [
          orderId,
          {
            reason: options.reason,
            openDispute: options.dispute,
          },
        ]);

        console.log(`Order ${orderId} rejected`);
        console.log(`Status: ${result.status}`);

        if (result.disputeId) {
          console.log(`\nDispute opened: ${result.disputeId}`);
          console.log("Track dispute: openclaw market dispute status ${result.disputeId}");
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

// ── Helper Functions ───────────────────────────────────────────────────────────

import * as readline from "readline";

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
