/**
 * Ops & Release section — alerts, health probes, degradation and release gates.
 */
import { html, nothing } from "lit";
import { formatRelativeTimestamp } from "../format.ts";
import type { MarketOpsSummary, OpsAlertView, OpsHealthProbe } from "../types.ts";

export type OpsSectionProps = {
  loading: boolean;
  summary: MarketOpsSummary | null;
  alerts: OpsAlertView[];
};

function levelColor(level: string): string {
  switch (level) {
    case "P0":
      return "#EF4444";
    case "P1":
      return "#F59E0B";
    case "P2":
      return "#38BDF8";
    default:
      return "#94A3B8";
  }
}

function probeStatus(status: OpsHealthProbe["status"]) {
  const colors: Record<string, string> = {
    healthy: "#10B981",
    degraded: "#F59E0B",
    down: "#EF4444",
  };
  return html`<span style="color:${colors[status] ?? "#94A3B8"};font-weight:600;">${status}</span>`;
}

export function renderOpsSection(props: OpsSectionProps) {
  const { summary, alerts, loading } = props;

  return html`
    <div class="card">
      <div class="card-title">Steward Operations & Health</div>
      <div class="card-sub">Alerts, health probes, degradation status and release gates.</div>
      ${
        summary
          ? html`
            <div class="stat-grid" style="margin-top: 16px;">
              <div class="stat">
                <div class="stat-label">Active Alerts</div>
                <div class="stat-value" style="color:${summary.activeAlerts > 0 ? "#EF4444" : "#10B981"}">${summary.activeAlerts}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Wallet</div>
                <div class="stat-value" style="color:${summary.walletHealthy ? "#10B981" : "#EF4444"}">${summary.walletHealthy ? "OK" : "DOWN"}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Discovery</div>
                <div class="stat-value" style="color:${summary.discoveryHealthy ? "#10B981" : "#EF4444"}">${summary.discoveryHealthy ? "OK" : "DOWN"}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Payment</div>
                <div class="stat-value" style="color:${summary.paymentHealthy ? "#10B981" : "#EF4444"}">${summary.paymentHealthy ? "OK" : "DOWN"}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Settlement</div>
                <div class="stat-value" style="color:${summary.settlementHealthy ? "#10B981" : "#EF4444"}">${summary.settlementHealthy ? "OK" : "DOWN"}</div>
              </div>
            </div>

            ${
              summary.healthProbes.length > 0
                ? html`
                  <div style="margin-top:16px;">
                    <div class="card-sub" style="font-weight:600;margin-bottom:8px;">Health Probes</div>
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th>Status</th>
                          <th>Last Check</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${summary.healthProbes.map(
                          (p) => html`
                            <tr>
                              <td>${p.name}</td>
                              <td>${probeStatus(p.status)}</td>
                              <td>${formatRelativeTimestamp(Date.parse(p.lastCheck))}</td>
                              <td>${p.details ?? "—"}</td>
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
              summary.preset
                ? html`
                    <div style="margin-top:16px;">
                      <div class="card-sub" style="font-weight:600;margin-bottom:8px;">
                        Preset Baseline Gates
                      </div>
                      <div class="muted" style="margin-bottom:8px;">
                        ${summary.preset.summary}
                      </div>
                      <table class="data-table">
                        <thead>
                          <tr>
                            <th>Check</th>
                            <th>Status</th>
                            <th>Detail</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${summary.preset.readiness.checks.map(
                            (check) => html`
                              <tr>
                                <td>${check.name}</td>
                                <td>${check.status.toUpperCase()}</td>
                                <td>${check.detail ?? "—"}</td>
                                <td>${check.action ?? "—"}</td>
                              </tr>
                            `,
                          )}
                        </tbody>
                      </table>
                      ${
                        summary.preset.recommendedActions.length > 0
                          ? html`
                              <div style="margin-top:12px;">
                                <div class="card-sub" style="font-weight:600;margin-bottom:6px;">Recommended Actions</div>
                                <ul class="clean-list muted">
                                  ${summary.preset.recommendedActions.map(
                                    (action) => html`<li>${action}</li>`,
                                  )}
                                </ul>
                              </div>
                            `
                          : nothing
                      }
                    </div>
                  `
                : nothing
            }
          `
          : loading
            ? html`
                <div class="muted" style="margin-top: 12px">Loading ops data…</div>
              `
            : html`
                <div class="muted" style="margin-top: 12px">No ops data available.</div>
              `
      }

      ${
        alerts.length > 0
          ? html`
            <div style="margin-top:20px;">
              <div class="card-sub" style="font-weight:600;margin-bottom:8px;">Recent Alerts</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Category</th>
                    <th>Message</th>
                    <th>Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${alerts.slice(0, 10).map(
                    (a) => html`
                      <tr>
                        <td><span style="color:${levelColor(a.level)};font-weight:700;">${a.level}</span></td>
                        <td>${a.category}</td>
                        <td>${a.message}</td>
                        <td>${formatRelativeTimestamp(Date.parse(a.timestamp))}</td>
                        <td>${a.status}</td>
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
