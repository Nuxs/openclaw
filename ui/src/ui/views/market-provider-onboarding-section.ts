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
  const previewBlockers = props.preview?.checks.filter((check) => check.status !== "pass") ?? [];
  const verifyIssues =
    props.verification?.readiness.checks.filter((check) => check.status !== "pass") ?? [];
  const publishableProviders =
    props.preview?.detectedProviders.filter((provider) => provider.publishable) ?? [];

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
            <div class="stat-label">Publishable</div>
            <div class="stat-value">${publishableProviders.length}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Preview Blockers</div>
            <div class="stat-value">${previewBlockers.length}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Verify Issues</div>
            <div class="stat-value">${verifyIssues.length}</div>
          </div>
        </div>

        <div class="muted" style="margin-top: 12px;">${props.preview.summary}</div>
        <div class="muted" style="margin-top: 6px;">${props.preview.layout.pattern} · ${props.preview.layout.trustDomain}</div>

        <div class="card" style="margin-top: 16px; background: rgba(15, 23, 42, 0.18); border: 1px dashed rgba(148, 163, 184, 0.25);">
          <div class="card-sub" style="font-weight:600;margin-bottom:6px;">Provider Lifecycle Path</div>
          <ul class="clean-list muted">
            <li><code>web3.market.offer.create</code>：先建立 seller offer 草稿。</li>
            <li><code>web3.market.offer.update</code>：修正价格、交付方式或 usage scope。</li>
            <li><code>web3.market.offer.publish</code>：在 preview / verify 足够稳定后发布 offer。</li>
            <li><code>web3.market.resource.publish</code>：把可发现资源挂到已发布 offer 上。</li>
            <li><code>web3.market.resource.unpublish</code> / <code>web3.market.offer.close</code>：下架资源或关闭旧 offer。</li>
          </ul>
        </div>

        ${
          previewBlockers.length > 0 || verifyIssues.length > 0
            ? html`
          <div class="callout warn" style="margin-top: 16px;">
            Publish is still gated by ${previewBlockers.length} preview blockers and ${verifyIssues.length} verify issues.
            Clear them before exposing this provider to buyers.
          </div>
        `
            : html`
                <div class="callout" style="margin-top: 16px">
                  Provider onboarding is green enough to draft/publish an offer. Finish resource publish and
                  operator review before go-live.
                </div>
              `
        }

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
