import { html, nothing } from "lit";
import { clampText, formatRelativeTimestamp } from "../format.ts";
import type {
  MarketAlert,
  MarketDispute,
  MarketFilters,
  MarketLedgerEntry,
  MarketLedgerSummary,
  MarketLease,
  MarketMetricsSnapshot,
  MarketResource,
  MarketResourceKind,
  MarketStatusSummary,
  Web3IndexEntry,
  Web3IndexStats,
  Web3MonitorSnapshot,
} from "../types.ts";
import { renderIndexOverview, renderMonitorOverview } from "./market-sections.ts";

type MarketProps = {
  loading: boolean;
  error: string | null;
  lastSuccessAt: number | null;
  status: MarketStatusSummary | null;
  metrics: MarketMetricsSnapshot | null;
  indexEntries: Web3IndexEntry[];
  indexStats: Web3IndexStats | null;
  monitor: Web3MonitorSnapshot | null;
  resources: MarketResource[];
  leases: MarketLease[];
  ledger: MarketLedgerSummary | null;
  ledgerEntries: MarketLedgerEntry[];
  disputes: MarketDispute[];
  resourceKind: MarketResourceKind | "all";
  filters: MarketFilters;
  onResourceKindChange: (next: MarketResourceKind | "all") => void;
  onFiltersChange: (next: MarketFilters) => void;
  onRefresh: () => void;
};

const RESOURCE_KINDS: Array<{ key: MarketProps["resourceKind"]; label: string }> = [
  { key: "all", label: "All" },
  { key: "model", label: "Model" },
  { key: "search", label: "Search" },
  { key: "storage", label: "Storage" },
];

const RESOURCE_STATUS_OPTIONS: Array<{
  value: MarketFilters["resourceStatus"];
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "resource_published", label: "Published" },
  { value: "resource_draft", label: "Draft" },
  { value: "resource_unpublished", label: "Unpublished" },
];

const LEASE_STATUS_OPTIONS: Array<{ value: MarketFilters["leaseStatus"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "lease_active", label: "Active" },
  { value: "lease_expired", label: "Expired" },
  { value: "lease_revoked", label: "Revoked" },
];

const DISPUTE_STATUS_OPTIONS: Array<{ value: MarketFilters["disputeStatus"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "dispute_opened", label: "Opened" },
  { value: "dispute_evidence_submitted", label: "Evidence" },
  { value: "dispute_resolved", label: "Resolved" },
  { value: "dispute_rejected", label: "Rejected" },
];

const LEDGER_UNIT_OPTIONS: Array<{ value: MarketFilters["ledgerUnit"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "token", label: "Token" },
  { value: "call", label: "Call" },
  { value: "query", label: "Query" },
  { value: "byte", label: "Byte" },
];

