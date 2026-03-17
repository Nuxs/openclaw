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
import {
  rememberMarketStewardContext,
  resolveMarketStewardContext,
  type ResolvedMarketStewardContext,
} from "./market-steward-context.js";

type AgentToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

type StewardBuyParams = {
  actorId?: string;
  consumerActorId?: string;
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

function resolvePlanningStatus(plan: ReturnType<typeof planMarketStewardPurchase>): string {
  return plan.status === "approval_required"
    ? "approval_required"
    : plan.status === "approved"
      ? "planned"
      : "blocked";
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

function formatGrowthRefs(params: {
  resourceId?: string;
  orderId?: string;
  leaseId?: string;
  consentId?: string;
  proofId?: string;
  disputeId?: string;
  settlementId?: string;
}): string {
  const refs = [
    params.resourceId,
    params.orderId,
    params.leaseId,
    params.consentId,
    params.proofId,
    params.disputeId,
    params.settlementId,
  ].filter((value): value is string => Boolean(value));
  return refs.length > 0 ? ` (${refs.join(", ")})` : "";
}

function buildStewardGrowthSummary(
  context: ResolvedMarketStewardContext,
  params: {
    status: string;
    resourceId?: string;
    orderId?: string;
    leaseId?: string;
    consentId?: string;
    proofId?: string;
    disputeId?: string;
    settlementId?: string;
  },
): string {
  const refs = formatGrowthRefs(params);
  const policyNote =
    context.usedDefaultBudgetPolicy || context.usedDefaultRiskPolicy
      ? " Conservative default policy remained in effect."
      : "";
  switch (params.status) {
    case "compare_failed":
      return `Market compare failed${refs}; re-check discovery and provider availability before retrying.${policyNote}`;
    case "quote_failed":
      return `Direct quote failed${refs}; verify the pinned resource and pricing posture before retrying.${policyNote}`;
    case "approval_required":
      return `Owner approval is still required${refs}; keep the candidate and policy context warm until the gate is decided.${policyNote}`;
    case "planned":
      return `A safe purchase plan is prepared${refs}; keep this candidate warm for the next execution window.${policyNote}`;
    case "blocked":
      return `No candidate cleared the current policy gate${refs}; research alternatives or change policy explicitly before spending.${policyNote}`;
    case "payment_unresolved":
      return `Autopay parameters could not be resolved${refs}; capture explicit payment metadata before retrying.${policyNote}`;
    case "payment_failed":
      return `Autopay failed${refs}; investigate wallet and payment rails before attempting the lease again.${policyNote}`;
    case "lease_failed":
      return `Lease issuance failed${refs}; inspect market health, approvals, and provider readiness before retrying.${policyNote}`;
    case "executed":
      return `The steward executed the purchase${refs}; follow proof, acceptance, and settlement before trusting this provider for future routing.${policyNote}`;
    default:
      return `Steward state updated to ${params.status}${refs}; keep memory, follow-up, and owner governance aligned.${policyNote}`;
  }
}

function extractLeaseIdentifiers(payload: GatewayCallResult | null) {
  const result = payload?.ok ? asRecord(payload.result) : undefined;
  return {
    orderId: result ? asString(result.orderId) : undefined,
    leaseId: result ? asString(result.leaseId) : undefined,
    consentId: result ? asString(result.consentId) : undefined,
  };
}

function extractExecutionIdentifiers(payload: GatewayCallResult | null) {
  const result = payload?.ok ? asRecord(payload.result) : undefined;
  const approval = result ? asRecord(result.approval) : undefined;
  const consent = result ? asRecord(result.consent) : undefined;
  const proof = result ? asRecord(result.proof) : undefined;
  const dispute = result ? asRecord(result.dispute) : undefined;
  const settlement = result ? asRecord(result.settlement) : undefined;
  const lease = result ? asRecord(result.lease) : undefined;
  return {
    orderId: result ? asString(result.orderId) : undefined,
    leaseId: lease ? asString(lease.leaseId) : undefined,
    consentId:
      (consent ? asString(consent.consentId) : undefined) ??
      (approval ? asString(approval.consentId) : undefined),
    proofId: proof ? asString(proof.proofId) : undefined,
    disputeId: dispute ? asString(dispute.disputeId) : undefined,
    settlementId: settlement ? asString(settlement.settlementId) : undefined,
  };
}

async function rememberStewardState(
  context: ResolvedMarketStewardContext,
  params: {
    actorId: string;
    consumerActorId: string;
    status: string;
    orderId?: string;
    resourceId?: string;
    leaseId?: string;
    consentId?: string;
    proofId?: string;
    disputeId?: string;
    settlementId?: string;
    growthSummary?: string;
  },
): Promise<void> {
  await rememberMarketStewardContext({
    sessionKey: context.sessionKey,
    actorId: params.actorId,
    consumerActorId: params.consumerActorId,
    budgetPolicy: context.budgetPolicy,
    riskPolicy: context.riskPolicy,
    approval: context.approval,
    status: params.status,
    orderId: params.orderId,
    resourceId: params.resourceId,
    leaseId: params.leaseId,
    consentId: params.consentId,
    proofId: params.proofId,
    disputeId: params.disputeId,
    settlementId: params.settlementId,
    growthSummary: params.growthSummary ?? buildStewardGrowthSummary(context, params),
  });
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
    actorId: Type.Optional(
      Type.String({
        description:
          "Optional actor ID authorizing the steward purchase. If omitted, the tool reuses remembered steward identity from the session when available.",
      }),
    ),
    consumerActorId: Type.Optional(
      Type.String({
        description:
          "Optional consumer actor ID receiving the leased capability. If omitted, the tool reuses remembered steward identity from the session when available.",
      }),
    ),
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
        const execute = params.execute === true;
        const resolvedContext = await resolveMarketStewardContext({
          sessionKey: asString(params.sessionKey),
          actorId: asString(params.actorId),
          consumerActorId: asString(params.consumerActorId),
          budgetPolicy: toBudgetPolicy(params.budgetPolicy),
          riskPolicy: toRiskPolicy(params.riskPolicy),
          approval: toApproval(params.approval),
          maxCost: asString(params.maxCost),
          execute,
        });
        const actorId = asString(resolvedContext.actorId);
        const consumerActorId = asString(resolvedContext.consumerActorId);
        if (!actorId || !consumerActorId) {
          return errorResult(
            "actorId and consumerActorId are required unless remembered steward identity is available for this session",
            {
              fields: ["actorId", "consumerActorId", "sessionKey"],
            },
          );
        }

        const quantity =
          typeof params.quantity === "number" && Number.isFinite(params.quantity)
            ? Math.max(1, Math.floor(params.quantity))
            : 1;
        const limit =
          typeof params.limit === "number" && Number.isFinite(params.limit)
            ? Math.max(1, Math.min(20, Math.floor(params.limit)))
            : 5;
        const resourceId = asString(params.resourceId);

        let candidates: MarketStewardCandidate[] = [];
        if (resourceId) {
          const quoteResult = await callGatewayMethod(config, "web3.market.offer.quote", {
            resourceId,
            quantity,
            ttlMs: params.ttlMs,
          });
          if (!quoteResult.ok) {
            await rememberStewardState(resolvedContext, {
              actorId,
              consumerActorId,
              status: "quote_failed",
              resourceId,
            });
            return errorResult(quoteResult.error, { method: "web3.market.offer.quote" });
          }
          const quotePayload = asRecord(quoteResult.result);
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
          if (!compareResult.ok) {
            await rememberStewardState(resolvedContext, {
              actorId,
              consumerActorId,
              status: "compare_failed",
            });
            return errorResult(compareResult.error, { method: "web3.market.offer.compare" });
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
          requireBudgetPolicy: execute,
          requireRiskPolicy: execute,
        });

        if (!execute || !plan.canExecute || !plan.selectedCandidate) {
          const status = resolvePlanningStatus(plan);
          await rememberStewardState(resolvedContext, {
            actorId,
            consumerActorId,
            status,
            resourceId: plan.selectedCandidate?.resourceId ?? resourceId,
          });
          return safeResult({
            ...buildBaseResponse({ status, plan, executed: false }),
            stewardContext: summarizeStewardContext(resolvedContext),
          });
        }

        let payment: GatewayCallResult | null = null;
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
            await rememberStewardState(resolvedContext, {
              actorId,
              consumerActorId,
              status: "payment_unresolved",
              resourceId: plan.selectedCandidate.resourceId,
            });
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
          if (!payment.ok) {
            await rememberStewardState(resolvedContext, {
              actorId,
              consumerActorId,
              status: "payment_failed",
              resourceId: plan.selectedCandidate.resourceId,
            });
            return errorResult(payment.error, { method: "web3.wallet.autopay" });
          }
        }

        const lease = await callGatewayMethod(config, "web3.market.lease.issue", {
          actorId,
          resourceId: plan.selectedCandidate.resourceId,
          consumerActorId,
          ttlMs: params.ttlMs,
          maxCost: asString(params.maxCost),
          sessionKey: asString(resolvedContext.sessionKey) ?? asString(params.sessionKey),
        });
        if (!lease.ok) {
          await rememberStewardState(resolvedContext, {
            actorId,
            consumerActorId,
            status: "lease_failed",
            resourceId: plan.selectedCandidate.resourceId,
          });
          return errorResult(lease.error, { method: "web3.market.lease.issue" });
        }

        const leaseIdentifiers = extractLeaseIdentifiers(lease);
        let execution: GatewayCallResult | null = null;
        if (leaseIdentifiers.leaseId) {
          execution = await callGatewayMethod(config, "web3.market.execution.status", {
            leaseId: leaseIdentifiers.leaseId,
          });
        }
        const executionIdentifiers = extractExecutionIdentifiers(execution);

        await rememberStewardState(resolvedContext, {
          actorId,
          consumerActorId,
          status: "executed",
          orderId: executionIdentifiers.orderId ?? leaseIdentifiers.orderId,
          resourceId: plan.selectedCandidate.resourceId,
          leaseId: executionIdentifiers.leaseId ?? leaseIdentifiers.leaseId,
          consentId: executionIdentifiers.consentId ?? leaseIdentifiers.consentId,
          proofId: executionIdentifiers.proofId,
          disputeId: executionIdentifiers.disputeId,
          settlementId: executionIdentifiers.settlementId,
        });

        return safeResult({
          ...buildBaseResponse({ status: "executed", plan, executed: true }),
          stewardContext: summarizeStewardContext(resolvedContext),
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
