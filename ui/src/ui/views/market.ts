import { html, nothing } from "lit";
import { clampText, formatRelativeTimestamp } from "../format.ts";
import type {
  MarketDispute,
  MarketLedgerSummary,
  MarketLease,
  MarketResource,
  MarketResourceKind,
  MarketStatusSummary,
} from "../types.ts";

type MarketProps = {
  loading: boolean;
  error: string | null;
  lastSuccessAt: number | null;
  status: MarketStatusSummary | null;
  resources: MarketResource[];
  leases: MarketLease[];
  ledger: MarketLedgerSummary | null;
  disputes: MarketDispute[];
  resourceKind: MarketResourceKind | "all";
  onResourceKindChange: (next: MarketResourceKind | "all") => void;
  onRefresh: () => void;
};

const RESOURCE_KINDS: Array<{ key: MarketProps["resourceKind"]; label: string }> = [
  { key: "all", label: "All" },
  { key: "model", label: "Model" },
  { key: "search", label: "Search" },
  { key: "storage", label: "Storage" },
];

export function renderMarket(props: MarketProps) {
  const status = props.status;
  const disputesByStatus = countByStatus(props.disputes);
  const totalDisputes = props.disputes.length;
  const activeLeases = props.leases.filter((lease) => lease.status === "lease_active").length;
  const expiredLeases = props.leases.filter((lease) => lease.status === "lease_expired").length;
  const revokedLeases = props.leases.filter((lease) => lease.status === "lease_revoked").length;
  const lastSuccessLabel = props.lastSuccessAt
    ? formatRelativeTimestamp(props.lastSuccessAt)
    : "n/a";

  const filteredResources =
    props.resourceKind === "all"
      ? props.resources
      : props.resources.filter((resource) => resource.kind === props.resourceKind);

  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">Market Overview</div>
            <div class="card-sub">Key totals and status distributions for live market activity.</div>
          </div>
          <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        ${
          props.error
            ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
            : nothing
        }
        <div class="muted" style="margin-top: 10px;">Last update: ${lastSuccessLabel}</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">Offers</div>
            <div class="stat-value">${status?.totals.offers ?? 0}</div>
            ${renderStatusPills(status?.offers ?? {})}
          </div>
          <div class="stat">
            <div class="stat-label">Orders</div>
            <div class="stat-value">${status?.totals.orders ?? 0}</div>
            ${renderStatusPills(status?.orders ?? {})}
          </div>
          <div class="stat">
            <div class="stat-label">Settlements</div>
            <div class="stat-value">${status?.totals.settlements ?? 0}</div>
            ${renderStatusPills(status?.settlements ?? {})}
          </div>
          <div class="stat">
            <div class="stat-label">Disputes</div>
            <div class="stat-value">${totalDisputes}</div>
            ${renderStatusPills(disputesByStatus)}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Leases & Ledger</div>
        <div class="card-sub">Current lease health and recent revenue summary.</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">Active leases</div>
            <div class="stat-value">${activeLeases}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Expired leases</div>
            <div class="stat-value">${expiredLeases}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Revoked leases</div>
            <div class="stat-value">${revokedLeases}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Ledger total</div>
            <div class="stat-value">${props.ledger?.totalCost ?? "0"}</div>
            <div class="muted">${props.ledger?.currency ?? "n/a"}</div>
          </div>
        </div>
        ${renderLedgerUnits(props.ledger)}
      </div>
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Resources</div>
          <div class="card-sub">Published market resources and pricing details.</div>
        </div>
        <div class="row" style="gap: 6px;">
          ${RESOURCE_KINDS.map((entry) =>
            renderFilterButton(
              entry.key,
              entry.label,
              props.resourceKind,
              props.onResourceKindChange,
            ),
          )}
        </div>
      </div>
      ${
        filteredResources.length === 0
          ? html`
              <div class="muted" style="margin-top: 12px">No published resources yet.</div>
            `
          : html`
              <div class="table" style="margin-top: 16px;">
                <div class="table-head">
                  <div>Resource</div>
                  <div>Kind</div>
                  <div>Provider</div>
                  <div>Price</div>
                  <div>Status</div>
                  <div>Updated</div>
                </div>
                ${filteredResources.map((resource) => renderResourceRow(resource))}
              </div>
            `
      }
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Leases</div>
      <div class="card-sub">Active and recent leases (latest 50).</div>
      ${
        props.leases.length === 0
          ? html`
              <div class="muted" style="margin-top: 12px">No leases reported yet.</div>
            `
          : html`
              <div class="table" style="margin-top: 16px;">
                <div class="table-head">
                  <div>Lease</div>
                  <div>Resource</div>
                  <div>Consumer</div>
                  <div>Status</div>
                  <div>Issued</div>
                  <div>Expires</div>
                </div>
                ${props.leases.map((lease) => renderLeaseRow(lease))}
              </div>
            `
      }
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Disputes</div>
      <div class="card-sub">Open and resolved disputes (latest 50).</div>
      ${
        props.disputes.length === 0
          ? html`
              <div class="muted" style="margin-top: 12px">No disputes reported yet.</div>
            `
          : html`
              <div class="table" style="margin-top: 16px;">
                <div class="table-head">
                  <div>Dispute</div>
                  <div>Order</div>
                  <div>Initiator</div>
                  <div>Reason</div>
                  <div>Status</div>
                  <div>Opened</div>
                </div>
                ${props.disputes.map((dispute) => renderDisputeRow(dispute))}
              </div>
            `
      }
    </section>
  `;
}

function renderFilterButton(
  key: MarketProps["resourceKind"],
  label: string,
  active: MarketProps["resourceKind"],
  onChange: MarketProps["onResourceKindChange"],
) {
  const isActive = key === active;
  return html`
    <button class="btn btn--sm ${isActive ? "primary" : ""}" @click=${() => onChange(key)}>
      ${label}
    </button>
  `;
}

function renderStatusPills(statuses: Record<string, number>) {
  const entries = Object.entries(statuses);
  if (entries.length === 0) {
    return html`
      <div class="muted" style="margin-top: 6px">No status data</div>
    `;
  }
  return html`
    <div class="row" style="gap: 6px; flex-wrap: wrap; margin-top: 8px;">
      ${entries.map(([status, count]) => {
        const tone = resolveStatusTone(status);
        return html`<span class="pill pill--sm ${tone}">${status} · ${count}</span>`;
      })}
    </div>
  `;
}

function renderResourceRow(resource: MarketResource) {
  return html`
    <div class="table-row">
      <div class="mono">${clampText(resource.resourceId, 16)}</div>
      <div><span class="chip">${resource.kind}</span></div>
      <div class="mono">${clampText(resource.providerActorId, 16)}</div>
      <div>${resource.price.amount} ${resource.price.unit}</div>
      <div>${renderStatusBadge(resource.status)}</div>
      <div>${formatIsoRelative(resource.updatedAt)}</div>
    </div>
  `;
}

function renderLeaseRow(lease: MarketLease) {
  return html`
    <div class="table-row">
      <div class="mono">${clampText(lease.leaseId, 14)}</div>
      <div class="mono">${clampText(lease.resourceId, 14)}</div>
      <div class="mono">${clampText(lease.consumerActorId, 14)}</div>
      <div>${renderStatusBadge(lease.status)}</div>
      <div>${formatIsoRelative(lease.issuedAt)}</div>
      <div>${formatIsoRelative(lease.expiresAt)}</div>
    </div>
  `;
}

function renderDisputeRow(dispute: MarketDispute) {
  return html`
    <div class="table-row">
      <div class="mono">${clampText(dispute.disputeId, 14)}</div>
      <div class="mono">${clampText(dispute.orderId, 14)}</div>
      <div class="mono">${clampText(dispute.initiatorActorId, 14)}</div>
      <div>${clampText(dispute.reason, 42)}</div>
      <div>${renderStatusBadge(dispute.status)}</div>
      <div>${formatIsoRelative(dispute.openedAt)}</div>
    </div>
  `;
}

function renderLedgerUnits(summary: MarketLedgerSummary | null) {
  const units = summary?.byUnit ? Object.entries(summary.byUnit) : [];
  if (units.length === 0) {
    return html`
      <div class="muted" style="margin-top: 12px">No ledger entries yet.</div>
    `;
  }
  return html`
    <div class="grid grid-cols-2" style="margin-top: 16px;">
      ${units.map(
        ([unit, data]) => html`
        <div class="card" style="padding: 12px;">
          <div class="card-title" style="font-size: 13px;">${unit}</div>
          <div class="stat-value" style="margin-top: 6px;">${data.quantity}</div>
          <div class="muted">Cost ${data.cost}</div>
        </div>
      `,
      )}
    </div>
  `;
}

function renderStatusBadge(status: string) {
  const tone = resolveStatusTone(status);
  return html`<span class="pill pill--sm ${tone}">${status}</span>`;
}

function resolveStatusTone(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes("failed") || lower.includes("rejected") || lower.includes("revoked")) {
    return "pill--danger";
  }
  if (lower.includes("pending") || lower.includes("open") || lower.includes("evidence")) {
    return "pill--warn";
  }
  return "pill--ok";
}

function formatIsoRelative(value?: string) {
  if (!value) {
    return "n/a";
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return formatRelativeTimestamp(parsed);
}

function countByStatus<T extends { status: string }>(items: T[]): Record<string, number> {
  return items.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}
