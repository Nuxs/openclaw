export type MarketExecutionTraceView = {
  id: string;
  kind: string;
  refId: string;
  actor: string | null;
  timestamp: string;
  detailSummary: string | null;
};

export type MarketExecutionSummaryView = {
  orderId: string;
  leaseId: string | null;
  resourceId: string | null;
  resourceLabel: string | null;
  providerActorId: string | null;
  buyerId: string | null;
  executionStatus: string;
  acceptanceStatus: string | null;
  deliveryStatus: string | null;
  proofId: string | null;
  proofStatus: string | null;
  proofType: string | null;
  settlementStatus: string | null;
  settlementAmount: string | null;
  releasedAmount: string | null;
  disputeStatus: string | null;
  currency: string | null;
  lastUpdatedAt: string | null;
  trace: MarketExecutionTraceView[];
};
