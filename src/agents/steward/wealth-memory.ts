import type { SessionEntry } from "../../config/sessions/types.js";
import {
  deriveStewardGrowthHints,
  deriveStewardHeartbeatBacklog,
  deriveStewardReflectionBacklog,
  deriveStewardResearchBacklog,
  resolveStewardAutonomyPosture,
  resolveStewardCadence,
  type StewardGrowthHint,
} from "./growth-loop.js";

export type StewardGrowthCheckpoint = {
  summary: string;
  autonomyPosture: ReturnType<typeof resolveStewardAutonomyPosture>;
  cadenceLabel: string;
  nextWakeAt?: string;
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

function buildMemoryAnchors(sessionEntry?: SessionEntry): string[] {
  const anchors: string[] = [];
  const steward = sessionEntry?.steward;
  const orderId = steward?.lastOrderId ?? sessionEntry?.settlement?.orderId;
  const cadence = resolveStewardCadence(sessionEntry);
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
  appendUnique(anchors, `Autonomy posture: ${resolveStewardAutonomyPosture(sessionEntry)}.`);
  appendUnique(anchors, `Steward cadence: ${cadence.label} (${cadence.reason.toLowerCase()}).`);
  appendUnique(
    anchors,
    steward?.growthJob?.nextWakeAt
      ? `Next wake anchor: ${steward.growthJob.nextWakeAt}`
      : undefined,
  );
  appendUnique(
    anchors,
    steward?.lastHeartbeatedAt ? `Last heartbeat sweep: ${steward.lastHeartbeatedAt}` : undefined,
  );
  appendUnique(
    anchors,
    steward?.lastReflectedAt ? `Last reflection update: ${steward.lastReflectedAt}` : undefined,
  );
  appendUnique(
    anchors,
    steward?.lastResearchedAt ? `Last research update: ${steward.lastResearchedAt}` : undefined,
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
  const posture = resolveStewardAutonomyPosture(sessionEntry);
  if (steward?.lastDisputeId && !steward.lastSettlementId) {
    return `The steward loop is in dispute resolution${orderRef}; preserve evidence quality, resolve the dispute explicitly, and keep autonomy ${posture} until the provider lesson is captured.`;
  }
  if (steward?.lastProofId && !steward.lastSettlementId) {
    return `A proof exists${orderRef}, but value is not realized yet; acceptance or dispute handling is the current closure gate.`;
  }
  if (steward?.lastStatus === "approval_required") {
    return `Execution is paused at an owner-governance boundary${orderRef}; keep the candidate, cadence, and policy context warm until approval or rejection arrives.`;
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
  return "No steward growth memory is stored yet; the next quiet cycle should capture policy boundaries, execution anchors, and provider lessons.";
}

export function deriveStewardGrowthCheckpoint(
  sessionEntry?: SessionEntry,
): StewardGrowthCheckpoint | undefined {
  const steward = sessionEntry?.steward;
  const hints = deriveStewardGrowthHints(sessionEntry);
  if (!steward && hints.length === 0) {
    return undefined;
  }

  const cadence = resolveStewardCadence(sessionEntry);
  return {
    summary: buildSummary(sessionEntry, hints),
    autonomyPosture: resolveStewardAutonomyPosture(sessionEntry),
    cadenceLabel: cadence.label,
    nextWakeAt: steward?.growthJob?.nextWakeAt,
    memoryAnchors: buildMemoryAnchors(sessionEntry),
    reflections: deriveStewardReflectionBacklog(sessionEntry),
    researchTopics: deriveStewardResearchBacklog(sessionEntry),
    heartbeatActions: deriveStewardHeartbeatBacklog(sessionEntry),
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
    `Autonomy posture: ${checkpoint.autonomyPosture}`,
    `Heartbeat cadence: ${checkpoint.cadenceLabel}`,
    checkpoint.nextWakeAt ? `Next wake: ${checkpoint.nextWakeAt}` : undefined,
    "Memory anchors:",
    ...checkpoint.memoryAnchors.map((entry) => `- ${entry}`),
    "Reflection:",
    ...checkpoint.reflections.map((entry) => `- ${entry}`),
    "Research queue:",
    ...checkpoint.researchTopics.map((entry) => `- ${entry}`),
    "Heartbeat queue:",
    ...checkpoint.heartbeatActions.map((entry) => `- ${entry}`),
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}
