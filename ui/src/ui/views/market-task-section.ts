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

export function renderTaskSection(props: TaskSectionProps) {
  const { summary, tasks, loading } = props;

  return html`
    <div class="card">
      <div class="card-title">Task Market</div>
      <div class="card-sub">Task publishing, bidding, delivery and settlement.</div>
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
                    (t) => html`
                      <tr>
                        <td title="${t.taskId}">${t.title}</td>
                        <td>${statusBadge(t.status)}</td>
                        <td>${t.budget.amount} ${t.budget.currency}</td>
                        <td>${formatRelativeTimestamp(Date.parse(t.expiryAt))}</td>
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
