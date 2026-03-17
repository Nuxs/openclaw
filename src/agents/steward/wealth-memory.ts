import type { SessionEntry } from "../../config/sessions/types.js";
import { deriveStewardGrowthHints, type StewardGrowthHint } from "./growth-loop.js";

export type StewardGrowthCheckpoint = {
  summary: string;
  memoryAnchors: string[];
  reflections: string[];
  researchTopics: string[];
  heartbeatActions: string[];
};

function appendUnique(target: string[], value?: string) {
  const trimmed = value?.trim();
  if (!trimmed || target.includes(trimmed)) {
    return;
  }
  target.push(trimmed);
}

function joinRefs(refs: string[]): string {
  return refs.length > 0 ? ` (${refs.join(", ")})` : "";
}

function buildMemoryAnchors(sessionEntry?: SessionEntry): string[] {
  const anchors: string[] = [];
  const steward = sessionEntry?.steward;
  const orderId = steward?.lastOrderId ?? sessionEntry?.settlement?.orderId;
  appendUnique(anchors, orderId ? `Current order anchor: ${orderId}` : undefined);
  appendUnique(anchors, steward?.lastLeaseId ? `Lease anchor: ${steward.lastLeaseId}` : undefined);
  appendUnique(
    anchors,
    steward?.lastConsentId ? `Consent anchor: ${steward.lastConsentId}` : undefined,
  );
  appendUnique(anchors, steward?.lastProofId ? `Proof anchor: ${steward.lastProofId}` : undefined);
  appendUnique(
    anchors,
    steward?.lastDisputeId ? `Dispute anchor: ${steward.lastDisputeId}` : undefined,
  );
  appendUnique(
    anchors,
    steward?.lastSettlementId ? `Settlement anchor: ${steward.lastSettlementId}` : undefined,
  );
  appendUnique(
    anchors,
    steward?.budgetPolicy
      ? "Remembered budget policy is available for autonomous execution."
      : "No durable budget policy remembered yet.",
  );
  appendUnique(
    anchors,
    steward?.riskPolicy
      ? "Remembered risk policy is available for provider and proof gating."
      : "No durable risk policy remembered yet.",
  );
  return anchors;
}

function buildSummary(sessionEntry: SessionEntry | undefined, hints: StewardGrowthHint[]): string {
  const steward = sessionEntry?.steward;
  const stored = steward?.growthSummary?.trim();
  if (stored) {
    return stored;
  }
  const orderId = steward?.lastOrderId ?? sessionEntry?.settlement?.orderId;
  const orderRef = orderId ? ` for ${orderId}` : "";
  if (steward?.lastDisputeId && !steward.lastSettlementId) {
    return `The steward loop is in dispute resolution${orderRef}; preserve evidence quality, resolve the dispute explicitly, and capture the provider lesson before spending again.`;
  }
  if (steward?.lastProofId && !steward.lastSettlementId) {
    return `A proof exists${orderRef}, but value is not realized yet; acceptance or dispute handling is the current closure gate.`;
  }
  if (steward?.lastStatus === "approval_required") {
    return `Execution is paused at an owner-governance boundary${orderRef}; keep the candidate and policy context warm until approval or rejection arrives.`;
  }
  if (steward?.lastStatus === "executed") {
    return `The steward executed a purchase${orderRef}; verify proof, acceptance, and settlement before trusting this provider for future routing.`;
  }
  if (!steward?.budgetPolicy || !steward?.riskPolicy) {
    return "The steward still lacks a durable spending and risk memory; stay conservative and convert this session into an explicit policy baseline.";
  }
  if (hints.length > 0) {
    return `The steward has ${hints.length} active follow-up lane${hints.length === 1 ? "" : "s"}; keep memory, research, and heartbeat aligned until the loop closes.`;
  }
  return "No steward growth memory is stored yet; the next cycle should capture policy boundaries, execution anchors, and provider lessons.";
}

