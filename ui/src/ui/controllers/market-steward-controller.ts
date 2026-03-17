import type {
  ConsentView,
  MarketAuditSnapshot,
  MarketDispute,
  MarketExecutionSummaryView,
  MarketOpsSummary,
  MarketStatusSummary,
} from "../types.ts";

export type StewardPriority = "high" | "medium";

export type ApprovalQueueItem = {
  id: string;
  kind: "consent" | "acceptance" | "dispute";
  title: string;
  status: string;
  action: string;
  detail: string;
  refs: string[];
  priority: StewardPriority;
};

export type OwnerGovernanceSnapshot = {
  approvalQueueCount: number;
  exceptionPressure: number;
  auditBacklog: number;
  killSwitchState: "steady" | "guarded" | "tripped";
  killSwitchReason: string;
  summary: string[];
};

export type GrowthLoopItem = {
  phase: "memory" | "reflection" | "research" | "heartbeat";
  title: string;
  detail: string;
  refs: string[];
  priority: StewardPriority;
};

function appendUnique<T>(target: T[], value: T) {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function isConsentPending(status: string): boolean {
  return status === "consent_pending" || status === "approval_required";
}

function isDisputeActive(status: string): boolean {
  return status === "dispute_opened" || status === "dispute_evidence_submitted";
}

function shortId(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function buildMarketApprovalQueue(params: {
  consents: ConsentView[];
  executions: MarketExecutionSummaryView[];
  disputes: MarketDispute[];
}): ApprovalQueueItem[] {
  const queue: ApprovalQueueItem[] = [];

  for (const consent of params.consents) {
    if (!isConsentPending(consent.status)) {
      continue;
    }
    queue.push({
      id: `consent:${consent.consentId}`,
      kind: "consent",
      title: `Owner consent · ${consent.purpose}`,
      status: consent.status,
      action: "Grant or revoke consent before execution continues.",
      detail: `Order ${shortId(consent.orderId)} is waiting on owner policy.`,
      refs: [`consentId=${consent.consentId}`, `orderId=${consent.orderId}`],
      priority: "high",
    });
  }

  for (const execution of params.executions) {
    const waitingForAcceptance =
      execution.acceptanceStatus === "acceptance_pending" ||
      execution.executionStatus === "awaiting_acceptance";
    if (!waitingForAcceptance) {
      continue;
    }
    queue.push({
      id: `acceptance:${execution.orderId}`,
      kind: "acceptance",
      title: `Buyer acceptance · ${execution.resourceLabel ?? shortId(execution.orderId)}`,
      status: execution.acceptanceStatus ?? execution.executionStatus,
      action: "Sign acceptance or reject with dispute context.",
      detail: `Proof ${execution.proofType ?? execution.proofStatus ?? "pending"} · Settlement ${execution.settlementStatus ?? "open"}.`,
      refs: [
        `orderId=${execution.orderId}`,
        ...(execution.proofId ? [`proofId=${execution.proofId}`] : []),
      ],
      priority: "high",
    });
  }

  for (const dispute of params.disputes) {
    if (!isDisputeActive(dispute.status)) {
      continue;
    }
    queue.push({
      id: `dispute:${dispute.disputeId}`,
      kind: "dispute",
      title: `Dispute lane · ${shortId(dispute.orderId)}`,
      status: dispute.status,
      action: "Attach evidence or resolve the dispute explicitly.",
      detail: dispute.reason,
      refs: [`disputeId=${dispute.disputeId}`, `orderId=${dispute.orderId}`],
      priority: dispute.status === "dispute_opened" ? "high" : "medium",
    });
  }

  return queue;
}

export function buildOwnerGovernanceSnapshot(params: {
  status: MarketStatusSummary | null;
  opsSummary: MarketOpsSummary | null;
  auditSnapshot: MarketAuditSnapshot | null;
  approvalQueue: ApprovalQueueItem[];
}): OwnerGovernanceSnapshot {
  const exceptionPressure =
    (params.opsSummary?.activeAlerts ?? 0) +
    (params.status?.disputes.open ?? 0) +
    (params.status?.revocations.pending ?? 0);
  const auditBacklog =
    (params.status?.audit.anchorPending ?? 0) + (params.status?.repair.candidates ?? 0);
  const presetFailCount = params.opsSummary?.preset?.readiness.failCount ?? 0;

  const killSwitchState: OwnerGovernanceSnapshot["killSwitchState"] =
    presetFailCount > 0 || exceptionPressure >= 5
      ? "tripped"
      : exceptionPressure > 0 || auditBacklog > 0 || params.approvalQueue.length > 0
        ? "guarded"
        : "steady";

  const summary: string[] = [];
  appendUnique(
    summary,
    `${params.approvalQueue.length} owner gate${params.approvalQueue.length === 1 ? "" : "s"} currently need attention.`,
  );
  appendUnique(
    summary,
    `${exceptionPressure} live exception signal${exceptionPressure === 1 ? "" : "s"} across alerts, disputes, and revocations.`,
  );
  appendUnique(
    summary,
    `${auditBacklog} audit backlog item${auditBacklog === 1 ? "" : "s"} across anchors and repair candidates.`,
  );
  if (params.auditSnapshot?.lastEventAt) {
    appendUnique(summary, `Last audit event at ${params.auditSnapshot.lastEventAt}.`);
  }
  const recommendedActions = params.opsSummary?.preset?.recommendedActions ?? [];
  if (recommendedActions[0]) {
    appendUnique(summary, `Latest preset action: ${recommendedActions[0]}.`);
  }

  let killSwitchReason = "No exception currently warrants a kill switch posture.";
  if (killSwitchState === "tripped") {
    killSwitchReason =
      presetFailCount > 0
        ? "Preset verification reports failing checks; owner intervention should precede further autonomous execution."
        : "Exception pressure is high enough that autonomous spending should stay paused until the system is re-stabilized.";
  } else if (killSwitchState === "guarded") {
    killSwitchReason =
      "The system is still operable, but approvals, audit backlog, or live alerts mean the steward should behave conservatively.";
  }

  return {
    approvalQueueCount: params.approvalQueue.length,
    exceptionPressure,
    auditBacklog,
    killSwitchState,
    killSwitchReason,
    summary,
  };
}

export function buildMarketGrowthLoop(params: {
  status: MarketStatusSummary | null;
  opsSummary: MarketOpsSummary | null;
  auditSnapshot: MarketAuditSnapshot | null;
  approvalQueue: ApprovalQueueItem[];
}): GrowthLoopItem[] {
  const items: GrowthLoopItem[] = [];
  const activeAlerts = params.opsSummary?.activeAlerts ?? 0;
  const openDisputes = params.status?.disputes.open ?? 0;
  const auditBacklog =
    (params.status?.audit.anchorPending ?? 0) + (params.status?.repair.candidates ?? 0);

  items.push({
    phase: "memory",
    title: "Carry forward live execution anchors",
    detail:
      params.approvalQueue.length > 0
        ? `Keep ${params.approvalQueue.length} open owner decisions visible so the steward resumes with exact order, consent, and dispute references.`
        : "No owner gates are open; this is a good window to persist provider lessons and policy posture.",
    refs: params.approvalQueue.flatMap((item) => item.refs).slice(0, 4),
    priority: params.approvalQueue.length > 0 ? "high" : "medium",
  });

  items.push({
    phase: "reflection",
    title: "Re-score exception pressure before the next spend",
    detail:
      openDisputes > 0 || activeAlerts > 0
        ? `${openDisputes} open dispute(s) and ${activeAlerts} active alert(s) mean provider trust should not be judged by price alone.`
        : "Exception pressure is quiet; use the cycle to tighten conservative defaults instead of relaxing them.",
    refs: [],
    priority: openDisputes > 0 || activeAlerts > 0 ? "high" : "medium",
  });

  items.push({
    phase: "research",
    title: "Update provider and policy playbooks",
    detail:
      (params.opsSummary?.preset?.recommendedActions ?? [])[0] ??
      "Research proof-backed alternatives, approval thresholds, and dispute cost so the steward can grow autonomy without losing auditability.",
    refs: [],
    priority: params.opsSummary?.preset?.readiness.warnCount ? "high" : "medium",
  });

  items.push({
    phase: "heartbeat",
    title: "Heartbeat on approvals, disputes, and audit backlog",
    detail:
      auditBacklog > 0
        ? `Next heartbeat should inspect ${auditBacklog} audit backlog item(s) alongside approvals and disputes before declaring the loop quiet.`
        : "Next heartbeat should still poll approvals, lease expiries, and new alerts to keep the loop warm.",
    refs: params.auditSnapshot?.lastEventAt
      ? [`lastAuditAt=${params.auditSnapshot.lastEventAt}`]
      : [],
    priority: auditBacklog > 0 || params.approvalQueue.length > 0 ? "high" : "medium",
  });

  return items;
}
