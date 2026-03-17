import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/core";
import type { Web3PluginConfig } from "../config.js";
import { rememberMarketStewardContext } from "./market-steward-context.js";
import {
  callGatewayMethod,
  errorResult,
  requireOneOf,
  safeResult,
  withTrimmedActor,
} from "./market-tools-shared.js";

type Payee = { address: string; amount: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function extractLifecycleMemory(payload: unknown) {
  const result = asRecord(payload);
  const approval = asRecord(result?.approval);
  const consent = asRecord(result?.consent);
  const lease = asRecord(result?.lease);
  const proof = asRecord(result?.proof);
  const dispute = asRecord(result?.dispute);
  const settlement = asRecord(result?.settlement);
  return {
    orderId: asString(result?.orderId) ?? asString(asRecord(result?.order)?.orderId),
    leaseId: asString(result?.leaseId) ?? asString(lease?.leaseId),
    consentId:
      asString(result?.consentId) ?? asString(consent?.consentId) ?? asString(approval?.consentId),
    proofId: asString(result?.proofId) ?? asString(proof?.proofId),
    disputeId: asString(result?.disputeId) ?? asString(dispute?.disputeId),
    settlementId: asString(result?.settlementId) ?? asString(settlement?.settlementId),
    status:
      asString(result?.executionStatus) ??
      asString(result?.acceptanceStatus) ??
      asString(result?.status),
  };
}

function buildLifecycleGrowthSummary(stage: string, result?: unknown): string | undefined {
  const memory = extractLifecycleMemory(result);
  const orderRef = memory.orderId ? ` for ${memory.orderId}` : "";
  switch (stage) {
    case "execution_status":
      return memory.proofId && !memory.settlementId
        ? `Proof is available${orderRef}; buyer acceptance or dispute handling is the next closure gate.`
        : `Execution posture was refreshed${orderRef}; keep proof, acceptance, and settlement aligned before considering the loop closed.`;
    case "proof_verified":
      return `Proof verification succeeded${orderRef}; convert this into an acceptance decision while the evidence is fresh.`;
    case "acceptance_signed":
      return `Buyer acceptance is signed${orderRef}; reconcile settlement release and provider quality before reusing this route.`;
    case "acceptance_rejected":
      return `Buyer acceptance was rejected${orderRef}; preserve the reason as dispute evidence and tighten future acceptance criteria.`;
    case "dispute_opened":
      return `A dispute is now open${orderRef}; gather paste-safe evidence and avoid blind retries until resolution is explicit.`;
    case "dispute_evidence_submitted":
      return memory.disputeId
        ? `Evidence was attached to dispute ${memory.disputeId}; resolve or reject it explicitly so the execution loop can converge.`
        : `Evidence was attached${orderRef}; finish the dispute path explicitly before trusting the provider again.`;
    case "dispute_resolved":
      return `The dispute path resolved${orderRef}; verify settlement propagation and fold the outcome into provider preference memory.`;
    case "dispute_rejected":
      return `The dispute path was rejected${orderRef}; confirm the order is no longer blocked and reconcile the remaining settlement posture.`;
    case "settlement_review":
      return `Settlement posture was reviewed${orderRef}; compare realized spend, dispute overhead, and provider quality before closing the learning loop.`;
    default:
      return undefined;
  }
}

async function rememberLifecycleContext(params: {
  sessionKey?: string;
  stage: string;
  result?: unknown;
}): Promise<void> {
  const sessionKey = asString(params.sessionKey);
  if (!sessionKey) {
    return;
  }
  const memory = extractLifecycleMemory(params.result);
  await rememberMarketStewardContext({
    sessionKey,
    status: memory.status ?? params.stage,
    orderId: memory.orderId,
    leaseId: memory.leaseId,
    consentId: memory.consentId,
    proofId: memory.proofId,
    disputeId: memory.disputeId,
    settlementId: memory.settlementId,
    growthSummary: buildLifecycleGrowthSummary(params.stage, params.result),
    lastReflectedAt: new Date().toISOString(),
  });
}

const ProofObjectSchema = Type.Object(
  {},
  {
    additionalProperties: true,
    description: "Proof payload passed through to market proof handlers. Keep it paste-safe.",
  },
);

const EvidenceObjectSchema = Type.Object(
  {
    summary: Type.String({ description: "Redacted evidence summary." }),
    cid: Type.Optional(Type.String({ description: "Optional external evidence CID." })),
  },
  { additionalProperties: false },
);

const PayeeSchema = Type.Object(
  {
    address: Type.String({ description: "Settlement payee address." }),
    amount: Type.String({ description: "Amount as a numeric string." }),
  },
  { additionalProperties: false },
);

const ExecutionStatusSchema = Type.Object(
  {
    actorId: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
    leaseId: Type.Optional(Type.String()),
    proofId: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
    sessionKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type ExecutionStatusParams = {
  actorId?: string;
  orderId?: string;
  leaseId?: string;
  proofId?: string;
  limit?: number;
  sessionKey?: string;
};

const SettlementQuerySchema = Type.Object(
  {
    actorId: Type.String({ description: "Buyer or seller actor ID." }),
    orderId: Type.Optional(Type.String()),
    settlementId: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
    timeRange: Type.Optional(Type.String()),
    since: Type.Optional(Type.String()),
    until: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
    sessionKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type SettlementQueryParams = {
  actorId: string;
  orderId?: string;
  settlementId?: string;
  status?: string;
  timeRange?: string;
  since?: string;
  until?: string;
  limit?: number;
  sessionKey?: string;
};

const ProofSubmitSchema = Type.Object(
  {
    actorId: Type.String({ description: "Provider actor ID submitting the proof." }),
    orderId: Type.String({ description: "Order ID tied to the proof." }),
    leaseId: Type.Optional(Type.String()),
    deliveryId: Type.Optional(Type.String()),
    proof: ProofObjectSchema,
    sessionKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type ProofSubmitParams = {
  actorId: string;
  orderId: string;
  leaseId?: string;
  deliveryId?: string;
  proof: Record<string, unknown>;
  sessionKey?: string;
};

const ProofVerifySchema = Type.Object(
  {
    actorId: Type.Optional(Type.String()),
    proofId: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type ProofVerifyParams = {
  actorId?: string;
  proofId?: string;
  orderId?: string;
  sessionKey?: string;
};

const AcceptanceSignSchema = Type.Object(
  {
    actorId: Type.String({ description: "Buyer actor ID approving the execution." }),
    orderId: Type.String({ description: "Order ID being accepted." }),
    proofId: Type.Optional(Type.String()),
    idempotencyKey: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type AcceptanceSignParams = {
  actorId: string;
  orderId: string;
  proofId?: string;
  idempotencyKey?: string;
  sessionKey?: string;
};

const AcceptanceRejectSchema = Type.Object(
  {
    actorId: Type.String({ description: "Buyer actor ID rejecting the execution." }),
    orderId: Type.String({ description: "Order ID being rejected." }),
    reason: Type.String({ description: "Rejection reason shown in dispute context." }),
    proofId: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type AcceptanceRejectParams = {
  actorId: string;
  orderId: string;
  reason: string;
  proofId?: string;
  sessionKey?: string;
};

const DisputeOpenSchema = Type.Object(
  {
    actorId: Type.String({ description: "Buyer or seller actor ID opening the dispute." }),
    orderId: Type.String({ description: "Order ID under dispute." }),
    reason: Type.String({ description: "Dispute reason." }),
    sessionKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type DisputeOpenParams = {
  actorId: string;
  orderId: string;
  reason: string;
  sessionKey?: string;
};

const DisputeEvidenceSchema = Type.Object(
  {
    actorId: Type.String({ description: "Buyer or seller actor ID submitting evidence." }),
    disputeId: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
    evidence: EvidenceObjectSchema,
    sessionKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type DisputeEvidenceParams = {
  actorId: string;
  disputeId?: string;
  orderId?: string;
  evidence: { summary: string; cid?: string };
  sessionKey?: string;
};

const DisputeResolveSchema = Type.Object(
  {
    actorId: Type.String({ description: "Authorized actor resolving the dispute." }),
    disputeId: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
    resolution: Type.String({ description: "release | refund | partial" }),
    payer: Type.Optional(Type.String()),
    payees: Type.Optional(Type.Array(PayeeSchema, { minItems: 1 })),
    sessionKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type DisputeResolveParams = {
  actorId: string;
  disputeId?: string;
  orderId?: string;
  resolution: string;
  payer?: string;
  payees?: Payee[];
  sessionKey?: string;
};

const DisputeRejectSchema = Type.Object(
  {
    actorId: Type.String({ description: "Authorized actor rejecting the dispute." }),
    disputeId: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type DisputeRejectParams = {
  actorId: string;
  disputeId?: string;
  orderId?: string;
  sessionKey?: string;
};

function createLifecycleTool<T extends Record<string, unknown>>(params: {
  config: Web3PluginConfig;
  name: string;
  label: string;
  description: string;
  schema: ReturnType<typeof Type.Object>;
  method: string;
  prepare: (raw: T) => Record<string, unknown>;
  stage: string;
  nextAction: string;
}): AnyAgentTool | null {
  if (!params.config.resources.enabled) {
    return null;
  }
  return {
    name: params.name,
    label: params.label,
    description: params.description,
    parameters: params.schema,
    execute: async (_toolCallId, raw: T) => {
      try {
        const prepared = params.prepare(raw);
        const result = await callGatewayMethod(params.config, params.method, prepared);
        if (result.ok) {
          await rememberLifecycleContext({
            sessionKey: asString(raw.sessionKey),
            stage: params.stage,
            result: result.result,
          });
        }
        return safeResult({
          buyerLifecycleStage: params.stage,
          nextAction: params.nextAction,
          result,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  } as AnyAgentTool;
}

export function createWeb3MarketExecutionStatusTool(config: Web3PluginConfig): AnyAgentTool | null {
  return createLifecycleTool<ExecutionStatusParams>({
    config,
    name: "web3.market.execution.status",
    label: "Web3 Market Execution Status",
    description: "Fetch a buyer-facing execution summary using orderId, leaseId, or proofId.",
    schema: ExecutionStatusSchema,
    method: "web3.market.execution.status",
    prepare: (raw) => {
      requireOneOf([raw.orderId, raw.leaseId, raw.proofId], ["orderId", "leaseId", "proofId"]);
      return withTrimmedActor(raw);
    },
    stage: "execution_status",
    nextAction:
      "Use proof / acceptance / dispute tools according to the returned execution posture.",
  });
}

export function createWeb3MarketSettlementQueryTool(config: Web3PluginConfig): AnyAgentTool | null {
  return createLifecycleTool<SettlementQueryParams>({
    config,
    name: "web3.market.settlement.query",
    label: "Web3 Market Settlement Query",
    description:
      "Query settlement posture for buyer or seller review, including list and aggregation fields.",
    schema: SettlementQuerySchema,
    method: "web3.market.settlement.query",
    prepare: (raw) => ({
      ...withTrimmedActor(raw),
      orderId: raw.orderId?.trim(),
      settlementId: raw.settlementId?.trim(),
      status: raw.status?.trim(),
      timeRange: raw.timeRange?.trim(),
      since: raw.since?.trim(),
      until: raw.until?.trim(),
      limit: raw.limit,
    }),
    stage: "settlement_review",
    nextAction:
      "If settlement is blocked, inspect acceptance/dispute posture before retrying release or refund decisions.",
  });
}

export function createWeb3MarketProofSubmitTool(config: Web3PluginConfig): AnyAgentTool | null {
  return createLifecycleTool<ProofSubmitParams>({
    config,
    name: "web3.market.proof.submit",
    label: "Web3 Market Proof Submit",
    description: "Submit a redacted execution proof after delivery so the buyer can review it.",
    schema: ProofSubmitSchema,
    method: "web3.market.proof.submit",
    prepare: (raw) => ({
      ...withTrimmedActor(raw),
      orderId: raw.orderId.trim(),
      leaseId: raw.leaseId?.trim(),
      deliveryId: raw.deliveryId?.trim(),
      proof: raw.proof,
    }),
    stage: "proof_submitted",
    nextAction: "Run proof verify or wait for buyer acceptance once the proof lands.",
  });
}

export function createWeb3MarketProofVerifyTool(config: Web3PluginConfig): AnyAgentTool | null {
  return createLifecycleTool<ProofVerifyParams>({
    config,
    name: "web3.market.proof.verify",
    label: "Web3 Market Proof Verify",
    description:
      "Verify a submitted proof by proofId or orderId before acceptance or dispute handling.",
    schema: ProofVerifySchema,
    method: "web3.market.proof.verify",
    prepare: (raw) => {
      requireOneOf([raw.proofId, raw.orderId], ["proofId", "orderId"]);
      return withTrimmedActor(raw);
    },
    stage: "proof_verified",
    nextAction: "If the proof verifies, move to acceptance; otherwise open or update a dispute.",
  });
}

export function createWeb3MarketAcceptanceSignTool(config: Web3PluginConfig): AnyAgentTool | null {
  return createLifecycleTool<AcceptanceSignParams>({
    config,
    name: "web3.market.acceptance.sign",
    label: "Web3 Market Acceptance Sign",
    description:
      "Approve the buyer-side acceptance decision and trigger settlement release if needed.",
    schema: AcceptanceSignSchema,
    method: "web3.market.acceptance.sign",
    prepare: (raw) => ({
      ...withTrimmedActor(raw),
      orderId: raw.orderId.trim(),
      proofId: raw.proofId?.trim(),
      idempotencyKey: raw.idempotencyKey?.trim(),
    }),
    stage: "acceptance_signed",
    nextAction: "Re-check execution and settlement status to confirm the release completed.",
  });
}

export function createWeb3MarketAcceptanceRejectTool(
  config: Web3PluginConfig,
): AnyAgentTool | null {
  return createLifecycleTool<AcceptanceRejectParams>({
    config,
    name: "web3.market.acceptance.reject",
    label: "Web3 Market Acceptance Reject",
    description: "Reject the buyer-side acceptance decision and open a dispute-compatible posture.",
    schema: AcceptanceRejectSchema,
    method: "web3.market.acceptance.reject",
    prepare: (raw) => ({
      ...withTrimmedActor(raw),
      orderId: raw.orderId.trim(),
      reason: raw.reason.trim(),
      proofId: raw.proofId?.trim(),
    }),
    stage: "acceptance_rejected",
    nextAction: "Attach evidence or resolve the resulting dispute before retrying acceptance.",
  });
}

export function createWeb3MarketDisputeOpenTool(config: Web3PluginConfig): AnyAgentTool | null {
  return createLifecycleTool<DisputeOpenParams>({
    config,
    name: "web3.market.dispute.open",
    label: "Web3 Market Dispute Open",
    description:
      "Open a dispute against an order when delivery, proof, or settlement posture is unacceptable.",
    schema: DisputeOpenSchema,
    method: "web3.market.dispute.open",
    prepare: (raw) => ({
      ...withTrimmedActor(raw),
      orderId: raw.orderId.trim(),
      reason: raw.reason.trim(),
    }),
    stage: "dispute_opened",
    nextAction:
      "Submit redacted evidence and then resolve or reject the dispute according to policy.",
  });
}

export function createWeb3MarketDisputeSubmitEvidenceTool(
  config: Web3PluginConfig,
): AnyAgentTool | null {
  return createLifecycleTool<DisputeEvidenceParams>({
    config,
    name: "web3.market.dispute.submitEvidence",
    label: "Web3 Market Dispute Submit Evidence",
    description: "Attach paste-safe evidence to an open dispute by disputeId or orderId.",
    schema: DisputeEvidenceSchema,
    method: "web3.market.dispute.submitEvidence",
    prepare: (raw) => {
      requireOneOf([raw.disputeId, raw.orderId], ["disputeId", "orderId"]);
      return {
        ...withTrimmedActor(raw),
        disputeId: raw.disputeId?.trim(),
        orderId: raw.orderId?.trim(),
        evidence: {
          summary: raw.evidence.summary.trim(),
          cid: raw.evidence.cid?.trim(),
        },
      };
    },
    stage: "dispute_evidence_submitted",
    nextAction:
      "After evidence is attached, resolve or reject the dispute to close the execution loop.",
  });
}

export function createWeb3MarketDisputeResolveTool(config: Web3PluginConfig): AnyAgentTool | null {
  return createLifecycleTool<DisputeResolveParams>({
    config,
    name: "web3.market.dispute.resolve",
    label: "Web3 Market Dispute Resolve",
    description: "Resolve a dispute with release, refund, or partial settlement semantics.",
    schema: DisputeResolveSchema,
    method: "web3.market.dispute.resolve",
    prepare: (raw) => {
      requireOneOf([raw.disputeId, raw.orderId], ["disputeId", "orderId"]);
      return {
        ...withTrimmedActor(raw),
        disputeId: raw.disputeId?.trim(),
        orderId: raw.orderId?.trim(),
        resolution: raw.resolution.trim(),
        payer: raw.payer?.trim(),
        payees: raw.payees,
      };
    },
    stage: "dispute_resolved",
    nextAction:
      "Re-check settlement and execution status to verify the dispute outcome propagated.",
  });
}

export function createWeb3MarketDisputeRejectTool(config: Web3PluginConfig): AnyAgentTool | null {
  return createLifecycleTool<DisputeRejectParams>({
    config,
    name: "web3.market.dispute.reject",
    label: "Web3 Market Dispute Reject",
    description: "Reject a dispute without changing settlement state, preserving the audit trail.",
    schema: DisputeRejectSchema,
    method: "web3.market.dispute.reject",
    prepare: (raw) => {
      requireOneOf([raw.disputeId, raw.orderId], ["disputeId", "orderId"]);
      return {
        ...withTrimmedActor(raw),
        disputeId: raw.disputeId?.trim(),
        orderId: raw.orderId?.trim(),
      };
    },
    stage: "dispute_rejected",
    nextAction:
      "Return to execution status review to confirm the dispute no longer blocks the order.",
  });
}
