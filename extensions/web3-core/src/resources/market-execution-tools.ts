import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/core";
import type { Web3PluginConfig } from "../config.js";
import {
  callGatewayMethod,
  errorResult,
  requireOneOf,
  safeResult,
  withTrimmedActor,
} from "./market-tools-shared.js";

type Payee = { address: string; amount: string };

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
  },
  { additionalProperties: false },
);

type ExecutionStatusParams = {
  actorId?: string;
  orderId?: string;
  leaseId?: string;
  proofId?: string;
  limit?: number;
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
};

const ProofSubmitSchema = Type.Object(
  {
    actorId: Type.String({ description: "Provider actor ID submitting the proof." }),
    orderId: Type.String({ description: "Order ID tied to the proof." }),
    leaseId: Type.Optional(Type.String()),
    deliveryId: Type.Optional(Type.String()),
    proof: ProofObjectSchema,
  },
  { additionalProperties: false },
);

type ProofSubmitParams = {
  actorId: string;
  orderId: string;
  leaseId?: string;
  deliveryId?: string;
  proof: Record<string, unknown>;
};

const ProofVerifySchema = Type.Object(
  {
    actorId: Type.Optional(Type.String()),
    proofId: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type ProofVerifyParams = {
  actorId?: string;
  proofId?: string;
  orderId?: string;
};

const AcceptanceSignSchema = Type.Object(
  {
    actorId: Type.String({ description: "Buyer actor ID approving the execution." }),
    orderId: Type.String({ description: "Order ID being accepted." }),
    proofId: Type.Optional(Type.String()),
    idempotencyKey: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type AcceptanceSignParams = {
  actorId: string;
  orderId: string;
  proofId?: string;
  idempotencyKey?: string;
};

const AcceptanceRejectSchema = Type.Object(
  {
    actorId: Type.String({ description: "Buyer actor ID rejecting the execution." }),
    orderId: Type.String({ description: "Order ID being rejected." }),
    reason: Type.String({ description: "Rejection reason shown in dispute context." }),
    proofId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type AcceptanceRejectParams = {
  actorId: string;
  orderId: string;
  reason: string;
  proofId?: string;
};

const DisputeOpenSchema = Type.Object(
  {
    actorId: Type.String({ description: "Buyer or seller actor ID opening the dispute." }),
    orderId: Type.String({ description: "Order ID under dispute." }),
    reason: Type.String({ description: "Dispute reason." }),
  },
  { additionalProperties: false },
);

type DisputeOpenParams = {
  actorId: string;
  orderId: string;
  reason: string;
};

const DisputeEvidenceSchema = Type.Object(
  {
    actorId: Type.String({ description: "Buyer or seller actor ID submitting evidence." }),
    disputeId: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
    evidence: EvidenceObjectSchema,
  },
  { additionalProperties: false },
);

type DisputeEvidenceParams = {
  actorId: string;
  disputeId?: string;
  orderId?: string;
  evidence: { summary: string; cid?: string };
};

const DisputeResolveSchema = Type.Object(
  {
    actorId: Type.String({ description: "Authorized actor resolving the dispute." }),
    disputeId: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
    resolution: Type.String({ description: "release | refund | partial" }),
    payer: Type.Optional(Type.String()),
    payees: Type.Optional(Type.Array(PayeeSchema, { minItems: 1 })),
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
};

const DisputeRejectSchema = Type.Object(
  {
    actorId: Type.String({ description: "Authorized actor rejecting the dispute." }),
    disputeId: Type.Optional(Type.String()),
    orderId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

type DisputeRejectParams = {
  actorId: string;
  disputeId?: string;
  orderId?: string;
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
        const result = await callGatewayMethod(params.config, params.method, params.prepare(raw));
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
