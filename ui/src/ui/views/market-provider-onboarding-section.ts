import { html, nothing } from "lit";
import type {
  MarketPresetIntent,
  MarketPresetMode,
  MarketPresetPreview,
  MarketPresetVerification,
} from "../types.ts";

export type MarketProviderOnboardingSectionProps = {
  loading: boolean;
  error: string | null;
  mode: MarketPresetMode;
  intent: MarketPresetIntent;
  preview: MarketPresetPreview | null;
  verification: MarketPresetVerification | null;
  onModeChange: (next: MarketPresetMode) => void;
  onIntentChange: (next: MarketPresetIntent) => void;
  onRefresh: () => void;
};

const MODE_OPTIONS: MarketPresetMode[] = ["single-node", "trusted-circle", "hybrid-cloud-edge"];
const INTENT_OPTIONS: MarketPresetIntent[] = ["provider", "hybrid", "consumer"];

export function renderMarketProviderOnboardingSection(props: MarketProviderOnboardingSectionProps) {
  return html`
    <div class="card" style="margin-top: 16px;">
      <div class="row" style="justify-content: space-between; gap: 12px; align-items:flex-start;">
        <div>
          <div class="card-title">Provider Onboarding</div>
          <div class="card-sub">Preset preview, runtime detection, publish blockers, and go-live checks for provider rollout.</div>
        </div>
        <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div class="grid grid-cols-2" style="margin-top: 16px; gap: 12px;">
        <label class="stack" style="gap: 6px;">
          <span class="card-sub" style="font-weight:600;">Mode</span>
          <select class="input" .value=${props.mode} @change=${(event: Event) => props.onModeChange((event.currentTarget as HTMLSelectElement).value as MarketPresetMode)}>
            ${MODE_OPTIONS.map((mode) => html`<option value=${mode}>${mode}</option>`)}
          </select>
        </label>
        <label class="stack" style="gap: 6px;">
          <span class="card-sub" style="font-weight:600;">Intent</span>
          <select class="input" .value=${props.intent} @change=${(event: Event) => props.onIntentChange((event.currentTarget as HTMLSelectElement).value as MarketPresetIntent)}>
            ${INTENT_OPTIONS.map((intent) => html`<option value=${intent}>${intent}</option>`)}
          </select>
        </label>
      </div>

      ${props.error ? html`<div class="callout warn" style="margin-top: 12px;">${props.error}</div>` : nothing}

      ${
        props.preview
          ? html`
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">Detected Providers</div>
            <div class="stat-value">${props.preview.detectedProviders.length}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Checks</div>
            <div class="stat-value">${props.preview.checks.length}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Next Steps</div>
            <div class="stat-value">${props.preview.nextSteps.length}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Verify Mode</div>
            <div class="stat-value">${props.verification?.mode ?? props.mode}</div>
          </div>
        </div>

        <div class="muted" style="margin-top: 12px;">${props.preview.summary}</div>
        <div class="muted" style="margin-top: 6px;">${props.preview.layout.pattern} · ${props.preview.layout.trustDomain}</div>

        ${
          props.preview.detectedProviders.length > 0
            ? html`
          <div style="margin-top: 16px;">
            <div class="card-sub" style="font-weight:600;margin-bottom:8px;">Detected Providers</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Runtime</th>
                  <th>Models</th>
                  <th>Publishable</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                ${props.preview.detectedProviders.map(
                  (provider) => html`
                  <tr>
                    <td>${provider.label}</td>
                    <td>${provider.runtime}</td>
                    <td>${provider.models.length > 0 ? provider.models.join(", ") : "—"}</td>
                    <td>${provider.publishable ? "YES" : "NO"}</td>
                    <td>${provider.note ?? "—"}</td>
                  </tr>
                `,
                )}
              </tbody>
            </table>
          </div>
        `
            : html`
                <div class="callout warn" style="margin-top: 16px">
                  No publishable provider runtime detected yet. Add runtime hints or configure provider offers
                  before publishing.
                </div>
              `
        }

        <div style="margin-top: 16px;">
          <div class="card-sub" style="font-weight:600;margin-bottom:8px;">Preview Checks</div>
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
              ${props.preview.checks.map(
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
        </div>

        ${
          props.preview.nextSteps.length > 0
            ? html`
          <div style="margin-top: 16px;">
            <div class="card-sub" style="font-weight:600;margin-bottom:6px;">Next Steps</div>
            <ul class="clean-list muted">
              ${props.preview.nextSteps.map((step) => html`<li>${step}</li>`)}
            </ul>
          </div>
        `
            : nothing
        }

        ${
          props.verification
            ? html`
          <div style="margin-top: 16px;">
            <div class="card-sub" style="font-weight:600;margin-bottom:6px;">Current Verify Summary</div>
            <div class="muted">${props.verification.summary}</div>
            ${
              props.verification.recommendedActions.length > 0
                ? html`
              <ul class="clean-list muted" style="margin-top: 8px;">
                ${props.verification.recommendedActions.map((action) => html`<li>${action}</li>`)}
              </ul>
            `
                : nothing
            }
          </div>
        `
            : nothing
        }
      `
          : html`
        <div class="muted" style="margin-top: 16px;">${props.loading ? "Loading preset preview…" : "No preset preview available yet."}</div>
      `
      }
    </div>
  `;
}
