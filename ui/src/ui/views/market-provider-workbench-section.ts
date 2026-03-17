import { html, nothing } from "lit";
import { clampText, formatRelativeTimestamp } from "../format.ts";
import type {
  MarketLease,
  MarketResource,
  MarketReputationSummary,
  TokenEconomyState,
} from "../types.ts";

export type MarketProviderWorkbenchSectionProps = {
  loading: boolean;
  resources: MarketResource[];
  leases: MarketLease[];
  reputation: MarketReputationSummary | null;
  tokenEconomy: TokenEconomyState | null;
};

export function renderMarketProviderWorkbenchSection(props: MarketProviderWorkbenchSectionProps) {
  const publishedResources = props.resources.filter(
    (resource) => resource.status === "resource_published",
  );
  const draftResources = props.resources.filter((resource) => resource.status === "resource_draft");
  const activeLeases = props.leases.filter((lease) => lease.status === "lease_active");
  const priorityResources = [...props.resources]
    .toSorted((left, right) => {
      const leftPublished = left.status === "resource_published" ? 1 : 0;
      const rightPublished = right.status === "resource_published" ? 1 : 0;
      if (leftPublished !== rightPublished) {
        return rightPublished - leftPublished;
      }
      return Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? "");
    })
    .slice(0, 5);
  const signals = props.reputation?.signals ?? [];

  return html`
    <div class="card" style="margin-top: 16px;">
      <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
        <div>
          <div class="card-title">Provider Workbench</div>
          <div class="card-sub">
            Inventory posture, publish readiness, live lease pressure, and provider-side revenue hygiene.
          </div>
        </div>
        ${
          props.tokenEconomy
            ? html`<span class="pill">Token ${props.tokenEconomy.status}</span>`
            : nothing
        }
      </div>

      <div class="stat-grid" style="margin-top: 16px;">
        <div class="stat">
          <div class="stat-label">Published</div>
          <div class="stat-value">${publishedResources.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Drafts</div>
          <div class="stat-value">${draftResources.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Active Leases</div>
          <div class="stat-value">${activeLeases.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Reputation</div>
          <div class="stat-value">${props.reputation?.score ?? "n/a"}</div>
        </div>
      </div>

      ${
        publishedResources.length === 0
          ? html`
              <div class="callout warn" style="margin-top: 16px">
                No published resources are live yet. Finish onboarding and publish at least one offer-backed
                resource before expecting buyer-side discovery.
              </div>
            `
          : html`
              <div class="callout" style="margin-top: 16px;">
                ${publishedResources.length} live resource${publishedResources.length === 1 ? "" : "s"} can
                currently absorb buyer demand. Keep draft backlog small and close stale offers promptly.
              </div>
            `
      }

      ${
        signals.length > 0
          ? html`
              <div class="pill-row" style="margin-top: 12px;">
                ${signals.slice(0, 4).map((signal) => html`<span class="pill">${signal}</span>`)}
              </div>
            `
          : nothing
      }

      <div style="margin-top: 16px;">
        <div class="card-sub" style="font-weight: 600; margin-bottom: 8px;">Priority Inventory</div>
        <div class="list list--dense">
          ${
            priorityResources.length === 0
              ? html`<div class="muted">${props.loading ? "Loading provider inventory…" : "No provider inventory available."}</div>`
              : priorityResources.map(
                  (resource) => html`
                    <article class="list-item list-item--stacked">
                      <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                        <div>
                          <div class="list-item__title">${resource.label}</div>
                          <div class="muted">${resource.resourceId}</div>
                        </div>
                        <span class="pill">${resource.status}</span>
                      </div>
                      <div class="list-item__meta">
                        <span>${resource.price.amount} ${resource.price.currency} / ${resource.price.unit}</span>
                        <span>${resource.kind}</span>
                        <span>${formatUpdated(resource.updatedAt)}</span>
                      </div>
                      ${
                        resource.description
                          ? html`<div class="list-item__body">${clampText(resource.description, 140)}</div>`
                          : nothing
                      }
                    </article>
                  `,
                )
          }
        </div>
      </div>
    </div>
  `;
}

function formatUpdated(value?: string) {
  if (!value) {
    return "updated n/a";
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : `updated ${formatRelativeTimestamp(parsed)}`;
}
