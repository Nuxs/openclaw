import { Command } from "commander";
import {
  asArray,
  asRecord,
  asString,
  callCliGateway,
  formatTimestamp,
  formatUnitPrice,
  parseCsv,
  printJson,
  printTable,
  shortId,
} from "./market-shared.js";

type MarketResource = {
  resourceId: string;
  label: string;
  kind: string;
  status: string;
  providerActorId: string;
  description?: string;
  offerId?: string;
  tags?: string[];
  price?: Record<string, unknown> | null;
  serviceSchema?: Record<string, unknown> | null;
  updatedAt?: string;
};

type QuotePayload = {
  resourceId: string;
  offerId: string;
  providerActorId: string;
  kind: string;
  label?: string | null;
  quantity: number;
  estimatedTotal?: string | null;
  requestedLeaseTtlMs?: number | null;
  proofRequired?: boolean;
  proofTypes?: string[];
  price?: Record<string, unknown> | null;
};

type CompareCandidate = {
  score: number;
  quote: QuotePayload;
};

export const marketBrowseCommand = new Command("browse")
  .description("Browse published market resources")
  .option("--kind <kind>", "Filter by kind: model|search|storage|service")
  .option("--tag <tag>", "Filter by tag")
  .option("--provider-actor-id <actorId>", "Filter by provider actor ID")
  .option("--query <text>", "Local text filter for label/description/tags")
  .option("--status <status>", "Filter by resource status", "resource_published")
  .option("--limit <n>", "Limit results", "20")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const response = await callCliGateway("web3.market.resource.list", {
        kind: options.kind,
        tag: options.tag,
        providerActorId: options.providerActorId,
        status: options.status,
        limit: Number.parseInt(options.limit, 10),
      });
      const resources = asArray(asRecord(response)?.resources)
        .map(normalizeResource)
        .filter((resource): resource is MarketResource => Boolean(resource))
        .filter((resource) => matchesQuery(resource, options.query));

      if (options.json) {
        printJson({ count: resources.length, resources });
        return;
      }

      if (resources.length === 0) {
        console.log("No published market resources matched the current filters.");
        return;
      }

      printTable(
        [
          { key: "resourceId", header: "Resource" },
          { key: "label", header: "Label", flex: true, minWidth: 20 },
          { key: "kind", header: "Kind" },
          { key: "price", header: "Price" },
          { key: "provider", header: "Provider" },
          { key: "status", header: "Status" },
        ],
        resources.map((resource) => ({
          resourceId: shortId(resource.resourceId),
          label: resource.label,
          kind: resource.kind,
          price: formatUnitPrice(resource.price ?? null),
          provider: shortId(resource.providerActorId),
          status: resource.status.replace("resource_", ""),
        })),
      );

      console.log("\nUse `openclaw market show <resource-id>` for full details.");
      console.log("Use `openclaw market quote <resource-id>` to preview buyer cost.");
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

