import { Command } from "commander";
import {
  marketBrowseCommand,
  marketCompareCommand,
  marketQuoteCommand,
  marketShowCommand,
} from "./market-browse.js";
import { marketOfferCommand } from "./market-offer.js";
import { marketOrderCommand } from "./market-order.js";
import {
  asArray,
  asDisplayString,
  asRecord,
  asString,
  callCliGateway,
  formatTimestamp,
  formatUnitPrice,
  printJson,
  printTable,
  readJsonObjectFile,
  requireStringOption,
  shortId,
} from "./market-shared.js";

export const marketCommand = new Command("market")
  .description("Operate the real Web3 Market public contract from the CLI")
  .addCommand(marketBrowseCommand)
  .addCommand(marketShowCommand)
  .addCommand(marketQuoteCommand)
  .addCommand(marketCompareCommand)
  .addCommand(marketOfferCommand)
  .addCommand(marketOrderCommand)
  .addCommand(createProviderCommand())
  .addCommand(createAuditCommand())
  .addCommand(createDisputeCommand())
  .addCommand(createStatusCommand());

export function registerMarketCli(program: Command): void {
  program.addCommand(marketCommand);
}

function createProviderCommand(): Command {
  return new Command("provider")
    .description("Inspect provider-facing resources and reputation")
    .addCommand(
      new Command("list")
        .description("List published market resources, optionally scoped to one provider")
        .option("--provider-actor-id <actorId>", "Filter by provider actor ID")
        .option("--kind <kind>", "Filter by resource kind")
        .option("--status <status>", "Filter by resource status", "resource_published")
        .option("--limit <n>", "Limit results", "20")
        .option("--json", "Output as JSON")
        .action(async (options) => {
          try {
            const response = await callCliGateway("web3.market.resource.list", {
              providerActorId: options.providerActorId,
              kind: options.kind,
              status: options.status,
              limit: Number.parseInt(options.limit, 10),
            });
            const resources = asArray(asRecord(response)?.resources)
              .map((entry) => asRecord(entry))
              .filter((entry): entry is Record<string, unknown> => Boolean(entry));

            if (options.json) {
              printJson({ count: resources.length, resources });
              return;
            }

            if (resources.length === 0) {
              console.log("No provider resources matched the current filters.");
              return;
            }

            printTable(
              [
                { key: "resourceId", header: "Resource" },
                { key: "label", header: "Label", flex: true, minWidth: 20 },
                { key: "kind", header: "Kind" },
                { key: "provider", header: "Provider" },
                { key: "price", header: "Price" },
                { key: "status", header: "Status" },
              ],
              resources.map((resource) => ({
                resourceId: shortId(resource.resourceId),
                label: asString(resource.label) ?? "n/a",
                kind: asString(resource.kind) ?? "n/a",
                provider: shortId(resource.providerActorId),
                price: formatUnitPrice(asRecord(resource.price)),
                status: (asString(resource.status) ?? "n/a").replace("resource_", ""),
              })),
            );
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("show")
        .description("Show one provider's reputation plus published resources")
        .argument("<provider-actor-id>", "Provider actor ID")
        .option("--limit <n>", "Max resources to display", "20")
        .option("--json", "Output as JSON")
        .action(async (providerActorId, options) => {
          try {
            const [resourcesResponse, reputationResponse] = await Promise.all([
              callCliGateway("web3.market.resource.list", {
                providerActorId,
                status: "resource_published",
                limit: Number.parseInt(options.limit, 10),
              }),
              callCliGateway("web3.market.reputation.summary", {
                providerActorId,
                limit: Number.parseInt(options.limit, 10),
              }),
            ]);
            const resources = asArray(asRecord(resourcesResponse)?.resources)
              .map((entry) => asRecord(entry))
              .filter((entry): entry is Record<string, unknown> => Boolean(entry));

            if (options.json) {
              printJson({ reputation: reputationResponse, resources });
              return;
            }

            const reputationIdentity = asRecord(reputationResponse.identity);
            const reputationLeases = asRecord(reputationResponse.leases);
            const reputationDisputes = asRecord(reputationResponse.disputes);

            console.log(`\nProvider: ${providerActorId}`);
            console.log(`ENS: ${asString(reputationIdentity?.ensName) ?? "n/a"}`);
            console.log(`Score: ${asDisplayString(reputationResponse.score) ?? "n/a"}`);
            console.log(`Leases: ${asDisplayString(reputationLeases?.total) ?? "n/a"}`);
            console.log(`Disputes: ${asDisplayString(reputationDisputes?.total) ?? "n/a"}`);
            console.log(`Published resources: ${resources.length}`);
            if (resources.length > 0) {
              printTable(
                [
                  { key: "resourceId", header: "Resource" },
                  { key: "label", header: "Label", flex: true, minWidth: 20 },
                  { key: "kind", header: "Kind" },
                  { key: "price", header: "Price" },
                ],
                resources.map((resource) => ({
                  resourceId: shortId(resource.resourceId),
                  label: asString(resource.label) ?? "n/a",
                  kind: asString(resource.kind) ?? "n/a",
                  price: formatUnitPrice(asRecord(resource.price)),
                })),
              );
            }
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("publish")
        .description("Publish or refresh a provider resource from a JSON payload")
        .option("-f, --file <path>", "JSON payload matching web3.market.resource.publish")
        .option("--json", "Output as JSON")
        .action(async (options) => {
          try {
            const filePath = requireStringOption(options.file, "file");
            const params = readJsonObjectFile(filePath);
            const result = await callCliGateway("web3.market.resource.publish", params);
            if (options.json) {
              printJson(result);
              return;
            }
            console.log(`Resource published: ${asString(result.resourceId) ?? "n/a"}`);
            console.log(`Offer: ${asString(result.offerId) ?? "n/a"}`);
            console.log(`Status: ${asString(result.status) ?? "n/a"}`);
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("unpublish")
        .description("Unpublish a provider resource")
        .argument("<resource-id>", "Resource ID")
        .option("--actor-id <actorId>", "Provider actor ID")
        .option("--json", "Output as JSON")
        .action(async (resourceId, options) => {
          try {
            const result = await callCliGateway("web3.market.resource.unpublish", {
              actorId: requireStringOption(options.actorId, "actor-id"),
              resourceId,
            });
            if (options.json) {
              printJson(result);
              return;
            }
            console.log(`Resource unpublished: ${asString(result.resourceId) ?? resourceId}`);
            console.log(`Status: ${asString(result.status) ?? "n/a"}`);
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        }),
    );
}

function createAuditCommand(): Command {
  return new Command("audit")
    .description("Query the market audit trail through the public contract")
    .option("--limit <n>", "Limit results", "50")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const response = await callCliGateway("web3.market.audit.query", {
          limit: Number.parseInt(options.limit, 10),
        });
        const events = asArray(asRecord(response)?.events)
          .map((entry) => asRecord(entry))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry));
        if (options.json) {
          printJson({ count: events.length, events });
          return;
        }
        if (events.length === 0) {
          console.log("No audit events were returned.");
          return;
        }
        printTable(
          [
            { key: "timestamp", header: "Time" },
            { key: "kind", header: "Kind" },
            { key: "refId", header: "Ref" },
            { key: "actor", header: "Actor" },
          ],
          events.map((event) => ({
            timestamp: formatTimestamp(event.timestamp),
            kind: asString(event.kind) ?? "n/a",
            refId: shortId(event.refId),
            actor: shortId(event.actor),
          })),
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function createDisputeCommand(): Command {
  return new Command("dispute")
    .description("Inspect market disputes")
    .addCommand(
      new Command("list")
        .description("List disputes")
        .option("--status <status>", "Filter by dispute status")
        .option("--limit <n>", "Limit results", "20")
        .option("--json", "Output as JSON")
        .action(async (options) => {
          try {
            const response = await callCliGateway("web3.market.dispute.list", {
              status: options.status,
              limit: Number.parseInt(options.limit, 10),
            });
            const disputes = asArray(asRecord(response)?.disputes)
              .map((entry) => asRecord(entry))
              .filter((entry): entry is Record<string, unknown> => Boolean(entry));
            if (options.json) {
              printJson({ count: disputes.length, disputes });
              return;
            }
            if (disputes.length === 0) {
              console.log("No disputes matched the current filters.");
              return;
            }
            printTable(
              [
                { key: "disputeId", header: "Dispute" },
                { key: "orderId", header: "Order" },
                { key: "status", header: "Status" },
                { key: "openedAt", header: "Opened" },
              ],
              disputes.map((dispute) => ({
                disputeId: shortId(dispute.disputeId),
                orderId: shortId(dispute.orderId),
                status: (asString(dispute.status) ?? "n/a").replaceAll("_", " "),
                openedAt: formatTimestamp(dispute.openedAt),
              })),
            );
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("status")
        .alias("show")
        .description("Show one dispute")
        .argument("<dispute-id>", "Dispute ID")
        .option("--json", "Output as JSON")
        .action(async (disputeId, options) => {
          try {
            const dispute = await callCliGateway("web3.market.dispute.get", { disputeId });
            if (options.json) {
              printJson(dispute);
              return;
            }
            console.log(`\nDispute: ${asString(dispute.disputeId) ?? disputeId}`);
            console.log(`Order: ${asString(dispute.orderId) ?? "n/a"}`);
            console.log(`Status: ${asString(dispute.status) ?? "n/a"}`);
            console.log(`Reason: ${asString(dispute.reason) ?? "n/a"}`);
            console.log(`Initiator: ${asString(dispute.initiatorActorId) ?? "n/a"}`);
            console.log(`Respondent: ${asString(dispute.respondentActorId) ?? "n/a"}`);
            console.log(`Opened: ${formatTimestamp(dispute.openedAt)}`);
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exit(1);
          }
        }),
    );
}

function createStatusCommand(): Command {
  return new Command("status")
    .description("Summarize market status, monitor health, and active alerts")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        const [marketStatus, monitorHealth, alertsResponse] = await Promise.all([
          callCliGateway("web3.market.status.summary", {}),
          callCliGateway("web3.monitor.health", {}),
          callCliGateway("web3.monitor.alerts.list", {
            activeOnly: false,
            limit: 20,
          }),
        ]);
        const alerts = asArray(asRecord(alertsResponse)?.alerts)
          .map((entry) => asRecord(entry))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry));

        if (options.json) {
          printJson({ marketStatus, monitorHealth, alerts });
          return;
        }

        const totals = asRecord(marketStatus.totals);

        console.log("\nMarket status");
        console.log(`Offers: ${asDisplayString(totals?.offers) ?? "0"}`);
        console.log(`Orders: ${asDisplayString(totals?.orders) ?? "0"}`);
        console.log(`Deliveries: ${asDisplayString(totals?.deliveries) ?? "0"}`);
        console.log(`Settlements: ${asDisplayString(totals?.settlements) ?? "0"}`);
        console.log(
          `Monitor: ${asString(monitorHealth.status) ?? (monitorHealth.healthy === true ? "healthy" : "unknown")}`,
        );
        console.log(
          `Active alerts: ${alerts.filter((alert) => asString(alert.status) !== "resolved").length}`,
        );
        if (alerts.length > 0) {
          printTable(
            [
              { key: "level", header: "Level" },
              { key: "category", header: "Category" },
              { key: "status", header: "Status" },
              { key: "timestamp", header: "Time" },
            ],
            alerts.slice(0, 5).map((alert) => ({
              level: asString(alert.level) ?? "n/a",
              category: asString(alert.category) ?? "n/a",
              status: asString(alert.status) ?? "n/a",
              timestamp: formatTimestamp(alert.timestamp),
            })),
          );
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

export default marketCommand;
