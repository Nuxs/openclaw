import { html, nothing } from "lit";
import type { ToolCard } from "../types/chat-types.ts";

type ParsedStewardToolCard = {
  kind: "steward";
  title: string;
  status: string;
  executed: boolean;
  resourceLabel: string | null;
  resourceId: string | null;
  providerActorId: string | null;
  candidateCount: number;
  budgetStatus: string | null;
  budgetReason: string | null;
  riskStatus: string | null;
  riskReason: string | null;
  riskLevel: string | null;
  executionStatus: string | null;
  leaseId: string | null;
  paymentTxHash: string | null;
};

type ParsedExecutionToolCard = {
  kind: "execution";
  title: string;
  executionStatus: string;
  orderId: string;
  acceptanceStatus: string | null;
  proofType: string | null;
  settlementStatus: string | null;
  disputeStatus: string | null;
  traceCount: number;
};

export type ParsedMarketToolCard = ParsedStewardToolCard | ParsedExecutionToolCard;

export function parseMarketToolCard(card: ToolCard): ParsedMarketToolCard | null {
  if (card.kind !== "result" || typeof card.text !== "string") {
    return null;
  }
  const payload = parseJsonRecord(card.text);
  if (!payload) {
    return null;
  }

  if (card.name === "web3.market.steward.buy") {
    const selectedCandidate = asRecord(payload.selectedCandidate);
    const plan = asRecord(payload.plan);
    const budget = asRecord(plan?.budget);
    const risk = asRecord(plan?.risk);
    const execution = unwrapGatewayRecord(payload.execution);
    const lease = unwrapGatewayRecord(payload.lease);
    const payment = unwrapGatewayRecord(payload.payment);
    return {
      kind: "steward",
      title: titleForStewardStatus(asString(payload.status) ?? "planned"),
      status: asString(payload.status) ?? "planned",
      executed: payload.executed === true,
      resourceLabel: asString(selectedCandidate?.label),
      resourceId: asString(selectedCandidate?.resourceId),
      providerActorId: asString(selectedCandidate?.providerActorId),
      candidateCount: asNumber(payload.candidatesConsidered),
      budgetStatus: asString(budget?.status),
      budgetReason: asString(budget?.reason),
      riskStatus: asString(risk?.status),
      riskReason: asString(risk?.reason),
      riskLevel: asString(risk?.riskLevel),
      executionStatus: asString(execution?.executionStatus),
      leaseId: asString(lease?.leaseId),
      paymentTxHash: asString(payment?.txHash),
    };
  }

  if (card.name === "web3.market.execution.status") {
    const acceptance = asRecord(payload.acceptance);
    const proof = asRecord(payload.proof);
    const proofSummary = asRecord(proof?.summary);
    const settlement = asRecord(payload.settlement);
    const dispute = asRecord(payload.dispute);
    const order = asRecord(payload.order);
    return {
      kind: "execution",
      title: "Execution summary",
      executionStatus: asString(payload.executionStatus) ?? "unknown",
      orderId: asString(payload.orderId) ?? asString(order?.orderId) ?? "unknown-order",
      acceptanceStatus: asString(acceptance?.status),
      proofType: asString(proofSummary?.type),
      settlementStatus: asString(settlement?.status),
      disputeStatus: asString(dispute?.status),
      traceCount: Array.isArray(payload.trace) ? payload.trace.length : 0,
    };
  }

  return null;
}

