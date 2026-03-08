/**
 * Privacy & Consent section — authorizations, assets, replays and erasure status.
 */
import { html, nothing } from "lit";
import { formatRelativeTimestamp } from "../format.ts";
import type {
  ConsentView,
  MarketPrivacySummary,
  PrivacyAssetView,
  PrivacyReplayView,
} from "../types.ts";

export type PrivacySectionProps = {
  loading: boolean;
  summary: MarketPrivacySummary | null;
  consents: ConsentView[];
  assets: PrivacyAssetView[];
  replays: PrivacyReplayView[];
};

function consentStatusColor(status: string): string {
  switch (status) {
    case "consent_granted":
      return "#10B981";
    case "consent_revoked":
      return "#EF4444";
    default:
      return "#94A3B8";
  }
}

export function renderPrivacySection(props: PrivacySectionProps) {
  const { summary, consents, assets, loading } = props;

  return html`
    <div class="card">
      <div class="card-title">Privacy & Consent</div>
      <div class="card-sub">Authorization governance, knowledge assets, replays and erasure.</div>
      ${
        summary
          ? html`
            <div class="stat-grid" style="margin-top: 16px;">
              <div class="stat">
                <div class="stat-label">Active</div>
                <div class="stat-value">${summary.activeConsents}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Revoked</div>
                <div class="stat-value" style="color:#EF4444">${summary.revokedConsents}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Pending Erase</div>
                <div class="stat-value" style="color:${summary.pendingErasure > 0 ? "#F59E0B" : "#10B981"}">${summary.pendingErasure}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Replays</div>
                <div class="stat-value">${summary.totalReplays}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Assets</div>
                <div class="stat-value">${summary.assetCount}</div>
              </div>
            </div>
          `
          : loading
            ? html`
                <div class="muted" style="margin-top: 12px">Loading privacy data…</div>
              `
            : html`
                <div class="muted" style="margin-top: 12px">No privacy data available.</div>
              `
      }

      ${
        consents.length > 0
          ? html`
            <div style="margin-top:20px;">
              <div class="card-sub" style="font-weight:600;margin-bottom:8px;">Consent Records</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Purpose</th>
                    <th>Status</th>
                    <th>Granted</th>
                    <th>Retention</th>
                  </tr>
                </thead>
                <tbody>
                  ${consents.slice(0, 8).map(
                    (c) => html`
                      <tr>
                        <td title="${c.consentId}">${c.purpose}</td>
                        <td>
                          <span style="color:${consentStatusColor(c.status)}">${c.status.replace("consent_", "")}</span>
                        </td>
                        <td>${formatRelativeTimestamp(Date.parse(c.grantedAt))}</td>
                        <td>${c.retentionUntil ? formatRelativeTimestamp(Date.parse(c.retentionUntil)) : "—"}</td>
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
        assets.length > 0
          ? html`
            <div style="margin-top:16px;">
              <div class="card-sub" style="font-weight:600;margin-bottom:8px;">Knowledge Assets</div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Purpose</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${assets.slice(0, 6).map(
                    (a) => html`
                      <tr>
                        <td>${a.title}</td>
                        <td>${a.purpose}</td>
                        <td><span style="color:${consentStatusColor(a.status)}">${a.status.replace("consent_", "")}</span></td>
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
