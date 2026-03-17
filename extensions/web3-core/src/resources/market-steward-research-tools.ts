import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/core";
import type {
  MarketStewardCandidate,
  StewardBudgetPolicy,
  StewardRiskLevel,
  StewardRiskPolicy,
  StewardSelectionPolicy,
} from "openclaw/plugin-sdk/steward-policy";
import { planMarketStewardPurchase } from "openclaw/plugin-sdk/steward-policy";
import type { Web3PluginConfig } from "../config.js";
import type { ResolvedMarketStewardContext } from "./market-steward-context.js";
import {
  rememberMarketStewardContext,
  resolveMarketStewardContext,
} from "./market-steward-context.js";
import { callGatewayMethod, errorResult, safeResult } from "./market-tools-shared.js";

type StewardResearchParams = {
  resourceId?: string;
  kind?: string;
  tag?: string;
  query?: string;
  quantity?: number;
  limit?: number;
  ttlMs: number;
  maxCost?: string;
  sessionKey?: string;
  selectionPolicy?: {
    strategy?: string;
    maxCandidates?: number;
    preferProof?: boolean;
  };
  budgetPolicy?: {
    currency?: string;
    maxAmount?: string;
    remainingDailyAmount?: string;
    requireApprovalAbove?: string;
    failClosed?: boolean;
  };
  riskPolicy?: {
    maxRiskLevel?: string;
    requireProof?: boolean;
    requireProviderActor?: boolean;
    requireApprovalForMediumRisk?: boolean;
    requireApprovalForHighRisk?: boolean;
    allowUnpriced?: boolean;
    failClosed?: boolean;
  };
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asRiskLevel(value: string | undefined): StewardRiskLevel | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function asScalar(value: unknown): string | number | null | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function appendUnique(target: string[], value?: string) {
  const trimmed = value?.trim();
  if (!trimmed || target.includes(trimmed)) {
    return;
  }
  target.push(trimmed);
}

function toSelectionPolicy(
  raw: StewardResearchParams["selectionPolicy"],
): StewardSelectionPolicy | undefined {
  if (!raw) {
    return undefined;
  }
  return {
    strategy:
      raw.strategy === "best_score" ||
      raw.strategy === "lowest_price" ||
      raw.strategy === "proof_first"
        ? raw.strategy
        : undefined,
    maxCandidates:
      typeof raw.maxCandidates === "number" && Number.isFinite(raw.maxCandidates)
        ? raw.maxCandidates
        : undefined,
    preferProof: asBoolean(raw.preferProof),
  };
}

function toBudgetPolicy(
  raw: StewardResearchParams["budgetPolicy"],
): StewardBudgetPolicy | undefined {
  if (!raw) {
    return undefined;
  }
  return {
    currency: asString(raw.currency),
    maxAmount: asString(raw.maxAmount),
    remainingDailyAmount: asString(raw.remainingDailyAmount),
    requireApprovalAbove: asString(raw.requireApprovalAbove),
    failClosed: asBoolean(raw.failClosed),
  };
}

function toRiskPolicy(raw: StewardResearchParams["riskPolicy"]): StewardRiskPolicy | undefined {
  if (!raw) {
    return undefined;
  }
  return {
    maxRiskLevel: asRiskLevel(asString(raw.maxRiskLevel)),
    requireProof: asBoolean(raw.requireProof),
    requireProviderActor: asBoolean(raw.requireProviderActor),
    requireApprovalForMediumRisk: asBoolean(raw.requireApprovalForMediumRisk),
    requireApprovalForHighRisk: asBoolean(raw.requireApprovalForHighRisk),
    allowUnpriced: asBoolean(raw.allowUnpriced),
    failClosed: asBoolean(raw.failClosed),
  };
}

function candidateFromQuote(
  quote: Record<string, unknown>,
  score?: number,
): MarketStewardCandidate | null {
  const resourceId = asString(quote.resourceId);
  if (!resourceId) {
    return null;
  }
  const price = asRecord(quote.price);
  const proofTypes = Array.isArray(quote.proofTypes)
    ? quote.proofTypes.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  return {
    resourceId,
    offerId: asString(quote.offerId),
    providerActorId: asString(quote.providerActorId),
    label: typeof quote.label === "string" ? quote.label : null,
    kind: typeof quote.kind === "string" ? quote.kind : null,
    score: typeof score === "number" && Number.isFinite(score) ? score : undefined,
    proofRequired: quote.proofRequired === true,
    proofTypes,
    estimatedTotal: asScalar(quote.estimatedTotal),
    priceAmount: asScalar(price?.amount),
    currency: typeof price?.currency === "string" ? price.currency : null,
  };
}

function extractCandidates(payload: unknown): MarketStewardCandidate[] {
  const resultRecord = asRecord(payload) ?? {};
  const rawCandidates = Array.isArray(resultRecord.candidates) ? resultRecord.candidates : [];
  return rawCandidates
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return null;
      }
      const quote = asRecord(record.quote);
      if (!quote) {
        return null;
      }
      return candidateFromQuote(
        quote,
        typeof record.score === "number" && Number.isFinite(record.score)
          ? record.score
          : undefined,
      );
    })
    .filter((entry): entry is MarketStewardCandidate => Boolean(entry));
}