export function renderMarketToolCardBody(card: ToolCard) {
  const parsed = parseMarketToolCard(card);
  if (!parsed) {
    return null;
  }

  if (parsed.kind === "steward") {
    return html`
      <div style="margin-top: 12px; display:grid; gap: 10px; border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 12px; padding: 12px; background: rgba(15, 23, 42, 0.35);">
        <div style="display:flex; justify-content:space-between; gap: 12px; align-items:flex-start;">
          <div>
            <div style="font-weight: 600;">${parsed.title}</div>
            <div class="muted" style="margin-top: 4px;">
              ${parsed.resourceLabel ?? shortId(parsed.resourceId)} · ${parsed.providerActorId ? `seller ${shortId(parsed.providerActorId)}` : "seller pending"}
            </div>
          </div>
          <span class="pill" style="border-color:${statusColor(parsed.status)}; color:${statusColor(parsed.status)};">
            ${formatStatus(parsed.status)}
          </span>
        </div>

        <div class="pill-row">
          <span class="pill">Candidates ${parsed.candidateCount}</span>
          ${parsed.budgetStatus ? html`<span class="pill">Budget ${formatStatus(parsed.budgetStatus)}</span>` : nothing}
          ${parsed.riskLevel ? html`<span class="pill">Risk ${parsed.riskLevel}</span>` : nothing}
          ${parsed.executionStatus ? html`<span class="pill">Execution ${formatStatus(parsed.executionStatus)}</span>` : nothing}
        </div>

        <div class="muted" style="display:grid; gap: 4px;">
          <div>Budget gate: ${parsed.budgetReason ? formatStatus(parsed.budgetReason) : "not evaluated"}</div>
          <div>Risk gate: ${parsed.riskReason ? formatStatus(parsed.riskReason) : "not evaluated"}</div>
          <div>
            ${parsed.executed ? "Autopay + lease executed" : "Plan only — waiting for explicit execute=true or approval gate."}
            ${parsed.leaseId ? ` Lease ${shortId(parsed.leaseId)}.` : ""}
            ${parsed.paymentTxHash ? ` Payment ${shortId(parsed.paymentTxHash)}.` : ""}
          </div>
        </div>
      </div>
    `;
  }

  return html`
    <div style="margin-top: 12px; display:grid; gap: 10px; border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 12px; padding: 12px; background: rgba(15, 23, 42, 0.35);">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
        <div>
          <div style="font-weight: 600;">${parsed.title}</div>
          <div class="muted" style="margin-top: 4px;">Order ${shortId(parsed.orderId)}</div>
        </div>
        <span class="pill" style="border-color:${statusColor(parsed.executionStatus)}; color:${statusColor(parsed.executionStatus)};">
          ${formatStatus(parsed.executionStatus)}
        </span>
      </div>
      <div class="pill-row">
        ${parsed.acceptanceStatus ? html`<span class="pill">${formatStatus(parsed.acceptanceStatus)}</span>` : nothing}
        ${
          parsed.proofType
            ? html`<span class="pill">Proof ${parsed.proofType}</span>`
            : html`
                <span class="pill">Proof pending</span>
              `
        }
        ${parsed.settlementStatus ? html`<span class="pill">${formatStatus(parsed.settlementStatus)}</span>` : nothing}
        ${parsed.disputeStatus ? html`<span class="pill" style="border-color:${statusColor(parsed.disputeStatus)}; color:${statusColor(parsed.disputeStatus)};">${formatStatus(parsed.disputeStatus)}</span>` : nothing}
      </div>
      <div class="muted">Trace events ${parsed.traceCount}</div>
    </div>
  `;
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function unwrapGatewayRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const result = asRecord(record.result);
  return result ?? record;
}

function titleForStewardStatus(status: string) {
  switch (status) {
    case "approval_required":
      return "Market approval required";
    case "executed":
      return "Steward purchase executed";
    case "blocked":
      return "Steward purchase blocked";
    default:
      return "Steward purchase plan";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function shortId(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function statusColor(status: string) {
  switch (status) {
    case "approved":
    case "executed":
    case "settled":
    case "acceptance_signed":
      return "#10B981";
    case "approval_required":
    case "planned":
    case "awaiting_acceptance":
      return "#F59E0B";
    case "blocked":
    case "rejected":
    case "disputed":
    case "acceptance_rejected":
      return "#EF4444";
    default:
      return "#94A3B8";
  }
}
