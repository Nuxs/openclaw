import { html, nothing } from "lit";
import { clampText, formatRelativeTimestamp } from "../format.ts";
import type {
  MarketDispute,
  MarketExecutionSummaryView,
  MarketLease,
  MarketResource,
} from "../types.ts";

export type MarketBuyerWorkbenchSectionProps = {
  loading: boolean;
  resources: MarketResource[];
  leases: MarketLease[];
  disputes: MarketDispute[];
  executions: MarketExecutionSummaryView[];
};

export function renderMarketBuyerWorkbenchSection(props: MarketBuyerWorkbenchSectionProps) {
  const publishedResources = props.resources
    .filter((resource) => resource.status === "resource_published")
    .toSorted(
      (left, right) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""),
    );
  const activeLeases = props.leases.filter((lease) => lease.status === "lease_active");
  const pendingExecutions = props.executions.filter(
    (execution) =>
      execution.executionStatus === "awaiting_acceptance" ||
      execution.acceptanceStatus === "acceptance_pending" ||
      execution.disputeStatus === "dispute_opened",
  );
  const openDisputes = props.disputes.filter(
    (dispute) =>
      dispute.status === "dispute_opened" || dispute.status === "dispute_evidence_submitted",
  );

  return html`
    <div class="card" style="margin-top: 16px;">
      <div>
        <div class="card-title">Buyer Workbench</div>
        <div class="card-sub">
          Discovery, execution follow-through, lease coverage, and exception posture for steward-side buying.
        </div>
      </div>

      <div class="stat-grid" style="margin-top: 16px;">
        <div class="stat">
          <div class="stat-label">Discoverable</div>
          <div class="stat-value">${publishedResources.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Active Leases</div>
          <div class="stat-value">${activeLeases.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Needs Acceptance</div>
          <div class="stat-value">${pendingExecutions.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Open Disputes</div>
          <div class="stat-value">${openDisputes.length}</div>
        </div>
      </div>

      ${
        publishedResources.length === 0
          ? html`
              <div class="callout warn" style="margin-top: 16px">
                No published market supply is visible yet. Discovery can proceed only after providers publish at
                least one resource.
              </div>
            `
          : html`
              <div class="callout" style="margin-top: 16px;">
                Steward can autonomously compare ${publishedResources.length} published resource${publishedResources.length === 1 ? "" : "s"}
                inside policy boundaries. Human attention should focus on thresholds, disputes, and settlement friction.
              </div>
            `
      }

      <section class="grid grid-cols-2" style="margin-top: 16px; gap: 12px;">
        <div>
          <div class="card-sub" style="font-weight: 600; margin-bottom: 8px;">Best Current Supply</div>
          <div class="list list--dense">
            ${
              publishedResources.length === 0
                ? html`<div class="muted">${props.loading ? "Loading buyer-side supply…" : "No published supply available."}</div>`
                : publishedResources.slice(0, 5).map(
                    (resource) => html`
                      <article class="list-item list-item--stacked">
                        <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                          <div>
                            <div class="list-item__title">${resource.label}</div>
                            <div class="muted">${resource.resourceId}</div>
                          </div>
                          <span class="pill">${resource.kind}</span>
                        </div>
                        <div class="list-item__meta">
                          <span>${resource.price.amount} ${resource.price.currency} / ${resource.price.unit}</span>
                          <span>${clampText(resource.providerActorId, 22)}</span>
                          <span>${formatUpdated(resource.updatedAt)}</span>
                        </div>
                      </article>
                    `,
                  )
            }
          </div>
        </div>

        <div>
          <div class="card-sub" style="font-weight: 600; margin-bottom: 8px;">Execution Attention Queue</div>
          <div class="list list--dense">
            ${
              pendingExecutions.length === 0
                ? html`
                    <div class="muted">No buyer-side executions currently need intervention.</div>
                  `
                : pendingExecutions.slice(0, 5).map(
                    (execution) => html`
                      <article class="list-item list-item--stacked">
                        <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                          <div>
                            <div class="list-item__title">${execution.resourceLabel ?? execution.orderId}</div>
                            <div class="muted">${execution.orderId}</div>
                          </div>
                          <span class="pill">${execution.executionStatus}</span>
                        </div>
                        <div class="list-item__meta">
                          <span>${execution.acceptanceStatus ?? "acceptance n/a"}</span>
                          <span>${execution.disputeStatus ?? "no dispute"}</span>
                          <span>${formatUpdated(execution.lastUpdatedAt)}</span>
                        </div>
                      </article>
                    `,
                  )
            }
          </div>
        </div>
      </section>

      ${
        openDisputes.length > 0
          ? html`
              <div class="pill-row" style="margin-top: 12px;">
                ${openDisputes
                  .slice(0, 3)
                  .map(
                    (dispute) =>
                      html`<span class="pill">${dispute.disputeId} · ${dispute.status}</span>`,
                  )}
              </div>
            `
          : nothing
      }
    </div>
  `;
}

function formatUpdated(value?: string | null) {
  if (!value) {
    return "updated n/a";
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : `updated ${formatRelativeTimestamp(parsed)}`;
}
