import { html } from "lit";
import type { ApprovalQueueItem } from "../controllers/market-steward-controller.ts";

export type MarketApprovalQueueSectionProps = {
  loading: boolean;
  items: ApprovalQueueItem[];
};

function priorityColor(priority: ApprovalQueueItem["priority"]): string {
  return priority === "high" ? "#F59E0B" : "#38BDF8";
}

export function renderMarketApprovalQueueSection(props: MarketApprovalQueueSectionProps) {
  return html`
    <div class="card card--stretch">
      <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
        <div>
          <div class="card-title">Approval & Exception Queue</div>
          <div class="card-sub">
            Owner-facing gates across consent, buyer acceptance, and dispute handling.
          </div>
        </div>
        <span class="pill">Open ${props.items.length}</span>
      </div>

      ${
        props.items.length === 0
          ? html`<div class="muted" style="margin-top: 16px;">${props.loading ? "Refreshing queue…" : "No owner gates are waiting right now."}</div>`
          : html`
              <div class="list list--dense" style="margin-top: 16px; display: grid; gap: 12px;">
                ${props.items.map(
                  (item) => html`
                    <article
                      class="list-item list-item--stacked"
                      style="border: 1px solid rgba(148, 163, 184, 0.14); border-radius: 14px; background: rgba(15, 23, 42, 0.22); padding: 14px;"
                    >
                      <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                        <div>
                          <div class="list-item__title">${item.title}</div>
                          <div class="muted" style="margin-top: 4px;">${item.detail}</div>
                        </div>
                        <span class="pill" style="border-color:${priorityColor(item.priority)}; color:${priorityColor(item.priority)};">
                          ${item.priority}
                        </span>
                      </div>
                      <div class="list-item__meta" style="margin-top: 8px;">
                        <span>${item.kind}</span>
                        <span>${item.status}</span>
                      </div>
                      <div class="list-item__body" style="margin-top: 10px;">${item.action}</div>
                      ${
                        item.refs.length > 0
                          ? html`<div class="pill-row" style="margin-top: 10px;">${item.refs.map((ref) => html`<span class="pill">${ref}</span>`)}</div>`
                          : null
                      }
                    </article>
                  `,
                )}
              </div>
            `
      }
    </div>
  `;
}
