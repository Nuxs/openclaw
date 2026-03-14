/**
 * Task Market section — tasks, bids, results and receipts overview.
 */
import { html, nothing } from "lit";
import { formatRelativeTimestamp } from "../format.ts";
import type {
  MarketTaskSummary,
  TaskBidView,
  TaskOrderView,
  TaskReceiptView,
  TaskResultView,
} from "../types.ts";

export type TaskSectionProps = {
  loading: boolean;
  error?: string | null;
  summary: MarketTaskSummary | null;
  tasks: TaskOrderView[];
  bids: TaskBidView[];
  results: TaskResultView[];
  receipts: TaskReceiptView[];
};

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    task_open: "#10B981",
    task_awarded: "#06B6D4",
    task_closed: "#94A3B8",
    task_cancelled: "#EF4444",
    task_expired: "#F59E0B",
    bid_submitted: "#38BDF8",
    bid_accepted: "#10B981",
    bid_rejected: "#EF4444",
    bid_withdrawn: "#94A3B8",
    result_submitted: "#F59E0B",
    result_accepted: "#10B981",
    result_rejected: "#EF4444",
    receipt_pending: "#F59E0B",
    receipt_settled: "#10B981",
    receipt_refunded: "#38BDF8",
    receipt_disputed: "#EF4444",
  };
  const color = colors[status] ?? "#94A3B8";
  return html`<span class="badge" style="background:${color};color:#0B1220;padding:2px 8px;border-radius:4px;font-size:11px;">${status}</span>`;
}

function shortId(value: string): string {
  return value.length <= 14 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function renderTimestamp(value?: string): string {
  if (!value) {
    return "—";
  }
  return formatRelativeTimestamp(Date.parse(value));
}

function renderArtifactSummary(result: TaskResultView): string {
  const count = result.artifacts.length;
  if (count === 0) {
    return "No artifacts";
  }
  if (count === 1) {
    return shortId(result.artifacts[0] ?? "artifact");
  }
  return `${count} artifacts`;
}

export function renderTaskSection(props: TaskSectionProps) {
  const { summary, tasks, bids, results, receipts, loading, error } = props;

  return html`
    <div class="card">
      <div class="card-title">Task Market</div>
      <div class="card-sub">Task publishing, bidding, delivery and settlement.</div>
      ${
        error
          ? html`
              <div class="callout warn" style="margin-top: 12px;">${error}</div>
            `
          : nothing
      }
      ${
        summary
          ? html`
            <div class="stat-grid" style="margin-top: 16px;">
              <div class="stat">
                <div class="stat-label">Open</div>
                <div class="stat-value">${summary.openTasks}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Awarded</div>
                <div class="stat-value">${summary.awardedTasks}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Closed</div>
                <div class="stat-value">${summary.closedTasks}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Bids</div>
                <div class="stat-value">${summary.totalBids}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Pending Results</div>
                <div class="stat-value">${summary.pendingResults}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Settled</div>
                <div class="stat-value">${summary.settledReceipts}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Disputed</div>
                <div class="stat-value" style="color:${summary.disputedReceipts > 0 ? "#EF4444" : "#94A3B8"}">
                  ${summary.disputedReceipts}
                </div>
              </div>
            </div>
          `
          : loading
            ? html`
                <div class="muted" style="margin-top: 12px">Loading task summary…</div>
              `
            : html`
                <div class="muted" style="margin-top: 12px">No task data available.</div>
              `
      }

      ${
        tasks.length > 0
          ? html`
            <div style="margin-top:20px;">
              <div class="card-sub" style="font-weight:600;margin-bottom:8px;">Recent Tasks</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Budget</th>
                    <th>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  ${tasks.slice(0, 8).map(
                    (task) => html`
                      <tr>
                        <td title="${task.taskId}">${task.title}</td>
                        <td>${statusBadge(task.status)}</td>
                        <td>${task.budget.amount} ${task.budget.currency}</td>
                        <td>${formatRelativeTimestamp(Date.parse(task.expiryAt))}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
          : nothing
      }

      ${
        bids.length > 0
          ? html`
            <div style="margin-top:16px;">
              <div class="card-sub" style="font-weight:600;margin-bottom:8px;">Recent Bids</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Bidder</th>
                    <th>Task</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  ${bids.slice(0, 6).map(
                    (bid) => html`
                      <tr>
                        <td title="${bid.bidderActorId}">${shortId(bid.bidderActorId)}</td>
                        <td title="${bid.taskId}">${shortId(bid.taskId)}</td>
                        <td>${bid.price} ${bid.currency}</td>
                        <td>${statusBadge(bid.status)}</td>
                        <td>${renderTimestamp(bid.createdAt)}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
          : nothing
      }

      ${
        results.length > 0
          ? html`
            <div style="margin-top:16px;">
              <div class="card-sub" style="font-weight:600;margin-bottom:8px;">Submitted Results</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Deliverer</th>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Artifacts</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  ${results.slice(0, 6).map(
                    (result) => html`
                      <tr>
                        <td title="${result.delivererActorId}">${shortId(result.delivererActorId)}</td>
                        <td title="${result.taskId}">${shortId(result.taskId)}</td>
                        <td>${statusBadge(result.status)}</td>
                        <td title="${result.artifacts.join(", ")}">${renderArtifactSummary(result)}</td>
                        <td>${renderTimestamp(result.submittedAt)}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
          : nothing
      }

      ${
        receipts.length > 0
          ? html`
            <div style="margin-top:16px;">
              <div class="card-sub" style="font-weight:600;margin-bottom:8px;">Settlement Receipts</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Settled</th>
                    <th>Dispute</th>
                  </tr>
                </thead>
                <tbody>
                  ${receipts.slice(0, 6).map(
                    (receipt) => html`
                      <tr>
                        <td title="${receipt.taskId}">${shortId(receipt.taskId)}</td>
                        <td>${statusBadge(receipt.status)}</td>
                        <td>${receipt.amount} ${receipt.currency}</td>
                        <td>${renderTimestamp(receipt.settledAt)}</td>
                        <td title="${receipt.disputeId ?? ""}">${receipt.disputeId ? shortId(receipt.disputeId) : "—"}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
          : nothing
      }
    </div>
  `;
}
