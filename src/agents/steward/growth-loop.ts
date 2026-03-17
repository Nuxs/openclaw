import type { SessionEntry } from "../../config/sessions/types.js";

export type StewardGrowthPriority = "high" | "medium";

export type StewardGrowthHint = {
  kind: "approval" | "delivery" | "acceptance" | "dispute" | "settlement" | "policy";
  priority: StewardGrowthPriority;
  summary: string;
  nextTools: string[];
  refs: string[];
};

function joinRefs(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
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

  if (!steward.budgetPolicy) {
    hints.push({
      kind: "policy",
      priority: "medium",
      summary:
        "No remembered budget policy is stored yet; stay conservative until the owner sets a spending boundary.",
      nextTools: [],
      refs: [],
    });
  }

  return hints;
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
