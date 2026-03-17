import type { SessionEntry, SessionStewardAutonomyPosture } from "../../config/sessions/types.js";

export type StewardGrowthPriority = "high" | "medium";

export type StewardGrowthHint = {
  kind: "approval" | "delivery" | "acceptance" | "dispute" | "settlement" | "policy";
  priority: StewardGrowthPriority;
  summary: string;
  nextTools: string[];
  refs: string[];
};

export type StewardCadence = {
  everyMs: number;
  label: string;
  reason: string;
};

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function joinRefs(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function appendUnique(target: string[], value?: string) {
  const trimmed = value?.trim();
  if (!trimmed || target.includes(trimmed)) {
    return;
  }
  target.push(trimmed);
}

function formatRefs(refs: string[]): string {
  return refs.length > 0 ? ` (${refs.join(", ")})` : "";
}

function normalizeBacklog(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const next: string[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") {
      continue;
    }
    appendUnique(next, entry);
  }
  return next;
}

function formatCadenceLabel(everyMs: number): string {
  const minutes = Math.round(everyMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

export function deriveStewardGrowthHints(sessionEntry?: SessionEntry): StewardGrowthHint[] {
  const steward = sessionEntry?.steward;
  if (!steward) {
    return [];
  }

  const orderId = steward.lastOrderId ?? sessionEntry?.settlement?.orderId;
  const leaseId = steward.lastLeaseId;
  const consentId = steward.lastConsentId;
  const proofId = steward.lastProofId;
  const disputeId = steward.lastDisputeId;
  const settlementId = steward.lastSettlementId;
  const hints: StewardGrowthHint[] = [];

  if (steward.lastStatus === "approval_required") {
    hints.push({
      kind: "approval",
      priority: "high",
      summary: "Owner approval is still required before market execution can continue.",
      nextTools: ["web3.market.consent.grant", "web3.market.consent.revoke"],
      refs: joinRefs([
        orderId ? `orderId=${orderId}` : undefined,
        consentId ? `consentId=${consentId}` : undefined,
      ]),
    });
  }

  if (steward.lastStatus === "executed" && orderId && !proofId && !disputeId && !settlementId) {
    hints.push({
      kind: "delivery",
      priority: "high",
      summary:
        "Execution has started; inspect delivery, proof, and acceptance posture before moving on.",
      nextTools: ["web3.market.execution.status", "web3.market.proof.verify"],
      refs: joinRefs([`orderId=${orderId}`, leaseId ? `leaseId=${leaseId}` : undefined]),
    });
  }

  if (proofId && orderId && !disputeId && !settlementId) {
    hints.push({
      kind: "acceptance",
      priority: "high",
      summary:
        "A proof is available but the order is not settled yet; make an acceptance decision or open a dispute.",
      nextTools: ["web3.market.acceptance.sign", "web3.market.acceptance.reject"],
      refs: joinRefs([`orderId=${orderId}`, `proofId=${proofId}`]),
    });
  }

  if (disputeId && !settlementId) {
    hints.push({
      kind: "dispute",
      priority: "high",
      summary: "An active dispute is blocking closure; attach evidence or resolve it explicitly.",
      nextTools: [
        "web3.market.dispute.submitEvidence",
        "web3.market.dispute.resolve",
        "web3.market.dispute.reject",
      ],
      refs: joinRefs([orderId ? `orderId=${orderId}` : undefined, `disputeId=${disputeId}`]),
    });
  }

  if (settlementId) {
    hints.push({
      kind: "settlement",
      priority: "medium",
      summary:
        "Settlement exists; reconcile execution status and audit posture before considering the loop closed.",
      nextTools: ["web3.market.settlement.query", "web3.market.execution.status"],
      refs: joinRefs([orderId ? `orderId=${orderId}` : undefined, `settlementId=${settlementId}`]),
    });
  }

  if (!steward.budgetPolicy || !steward.riskPolicy) {
    hints.push({
      kind: "policy",
      priority: "medium",
      summary:
        "Durable spending or risk policy memory is still missing; keep the steward conservative until the owner sets explicit boundaries.",
      nextTools: [],
      refs: [],
    });
  }

  return hints;
}

export function resolveStewardAutonomyPosture(
  sessionEntry?: SessionEntry,
): SessionStewardAutonomyPosture {
  const stored = sessionEntry?.steward?.autonomyPosture;
  if (
    stored === "active" ||
    stored === "conservative" ||
    stored === "guarded" ||
    stored === "tripped"
  ) {
    return stored;
  }

  const steward = sessionEntry?.steward;
  const status = steward?.lastStatus;
  if (status === "payment_failed" || status === "lease_failed") {
    return "tripped";
  }
  if (
    status === "approval_required" ||
    status === "acceptance_rejected" ||
    Boolean(steward?.lastDisputeId && !steward.lastSettlementId)
  ) {
    return "guarded";
  }
  if (
    !steward?.budgetPolicy ||
    !steward?.riskPolicy ||
    status === "blocked" ||
    status === "compare_failed" ||
    status === "quote_failed" ||
    status === "payment_unresolved"
  ) {
    return "conservative";
  }
  return "active";
}

export function resolveStewardCadence(sessionEntry?: SessionEntry): StewardCadence {
  const stored = sessionEntry?.steward?.cadence;
  if (
    stored &&
    typeof stored.everyMs === "number" &&
    Number.isFinite(stored.everyMs) &&
    stored.everyMs > 0
  ) {
    const everyMs = Math.max(60_000, Math.floor(stored.everyMs));
    return {
      everyMs,
      label: stored.label?.trim() || formatCadenceLabel(everyMs),
      reason: stored.reason?.trim() || "Resume the remembered steward rhythm.",
    };
  }

  const posture = resolveStewardAutonomyPosture(sessionEntry);
  const hints = deriveStewardGrowthHints(sessionEntry);
  const hasHighPriority = hints.some((hint) => hint.priority === "high");
  const hasLifecycleFollowUp = hints.some(
    (hint) => hint.kind === "delivery" || hint.kind === "acceptance" || hint.kind === "settlement",
  );

  if (posture === "tripped") {
    return {
      everyMs: THIRTY_MINUTES_MS,
      label: formatCadenceLabel(THIRTY_MINUTES_MS),
      reason: "Execution failed recently, so the steward should stay close to the exception lane.",
    };
  }
  if (posture === "guarded" || hasHighPriority) {
    return {
      everyMs: THIRTY_MINUTES_MS,
      label: formatCadenceLabel(THIRTY_MINUTES_MS),
      reason: "Open approvals, disputes, or acceptance gates require a near-term follow-up.",
    };
  }
  if (hasLifecycleFollowUp) {
    return {
      everyMs: ONE_HOUR_MS,
      label: formatCadenceLabel(ONE_HOUR_MS),
      reason: "Delivery, proof, or settlement still needs an auditable closure pass.",
    };
  }
  if (posture === "conservative") {
    return {
      everyMs: TWO_HOURS_MS,
      label: formatCadenceLabel(TWO_HOURS_MS),
      reason: "Missing policy memory keeps the steward in a conservative tightening loop.",
    };
  }
  return {
    everyMs: SIX_HOURS_MS,
    label: formatCadenceLabel(SIX_HOURS_MS),
    reason:
      "No exception is live, so quiet-cycle research and policy hardening can run on a slower rhythm.",
  };
}

export function deriveStewardReflectionBacklog(sessionEntry?: SessionEntry): string[] {
  const stored = normalizeBacklog(sessionEntry?.steward?.reflectionBacklog);
  if (stored.length > 0) {
    return stored;
  }

  const reflections: string[] = [];
  const steward = sessionEntry?.steward;
  const hints = deriveStewardGrowthHints(sessionEntry);
  if (steward?.lastStatus === "approval_required") {
    appendUnique(
      reflections,
      "A governance boundary blocked execution; treat approval thresholds as durable policy instead of a one-off interruption.",
    );
  }
  if (steward?.lastStatus === "executed" && !steward.lastProofId) {
    appendUnique(
      reflections,
      "Execution alone is not closure; provider quality remains provisional until proof and acceptance data arrive.",
    );
  }
  if (steward?.lastProofId && !steward.lastSettlementId) {
    appendUnique(
      reflections,
      "A proof exists but the economic loop is still open; acceptance quality is now the main trust signal.",
    );
  }
  if (steward?.lastDisputeId && !steward.lastSettlementId) {
    appendUnique(
      reflections,
      "Dispute posture means the steward should preserve evidence, avoid emotional retries, and fold the outcome back into provider preference.",
    );
  }
  if (!steward?.budgetPolicy) {
    appendUnique(
      reflections,
      "Budget policy is missing, so the steward cannot safely generalize this run into autonomous future behavior.",
    );
  }
  if (!steward?.riskPolicy) {
    appendUnique(
      reflections,
      "Risk policy is missing, so proof requirements and provider trust posture remain under-specified.",
    );
  }
  if (reflections.length === 0 && hints.length > 0) {
    appendUnique(
      reflections,
      "The loop still has follow-up work; keep the execution anchor visible until every pending lane becomes an auditable outcome.",
    );
  }
  if (reflections.length === 0) {
    appendUnique(
      reflections,
      "Quiet cycles should consolidate provider lessons and tighten durable policy memory instead of narrating stale history.",
    );
  }
  return reflections;
}

export function deriveStewardResearchBacklog(sessionEntry?: SessionEntry): string[] {
  const stored = normalizeBacklog(sessionEntry?.steward?.researchBacklog);
  if (stored.length > 0) {
    return stored;
  }

  const topics: string[] = [];
  for (const hint of deriveStewardGrowthHints(sessionEntry)) {
    switch (hint.kind) {
      case "approval":
        appendUnique(
          topics,
          "Clarify durable owner approval thresholds for this purchase class so low-risk repeats can stay autonomous.",
        );
        break;
      case "delivery":
        appendUnique(
          topics,
          "Compare the current provider delivery posture with proof-backed alternatives before granting long-term preference.",
        );
        break;
      case "acceptance":
        appendUnique(
          topics,
          "Refine buyer acceptance criteria for this service type so proof review becomes faster and more repeatable.",
        );
        break;
      case "dispute":
        appendUnique(
          topics,
          "Review dispute evidence quality and historical provider behavior before choosing refund, release, or partial resolution.",
        );
        break;
      case "settlement":
        appendUnique(
          topics,
          "After settlement, re-score provider preference using cost, proof quality, and dispute overhead instead of price alone.",
        );
        break;
      case "policy":
        appendUnique(
          topics,
          "Turn ad-hoc owner instructions into explicit budget and risk policy memory for future autonomous loops.",
        );
        break;
    }
  }
  if (topics.length === 0) {
    appendUnique(
      topics,
      "Periodically re-score provider routing, proof quality, and approval burden so autonomy can grow without relaxing safety boundaries.",
    );
  }
  return topics;
}

export function deriveStewardHeartbeatBacklog(sessionEntry?: SessionEntry): string[] {
  const stored = normalizeBacklog(sessionEntry?.steward?.heartbeatBacklog);
  if (stored.length > 0) {
    return stored;
  }

  const actions: string[] = [];
  for (const hint of deriveStewardGrowthHints(sessionEntry)) {
    appendUnique(
      actions,
      `${hint.summary}${formatRefs(hint.refs)}${
        hint.nextTools.length > 0 ? ` — next tools: ${hint.nextTools.join(", ")}` : ""
      }`,
    );
  }
  if (actions.length === 0) {
    appendUnique(
      actions,
      "Check approvals, lease expiry risk, audit backlog, and provider exceptions before declaring the cycle quiet.",
    );
  }
  return actions;
}

export function formatStewardGrowthHints(sessionEntry?: SessionEntry): string | undefined {
  const hints = deriveStewardGrowthHints(sessionEntry);
  if (hints.length === 0) {
    return undefined;
  }
  const lines = ["Suggested steward follow-up priorities:"];
  for (const hint of hints) {
    const refs = hint.refs.length > 0 ? ` (${hint.refs.join(", ")})` : "";
    const tools = hint.nextTools.length > 0 ? ` Next tools: ${hint.nextTools.join(", ")}.` : "";
    lines.push(`- [${hint.priority}] ${hint.summary}${refs}.${tools}`);
  }
  return lines.join("\n");
}
