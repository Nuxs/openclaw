import { html, nothing } from "lit";
import type { UsageProps } from "./usageTypes.ts";

export function renderBillingSummary(props: UsageProps) {
  const summary = props.billingSummary;
  const usage = summary?.usage ?? null;
  const remaining = usage ? Math.max(usage.creditsQuota - usage.creditsUsed, 0) : null;
  const nearLimit = usage
    ? usage.creditsQuota > 0 && usage.creditsUsed / usage.creditsQuota >= 0.9
    : false;
  const sessionHash = summary?.sessionIdHash ? `${summary.sessionIdHash.slice(0, 10)}…` : null;

  return html`
    <section class="card" style="margin-top: 18px;">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Billing (Web3)</div>
          <div class="card-sub">Session credits, usage, and quota from web3-core.</div>
        </div>
        <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onBillingRefresh}>
          ${props.loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      ${
        props.billingError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.billingError}</div>`
          : nothing
      }
      ${
        summary && !summary.enabled
          ? html`
              <div class="callout warning" style="margin-top: 12px">Billing is disabled in web3-core config.</div>
            `
          : nothing
      }
      ${
        !summary
          ? html`
              <div class="callout info" style="margin-top: 12px">Billing summary is not available yet.</div>
            `
          : nothing
      }
      ${
        summary && !usage
          ? html`
              <div class="muted" style="margin-top: 12px">No usage recorded for this session yet.</div>
            `
          : nothing
      }
      ${
        usage
          ? html`
              <div class="stat-grid" style="margin-top: 14px;">
                <div class="stat">
                  <div class="stat-label">Credits</div>
                  <div class="stat-value">
                    ${usage.creditsUsed} / ${usage.creditsQuota}
                  </div>
                  <div class="muted">${remaining ?? 0} remaining</div>
                </div>
                <div class="stat">
                  <div class="stat-label">LLM calls</div>
                  <div class="stat-value">${usage.llmCalls}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Tool calls</div>
                  <div class="stat-value">${usage.toolCalls}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Last activity</div>
                  <div class="stat-value">${usage.lastActivity}</div>
                </div>
              </div>
              ${
                nearLimit
                  ? html`
                      <div class="callout warning" style="margin-top: 12px">
                        Credits nearly exhausted. Consider topping up or reducing usage.
                      </div>
                    `
                  : nothing
              }
              ${
                sessionHash
                  ? html`<div class="muted" style="margin-top: 10px;">
                      Session hash: <span class="mono">${sessionHash}</span>
                    </div>`
                  : nothing
              }
            `
          : nothing
      }
    </section>
  `;
}
