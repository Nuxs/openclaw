import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/core";
import type {
  MarketStewardCandidate,
  StewardApproval,
  StewardBudgetPolicy,
  StewardRiskLevel,
  StewardRiskPolicy,
  StewardSelectionPolicy,
} from "openclaw/plugin-sdk/steward-policy";
import { planMarketStewardPurchase } from "openclaw/plugin-sdk/steward-policy";
import type { Web3PluginConfig } from "../config.js";
import { loadCallGateway, normalizeGatewayResult } from "../core-imports.js";
import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { ErrorCode } from "../errors/codes.js";
import { redactUnknown } from "../utils/redact.js";

type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

type StewardBuyParams = {
  actorId: string;
  consumerActorId: string;
  resourceId?: string;
  kind?: string;
  tag?: string;
  query?: string;
  quantity?: number;
  limit?: number;
  ttlMs: number;
  maxCost?: string;
  sessionKey?: string;
  autoPay?: boolean;
  execute?: boolean;
  paymentChain?: string;
  paymentTo?: string;
  paymentAmount?: string;
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
  approval?: {
    approved: boolean;
    approvalId?: string;
    approverId?: string;
    decidedAt?: string;
    expiresAt?: string;
  };
};

function jsonResult(payload: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

type GatewayCallSuccess = {
  ok: true;
  result?: unknown;
  error?: string;
};

type GatewayCallFailure = {
  ok: false;
  error: unknown;
};

type GatewayCallResult = GatewayCallSuccess | GatewayCallFailure;

async function callGatewayMethod(
  config: Web3PluginConfig,
  method: string,
  params?: unknown,
): Promise<GatewayCallResult> {
  const callGateway = await loadCallGateway();
  const response = await callGateway({
    method,
    params,
    timeoutMs: config.brain.timeoutMs,
  });
  const normalized = normalizeGatewayResult(response);
  if (!normalized.ok) {
    return { ok: false, error: formatWeb3GatewayErrorResponse(normalized.error) };
  }
  return { ok: true, result: normalized.result, error: normalized.error };
}

function safeResult(payload: unknown): AgentToolResult {
  return jsonResult(redactUnknown(payload));
}

function errorResult(err: unknown, details?: Record<string, unknown>): AgentToolResult {
  return safeResult(formatWeb3GatewayErrorResponse(err, ErrorCode.E_INTERNAL, details));
}

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

function toSelectionPolicy(
  raw: StewardBuyParams["selectionPolicy"],
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

function toBudgetPolicy(raw: StewardBuyParams["budgetPolicy"]): StewardBudgetPolicy | undefined {
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

function toRiskPolicy(raw: StewardBuyParams["riskPolicy"]): StewardRiskPolicy | undefined {
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

function toApproval(raw: StewardBuyParams["approval"]): StewardApproval | undefined {
  if (!raw) {
    return undefined;
  }
  return {
    approved: raw.approved === true,
    approvalId: asString(raw.approvalId),
    approverId: asString(raw.approverId),
    decidedAt: asString(raw.decidedAt),
    expiresAt: asString(raw.expiresAt),
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

function buildBaseResponse(params: {
  status: string;
  plan: ReturnType<typeof planMarketStewardPurchase>;
  executed: boolean;
}) {
  return {
    status: params.status,
    executed: params.executed,
    workflow: "compare/quote -> select -> budget/risk gate -> optional autopay -> lease",
    plan: params.plan,
    selectedCandidate: params.plan.selectedCandidate,
    candidatesConsidered: params.plan.selection.consideredCandidates,
  };
}

const ApprovalSchema = Type.Object(
  {
    approved: Type.Boolean(),
    approvalId: Type.Optional(Type.String()),
    approverId: Type.Optional(Type.String()),
    decidedAt: Type.Optional(Type.String()),
    expiresAt: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

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

const StewardBuySchema = Type.Object(
  {
    actorId: Type.String({ description: "Actor ID authorizing the steward purchase." }),
    consumerActorId: Type.String({
      description: "Consumer actor ID receiving the leased capability.",
    }),
    resourceId: Type.Optional(
      Type.String({
        description: "Optional pinned resource ID. If omitted, compare flow is used.",
      }),
    ),
    kind: Type.Optional(Type.String()),
    tag: Type.Optional(Type.String()),
    query: Type.Optional(Type.String()),
    quantity: Type.Optional(Type.Number({ minimum: 1, maximum: 1000 })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
    ttlMs: Type.Number({ minimum: 10_000, maximum: 604_800_000 }),
    maxCost: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
    autoPay: Type.Optional(Type.Boolean()),
    execute: Type.Optional(Type.Boolean()),
    paymentChain: Type.Optional(Type.String()),
    paymentTo: Type.Optional(Type.String()),
    paymentAmount: Type.Optional(Type.String()),
    selectionPolicy: Type.Optional(SelectionPolicySchema),
    budgetPolicy: Type.Optional(BudgetPolicySchema),
    riskPolicy: Type.Optional(RiskPolicySchema),
    approval: Type.Optional(ApprovalSchema),
  },
  { additionalProperties: false },
);

export function createWeb3MarketStewardBuyTool(config: Web3PluginConfig): AnyAgentTool | null {
  if (!config.resources.enabled || !config.resources.consumer.enabled) {
    return null;
  }
  return {
    name: "web3.market.steward.buy",
    label: "Web3 Market Steward Buy",
    description:
      "Plan or execute a policy-gated market purchase: compare candidates, pick one, evaluate budget/risk, and optionally autopay + lease.",
    parameters: StewardBuySchema,
    execute: async (_toolCallId: string, params: StewardBuyParams) => {
      try {
        const actorId = asString(params.actorId);
        const consumerActorId = asString(params.consumerActorId);
        if (!actorId || !consumerActorId) {
          return errorResult("actorId and consumerActorId are required", {
            fields: ["actorId", "consumerActorId"],
          });
        }

        const quantity =
          typeof params.quantity === "number" && Number.isFinite(params.quantity)
            ? Math.max(1, Math.floor(params.quantity))
            : 1;
        const limit =
          typeof params.limit === "number" && Number.isFinite(params.limit)
            ? Math.max(1, Math.min(20, Math.floor(params.limit)))
            : 5;
        const execute = params.execute === true;

        let candidates: MarketStewardCandidate[] = [];
        const resourceId = asString(params.resourceId);
        if (resourceId) {
          const quoteResult = await callGatewayMethod(config, "web3.market.offer.quote", {
            resourceId,
            quantity,
            ttlMs: params.ttlMs,
          });
          const quotePayload = quoteResult.ok ? asRecord(quoteResult.result) : undefined;
          const quote = quotePayload ? asRecord(quotePayload.quote) : undefined;
          const candidate = quote ? candidateFromQuote(quote) : null;
          if (candidate) {
            candidates = [candidate];
          }
        } else {
          const compareResult = await callGatewayMethod(config, "web3.market.offer.compare", {
            kind: asString(params.kind),
            tag: asString(params.tag),
            query: asString(params.query),
            quantity,
            limit,
          });
          candidates = compareResult.ok ? extractCandidates(compareResult.result) : [];
        }

        const plan = planMarketStewardPurchase({
          candidates,
          requestedResourceId: resourceId,
          selectionPolicy: toSelectionPolicy(params.selectionPolicy),
          budgetPolicy: toBudgetPolicy(params.budgetPolicy),
          riskPolicy: toRiskPolicy(params.riskPolicy),
          approval: toApproval(params.approval),
          requireBudgetPolicy: execute,
          requireRiskPolicy: execute,
        });

        if (!execute || !plan.canExecute || !plan.selectedCandidate) {
          const status =
            plan.status === "approval_required"
              ? "approval_required"
              : plan.status === "approved"
                ? "planned"
                : "blocked";
          return safeResult(buildBaseResponse({ status, plan, executed: false }));
        }

        let payment: unknown = null;
        if (params.autoPay) {
          const paymentChain = asString(params.paymentChain) ?? "evm";
          const paymentTo =
            asString(params.paymentTo) ?? asString(plan.selectedCandidate.providerActorId) ?? "";
          const paymentAmount =
            asString(params.paymentAmount) ??
            (typeof plan.selectedCandidate.estimatedTotal === "string"
              ? plan.selectedCandidate.estimatedTotal
              : typeof plan.selectedCandidate.priceAmount === "string"
                ? plan.selectedCandidate.priceAmount
                : undefined);
          if (!paymentTo || !paymentAmount) {
            return errorResult(
              "paymentTo/paymentAmount could not be resolved for steward autopay",
              {
                fields: ["paymentTo", "paymentAmount"],
              },
            );
          }
          payment = await callGatewayMethod(config, "web3.wallet.autopay", {
            chain: paymentChain,
            to: paymentTo,
            value: paymentAmount,
            amount: paymentAmount,
            tool: "web3.market.steward.buy",
          });
        }

        const lease = await callGatewayMethod(config, "web3.market.lease.issue", {
          actorId,
          resourceId: plan.selectedCandidate.resourceId,
          consumerActorId,
          ttlMs: params.ttlMs,
          maxCost: asString(params.maxCost),
          sessionKey: asString(params.sessionKey),
        });

        const leasePayload = lease.ok ? asRecord(lease.result) : undefined;
        const leaseId = leasePayload ? asString(leasePayload.leaseId) : undefined;
        let execution: unknown = null;
        if (leaseId) {
          execution = await callGatewayMethod(config, "web3.market.execution.status", { leaseId });
        }

        return safeResult({
          ...buildBaseResponse({ status: "executed", plan, executed: true }),
          payment,
          lease,
          execution,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}
