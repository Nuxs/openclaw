import { html, nothing } from "lit";
import { formatRelativeTimestamp } from "../format.ts";
import type { MarketStatusSummary, Web3BillingSummary, Web3StatusSummary } from "../types.ts";

export type Web3Props = {
  connected: boolean;
  loading: boolean;
  error: string | null;
  status: Web3StatusSummary | null;
  billing: Web3BillingSummary | null;
  billingError: string | null;
  marketStatus: MarketStatusSummary | null;
  marketError: string | null;
  lastSuccessAt: number | null;
  onRefresh: () => void;
};

export function renderWeb3(props: Web3Props) {
  const status = props.status;
  const identity = status?.identity;
  const bindings = identity?.bindings ?? [];
  const primary = identity?.primary ?? null;

  const billingUsage = props.billing?.usage ?? null;
  const billingEnabled = props.billing?.enabled ?? status?.billing?.status !== "unbound";
  const creditsRemaining = billingUsage
    ? Math.max(0, billingUsage.creditsQuota - billingUsage.creditsUsed)
    : (status?.billing?.credits ?? 0);
  const creditsQuota = billingUsage?.creditsQuota ?? 0;

  const lastAuditAtMs = status?.auditLastAt ? Date.parse(status.auditLastAt) : null;
  const lastAuditLabel =
    lastAuditAtMs && !Number.isNaN(lastAuditAtMs) ? formatRelativeTimestamp(lastAuditAtMs) : "n/a";

  const market = props.marketStatus;
  const lastSuccessLabel = props.lastSuccessAt
    ? formatRelativeTimestamp(props.lastSuccessAt)
    : "n/a";

  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">Identity</div>
        <div class="card-sub">Wallet bindings and SIWE readiness.</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">Bindings</div>
            <div class="stat-value">${bindings.length}</div>
          </div>
          <div class="stat">
            <div class="stat-label">SIWE</div>
            <div class="stat-value">${identity?.siweEnabled ? "Enabled" : "Disabled"}</div>
          </div>
        </div>
        <div class="muted" style="margin-top: 12px;">
          Primary: ${primary ? `${primary.address.slice(0, 8)}…` : "n/a"}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Billing</div>
        <div class="card-sub">Credits and quota status.</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">Remaining</div>
            <div class="stat-value">${creditsRemaining}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Quota</div>
            <div class="stat-value">${creditsQuota || "—"}</div>
          </div>
        </div>
        ${
          billingEnabled
            ? nothing
            : html`
                <div class="pill danger" style="margin-top: 12px">Billing disabled</div>
              `
        }
        ${props.billingError ? html`<div class="pill danger" style="margin-top: 12px;">${props.billingError}</div>` : nothing}
      </div>

      <div class="card">
        <div class="card-title">Audit & Evidence</div>
        <div class="card-sub">Anchoring, archives, and recent events.</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">Recent events</div>
            <div class="stat-value">${status?.auditEventsRecent ?? 0}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Pending anchors</div>
            <div class="stat-value">${status?.queues?.anchors?.pending ?? 0}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Pending archives</div>
            <div class="stat-value">${status?.queues?.archives?.pending ?? 0}</div>
          </div>
        </div>
        <div class="muted" style="margin-top: 12px;">Last audit: ${lastAuditLabel}</div>
      </div>

      <div class="card">
        <div class="card-title">Market</div>
        <div class="card-sub">Offers, orders, and settlement health.</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">Offers</div>
            <div class="stat-value">${market?.totals?.offers ?? 0}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Orders</div>
            <div class="stat-value">${market?.totals?.orders ?? 0}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Settlements</div>
            <div class="stat-value">${market?.totals?.settlements ?? 0}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Disputes</div>
            <div class="stat-value">${market?.disputes?.total ?? 0}</div>
          </div>
        </div>
        <div class="muted" style="margin-top: 12px;">Last update: ${lastSuccessLabel}</div>
        ${props.marketError ? html`<div class="pill danger" style="margin-top: 12px;">${props.marketError}</div>` : nothing}
      </div>
    </section>

    <section class="card" style="margin-top: 20px;">
      <div class="card-title">Next actions</div>
      <div class="card-sub">Suggested quick checks based on current status.</div>
      <div class="pill-group" style="margin-top: 12px;">
        <span class="pill">/web3</span>
        <span class="pill">/bind_wallet</span>
        <span class="pill">/credits</span>
        <span class="pill">/audit_status</span>
        <span class="pill">/web3-market status</span>
      </div>
      <div style="margin-top: 16px;">
        <button class="btn" ?disabled=${props.loading || !props.connected} @click=${props.onRefresh}>
          ${props.loading ? "Refreshing…" : "Refresh"}
        </button>
        ${props.error ? html`<span class="pill danger" style="margin-left: 12px;">${props.error}</span>` : nothing}
      </div>
    </section>
  `;
}