export function renderMarket(props: MarketProps) {
  const status = props.status;
  const metrics = props.metrics;
  const activeAlerts = metrics?.alerts.filter((alert) => alert.triggered) ?? [];
  const disputesByStatus = countByStatus(props.disputes);
  const totalDisputes = props.disputes.length;
  const activeLeases = props.leases.filter((lease) => lease.status === "lease_active").length;
  const expiredLeases = props.leases.filter((lease) => lease.status === "lease_expired").length;
  const revokedLeases = props.leases.filter((lease) => lease.status === "lease_revoked").length;
  const lastSuccessLabel = props.lastSuccessAt
    ? formatRelativeTimestamp(props.lastSuccessAt)
    : "n/a";
  const filters = props.filters;
  const ledgerEntriesByFilter = props.ledgerEntries.filter((entry) => {
    if (filters.ledgerUnit !== "all" && entry.unit !== filters.ledgerUnit) {
      return false;
    }
    return matchesText(filters.ledgerSearch, [
      entry.leaseId,
      entry.resourceId,
      entry.sessionId,
      entry.runId,
    ]);
  });
  const sortedLedgerEntries = sortByTime(
    ledgerEntriesByFilter,
    (entry) => entry.timestamp,
    filters.ledgerSort === "time_desc" ? "desc" : "asc",
  );
  const ledgerEntryCount = sortedLedgerEntries.length;
  const ledgerPreview = sortedLedgerEntries.slice(0, 12);

  const resourcesByKind =
    props.resourceKind === "all"
      ? props.resources
      : props.resources.filter((resource) => resource.kind === props.resourceKind);
  const resourcesByStatus =
    filters.resourceStatus === "all"
      ? resourcesByKind
      : resourcesByKind.filter((resource) => resource.status === filters.resourceStatus);
  const filteredResources = resourcesByStatus.filter((resource) =>
    matchesText(filters.resourceSearch, [
      resource.resourceId,
      resource.label,
      resource.providerActorId,
      resource.tags?.join(" "),
    ]),
  );
  const sortedResources = sortByTime(
    filteredResources,
    (resource) => resource.updatedAt,
    filters.resourceSort === "updated_desc" ? "desc" : "asc",
  );

  const leasesByStatus =
    filters.leaseStatus === "all"
      ? props.leases
      : props.leases.filter((lease) => lease.status === filters.leaseStatus);
  const filteredLeases = leasesByStatus.filter((lease) =>
    matchesText(filters.leaseSearch, [
      lease.leaseId,
      lease.resourceId,
      lease.consumerActorId,
      lease.providerActorId,
      lease.orderId,
    ]),
  );
  const sortedLeases = sortByTime(
    filteredLeases,
    (lease) => lease.issuedAt,
    filters.leaseSort === "issued_desc" ? "desc" : "asc",
  );

  const disputesByStatusFilter =
    filters.disputeStatus === "all"
      ? props.disputes
      : props.disputes.filter((dispute) => dispute.status === filters.disputeStatus);
  const filteredDisputes = disputesByStatusFilter.filter((dispute) =>
    matchesText(filters.disputeSearch, [
      dispute.disputeId,
      dispute.orderId,
      dispute.initiatorActorId,
      dispute.respondentActorId,
      dispute.reason,
    ]),
  );
  const sortedDisputes = sortByTime(
    filteredDisputes,
    (dispute) => dispute.openedAt,
    filters.disputeSort === "opened_desc" ? "desc" : "asc",
  );

  const resourceEmptyLabel =
    props.resources.length === 0
      ? "No resources reported yet."
      : "No resources match current filters.";
  const leaseEmptyLabel =
    props.leases.length === 0 ? "No leases reported yet." : "No leases match current filters.";
  const disputeEmptyLabel =
    props.disputes.length === 0
      ? "No disputes reported yet."
      : "No disputes match current filters.";
  const ledgerEmptyLabel =
    props.ledgerEntries.length === 0
      ? "No ledger entries yet."
      : "No ledger entries match current filters.";

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
            <div class="stat-label">Deliveries</div>
            <div class="stat-value">${status?.totals.deliveries ?? 0}</div>
            ${renderStatusPills(status?.deliveries ?? {})}
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

    <section class="grid grid-cols-2" style="margin-top: 18px;">
      <div class="card">
        <div class="card-title">Market Signals</div>
        <div class="card-sub">Key metrics from the latest market snapshot.</div>
        ${renderMetricsSnapshot(metrics)}
      </div>
      <div class="card">
        <div class="card-title">Alerts</div>
        <div class="card-sub">Triggered rules that need attention.</div>
        ${renderAlerts(activeAlerts, metrics?.alerts ?? [])}
      </div>
    </section>

    <section class="grid grid-cols-2" style="margin-top: 18px;">
      ${renderIndexOverview({
        loading: props.loading,
        indexEntries: props.indexEntries,
        indexStats: props.indexStats,
      })}
      ${renderMonitorOverview({
        loading: props.loading,
        monitor: props.monitor,
      })}
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Ledger Entries</div>
          <div class="card-sub">Latest usage charges and consumption (latest 50).</div>
        </div>
        <div class="muted">${ledgerEntryCount} entries</div>
      </div>
      <div class="filters" style="margin-top: 12px;">
        <label class="field" style="flex: 1; min-width: 220px;">
          <span>Search</span>
          <input
            .value=${filters.ledgerSearch}
            placeholder="Lease, resource, session, run"
            @input=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                ledgerSearch: (e.target as HTMLInputElement).value,
              })}
          />
        </label>
        <label class="field">
          <span>Unit</span>
          <select
            .value=${filters.ledgerUnit}
            @change=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                ledgerUnit: (e.target as HTMLSelectElement).value as MarketFilters["ledgerUnit"],
              })}
          >
            ${LEDGER_UNIT_OPTIONS.map(
              (option) => html`<option value=${option.value}>${option.label}</option>`,
            )}
          </select>
        </label>
        <label class="field">
          <span>Sort</span>
          <select
            .value=${filters.ledgerSort}
            @change=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                ledgerSort: (e.target as HTMLSelectElement).value as MarketFilters["ledgerSort"],
              })}
          >
            <option value="time_desc">Newest</option>
            <option value="time_asc">Oldest</option>
          </select>
        </label>
      </div>
      ${
        ledgerEntryCount === 0
          ? renderEmptyState(props.loading, ledgerEmptyLabel, "Loading ledger entries…")
          : html`
              <div class="table" style="margin-top: 16px;">
                <div class="table-head">
                  <div>Time</div>
                  <div>Lease</div>
                  <div>Resource</div>
                  <div>Unit</div>
                  <div>Quantity</div>
                  <div>Cost</div>
                </div>
                ${ledgerPreview.map((entry) => renderLedgerEntryRow(entry))}
              </div>
              ${
                ledgerEntryCount > ledgerPreview.length
                  ? html`
                      <div class="muted" style="margin-top: 12px;">
                        Showing ${ledgerPreview.length} of ${ledgerEntryCount} entries.
                      </div>
                    `
                  : nothing
              }
            `
      }
      ${renderFilterSummary(ledgerEntryCount, props.ledgerEntries.length)}
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
      <div class="filters" style="margin-top: 12px;">
        <label class="field" style="flex: 1; min-width: 220px;">
          <span>Search</span>
          <input
            .value=${filters.resourceSearch}
            placeholder="Resource ID, label, provider"
            @input=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                resourceSearch: (e.target as HTMLInputElement).value,
              })}
          />
        </label>
        <label class="field">
          <span>Status</span>
          <select
            .value=${filters.resourceStatus}
            @change=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                resourceStatus: (e.target as HTMLSelectElement)
                  .value as MarketFilters["resourceStatus"],
              })}
          >
            ${RESOURCE_STATUS_OPTIONS.map(
              (option) => html`<option value=${option.value}>${option.label}</option>`,
            )}
          </select>
        </label>
        <label class="field">
          <span>Sort</span>
          <select
            .value=${filters.resourceSort}
            @change=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                resourceSort: (e.target as HTMLSelectElement)
                  .value as MarketFilters["resourceSort"],
              })}
          >
            <option value="updated_desc">Updated (newest)</option>
            <option value="updated_asc">Updated (oldest)</option>
          </select>
        </label>
      </div>
      ${
        sortedResources.length === 0
          ? renderEmptyState(props.loading, resourceEmptyLabel, "Loading resources…")
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
                ${sortedResources.map((resource) => renderResourceRow(resource))}
              </div>
            `
      }
      ${renderFilterSummary(sortedResources.length, props.resources.length)}
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Leases</div>
      <div class="card-sub">Active and recent leases (latest 50).</div>
      <div class="filters" style="margin-top: 12px;">
        <label class="field" style="flex: 1; min-width: 220px;">
          <span>Search</span>
          <input
            .value=${filters.leaseSearch}
            placeholder="Lease, resource, consumer"
            @input=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                leaseSearch: (e.target as HTMLInputElement).value,
              })}
          />
        </label>
        <label class="field">
          <span>Status</span>
          <select
            .value=${filters.leaseStatus}
            @change=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                leaseStatus: (e.target as HTMLSelectElement).value as MarketFilters["leaseStatus"],
              })}
          >
            ${LEASE_STATUS_OPTIONS.map(
              (option) => html`<option value=${option.value}>${option.label}</option>`,
            )}
          </select>
        </label>
        <label class="field">
          <span>Sort</span>
          <select
            .value=${filters.leaseSort}
            @change=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                leaseSort: (e.target as HTMLSelectElement).value as MarketFilters["leaseSort"],
              })}
          >
            <option value="issued_desc">Issued (newest)</option>
            <option value="issued_asc">Issued (oldest)</option>
          </select>
        </label>
      </div>
      ${
        sortedLeases.length === 0
          ? renderEmptyState(props.loading, leaseEmptyLabel, "Loading leases…")
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
                ${sortedLeases.map((lease) => renderLeaseRow(lease))}
              </div>
            `
      }
      ${renderFilterSummary(sortedLeases.length, props.leases.length)}
    </section>

    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Disputes</div>
      <div class="card-sub">Open and resolved disputes (latest 50).</div>
      <div class="filters" style="margin-top: 12px;">
        <label class="field" style="flex: 1; min-width: 220px;">
          <span>Search</span>
          <input
            .value=${filters.disputeSearch}
            placeholder="Dispute, order, initiator"
            @input=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                disputeSearch: (e.target as HTMLInputElement).value,
              })}
          />
        </label>
        <label class="field">
          <span>Status</span>
          <select
            .value=${filters.disputeStatus}
            @change=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                disputeStatus: (e.target as HTMLSelectElement)
                  .value as MarketFilters["disputeStatus"],
              })}
          >
            ${DISPUTE_STATUS_OPTIONS.map(
              (option) => html`<option value=${option.value}>${option.label}</option>`,
            )}
          </select>
        </label>
        <label class="field">
          <span>Sort</span>
          <select
            .value=${filters.disputeSort}
            @change=${(e: Event) =>
              props.onFiltersChange({
                ...filters,
                disputeSort: (e.target as HTMLSelectElement).value as MarketFilters["disputeSort"],
              })}
          >
            <option value="opened_desc">Opened (newest)</option>
            <option value="opened_asc">Opened (oldest)</option>
          </select>
        </label>
      </div>
      ${
        sortedDisputes.length === 0
          ? renderEmptyState(props.loading, disputeEmptyLabel, "Loading disputes…")
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
                ${sortedDisputes.map((dispute) => renderDisputeRow(dispute))}
              </div>
            `
      }
      ${renderFilterSummary(sortedDisputes.length, props.disputes.length)}
    </section>
  `;
}