export const marketShowCommand = new Command("show")
  .description("Show a published market resource")
  .argument("<resource-id>", "Published resource ID")
  .option("--json", "Output as JSON")
  .action(async (resourceId, options) => {
    try {
      const response = await callCliGateway("web3.market.resource.get", {
        resourceId,
      });
      const resource = normalizeResource(asRecord(response)?.resource);
      if (!resource) {
        throw new Error(`resource not found: ${resourceId}`);
      }

      if (options.json) {
        printJson({ resource });
        return;
      }

      console.log(`\nResource: ${resource.label}`);
      console.log(`ID: ${resource.resourceId}`);
      console.log(`Kind: ${resource.kind}`);
      console.log(`Status: ${resource.status}`);
      console.log(`Provider: ${resource.providerActorId}`);
      console.log(`Offer: ${resource.offerId ?? "n/a"}`);
      console.log(`Price: ${formatUnitPrice(resource.price ?? null)}`);
      console.log(`Updated: ${formatTimestamp(resource.updatedAt)}`);
      if (resource.description) {
        console.log(`Description: ${resource.description}`);
      }
      if (resource.tags && resource.tags.length > 0) {
        console.log(`Tags: ${resource.tags.join(", ")}`);
      }
      if (resource.serviceSchema) {
        const inputs = parseCsvArray(resource.serviceSchema.inputs);
        const outputs = parseCsvArray(resource.serviceSchema.outputs);
        const proofTypes = asArray(resource.serviceSchema.proofRequirements)
          .map((entry) => asString(asRecord(entry)?.type))
          .filter((entry): entry is string => Boolean(entry));
        console.log(`Inputs: ${inputs.length > 0 ? inputs.join(", ") : "n/a"}`);
        console.log(`Outputs: ${outputs.length > 0 ? outputs.join(", ") : "n/a"}`);
        if (proofTypes.length > 0) {
          console.log(`Proofs: ${proofTypes.join(", ")}`);
        }
      }
      console.log("\nNext steps:");
      console.log(`- Quote: openclaw market quote ${resource.resourceId}`);
      console.log(
        `- Buy:   openclaw market order create ${resource.resourceId} --buyer-id <0x...>`,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

export const marketQuoteCommand = new Command("quote")
  .description("Build a redacted quote for a published market resource")
  .argument("<resource-id>", "Published resource ID")
  .option("--quantity <n>", "Quantity", "1")
  .option("--ttl-ms <ms>", "Optional requested lease TTL in milliseconds")
  .option("--json", "Output as JSON")
  .action(async (resourceId, options) => {
    try {
      const response = await callCliGateway("web3.market.offer.quote", {
        resourceId,
        quantity: Number.parseInt(options.quantity, 10),
        ttlMs: options.ttlMs ? Number.parseInt(options.ttlMs, 10) : undefined,
      });
      const quote = normalizeQuote(asRecord(response)?.quote);
      if (!quote) {
        throw new Error("quote unavailable");
      }

      if (options.json) {
        printJson({ quote });
        return;
      }

      console.log(`\nQuote for ${quote.label ?? quote.resourceId}`);
      console.log(`Resource: ${quote.resourceId}`);
      console.log(`Offer: ${quote.offerId}`);
      console.log(`Provider: ${quote.providerActorId}`);
      console.log(`Kind: ${quote.kind}`);
      console.log(`Quantity: ${quote.quantity}`);
      console.log(`Price: ${formatUnitPrice(quote.price ?? null)}`);
      console.log(`Estimated total: ${quote.estimatedTotal ?? "n/a"}`);
      console.log(`Proof required: ${quote.proofRequired ? "yes" : "no"}`);
      if (quote.proofTypes && quote.proofTypes.length > 0) {
        console.log(`Proof types: ${quote.proofTypes.join(", ")}`);
      }
      if (quote.requestedLeaseTtlMs) {
        console.log(`Requested lease TTL: ${quote.requestedLeaseTtlMs}ms`);
      }
      console.log("\nCreate order:");
      console.log(
        `openclaw market order create ${quote.resourceId} --buyer-id <0x...> --quantity ${quote.quantity}`,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

export const marketCompareCommand = new Command("compare")
  .description("Compare published resources for the same buyer intent")
  .option("--kind <kind>", "Preferred kind: model|search|storage|service")
  .option("--tag <tag>", "Optional tag filter")
  .option("--query <text>", "Intent text used for ranking")
  .option("--quantity <n>", "Quantity", "1")
  .option("--limit <n>", "Limit candidates", "5")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      const response = await callCliGateway("web3.market.offer.compare", {
        kind: options.kind,
        tag: options.tag,
        query: options.query,
        quantity: Number.parseInt(options.quantity, 10),
        limit: Number.parseInt(options.limit, 10),
      });
      const candidates = asArray(asRecord(response)?.candidates)
        .map((candidate) => normalizeCandidate(candidate))
        .filter((candidate): candidate is CompareCandidate => Boolean(candidate));

      if (options.json) {
        printJson({ count: candidates.length, candidates });
        return;
      }

      if (candidates.length === 0) {
        console.log("No comparable resources matched the current intent.");
        return;
      }

      printTable(
        [
          { key: "score", header: "Score", align: "right" },
          { key: "resourceId", header: "Resource" },
          { key: "label", header: "Label", flex: true, minWidth: 20 },
          { key: "price", header: "Price" },
          { key: "provider", header: "Provider" },
          { key: "proof", header: "Proof" },
        ],
        candidates.map((candidate) => ({
          score: candidate.score.toFixed(2),
          resourceId: shortId(candidate.quote.resourceId),
          label: candidate.quote.label ?? candidate.quote.resourceId,
          price: formatUnitPrice(candidate.quote.price ?? null),
          provider: shortId(candidate.quote.providerActorId),
          proof:
            candidate.quote.proofRequired && candidate.quote.proofTypes?.length
              ? candidate.quote.proofTypes.join(",")
              : candidate.quote.proofRequired
                ? "required"
                : "none",
        })),
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

function normalizeResource(value: unknown): MarketResource | null {
  const record = asRecord(value);
  const resourceId = asString(record?.resourceId);
  const label = asString(record?.label);
  const kind = asString(record?.kind);
  const status = asString(record?.status);
  const providerActorId = asString(record?.providerActorId);
  if (!resourceId || !label || !kind || !status || !providerActorId) {
    return null;
  }
  return {
    resourceId,
    label,
    kind,
    status,
    providerActorId,
    description: asString(record?.description) ?? undefined,
    offerId: asString(record?.offerId) ?? undefined,
    tags: asArray(record?.tags)
      .map((entry) => asString(entry))
      .filter((entry): entry is string => Boolean(entry)),
    price: asRecord(record?.price),
    serviceSchema: asRecord(record?.serviceSchema),
    updatedAt: asString(record?.updatedAt) ?? undefined,
  };
}

function normalizeQuote(value: unknown): QuotePayload | null {
  const record = asRecord(value);
  const resourceId = asString(record?.resourceId);
  const offerId = asString(record?.offerId);
  const providerActorId = asString(record?.providerActorId);
  const kind = asString(record?.kind);
  const quantity = Number(asRecord({ quantity: record?.quantity })?.quantity ?? 1);
  if (!resourceId || !offerId || !providerActorId || !kind || !Number.isFinite(quantity)) {
    return null;
  }
  const proofTypes = asArray(record?.proofTypes)
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return {
    resourceId,
    offerId,
    providerActorId,
    kind,
    label: asString(record?.label),
    quantity,
    estimatedTotal: asString(record?.estimatedTotal),
    requestedLeaseTtlMs:
      typeof record?.requestedLeaseTtlMs === "number" ? record.requestedLeaseTtlMs : null,
    proofRequired: record?.proofRequired === true,
    proofTypes,
    price: asRecord(record?.price),
  };
}

function normalizeCandidate(value: unknown): CompareCandidate | null {
  const record = asRecord(value);
  const scoreRaw = record?.score;
  const score = typeof scoreRaw === "number" ? scoreRaw : Number.NaN;
  const quote = normalizeQuote(record?.quote);
  if (!Number.isFinite(score) || !quote) {
    return null;
  }
  return { score, quote };
}

function matchesQuery(resource: MarketResource, queryRaw: string | undefined): boolean {
  const query = queryRaw?.trim().toLowerCase();
  if (!query) {
    return true;
  }
  const haystack = [resource.label, resource.description ?? "", ...(resource.tags ?? [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function parseCsvArray(value: unknown): string[] {
  return parseCsv(
    asArray(value)
      .map((entry) => asString(entry) ?? "")
      .join(","),
  );
}
