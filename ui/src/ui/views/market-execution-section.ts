import { html, nothing } from "lit";
import { clampText, formatRelativeTimestamp } from "../format.ts";
import type { MarketExecutionSummaryView } from "../types.ts";

export type MarketExecutionSectionProps = {
  loading: boolean;
  error?: string | null;
  executions: MarketExecutionSummaryView[];
};

export function renderMarketExecutionSection(props: MarketExecutionSectionProps) {
  const { executions, loading, error } = props;
  const statusCounts = countBy(executions, (entry) => entry.executionStatus);
  const acceptanceCounts = countBy(executions, (entry) => entry.acceptanceStatus ?? "unknown");

  return html`
    <div class="card">
      <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
        <div>
          <div class="card-title">Recent Executions</div>
          <div class="card-sub">
            Steward purchase outcomes, proof posture, acceptance state, settlement progress, and dispute posture.
          </div>
        </div>
        <div class="pill-row">
          ${Object.entries(statusCounts)
            .slice(0, 3)
            .map(
              ([
                status,
                count,
              ]) => html`<span class="pill" style="border-color:${statusColor(status)}; color:${statusColor(status)};">
                ${formatStatus(status)} · ${count}
              </span>`,
            )}
        </div>
      </div>

      ${error ? html`<div class="callout warn" style="margin-top: 12px;">${error}</div>` : nothing}

      ${
        executions.length > 0
          ? html`
              <div class="stat-grid" style="margin-top: 16px;">
                <div class="stat">
                  <div class="stat-label">Tracked</div>
                  <div class="stat-value">${executions.length}</div>
                  <div class="stat-sub">Recent lease / dispute anchors</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Awaiting Acceptance</div>
                  <div class="stat-value" style="color:${statusColor("awaiting_acceptance")};">
                    ${statusCounts.awaiting_acceptance ?? 0}
                  </div>
                  <div class="stat-sub">Proof landed, waiting for buyer decision</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Settled</div>
                  <div class="stat-value" style="color:${statusColor("settled")};">
                    ${statusCounts.settled ?? 0}
                  </div>
                  <div class="stat-sub">Released or completed settlements</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Approval States</div>
                  <div class="stat-value">${acceptanceCounts.acceptance_pending ?? 0}</div>
                  <div class="stat-sub">
                    Signed ${acceptanceCounts.acceptance_signed ?? 0} · Rejected ${acceptanceCounts.acceptance_rejected ?? 0}
                  </div>
                </div>
              </div>

              <div class="list list--dense" style="margin-top: 16px; display: grid; gap: 12px;">
                ${executions.map(
                  (execution) => html`
                    <article
                      class="list-item list-item--stacked"
                      style="border: 1px solid rgba(148, 163, 184, 0.14); border-radius: 14px; background: rgba(15, 23, 42, 0.22); padding: 14px;"
                    >
                      <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                        <div>
                          <div class="list-item__title">
                            ${execution.resourceLabel ?? shortId(execution.resourceId ?? execution.orderId)}
                          </div>
                          <div class="muted">Order ${shortId(execution.orderId)}${execution.leaseId ? ` · Lease ${shortId(execution.leaseId)}` : ""}</div>
                        </div>
                        <div class="pill-row">
                          <span class="pill" style="border-color:${statusColor(execution.executionStatus)}; color:${statusColor(execution.executionStatus)};">
                            ${formatStatus(execution.executionStatus)}
                          </span>
                          ${
                            execution.acceptanceStatus
                              ? html`<span class="pill">${formatStatus(execution.acceptanceStatus)}</span>`
                              : nothing
                          }
                        </div>
                      </div>

                      <div class="list-item__meta" style="margin-top: 8px;">
                        <span title=${execution.providerActorId ?? ""}>Seller ${shortId(execution.providerActorId)}</span>
                        <span title=${execution.buyerId ?? ""}>Buyer ${shortId(execution.buyerId)}</span>
                        <span>${execution.lastUpdatedAt ? formatRelativeTimestamp(Date.parse(execution.lastUpdatedAt)) : "n/a"}</span>
                      </div>

                      <div class="pill-row" style="margin-top: 10px;">
                        ${
                          execution.proofType
                            ? html`<span class="pill">Proof ${execution.proofType}</span>`
                            : html`
                                <span class="pill">Proof pending</span>
                              `
                        }
                        ${execution.proofStatus ? html`<span class="pill">${formatStatus(execution.proofStatus)}</span>` : nothing}
                        ${
                          execution.settlementStatus
                            ? html`<span class="pill">${formatStatus(execution.settlementStatus)}</span>`
                            : nothing
                        }
                        ${
                          execution.disputeStatus
                            ? html`<span class="pill" style="border-color:${statusColor("disputed")}; color:${statusColor("disputed")};">
                              ${formatStatus(execution.disputeStatus)}
                            </span>`
                            : nothing
                        }
                      </div>

                      <div class="list-item__body" style="margin-top: 10px; display: grid; gap: 6px;">
                        <div>
                          Settlement ${execution.settlementAmount ?? "n/a"}
                          ${execution.currency ?? ""}
                          ${execution.releasedAmount ? ` · released ${execution.releasedAmount}` : ""}
                        </div>
                        <div>
                          Delivery ${execution.deliveryStatus ? formatStatus(execution.deliveryStatus) : "not issued"}
                        </div>
                        ${renderTrace(execution)}
                      </div>
                    </article>
                  `,
                )}
              </div>
            `
          : loading
            ? html`
                <div class="muted" style="margin-top: 12px">Loading execution summaries…</div>
              `
            : html`
                <div class="muted" style="margin-top: 12px">No recent execution summaries yet.</div>
              `
      }
    </div>
  `;
}

function renderTrace(execution: MarketExecutionSummaryView) {
  if (execution.trace.length === 0) {
    return html`
      <div class="muted">No execution trace yet.</div>
    `;
  }

  return html`
    <div style="display:grid; gap: 6px;">
      <div class="muted">Recent trace</div>
      <div class="pill-row">
        ${execution.trace.slice(0, 3).map(
          (entry) => html`<span class="pill" title=${entry.detailSummary ?? entry.refId}>
            ${formatStatus(entry.kind)} · ${formatRelativeTimestamp(Date.parse(entry.timestamp))}
          </span>`,
        )}
      </div>
    </div>
  `;
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function shortId(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function formatStatus(value: string) {
  return clampText(value.replaceAll("_", " "), 28);
}

function statusColor(status: string) {
  switch (status) {
    case "settled":
    case "acceptance_signed":
    case "settlement_released":
      return "#10B981";
    case "awaiting_acceptance":
    case "acceptance_pending":
      return "#F59E0B";
    case "disputed":
    case "acceptance_rejected":
      return "#EF4444";
    default:
      return "#94A3B8";
  }
}
