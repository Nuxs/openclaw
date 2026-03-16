/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-base-to-string */
// src/commands/market.ts
/**
 * Market CLI 命令入口
 *
 * 提供市场相关的所有子命令
 */

import { Command } from "commander";
import { marketBrowseCommand, marketShowCommand, marketQuoteCommand } from "./market-browse.js";
import { marketOfferCommand } from "./market-offer.js";
import { marketOrderCommand } from "./market-order.js";

export const marketCommand = new Command("market")
  .description("Manage Web3 Market services and orders")
  .addCommand(marketBrowseCommand)
  .addCommand(marketShowCommand)
  .addCommand(marketQuoteCommand)
  .addCommand(marketOfferCommand)
  .addCommand(marketOrderCommand)
  .addCommand(marketProviderCommand())
  .addCommand(marketAuditCommand())
  .addCommand(marketDisputeCommand())
  .addCommand(marketStatusCommand());

/**
 * openclaw market provider
 */
function marketProviderCommand(): Command {
  return new Command("provider")
    .description("Manage providers")
    .addCommand(
      new Command("list")
        .description("List all providers")
        .option("--status <status>", "Filter by status")
        .option("--limit <n>", "Limit results", "20")
        .action(async (options) => {
          const { callGateway } = await import("../gateway/call.js");
          const { table } = await import("../terminal/table.js");

          try {
            const result = await callGateway("web3.market.provider.list", [
              {
                status: options.status,
                limit: parseInt(options.limit),
              },
            ]);

            console.log(
              table([
                ["ID", "Name", "Status", "Rating", "Offers"],
                ...result.map(
                  (p: {
                    id: string;
                    name?: string;
                    status: string;
                    rating?: number;
                    totalOffers?: number;
                  }) => [
                    p.id.slice(0, 12),
                    p.name || "N/A",
                    p.status,
                    p.rating?.toFixed(1) || "N/A",
                    String(p.totalOffers || 0),
                  ],
                ),
              ]),
            );
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("show")
        .description("Show provider details")
        .argument("<provider-id>", "Provider ID")
        .action(async (providerId) => {
          const { callGateway } = await import("../gateway/call.js");

          try {
            const result = await callGateway("web3.market.provider.get", [providerId]);

            console.log(`\n  Provider: ${result.id}`);
            console.log(`  Name: ${result.name || "N/A"}`);
            console.log(`  Status: ${result.status}`);
            console.log(`  Rating: ${result.rating?.toFixed(1) || "N/A"}`);
            console.log(`  Total Offers: ${result.totalOffers || 0}`);
            console.log(`  Total Orders: ${result.totalOrders || 0}`);
            if (result.verifiedAt) {
              console.log(`  Verified: ${result.verifiedAt}`);
            }
            console.log();
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        }),
    );
}

/**
 * openclaw market audit
 */
function marketAuditCommand(): Command {
  return new Command("audit")
    .description("Query audit logs")
    .option("--kind <kind>", "Filter by event kind")
    .option("--entity <id>", "Filter by entity ID")
    .option("--from <date>", "From date (ISO)")
    .option("--to <date>", "To date (ISO)")
    .option("--limit <n>", "Limit results", "100")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const { callGateway } = await import("../gateway/call.js");
      const { table } = await import("../terminal/table.js");

      try {
        const result = await callGateway("web3.market.audit.query", [
          {
            kind: options.kind,
            entityId: options.entity,
            from: options.from,
            to: options.to,
            limit: parseInt(options.limit),
          },
        ]);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.length === 0) {
          console.log("No audit logs found");
          return;
        }

        console.log(
          table([
            ["Time", "Kind", "Entity", "Actor"],
            ...result.map((log: any) => [
              new Date(log.timestamp).toLocaleString(),
              log.kind,
              log.refId?.slice(0, 15) || "N/A",
              log.actor?.slice(0, 15) || "system",
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
 * openclaw market dispute
 */
function marketDisputeCommand(): Command {
  return new Command("dispute")
    .description("Manage disputes")
    .addCommand(
      new Command("list")
        .description("List disputes")
        .option("--status <status>", "Filter by status")
        .option("--limit <n>", "Limit results", "20")
        .action(async (options) => {
          const { callGateway } = await import("../gateway/call.js");
          const { table } = await import("../terminal/table.js");

          try {
            const result = await callGateway("web3.market.dispute.list", [
              {
                status: options.status,
                limit: parseInt(options.limit),
              },
            ]);

            if (result.length === 0) {
              console.log("No disputes found");
              return;
            }

            console.log(
              table([
                ["ID", "Order", "Status", "Resolution", "Opened"],
                ...result.map(
                  (d: {
                    disputeId: string;
                    orderId: string;
                    status: string;
                    resolution?: string;
                    openedAt: string;
                  }) => [
                    d.disputeId.slice(0, 12),
                    d.orderId.slice(0, 12),
                    d.status.replace("dispute_", ""),
                    d.resolution || "pending",
                    new Date(d.openedAt).toLocaleDateString(),
                  ],
                ),
              ]),
            );
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("status")
        .description("Show dispute status")
        .argument("<dispute-id>", "Dispute ID")
        .action(async (disputeId) => {
          const { callGateway } = await import("../gateway/call.js");

          try {
            const result = await callGateway("web3.market.dispute.get", [disputeId]);

            console.log(`\n  Dispute: ${result.disputeId}`);
            console.log(`  Order: ${result.orderId}`);
            console.log(`  Status: ${result.status}`);
            console.log(`  Reason: ${result.reason}`);
            console.log(`\n  Initiator: ${result.initiatorActorId}`);
            console.log(`  Respondent: ${result.respondentActorId}`);
            console.log(`  Arbitrator: ${result.arbitratorType}`);
            console.log(`\n  Evidence: ${result.evidence?.length || 0} items`);
            if (result.resolution) {
              console.log(`  Resolution: ${result.resolution}`);
            }
            console.log(`  Opened: ${result.openedAt}`);
            if (result.resolvedAt) {
              console.log(`  Resolved: ${result.resolvedAt}`);
            }
            console.log();
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        }),
    );
}

/**
 * openclaw market status
 */
function marketStatusCommand(): Command {
  return new Command("status")
    .description("Show market status summary")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const { callGateway } = await import("../gateway/call.js");

      try {
        const [health, stats] = await Promise.all([
          callGateway("web3.market.health.check", []),
          callGateway("web3.market.stats", []),
        ]);

        if (options.json) {
          console.log(JSON.stringify({ health, stats }, null, 2));
          return;
        }

        console.log("\n  Market Status");
        console.log("  ─────────────");

        console.log(`  Overall: ${health.overall as string}`);

        console.log("\n  Statistics");
        console.log("  ─────────────");
        console.log(`  Total Offers: ${stats.totalOffers || 0}`);
        console.log(`  Active Offers: ${stats.activeOffers || 0}`);
        console.log(`  Total Orders: ${stats.totalOrders || 0}`);
        console.log(`  Pending Orders: ${stats.pendingOrders || 0}`);
        console.log(`  Total Providers: ${stats.totalProviders || 0}`);

        console.log("\n  Health Probes");
        console.log("  ─────────────");
        for (const probe of health.probes || []) {
          const probeStatus =
            probe.status === "healthy" ? "✓" : probe.status === "degraded" ? "⚠" : "✗";
          console.log(`  ${probeStatus} ${probe.component}: ${probe.status}`);
        }

        console.log();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

export default marketCommand;
