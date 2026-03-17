import { html, nothing } from "lit";
import { clampText, formatRelativeTimestamp } from "../format.ts";
import type {
  MarketAuditSnapshot,
  MarketOpsSummary,
  MarketStatusSummary,
  OpsAlertView,
} from "../types.ts";

export type MarketControlWorkbenchSectionProps = {
  loading: boolean;
  status: MarketStatusSummary | null;
  opsSummary: MarketOpsSummary | null;
  alerts: OpsAlertView[];
  auditSnapshot: MarketAuditSnapshot | null;
  auditError: string | null;
};

export function renderMarketControlWorkbenchSection(props: MarketControlWorkbenchSectionProps) {
  const recentEvents = props.auditSnapshot?.events.slice(0, 6) ?? [];
  const preset = props.opsSummary?.preset ?? null;

  return html`
    <div class="card" style="margin-top: 16px;">
      <div>
        <div class="card-title">Control Workbench</div>
        <div class="card-sub">
          Governance, alert pressure, audit visibility, and repair posture for accountable execution.
        </div>
      </div>

      <div class="stat-grid" style="margin-top: 16px;">
        <div class="stat">
          <div class="stat-label">Active Alerts</div>
          <div class="stat-value">${props.opsSummary?.activeAlerts ?? 0}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Audit Events</div>
          <div class="stat-value">${props.auditSnapshot?.count ?? props.status?.audit.events ?? 0}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Anchor Pending</div>
          <div class="stat-value">${props.status?.audit.anchorPending ?? 0}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Repair Candidates</div>
          <div class="stat-value">${props.status?.repair.candidates ?? 0}</div>
        </div>
      </div>

      ${props.auditError ? html`<div class="callout warn" style="margin-top: 16px;">${props.auditError}</div>` : nothing}

      ${
        preset
          ? html`
              <div class="pill-row" style="margin-top: 12px;">
                <span class="pill">Preset ${preset.mode}</span>
                <span class="pill">Pass ${preset.readiness.passCount}</span>
                <span class="pill">Warn ${preset.readiness.warnCount}</span>
                <span class="pill">Fail ${preset.readiness.failCount}</span>
              </div>
            `
          : nothing
      }

      <section class="grid grid-cols-2" style="margin-top: 16px; gap: 12px;">
        <div>
          <div class="card-sub" style="font-weight: 600; margin-bottom: 8px;">Recent Audit Trail</div>
          ${
            recentEvents.length === 0
              ? html`<div class="muted">${props.loading ? "Loading audit trail…" : "No audit events available."}</div>`
              : html`
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Kind</th>
                        <th>Ref</th>
                        <th>Actor</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${recentEvents.map(
                        (event) => html`
                          <tr>
                            <td>${event.kind}</td>
                            <td>${clampText(event.refId, 22)}</td>
                            <td>${clampText(event.actor ?? "system", 22)}</td>
                            <td>${formatEventTime(event.timestamp)}</td>
                          </tr>
                          ${
                            event.detailSummary
                              ? html`
                                  <tr>
                                    <td colspan="4" class="muted">${event.detailSummary}</td>
                                  </tr>
                                `
                              : nothing
                          }
                        `,
                      )}
                    </tbody>
                  </table>
                `
          }
        </div>

        <div>
          <div class="card-sub" style="font-weight: 600; margin-bottom: 8px;">Governance Summary</div>
          <div class="list list--dense">
            <article class="list-item list-item--stacked">
              <div class="list-item__title">Alert Pressure</div>
              <div class="list-item__meta">
                <span>${props.opsSummary?.activeAlerts ?? 0} active</span>
                <span>${Object.keys(props.opsSummary?.alertsByLevel ?? {}).length} levels</span>
              </div>
            </article>
            <article class="list-item list-item--stacked">
              <div class="list-item__title">Repair Backlog</div>
              <div class="list-item__meta">
                <span>${props.status?.repair.candidates ?? 0} candidates</span>
                <span>${props.status?.repair.orphaned ?? 0} orphaned</span>
                <span>${props.status?.repair.expiredActive ?? 0} expired-active</span>
              </div>
            </article>
            <article class="list-item list-item--stacked">
              <div class="list-item__title">Dispute Queue</div>
              <div class="list-item__meta">
                <span>${props.status?.disputes.open ?? 0} open</span>
                <span>${props.status?.disputes.resolved ?? 0} resolved</span>
                <span>${props.status?.disputes.rejected ?? 0} rejected</span>
              </div>
            </article>
            <article class="list-item list-item--stacked">
              <div class="list-item__title">Revocation Jobs</div>
              <div class="list-item__meta">
                <span>${props.status?.revocations.pending ?? 0} pending</span>
                <span>${props.status?.revocations.failed ?? 0} failed</span>
              </div>
            </article>
          </div>

          ${
            props.alerts.length > 0
              ? html`
                  <div class="pill-row" style="margin-top: 12px;">
                    ${props.alerts
                      .slice(0, 3)
                      .map(
                        (alert) =>
                          html`<span class="pill">${alert.level} · ${clampText(alert.message, 40)}</span>`,
                      )}
                  </div>
                `
              : nothing
          }
        </div>
      </section>
    </div>
  `;
}

function formatEventTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : formatRelativeTimestamp(parsed);
}
