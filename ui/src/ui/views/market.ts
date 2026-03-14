import { html, nothing } from "lit";
import { clampText, formatRelativeTimestamp } from "../format.ts";
import type {
  BridgeRoutesSnapshot,
  BridgeTransfer,
  MarketAlert,
  MarketDispute,
  MarketFilters,
  MarketLedgerEntry,
  MarketLedgerSummary,
  MarketLease,
  MarketMetricsSnapshot,
  MarketReputationSummary,
  MarketResource,
  MarketResourceKind,
  MarketStatusSummary,
  TokenEconomyState,
  Web3IndexEntry,
  Web3IndexStats,
  Web3MonitorSnapshot,
} from "../types.ts";
import {
  renderBridgeRoutesCard,
  renderBridgeTransfersCard,
  renderReputationCard,
  renderTokenEconomyCard,
} from "./market-cards.ts";
import { renderOpsSection, type OpsSectionProps } from "./market-ops-section.ts";
import { renderPrivacySection, type PrivacySectionProps } from "./market-privacy-section.ts";
import { renderIndexOverview, renderMonitorOverview } from "./market-sections.ts";
import { renderTaskSection, type TaskSectionProps } from "./market-task-section.ts";

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
  reputation: MarketReputationSummary | null;
  tokenEconomy: TokenEconomyState | null;
  bridgeRoutes: BridgeRoutesSnapshot | null;
  bridgeTransfers: BridgeTransfer[];
  resourceKind: MarketResourceKind | "all";
  filters: MarketFilters;
  taskSection?: TaskSectionProps;
  privacySection?: PrivacySectionProps;
  opsSection?: OpsSectionProps;
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
      resource.providerLabel,
      resource.kind,
    ]),
  );
  const sortedResources = sortResources(filteredResources, filters.resourceSort);

  const leasesByStatus =
    filters.leaseStatus === "all"
      ? props.leases
      : props.leases.filter((lease) => lease.status === filters.leaseStatus);
  const filteredLeases = leasesByStatus.filter((lease) =>
    matchesText(filters.leaseSearch, [
      lease.leaseId,
      lease.resourceId,
      lease.consumerId,
      lease.providerId,
      lease.status,
    ]),
  );
  const sortedLeases = sortLeases(filteredLeases, filters.leaseSort);

  const disputesFiltered =
    filters.disputeStatus === "all"
      ? props.disputes
      : props.disputes.filter((dispute) => dispute.status === filters.disputeStatus);
  const filteredDisputes = disputesFiltered.filter((dispute) =>
    matchesText(filters.disputeSearch, [
      dispute.disputeId,
      dispute.leaseId,
      dispute.reason,
      dispute.status,
    ]),
  );
  const sortedDisputes = sortDisputes(filteredDisputes, filters.disputeSort);

  const resourceEmptyLabel =
    props.resources.length === 0
      ? "No resources published yet."
      : "No resources match current filters.";
  const leaseEmptyLabel =
    props.leases.length === 0 ? "No leases yet." : "No leases match current filters.";
  const disputeEmptyLabel =
    props.disputes.length === 0 ? "No disputes recorded." : "No disputes match current filters.";
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
            <div class="stat-value">${status?.totals?.offers ?? 0}</div>
            ${renderStatusPills(status?.offers ?? {})}
          </div>
          <div class="stat">
            <div class="stat-label">Orders</div>
            <div class="stat-value">${status?.totals?.orders ?? 0}</div>
            ${renderStatusPills(status?.orders ?? {})}
          </div>
          <div class="stat">
            <div class="stat-label">Leases</div>
            <div class="stat-value">${status?.totals?.leases ?? 0}</div>
            ${renderStatusPills(status?.leases ?? {})}
          </div>
          <div class="stat">
            <div class="stat-label">Ledger entries</div>
            <div class="stat-value">${status?.totals?.ledgerEntries ?? 0}</div>
            ${renderStatusPills(status?.ledger ?? {})}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Activity Health</div>
        <div class="card-sub">Current alerts, lease activity, and dispute distribution.</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">Active alerts</div>
            <div class="stat-value">${activeAlerts.length}</div>
            ${renderAlertPreview(activeAlerts)}
          </div>
          <div class="stat">
            <div class="stat-label">Active leases</div>
            <div class="stat-value">${activeLeases}</div>
            <div class="stat-sub">Expired ${expiredLeases} · Revoked ${revokedLeases}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Disputes</div>
            <div class="stat-value">${totalDisputes}</div>
            <div class="stat-sub">Open ${disputesByStatus.open} · Resolved ${disputesByStatus.resolved}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Settlement volume</div>
            <div class="stat-value">${props.ledger?.totals.entries ?? 0}</div>
            <div class="stat-sub">Credits ${props.ledger?.totals.credits ?? 0}</div>
          </div>
        </div>
      </div>
    </section>

    <section class="grid grid-cols-2" style="margin-top: 16px;">
      ${renderIndexOverview(props.indexStats, props.indexEntries)}
      ${renderMonitorOverview(props.monitor)}
    </section>

    <section class="grid grid-cols-2" style="margin-top: 16px;">
      ${renderResourceCard(props, sortedResources, resourceEmptyLabel)}
      ${renderLeaseCard(props, sortedLeases, leaseEmptyLabel)}
    </section>

    <section class="grid grid-cols-2" style="margin-top: 16px;">
      ${renderDisputeCard(props, sortedDisputes, disputeEmptyLabel)}
      ${renderLedgerCard(props, ledgerPreview, ledgerEntryCount, ledgerEmptyLabel)}
    </section>

    <section class="grid grid-cols-2" style="margin-top: 16px;">
      ${renderReputationCard(props.reputation)}
      ${renderTokenEconomyCard(props.tokenEconomy)}
    </section>

    <section class="grid grid-cols-2" style="margin-top: 16px;">
      ${renderBridgeRoutesCard(props.bridgeRoutes)}
      ${renderBridgeTransfersCard(props.bridgeTransfers)}
    </section>

    ${props.taskSection ? renderTaskSection(props.taskSection) : nothing}
    ${props.privacySection ? renderPrivacySection(props.privacySection) : nothing}
    ${props.opsSection ? renderOpsSection(props.opsSection) : nothing}
  `;
}

function renderStatusPills(summary: Record<string, number>) {
  const entries = Object.entries(summary).filter(([, value]) => value > 0);
  if (entries.length === 0) {
    return html`
      <div class="stat-sub">No activity</div>
    `;
  }
  return html`
    <div class="pill-row" style="margin-top: 10px;">
      ${entries.map(
        ([label, value]) => html`<span class="pill">${formatStatusLabel(label)} · ${value}</span>`,
      )}
    </div>
  `;
}

function renderAlertPreview(alerts: MarketAlert[]) {
  if (alerts.length === 0) {
    return html`
      <div class="stat-sub">No active alerts</div>
    `;
  }
  return html`
    <div class="pill-row" style="margin-top: 10px;">
      ${alerts.slice(0, 3).map((alert) => html`<span class="pill">${alert.level} · ${alert.name}</span>`)}
    </div>
  `;
}

function renderResourceCard(props: MarketProps, resources: MarketResource[], emptyLabel: string) {
  return html`
    <div class="card card--stretch">
      <div class="row" style="justify-content: space-between; align-items: flex-start; gap: 16px;">
        <div>
          <div class="card-title">Resources</div>
          <div class="card-sub">Published capacity, pricing, and provider metadata.</div>
        </div>
        <label class="field" style="min-width: 120px;">
          <span class="field__label">Kind</span>
          <select
            .value=${props.resourceKind}
            @change=${(event: Event) => {
              const value = (event.target as HTMLSelectElement)
                .value as MarketProps["resourceKind"];
              props.onResourceKindChange(value);
            }}
          >
            ${RESOURCE_KINDS.map(
              (option) => html`<option value=${option.key}>${option.label}</option>`,
            )}
          </select>
        </label>
      </div>
      <div class="filters filters--four" style="margin-top: 16px;">
        <label class="field">
          <span class="field__label">Search</span>
          <input
            type="search"
            placeholder="Resource, provider, or ID"
            .value=${props.filters.resourceSearch}
            @input=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                resourceSearch: (event.target as HTMLInputElement).value,
              })}
          />
        </label>
        <label class="field">
          <span class="field__label">Status</span>
          <select
            .value=${props.filters.resourceStatus}
            @change=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                resourceStatus: (event.target as HTMLSelectElement)
                  .value as MarketFilters["resourceStatus"],
              })}
          >
            ${RESOURCE_STATUS_OPTIONS.map(
              (option) => html`<option value=${option.value}>${option.label}</option>`,
            )}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Sort</span>
          <select
            .value=${props.filters.resourceSort}
            @change=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                resourceSort: (event.target as HTMLSelectElement)
                  .value as MarketFilters["resourceSort"],
              })}
          >
            <option value="updated_desc">Updated ↓</option>
            <option value="updated_asc">Updated ↑</option>
            <option value="price_desc">Price ↓</option>
            <option value="price_asc">Price ↑</option>
          </select>
        </label>
        <div class="field field--summary">
          <span class="field__label">Visible</span>
          <div class="field__value">${resources.length}</div>
        </div>
      </div>
      <div class="list list--dense" style="margin-top: 16px;">
        ${
          resources.length === 0
            ? html`<div class="muted">${emptyLabel}</div>`
            : resources.map(
                (resource) => html`
                <article class="list-item list-item--stacked">
                  <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                    <div>
                      <div class="list-item__title">${resource.label}</div>
                      <div class="muted">${resource.resourceId}</div>
                    </div>
                    <span class="pill">${resource.kind}</span>
                  </div>
                  <div class="list-item__meta">
                    <span>${resource.status}</span>
                    <span>${formatPrice(resource.price)}</span>
                    <span>${clampText(resource.providerLabel ?? resource.providerActorId ?? "unknown", 32)}</span>
                  </div>
                  ${
                    resource.description
                      ? html`<div class="list-item__body">${clampText(resource.description, 180)}</div>`
                      : nothing
                  }
                </article>
              `,
              )
        }
      </div>
    </div>
  `;
}

function renderLeaseCard(props: MarketProps, leases: MarketLease[], emptyLabel: string) {
  return html`
    <div class="card card--stretch">
      <div class="card-title">Leases</div>
      <div class="card-sub">Consumer/provider bindings with status, windows, and access posture.</div>
      <div class="filters filters--four" style="margin-top: 16px;">
        <label class="field">
          <span class="field__label">Search</span>
          <input
            type="search"
            placeholder="Lease, resource, or actor"
            .value=${props.filters.leaseSearch}
            @input=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                leaseSearch: (event.target as HTMLInputElement).value,
              })}
          />
        </label>
        <label class="field">
          <span class="field__label">Status</span>
          <select
            .value=${props.filters.leaseStatus}
            @change=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                leaseStatus: (event.target as HTMLSelectElement)
                  .value as MarketFilters["leaseStatus"],
              })}
          >
            ${LEASE_STATUS_OPTIONS.map(
              (option) => html`<option value=${option.value}>${option.label}</option>`,
            )}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Sort</span>
          <select
            .value=${props.filters.leaseSort}
            @change=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                leaseSort: (event.target as HTMLSelectElement).value as MarketFilters["leaseSort"],
              })}
          >
            <option value="issued_desc">Issued ↓</option>
            <option value="issued_asc">Issued ↑</option>
            <option value="expires_desc">Expires ↓</option>
            <option value="expires_asc">Expires ↑</option>
          </select>
        </label>
        <div class="field field--summary">
          <span class="field__label">Visible</span>
          <div class="field__value">${leases.length}</div>
        </div>
      </div>
      <div class="list list--dense" style="margin-top: 16px;">
        ${
          leases.length === 0
            ? html`<div class="muted">${emptyLabel}</div>`
            : leases.map(
                (lease) => html`
                <article class="list-item list-item--stacked">
                  <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                    <div>
                      <div class="list-item__title">${lease.leaseId}</div>
                      <div class="muted">${lease.resourceId}</div>
                    </div>
                    <span class="pill">${lease.status}</span>
                  </div>
                  <div class="list-item__meta">
                    <span>${lease.consumerId}</span>
                    <span>${lease.providerId}</span>
                    <span>${lease.unitPrice} / ${lease.unit}</span>
                  </div>
                </article>
              `,
              )
        }
      </div>
    </div>
  `;
}

function renderDisputeCard(props: MarketProps, disputes: MarketDispute[], emptyLabel: string) {
  return html`
    <div class="card card--stretch">
      <div class="card-title">Disputes</div>
      <div class="card-sub">Arbitration queue and evidence snapshots.</div>
      <div class="filters filters--four" style="margin-top: 16px;">
        <label class="field">
          <span class="field__label">Search</span>
          <input
            type="search"
            placeholder="Dispute, lease, or reason"
            .value=${props.filters.disputeSearch}
            @input=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                disputeSearch: (event.target as HTMLInputElement).value,
              })}
          />
        </label>
        <label class="field">
          <span class="field__label">Status</span>
          <select
            .value=${props.filters.disputeStatus}
            @change=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                disputeStatus: (event.target as HTMLSelectElement)
                  .value as MarketFilters["disputeStatus"],
              })}
          >
            ${DISPUTE_STATUS_OPTIONS.map(
              (option) => html`<option value=${option.value}>${option.label}</option>`,
            )}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Sort</span>
          <select
            .value=${props.filters.disputeSort}
            @change=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                disputeSort: (event.target as HTMLSelectElement)
                  .value as MarketFilters["disputeSort"],
              })}
          >
            <option value="opened_desc">Opened ↓</option>
            <option value="opened_asc">Opened ↑</option>
            <option value="updated_desc">Updated ↓</option>
            <option value="updated_asc">Updated ↑</option>
          </select>
        </label>
        <div class="field field--summary">
          <span class="field__label">Visible</span>
          <div class="field__value">${disputes.length}</div>
        </div>
      </div>
      <div class="list list--dense" style="margin-top: 16px;">
        ${
          disputes.length === 0
            ? html`<div class="muted">${emptyLabel}</div>`
            : disputes.map(
                (dispute) => html`
                <article class="list-item list-item--stacked">
                  <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                    <div>
                      <div class="list-item__title">${dispute.disputeId}</div>
                      <div class="muted">${dispute.leaseId}</div>
                    </div>
                    <span class="pill">${dispute.status}</span>
                  </div>
                  <div class="list-item__body">${clampText(dispute.reason, 220)}</div>
                </article>
              `,
              )
        }
      </div>
    </div>
  `;
}

function renderLedgerCard(
  props: MarketProps,
  ledgerEntries: MarketLedgerEntry[],
  ledgerEntryCount: number,
  emptyLabel: string,
) {
  return html`
    <div class="card card--stretch">
      <div class="card-title">Ledger</div>
      <div class="card-sub">Recent billing and settlement events.</div>
      <div class="filters filters--four" style="margin-top: 16px;">
        <label class="field">
          <span class="field__label">Search</span>
          <input
            type="search"
            placeholder="Lease, resource, or run"
            .value=${props.filters.ledgerSearch}
            @input=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                ledgerSearch: (event.target as HTMLInputElement).value,
              })}
          />
        </label>
        <label class="field">
          <span class="field__label">Unit</span>
          <select
            .value=${props.filters.ledgerUnit}
            @change=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                ledgerUnit: (event.target as HTMLSelectElement)
                  .value as MarketFilters["ledgerUnit"],
              })}
          >
            ${LEDGER_UNIT_OPTIONS.map(
              (option) => html`<option value=${option.value}>${option.label}</option>`,
            )}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Sort</span>
          <select
            .value=${props.filters.ledgerSort}
            @change=${(event: Event) =>
              props.onFiltersChange({
                ...props.filters,
                ledgerSort: (event.target as HTMLSelectElement)
                  .value as MarketFilters["ledgerSort"],
              })}
          >
            <option value="time_desc">Time ↓</option>
            <option value="time_asc">Time ↑</option>
          </select>
        </label>
        <div class="field field--summary">
          <span class="field__label">Visible</span>
          <div class="field__value">${ledgerEntryCount}</div>
        </div>
      </div>
      <div class="list list--dense" style="margin-top: 16px;">
        ${
          ledgerEntries.length === 0
            ? html`<div class="muted">${emptyLabel}</div>`
            : ledgerEntries.map(
                (entry) => html`
                <article class="list-item list-item--stacked">
                  <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                    <div>
                      <div class="list-item__title">${entry.entryId}</div>
                      <div class="muted">${entry.leaseId ?? entry.resourceId ?? entry.runId ?? "n/a"}</div>
                    </div>
                    <span class="pill">${entry.unit}</span>
                  </div>
                  <div class="list-item__meta">
                    <span>${entry.amount}</span>
                    <span>${entry.direction}</span>
                    <span>${entry.timestamp}</span>
                  </div>
                </article>
              `,
              )
        }
      </div>
    </div>
  `;
}

function sortResources(resources: MarketResource[], mode: MarketFilters["resourceSort"]) {
  const copy = [...resources];
  switch (mode) {
    case "updated_asc":
      return copy.toSorted((a, b) => compareValues(a.updatedAt, b.updatedAt));
    case "price_desc":
      return copy.toSorted((a, b) => compareValues(b.price?.value ?? 0, a.price?.value ?? 0));
    case "price_asc":
      return copy.toSorted((a, b) => compareValues(a.price?.value ?? 0, b.price?.value ?? 0));
    case "updated_desc":
    default:
      return copy.toSorted((a, b) => compareValues(b.updatedAt, a.updatedAt));
  }
}

function sortLeases(leases: MarketLease[], mode: MarketFilters["leaseSort"]) {
  const copy = [...leases];
  switch (mode) {
    case "issued_asc":
      return copy.toSorted((a, b) => compareValues(a.issuedAt, b.issuedAt));
    case "expires_desc":
      return copy.toSorted((a, b) => compareValues(b.expiresAt, a.expiresAt));
    case "expires_asc":
      return copy.toSorted((a, b) => compareValues(a.expiresAt, b.expiresAt));
    case "issued_desc":
    default:
      return copy.toSorted((a, b) => compareValues(b.issuedAt, a.issuedAt));
  }
}

function sortDisputes(disputes: MarketDispute[], mode: MarketFilters["disputeSort"]) {
  const copy = [...disputes];
  switch (mode) {
    case "opened_asc":
      return copy.toSorted((a, b) => compareValues(a.openedAt, b.openedAt));
    case "updated_desc":
      return copy.toSorted((a, b) =>
        compareValues(b.updatedAt ?? b.openedAt, a.updatedAt ?? a.openedAt),
      );
    case "updated_asc":
      return copy.toSorted((a, b) =>
        compareValues(a.updatedAt ?? a.openedAt, b.updatedAt ?? b.openedAt),
      );
    case "opened_desc":
    default:
      return copy.toSorted((a, b) => compareValues(b.openedAt, a.openedAt));
  }
}

function sortByTime<T>(
  entries: T[],
  pick: (entry: T) => string | number | null | undefined,
  direction: "asc" | "desc",
) {
  const copy = [...entries];
  copy.sort((a, b) => {
    const result = compareValues(pick(a), pick(b));
    return direction === "asc" ? result : -result;
  });
  return copy;
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
) {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function matchesText(search: string | undefined, values: Array<string | null | undefined>) {
  const needle = search?.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return values.some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(needle),
  );
}

function countByStatus(disputes: MarketDispute[]) {
  return disputes.reduce(
    (acc, dispute) => {
      if (dispute.status === "dispute_opened") {
        acc.open += 1;
      }
      if (dispute.status === "dispute_resolved") {
        acc.resolved += 1;
      }
      return acc;
    },
    { open: 0, resolved: 0 },
  );
}

function formatStatusLabel(label: string) {
  return clampText(label.replaceAll("_", " "), 24);
}

function formatPrice(price: MarketResource["price"]) {
  if (!price) {
    return "No price";
  }
  return `${price.value} ${price.currency} / ${price.unit}`;
}
