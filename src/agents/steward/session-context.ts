import type { OpenClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions/types.js";
import { normalizePluginsConfig, resolveEnableState } from "../../plugins/config-state.js";
import { formatStewardGrowthHints } from "./growth-loop.js";
import {
  formatStewardGrowthCheckpoint,
  summarizeStewardGrowthCheckpoint,
} from "./wealth-memory.js";

type StewardPromptBudgetPolicy = {
  currency?: string;
  maxAmount?: string;
  remainingDailyAmount?: string;
  requireApprovalAbove?: string;
  failClosed?: boolean;
};

type StewardPromptRiskPolicy = {
  maxRiskLevel?: "low" | "medium" | "high";
  requireProof?: boolean;
  requireProviderActor?: boolean;
  requireApprovalForMediumRisk?: boolean;
  requireApprovalForHighRisk?: boolean;
  allowUnpriced?: boolean;
  failClosed?: boolean;
};

function isWealthStewardEnabled(config?: OpenClawConfig): boolean {
  const normalizedPlugins = normalizePluginsConfig(config?.plugins);
  return resolveEnableState("web3-core", "workspace", normalizedPlugins).enabled;
}

function formatBudgetPolicy(policy?: StewardPromptBudgetPolicy): string | undefined {
  if (!policy) {
    return undefined;
  }
  const parts = [
    policy.currency ? `currency=${policy.currency}` : undefined,
    policy.maxAmount ? `maxAmount=${policy.maxAmount}` : undefined,
    policy.remainingDailyAmount ? `remainingDailyAmount=${policy.remainingDailyAmount}` : undefined,
    policy.requireApprovalAbove ? `approvalAbove=${policy.requireApprovalAbove}` : undefined,
    typeof policy.failClosed === "boolean" ? `failClosed=${policy.failClosed}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function formatRiskPolicy(policy?: StewardPromptRiskPolicy): string | undefined {
  if (!policy) {
    return undefined;
  }
  const parts = [
    policy.maxRiskLevel ? `maxRiskLevel=${policy.maxRiskLevel}` : undefined,
    typeof policy.requireProof === "boolean" ? `requireProof=${policy.requireProof}` : undefined,
    typeof policy.requireProviderActor === "boolean"
      ? `requireProviderActor=${policy.requireProviderActor}`
      : undefined,
    typeof policy.requireApprovalForMediumRisk === "boolean"
      ? `approvalForMedium=${policy.requireApprovalForMediumRisk}`
      : undefined,
    typeof policy.requireApprovalForHighRisk === "boolean"
      ? `approvalForHigh=${policy.requireApprovalForHighRisk}`
      : undefined,
    typeof policy.allowUnpriced === "boolean" ? `allowUnpriced=${policy.allowUnpriced}` : undefined,
    typeof policy.failClosed === "boolean" ? `failClosed=${policy.failClosed}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function formatStewardReferences(sessionEntry?: SessionEntry): string | undefined {
  const orderId = sessionEntry?.steward?.lastOrderId ?? sessionEntry?.settlement?.orderId;
  const references = [
    orderId ? `orderId=${orderId}` : undefined,
    sessionEntry?.steward?.lastLeaseId ? `leaseId=${sessionEntry.steward.lastLeaseId}` : undefined,
    sessionEntry?.steward?.lastConsentId
      ? `consentId=${sessionEntry.steward.lastConsentId}`
      : undefined,
    sessionEntry?.steward?.lastProofId ? `proofId=${sessionEntry.steward.lastProofId}` : undefined,
    sessionEntry?.steward?.lastDisputeId
      ? `disputeId=${sessionEntry.steward.lastDisputeId}`
      : undefined,
    sessionEntry?.steward?.lastSettlementId
      ? `settlementId=${sessionEntry.steward.lastSettlementId}`
      : undefined,
  ].filter((entry): entry is string => Boolean(entry));
  return references.length > 0 ? references.join(", ") : undefined;
}

export function buildStewardSystemPrompt(params: {
  config?: OpenClawConfig;
  sessionEntry?: SessionEntry;
  sessionKey?: string;
}): string | undefined {
  if (!isWealthStewardEnabled(params.config)) {
    return undefined;
  }

  const actorId = params.sessionEntry?.steward?.actorId ?? params.sessionEntry?.settlement?.actorId;
  const consumerActorId =
    params.sessionEntry?.steward?.consumerActorId ?? params.sessionEntry?.settlement?.payer;
  const budgetSummary = formatBudgetPolicy(params.sessionEntry?.steward?.budgetPolicy);
  const riskSummary = formatRiskPolicy(params.sessionEntry?.steward?.riskPolicy);
  const referenceSummary = formatStewardReferences(params.sessionEntry);
  const growthSummary =
    params.sessionEntry?.steward?.growthSummary?.trim() ??
    summarizeStewardGrowthCheckpoint(params.sessionEntry);
  const growthHints = formatStewardGrowthHints(params.sessionEntry);
  const growthCheckpoint = formatStewardGrowthCheckpoint(params.sessionEntry);

  const lines = [
    "## Steward Wealth Context",
    "This conversation may operate as a private wealth steward for external digital services and accountable market execution.",
    "For market-backed purchasing, prefer `web3.market.steward.buy` as the default buyer entrypoint.",
    "Use lower-level tools such as `web3.market.buy`, `web3.market.order.create`, or `web3.market.lease` only when the user explicitly asks for raw control or when debugging a broken steward flow.",
    "Always include `sessionKey` on market purchase or execution tools when available so settlement tracking, lease recovery, approvals, and follow-up state stay attached to this conversation.",
    "If a tool returns `approval_required`, stop, explain the gate, and wait for owner approval instead of trying to bypass the governance boundary.",
    "Never print or request raw access tokens, provider endpoints, or local secret paths. Use mounted leases and redacted summaries only.",
    params.sessionKey ? `Runtime sessionKey: ${params.sessionKey}` : undefined,
    actorId ? `Default steward actorId: ${actorId}` : undefined,
    consumerActorId ? `Default consumerActorId: ${consumerActorId}` : undefined,
    budgetSummary ? `Remembered budget policy: ${budgetSummary}` : undefined,
    riskSummary ? `Remembered risk policy: ${riskSummary}` : undefined,
    referenceSummary ? `Active market references: ${referenceSummary}` : undefined,
    growthSummary ? `Recent steward growth summary: ${growthSummary}` : undefined,
    growthHints,
    growthCheckpoint,
    !budgetSummary
      ? "No remembered spending boundary is stored yet. Stay conservative: prefer planning first, or require owner confirmation before execute=true when no clear budget was provided in this conversation."
      : undefined,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}
