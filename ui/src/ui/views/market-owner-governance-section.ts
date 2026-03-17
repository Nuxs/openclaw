import { html } from "lit";
import type { OwnerGovernanceSnapshot } from "../controllers/market-steward-controller.ts";

export type MarketOwnerGovernanceSectionProps = {
  snapshot: OwnerGovernanceSnapshot;
};

function statusColor(state: OwnerGovernanceSnapshot["killSwitchState"]): string {
  switch (state) {
    case "tripped":
      return "#EF4444";
    case "guarded":
      return "#F59E0B";
    default:
      return "#10B981";
  }
}

export function renderMarketOwnerGovernanceSection(props: MarketOwnerGovernanceSectionProps) {
  const { snapshot } = props;
  const color = statusColor(snapshot.killSwitchState);
  return html`
    <div class="card" style="margin-top: 16px;">
      <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
        <div>
          <div class="card-title">Owner Governance Cockpit</div>
          <div class="card-sub">
            God-view posture for owner approvals, exception pressure, audit backlog, kill switch readiness, and cron-traceable steward loops.
          </div>
        </div>
        <span class="pill" style="border-color:${color}; color:${color};">
          Kill switch ${snapshot.killSwitchState}
        </span>
      </div>

      <div class="stat-grid" style="margin-top: 16px;">
        <div class="stat">
          <div class="stat-label">Owner Gates</div>
          <div class="stat-value">${snapshot.approvalQueueCount}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Exception Pressure</div>
          <div class="stat-value">${snapshot.exceptionPressure}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Audit Backlog</div>
          <div class="stat-value">${snapshot.auditBacklog}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Steward Posture</div>
          <div class="stat-value" style="color:${color};">${snapshot.killSwitchState}</div>
        </div>
      </div>

      <div class="callout ${snapshot.killSwitchState === "tripped" ? "danger" : snapshot.killSwitchState === "guarded" ? "warn" : "info"}" style="margin-top: 16px;">
        ${snapshot.killSwitchReason}
      </div>

      <div class="list list--dense" style="margin-top: 16px;">
        ${snapshot.summary.map(
          (item) => html`
            <article class="list-item list-item--stacked">
              <div class="list-item__title">Owner note</div>
              <div class="list-item__body">${item}</div>
            </article>
          `,
        )}
      </div>
    </div>
  `;
}