function buildReflections(
  sessionEntry: SessionEntry | undefined,
  hints: StewardGrowthHint[],
): string[] {
  const reflections: string[] = [];
  const steward = sessionEntry?.steward;
  if (steward?.lastStatus === "approval_required") {
    appendUnique(
      reflections,
      "A governance boundary blocked execution; the steward should treat owner approval thresholds as a reusable policy, not a one-off interruption.",
    );
  }
  if (steward?.lastStatus === "executed" && !steward.lastProofId) {
    appendUnique(
      reflections,
      "Execution alone is not closure; provider quality should remain provisional until proof and acceptance data arrive.",
    );
  }
  if (steward?.lastProofId && !steward.lastSettlementId) {
    appendUnique(
      reflections,
      "A proof is present but the economic loop is still open; acceptance quality is now the main trust signal.",
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
      "Budget policy is missing, so the steward cannot safely generalize from this purchase into autonomous future behavior.",
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
      "The loop has pending follow-up work; keep the execution anchor visible until every pending tool path becomes an auditable outcome.",
    );
  }
  if (reflections.length === 0) {
    appendUnique(
      reflections,
      "No sharp exception is active; use this quiet cycle to consolidate provider lessons and tighten durable policy memory.",
    );
  }
  return reflections;
}

function buildResearchTopics(hints: StewardGrowthHint[]): string[] {
  const topics: string[] = [];
  for (const hint of hints) {
    switch (hint.kind) {
      case "approval":
        appendUnique(
          topics,
          "Clarify durable owner approval thresholds for this purchase class so future low-risk repeats can stay autonomous.",
        );
        break;
      case "delivery":
        appendUnique(
          topics,
          "Compare current provider delivery posture with proof-backed alternatives before granting long-term preference.",
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
      "Periodically review provider routing, proof quality, and approval frequency so the steward grows more autonomous without relaxing safety boundaries.",
    );
  }
  return topics;
}

function buildHeartbeatActions(hints: StewardGrowthHint[]): string[] {
  const actions: string[] = [];
  for (const hint of hints) {
    appendUnique(
      actions,
      `${hint.summary}${joinRefs(hint.refs)}${
        hint.nextTools.length > 0 ? ` — next tools: ${hint.nextTools.join(", ")}` : ""
      }`,
    );
  }
  if (actions.length === 0) {
    appendUnique(
      actions,
      "Check for new approvals, expiring leases, audit backlog growth, and provider exceptions before declaring the cycle quiet.",
    );
  }
  return actions;
}

export function deriveStewardGrowthCheckpoint(
  sessionEntry?: SessionEntry,
): StewardGrowthCheckpoint | undefined {
  const steward = sessionEntry?.steward;
  const hints = deriveStewardGrowthHints(sessionEntry);
  if (!steward && hints.length === 0) {
    return undefined;
  }
  return {
    summary: buildSummary(sessionEntry, hints),
    memoryAnchors: buildMemoryAnchors(sessionEntry),
    reflections: buildReflections(sessionEntry, hints),
    researchTopics: buildResearchTopics(hints),
    heartbeatActions: buildHeartbeatActions(hints),
  };
}

export function summarizeStewardGrowthCheckpoint(sessionEntry?: SessionEntry): string | undefined {
  return deriveStewardGrowthCheckpoint(sessionEntry)?.summary;
}

export function formatStewardGrowthCheckpoint(sessionEntry?: SessionEntry): string | undefined {
  const checkpoint = deriveStewardGrowthCheckpoint(sessionEntry);
  if (!checkpoint) {
    return undefined;
  }
  const lines = [
    "## Steward Growth Loop",
    `Growth summary: ${checkpoint.summary}`,
    "Memory anchors:",
    ...checkpoint.memoryAnchors.map((entry) => `- ${entry}`),
    "Reflection:",
    ...checkpoint.reflections.map((entry) => `- ${entry}`),
    "Research queue:",
    ...checkpoint.researchTopics.map((entry) => `- ${entry}`),
    "Heartbeat queue:",
    ...checkpoint.heartbeatActions.map((entry) => `- ${entry}`),
  ];
  return lines.join("\n");
}