function matchesText(query: string, values: Array<string | undefined | null>) {
  if (!query) {
    return true;
  }
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return values.some((value) =>
    typeof value === "string" ? value.toLowerCase().includes(normalized) : false,
  );
}

function sortByTime<T>(
  items: T[],
  getValue: (item: T) => string | undefined,
  direction: "asc" | "desc",
) {
  return items.toSorted((a, b) => {
    const aTime = parseTimestamp(getValue(a));
    const bTime = parseTimestamp(getValue(b));
    if (direction === "desc") {
      return bTime - aTime;
    }
    return aTime - bTime;
  });
}

function parseTimestamp(value?: string) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

function renderFilterSummary(current: number, total: number) {
  if (total === 0 || current === total) {
    return nothing;
  }
  return html`
    <div class="muted" style="margin-top: 12px;">Showing ${current} of ${total} items.</div>
  `;
}

function renderEmptyState(loading: boolean, emptyLabel: string, loadingLabel: string) {
  return html`
    <div class="muted" style="margin-top: 12px;">
      ${loading ? loadingLabel : emptyLabel}
    </div>
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

function renderMetricsSnapshot(metrics: MarketMetricsSnapshot | null) {
  if (!metrics) {
    return html`
      <div class="muted" style="margin-top: 12px">No metrics snapshot yet.</div>
    `;
  }
  return html`
    <div class="stat-grid" style="margin-top: 16px;">
      <div class="stat">
        <div class="stat-label">Settlement failure rate</div>
        <div class="stat-value">${formatPercent(metrics.settlements.failureRate)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Pending anchors</div>
        <div class="stat-value">${metrics.audit.anchorPending}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Revocations pending</div>
        <div class="stat-value">${metrics.revocations.pending}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Revocations failed</div>
        <div class="stat-value">${metrics.revocations.failed}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Disputes open</div>
        <div class="stat-value">${metrics.disputes.open}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Active leases</div>
        <div class="stat-value">${metrics.leases.active}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Audit events</div>
        <div class="stat-value">${metrics.audit.events}</div>
      </div>
    </div>
  `;
}

function renderAlerts(activeAlerts: MarketAlert[], allAlerts: MarketAlert[]) {
  if (allAlerts.length === 0) {
    return html`
      <div class="muted" style="margin-top: 12px">No alert data available.</div>
    `;
  }
  if (activeAlerts.length === 0) {
    return html`
      <div class="callout success" style="margin-top: 12px">
        No active alerts. Market rules are within expected thresholds.
      </div>
    `;
  }
  return html`
    <div class="stack" style="margin-top: 12px;">
      ${activeAlerts.map((alert) => renderAlertRow(alert))}
    </div>
  `;
}

function renderAlertRow(alert: MarketAlert) {
  const tone = alert.severity === "p0" ? "pill--danger" : "pill--warn";
  return html`
    <div class="row" style="justify-content: space-between;">
      <div>
        <div class="card-title" style="font-size: 13px;">${formatAlertLabel(alert.rule)}</div>
        <div class="muted">Rule: ${alert.rule}</div>
      </div>
      <div class="row" style="gap: 8px;">
        <span class="pill pill--sm ${tone}">${alert.severity.toUpperCase()}</span>
        <span class="pill pill--sm">${formatAlertValue(alert)}</span>
      </div>
    </div>
  `;
}

function renderLedgerEntryRow(entry: MarketLedgerEntry) {
  return html`
    <div class="table-row">
      <div>${formatIsoRelative(entry.timestamp)}</div>
      <div class="mono">${clampText(entry.leaseId, 14)}</div>
      <div class="mono">${clampText(entry.resourceId, 14)}</div>
      <div>${entry.unit}</div>
      <div>${entry.quantity}</div>
      <div>${entry.cost} ${entry.currency}</div>
    </div>
  `;
}

function formatAlertLabel(rule: string) {
  switch (rule) {
    case "settlement_failure_rate":
      return "Settlement failure rate";
    case "anchor_pending":
      return "Anchors pending";
    case "dispute_unresolved_24h":
      return "Disputes unresolved (24h+)";
    case "revocation_failed":
      return "Revocations failed";
    case "revocation_pending":
      return "Revocations pending";
    default:
      return rule;
  }
}

function formatAlertValue(alert: MarketAlert) {
  if (alert.rule === "settlement_failure_rate") {
    return formatPercent(alert.value);
  }
  return String(alert.value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${(value * 100).toFixed(2)}%`;
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
