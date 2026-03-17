import { Command } from "commander";
import {
  asArray,
  asDisplayString,
  asRecord,
  asString,
  callCliGateway,
  formatTimestamp,
  printJson,
  printTable,
  promptConfirm,
  requireStringOption,
  shortId,
} from "./market-shared.js";

type QuotePayload = {
  offerId: string;
  resourceId: string;
  providerActorId: string;
  quantity: number;
  estimatedTotal?: string | null;
  price?: Record<string, unknown> | null;
};

export const marketOrderCommand = new Command("order")
  .description("Manage buyer-side market orders")
  .addCommand(createOrderCommand())
  .addCommand(listOrderCommand())
  .addCommand(showOrderCommand())
  .addCommand(cancelOrderCommand())
  .addCommand(acceptOrderCommand())
  .addCommand(rejectOrderCommand());

function createOrderCommand(): Command {
  return new Command("create")
    .description("Create a buyer order from a published resource")
    .argument("<resource-id>", "Published resource ID")
    .option("--buyer-id <actorId>", "Buyer actor ID")
    .option("--actor-id <actorId>", "Authorizing actor ID; defaults to buyer-id")
    .option("--quantity <n>", "Quantity", "1")
    .option("-y, --yes", "Skip confirmation", false)
    .option("--json", "Output as JSON")
    .action(async (resourceId, options) => {
      try {
        const buyerId = requireStringOption(options.buyerId, "buyer-id");
        const actorId = asString(options.actorId) ?? buyerId;
        const quantity = Number.parseInt(options.quantity, 10);
        const quoteResponse = await callCliGateway("web3.market.offer.quote", {
          resourceId,
          quantity,
        });
        const quote = normalizeQuote(asRecord(quoteResponse)?.quote);
        if (!quote) {
          throw new Error("quote unavailable");
        }

        if (!options.yes) {
          console.log(`Resource: ${quote.resourceId}`);
          console.log(`Offer: ${quote.offerId}`);
          console.log(`Provider: ${quote.providerActorId}`);
          console.log(`Quantity: ${quote.quantity}`);
          console.log(`Estimated total: ${quote.estimatedTotal ?? "n/a"}`);
          const confirmed = await promptConfirm("Create the order with the quoted offer?");
          if (!confirmed) {
            console.log("Cancelled.");
            return;
          }
        }

        const result = await callCliGateway("web3.market.order.create", {
          actorId,
          buyerId,
          offerId: quote.offerId,
          quantity,
        });
        if (options.json) {
          printJson({ quote, result });
          return;
        }
        console.log(`Order created: ${asString(result.orderId) ?? "n/a"}`);
        console.log(`Status: ${asString(result.status) ?? "n/a"}`);
        console.log(`Order hash: ${asString(result.orderHash) ?? "n/a"}`);
        console.log(
          `Track it: openclaw market order status ${asString(result.orderId) ?? "<order-id>"}`,
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function listOrderCommand(): Command {
  return new Command("list")
    .description("List buyer/provider orders")
    .option("--order-id <orderId>", "Filter by order ID")
    .option("--offer-id <offerId>", "Filter by offer ID")
    .option("--buyer-id <actorId>", "Filter by buyer actor ID")
    .option("--seller-id <actorId>", "Filter by seller actor ID")
    .option("--status <status>", "Filter by status")
    .option("--limit <n>", "Limit results", "20")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const response = await callCliGateway("web3.market.order.list", {
          orderId: options.orderId,
          offerId: options.offerId,
          buyerId: options.buyerId,
          sellerId: options.sellerId,
          status: options.status,
          limit: Number.parseInt(options.limit, 10),
        });
        const orders = asArray(asRecord(response)?.orders)
          .map((entry) => asRecord(entry))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry));

        if (options.json) {
          printJson({ count: orders.length, orders });
          return;
        }

        if (orders.length === 0) {
          console.log("No orders matched the current filters.");
          return;
        }

        printTable(
          [
            { key: "orderId", header: "Order" },
            { key: "resource", header: "Resource", flex: true, minWidth: 18 },
            { key: "buyer", header: "Buyer" },
            { key: "seller", header: "Seller" },
            { key: "status", header: "Status" },
            { key: "createdAt", header: "Created" },
          ],
          orders.map((order) => ({
            orderId: shortId(order.orderId),
            resource: asString(order.resourceName) ?? asString(order.offerId) ?? "n/a",
            buyer: shortId(order.buyerId),
            seller: shortId(order.sellerId),
            status: (asString(order.status) ?? "n/a").replaceAll("_", " "),
            createdAt: formatTimestamp(order.createdAt),
          })),
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function showOrderCommand(): Command {
  return new Command("status")
    .alias("show")
    .description("Show one order plus the execution summary")
    .argument("<order-id>", "Order ID")
    .option("--buyer-id <actorId>", "Optional buyer actor filter")
    .option("--seller-id <actorId>", "Optional seller actor filter")
    .option("--json", "Output as JSON")
    .action(async (orderId, options) => {
      try {
        const [listResponse, executionResponse] = await Promise.all([
          callCliGateway("web3.market.order.list", {
            orderId,
            buyerId: options.buyerId,
            sellerId: options.sellerId,
            limit: 1,
          }),
          callCliGateway("web3.market.execution.status", { orderId }),
        ]);
        const order = asRecord(asArray(asRecord(listResponse)?.orders)[0]);
        if (!order) {
          throw new Error(`order not found: ${orderId}`);
        }

        if (options.json) {
          printJson({ order, execution: executionResponse });
          return;
        }

        console.log(`\nOrder: ${asString(order.orderId) ?? orderId}`);
        console.log(`Status: ${asString(order.status) ?? "n/a"}`);
        console.log(
          `Resource: ${asString(order.resourceName) ?? asString(order.offerId) ?? "n/a"}`,
        );
        console.log(`Buyer: ${asString(order.buyerId) ?? "n/a"}`);
        console.log(`Seller: ${asString(order.sellerId) ?? "n/a"}`);
        console.log(`Quantity: ${asDisplayString(order.quantity) ?? "1"}`);
        console.log(`Created: ${formatTimestamp(order.createdAt)}`);
        console.log(`Updated: ${formatTimestamp(order.updatedAt)}`);

        const execution = asRecord(executionResponse);
        if (execution) {
          console.log("\nExecution summary:");
          console.log(`Execution: ${asString(execution.executionStatus) ?? "n/a"}`);
          console.log(`Acceptance: ${asString(asRecord(execution.acceptance)?.status) ?? "n/a"}`);
          console.log(`Delivery: ${asString(asRecord(execution.delivery)?.status) ?? "n/a"}`);
          console.log(`Proof: ${asString(asRecord(execution.proof)?.status) ?? "n/a"}`);
          console.log(`Settlement: ${asString(asRecord(execution.settlement)?.status) ?? "n/a"}`);
          console.log(`Dispute: ${asString(asRecord(execution.dispute)?.status) ?? "n/a"}`);
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function cancelOrderCommand(): Command {
  return new Command("cancel")
    .description("Cancel an order you own")
    .argument("<order-id>", "Order ID")
    .option("--actor-id <actorId>", "Buyer actor ID")
    .option("--reason <reason>", "Optional cancellation reason")
    .option("-y, --yes", "Skip confirmation", false)
    .option("--json", "Output as JSON")
    .action(async (orderId, options) => {
      try {
        const actorId = requireStringOption(options.actorId, "actor-id");
        if (!options.yes) {
          const confirmed = await promptConfirm(`Cancel order ${orderId}?`);
          if (!confirmed) {
            console.log("Cancelled.");
            return;
          }
        }
        const result = await callCliGateway("web3.market.order.cancel", {
          actorId,
          orderId,
          reason: asString(options.reason) ?? undefined,
        });
        if (options.json) {
          printJson(result);
          return;
        }
        console.log(`Order cancelled: ${asString(result.orderId) ?? orderId}`);
        console.log(`Status: ${asString(result.status) ?? "n/a"}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function acceptOrderCommand(): Command {
  return new Command("accept")
    .description("Accept a completed delivery")
    .argument("<order-id>", "Order ID")
    .option("--actor-id <actorId>", "Buyer actor ID")
    .option("--proof-id <proofId>", "Optional proof ID")
    .option("--json", "Output as JSON")
    .action(async (orderId, options) => {
      try {
        const actorId = requireStringOption(options.actorId, "actor-id");
        const result = await callCliGateway("web3.market.acceptance.sign", {
          actorId,
          orderId,
          proofId: asString(options.proofId) ?? undefined,
        });
        if (options.json) {
          printJson(result);
          return;
        }
        console.log(`Acceptance recorded for ${orderId}.`);
        console.log(
          `Settlement status: ${asString(asRecord(result.settlement)?.status) ?? asString(result.status) ?? "n/a"}`,
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function rejectOrderCommand(): Command {
  return new Command("reject")
    .description("Reject a delivery and trigger the dispute-ready path")
    .argument("<order-id>", "Order ID")
    .option("--actor-id <actorId>", "Buyer actor ID")
    .option("--proof-id <proofId>", "Optional proof ID")
    .option("--reason <reason>", "Rejection reason")
    .option("--json", "Output as JSON")
    .action(async (orderId, options) => {
      try {
        const actorId = requireStringOption(options.actorId, "actor-id");
        const reason = requireStringOption(options.reason, "reason");
        const result = await callCliGateway("web3.market.acceptance.reject", {
          actorId,
          orderId,
          proofId: asString(options.proofId) ?? undefined,
          reason,
        });
        if (options.json) {
          printJson(result);
          return;
        }
        console.log(`Acceptance rejected for ${orderId}.`);
        console.log(`Status: ${asString(result.status) ?? "n/a"}`);
        console.log(`Dispute: ${asString(result.disputeId) ?? "n/a"}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function normalizeQuote(value: unknown): QuotePayload | null {
  const record = asRecord(value) ?? {};
  const offerId = asString(record.offerId);
  const resourceId = asString(record.resourceId);
  const providerActorId = asString(record.providerActorId);
  const quantityRaw = record.quantity;
  const quantity = typeof quantityRaw === "number" ? quantityRaw : Number.NaN;
  if (!offerId || !resourceId || !providerActorId || !Number.isFinite(quantity)) {
    return null;
  }
  return {
    offerId,
    resourceId,
    providerActorId,
    quantity,
    estimatedTotal: asString(record.estimatedTotal),
    price: asRecord(record.price),
  };
}