function parseCandidateCost(candidate: MarketStewardCandidate): number | undefined {
  const raw =
    typeof candidate.estimatedTotal === "string" || typeof candidate.estimatedTotal === "number"
      ? candidate.estimatedTotal
      : typeof candidate.priceAmount === "string" || typeof candidate.priceAmount === "number"
        ? candidate.priceAmount
        : undefined;
  if (raw === undefined) {
    return undefined;
  }
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function summarizeStewardContext(context: ResolvedMarketStewardContext) {
  return {
    sessionKey: context.sessionKey,
    usedStoredIdentity: context.usedStoredIdentity,
    usedStoredBudgetPolicy: context.usedStoredBudgetPolicy,
    usedStoredRiskPolicy: context.usedStoredRiskPolicy,
    usedStoredApproval: context.usedStoredApproval,
    usedDefaultBudgetPolicy: context.usedDefaultBudgetPolicy,
    usedDefaultRiskPolicy: context.usedDefaultRiskPolicy,
  };
}

function summarizeCandidate(candidate: MarketStewardCandidate) {
  return {
    resourceId: candidate.resourceId,
    label: candidate.label,
    providerActorId: candidate.providerActorId,
    score: candidate.score,
    proofRequired: candidate.proofRequired,
    proofTypes: candidate.proofTypes,
    estimatedTotal: candidate.estimatedTotal,
    priceAmount: candidate.priceAmount,
    currency: candidate.currency,
  };
}

function buildResearchPackage(params: {
  candidates: MarketStewardCandidate[];
  selected: MarketStewardCandidate;
  context: ResolvedMarketStewardContext;
}): {
  findings: string[];
  policyRecommendations: string[];
  nextResearchBacklog: string[];
  growthSummary: string;
} {
  const findings: string[] = [];
  const policyRecommendations: string[] = [];
  const nextResearchBacklog: string[] = [];
  const proofBacked = params.candidates.filter(
    (candidate) => candidate.proofRequired || (candidate.proofTypes?.length ?? 0) > 0,
  );
  const cheaperAlternative = params.candidates
    .filter((candidate) => candidate.resourceId !== params.selected.resourceId)
    .map((candidate) => ({ candidate, cost: parseCandidateCost(candidate) }))
    .filter(
      (entry): entry is { candidate: MarketStewardCandidate; cost: number } =>
        typeof entry.cost === "number",
    )
    .sort((left, right) => left.cost - right.cost)[0];

  appendUnique(
    findings,
    `Compared ${params.candidates.length} candidate${params.candidates.length === 1 ? "" : "s"} without spending; ${params.selected.resourceId} remains the best current route.`,
  );
  appendUnique(
    findings,
    `${proofBacked.length} candidate${proofBacked.length === 1 ? " already advertises" : "s advertise"} proof-backed delivery posture.`,
  );
  if (cheaperAlternative) {
    appendUnique(
      findings,
      `A cheaper alternative exists (${cheaperAlternative.candidate.resourceId} @ ${cheaperAlternative.cost}${cheaperAlternative.candidate.currency ? ` ${cheaperAlternative.candidate.currency}` : ""}); price alone still should not override proof and dispute posture.`,
    );
  }

  if (!params.context.budgetPolicy) {
    appendUnique(
      policyRecommendations,
      "Persist a durable budget ceiling before allowing future autonomous execution in this purchase class.",
    );
    appendUnique(
      nextResearchBacklog,
      "Decide a remembered maxAmount and approval threshold for this service category.",
    );
  }

  if (!params.context.riskPolicy?.requireProof && proofBacked.length > 0) {
    appendUnique(
      policyRecommendations,
      "Require proof for this service class because proof-backed alternatives already exist in the market slice.",
    );
    appendUnique(
      nextResearchBacklog,
      "Compare whether proof-backed candidates reduce future dispute overhead enough to justify a stricter proof gate.",
    );
  }

  if (proofBacked.some((candidate) => candidate.resourceId !== params.selected.resourceId)) {
    appendUnique(
      policyRecommendations,
      "Prefer proof-backed alternatives during quiet cycles so provider routing improves without changing the spend boundary.",
    );
    appendUnique(
      nextResearchBacklog,
      "Re-run research when the current provider misses proof or acceptance quality weakens.",
    );
  }

  if (nextResearchBacklog.length === 0) {
    appendUnique(
      nextResearchBacklog,
      "Periodically re-score provider preference using proof quality, acceptance friction, and dispute overhead instead of price alone.",
    );
  }

  if (policyRecommendations.length === 0) {
    appendUnique(
      policyRecommendations,
      "Current policy is serviceable; keep the steward in quiet-cycle research mode and only tighten rules when proof or settlement quality drifts.",
    );
  }

  return {
    findings,
    policyRecommendations,
    nextResearchBacklog,
    growthSummary: [findings[0], policyRecommendations[0]].filter(Boolean).join(" "),
  };
}

const SelectionPolicySchema = Type.Object(
  {
    strategy: Type.Optional(
      Type.String({ description: "best_score | lowest_price | proof_first" }),
    ),
    maxCandidates: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
    preferProof: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const BudgetPolicySchema = Type.Object(
  {
    currency: Type.Optional(Type.String()),
    maxAmount: Type.Optional(Type.String()),
    remainingDailyAmount: Type.Optional(Type.String()),
    requireApprovalAbove: Type.Optional(Type.String()),
    failClosed: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const RiskPolicySchema = Type.Object(
  {
    maxRiskLevel: Type.Optional(Type.String({ description: "low | medium | high" })),
    requireProof: Type.Optional(Type.Boolean()),
    requireProviderActor: Type.Optional(Type.Boolean()),
    requireApprovalForMediumRisk: Type.Optional(Type.Boolean()),
    requireApprovalForHighRisk: Type.Optional(Type.Boolean()),
    allowUnpriced: Type.Optional(Type.Boolean()),
    failClosed: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const StewardResearchSchema = Type.Object(
  {
    resourceId: Type.Optional(Type.String({ description: "Optional pinned resource ID." })),
    kind: Type.Optional(Type.String()),
    tag: Type.Optional(Type.String()),
    query: Type.Optional(Type.String()),
    quantity: Type.Optional(Type.Number({ minimum: 1, maximum: 1000 })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
    ttlMs: Type.Number({ minimum: 10_000, maximum: 604_800_000 }),
    maxCost: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
    selectionPolicy: Type.Optional(SelectionPolicySchema),
    budgetPolicy: Type.Optional(BudgetPolicySchema),
    riskPolicy: Type.Optional(RiskPolicySchema),
  },
  { additionalProperties: false },
);

export function createWeb3MarketStewardResearchTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled || !config.resources.consumer.enabled) {
    return null;
  }
  return {
    name: "web3.market.steward.research",
    label: "Web3 Market Steward Research",
    description:
      "Run a no-spend steward research pass: compare alternatives, inspect proof posture, and generate tighter future policy recommendations.",
    parameters: StewardResearchSchema,
    execute: async (_toolCallId: string, params: StewardResearchParams) => {
      try {
        const quantity =
          typeof params.quantity === "number" && Number.isFinite(params.quantity)
            ? Math.max(1, Math.floor(params.quantity))
            : 1;
        const limit =
          typeof params.limit === "number" && Number.isFinite(params.limit)
            ? Math.max(1, Math.min(20, Math.floor(params.limit)))
            : 5;
        const resourceId = asString(params.resourceId);
        const resolvedContext = await resolveMarketStewardContext({
          sessionKey: asString(params.sessionKey),
          budgetPolicy: toBudgetPolicy(params.budgetPolicy),
          riskPolicy: toRiskPolicy(params.riskPolicy),
          maxCost: asString(params.maxCost),
          execute: false,
        });

        let candidates: MarketStewardCandidate[] = [];
        let sourceMethod = "web3.market.offer.compare";
        if (resourceId) {
          sourceMethod = "web3.market.offer.quote";
          const quoteResult = await callGatewayMethod(config, sourceMethod, {
            resourceId,
            quantity,
            ttlMs: params.ttlMs,
          });
          if (!quoteResult.ok) {
            await rememberMarketStewardContext({
              sessionKey: resolvedContext.sessionKey,
              status: "quote_failed",
              resourceId,
            });
            return errorResult(quoteResult.error, { method: sourceMethod });
          }
          const quotePayload = asRecord(quoteResult.result);
          const quote = quotePayload ? asRecord(quotePayload.quote) : undefined;
          const candidate = quote ? candidateFromQuote(quote) : null;
          if (candidate) {
            candidates = [candidate];
          }
        } else {
          const compareResult = await callGatewayMethod(config, sourceMethod, {
            kind: asString(params.kind),
            tag: asString(params.tag),
            query: asString(params.query),
            quantity,
            limit,
          });
          if (!compareResult.ok) {
            await rememberMarketStewardContext({
              sessionKey: resolvedContext.sessionKey,
              status: "compare_failed",
            });
            return errorResult(compareResult.error, { method: sourceMethod });
          }
          candidates = extractCandidates(compareResult.result);
        }

        const plan = planMarketStewardPurchase({
          candidates,
          requestedResourceId: resourceId,
          selectionPolicy: toSelectionPolicy(params.selectionPolicy),
          budgetPolicy: resolvedContext.budgetPolicy,
          riskPolicy: resolvedContext.riskPolicy,
          approval: resolvedContext.approval,
          requireBudgetPolicy: false,
          requireRiskPolicy: false,
        });
        const selected = plan.selectedCandidate;
        if (!selected) {
          await rememberMarketStewardContext({
            sessionKey: resolvedContext.sessionKey,
            status: "research_empty",
            researchBacklog: [
              "Re-run provider discovery with a broader query or a pinned resource once the market surface changes.",
            ],
            lastResearchedAt: new Date().toISOString(),
          });
          return safeResult({
            status: "no_candidates",
            workflow: "compare/quote -> score -> research -> policy hardening",
            candidatesConsidered: candidates.length,
            stewardContext: summarizeStewardContext(resolvedContext),
          });
        }

        const research = buildResearchPackage({
          candidates,
          selected,
          context: resolvedContext,
        });
        await rememberMarketStewardContext({
          sessionKey: resolvedContext.sessionKey,
          status: "research_updated",
          resourceId: selected.resourceId,
          growthSummary: research.growthSummary,
          researchBacklog: research.nextResearchBacklog,
          lastResearchedAt: new Date().toISOString(),
        });

        return safeResult({
          status: "research_updated",
          workflow: "compare/quote -> score -> research -> policy hardening",
          candidatesConsidered: candidates.length,
          selectedCandidate: summarizeCandidate(selected),
          alternatives: candidates
            .filter((candidate) => candidate.resourceId !== selected.resourceId)
            .slice(0, 3)
            .map(summarizeCandidate),
          findings: research.findings,
          policyRecommendations: research.policyRecommendations,
          nextResearchBacklog: research.nextResearchBacklog,
          stewardContext: summarizeStewardContext(resolvedContext),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}
