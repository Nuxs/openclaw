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
import {
  renderMarketExecutionSection,
  type MarketExecutionSectionProps,
} from "./market-execution-section.ts";
import { renderOpsSection, type OpsSectionProps } from "./market-ops-section.ts";
import { renderPrivacySection, type PrivacySectionProps } from "./market-privacy-section.ts";
import {
  renderMarketProviderOnboardingSection,
  type MarketProviderOnboardingSectionProps,
} from "./market-provider-onboarding-section.ts";
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
  executionSection?: MarketExecutionSectionProps;
  taskSection?: TaskSectionProps;
  privacySection?: PrivacySectionProps;
  opsSection?: OpsSectionProps;
  providerOnboardingSection?: MarketProviderOnboardingSectionProps;
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
  const filters = props.filters;
  const lastSuccessLabel = props.lastSuccessAt
    ? formatRelativeTimestamp(props.lastSuccessAt)
    : "n/a";
  const activeAlerts = metrics?.alerts.filter((alert) => alert.triggered) ?? [];

  const filteredResources = sortResources(
    props.resources
      .filter((resource) => props.resourceKind === "all" || resource.kind === props.resourceKind)
      .filter(
        (resource) =>
          filters.resourceStatus === "all" || resource.status === filters.resourceStatus,
      )
      .filter((resource) =>
        matchesText(filters.resourceSearch, [
          resource.resourceId,
          resource.label,
          resource.providerActorId,
          resource.offerId,
          resource.kind,
          ...(resource.tags ?? []),
        ]),
      ),
    filters.resourceSort,
  );

  const filteredLeases = sortLeases(
    props.leases
      .filter((lease) => filters.leaseStatus === "all" || lease.status === filters.leaseStatus)
      .filter((lease) =>
        matchesText(filters.leaseSearch, [
          lease.leaseId,
          lease.resourceId,
          lease.consumerActorId,
          lease.providerActorId,
          lease.orderId,
          lease.status,
        ]),
      ),
    filters.leaseSort,
  );

  const filteredDisputes = sortDisputes(
    props.disputes
      .filter(
        (dispute) => filters.disputeStatus === "all" || dispute.status === filters.disputeStatus,
      )
      .filter((dispute) =>
        matchesText(filters.disputeSearch, [
          dispute.disputeId,
          dispute.orderId,
          dispute.initiatorActorId,
          dispute.respondentActorId,
          dispute.reason,
          dispute.status,
        ]),
      ),
    filters.disputeSort,
  );

  const filteredLedgerEntries = sortLedgerEntries(
    props.ledgerEntries
      .filter((entry) => filters.ledgerUnit === "all" || entry.unit === filters.ledgerUnit)
      .filter((entry) =>
        matchesText(filters.ledgerSearch, [
          entry.ledgerId,
          entry.leaseId,
          entry.resourceId,
          entry.providerActorId,
          entry.consumerActorId,
          entry.sessionId,
          entry.runId,
          entry.entryHash,
        ]),
      ),
    filters.ledgerSort,
  );

  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">Market Overview</div>
            <div class="card-sub">Key totals and live status distributions for market activity.</div>
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
            ${renderStatusPills(status?.offers)}
          </div>
          <div class="stat">
            <div class="stat-label">Orders</div>
            <div class="stat-value">${status?.totals.orders ?? 0}</div>
            ${renderStatusPills(status?.orders)}
          </div>
          <div class="stat">
            <div class="stat-label">Deliveries</div>
            <div class="stat-value">${status?.totals.deliveries ?? 0}</div>
            ${renderStatusPills(status?.deliveries)}
          </div>
          <div class="stat">
            <div class="stat-label">Settlements</div>
            <div class="stat-value">${status?.totals.settlements ?? 0}</div>
            ${renderStatusPills(status?.settlements)}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Activity Health</div>
        <div class="card-sub">Alerts, lease posture, dispute queue, and billing totals.</div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">Active alerts</div>
            <div class="stat-value">${activeAlerts.length}</div>
            ${renderAlertPreview(activeAlerts)}
          </div>
          <div class="stat">
            <div class="stat-label">Leases</div>
            <div class="stat-value">${status?.leases.total ?? props.leases.length}</div>
            <div class="stat-sub">
              Active ${status?.leases.active ?? 0} · Expired ${status?.leases.expired ?? 0} · Revoked ${status?.leases.revoked ?? 0}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">Disputes</div>
            <div class="stat-value">${status?.disputes.total ?? props.disputes.length}</div>
            <div class="stat-sub">
              Open ${status?.disputes.open ?? 0} · Resolved ${status?.disputes.resolved ?? 0} · Rejected ${status?.disputes.rejected ?? 0}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">Ledger total</div>
            <div class="stat-value">${formatLedgerTotal(props.ledger)}</div>
            <div class="stat-sub">${formatLedgerUnits(props.ledger)}</div>
          </div>
        </div>
      </div>
    </section>

    ${
      props.providerOnboardingSection
        ? renderMarketProviderOnboardingSection(props.providerOnboardingSection)
        : nothing
    }

    ${props.executionSection ? renderMarketExecutionSection(props.executionSection) : nothing}

    <section class="grid grid-cols-2" style="margin-top: 16px;">
      ${renderIndexOverview({
        loading: props.loading,
        indexEntries: props.indexEntries,
        indexStats: props.indexStats,
      })}
      ${renderMonitorOverview({ loading: props.loading, monitor: props.monitor })}
    </section>

    <section class="grid grid-cols-2" style="margin-top: 16px;">
      ${renderResourceCard(props, filteredResources)}
      ${renderLeaseCard(props, filteredLeases)}
    </section>

    <section class="grid grid-cols-2" style="margin-top: 16px;">
      ${renderDisputeCard(props, filteredDisputes)}
      ${renderLedgerCard(props, filteredLedgerEntries)}
    </section>

    <section class="grid grid-cols-2" style="margin-top: 16px;">
      ${renderReputationCard(props.reputation, props.loading)}
      ${renderTokenEconomyCard(props.tokenEconomy, props.loading)}
    </section>

    <section class="grid grid-cols-2" style="margin-top: 16px;">
      ${renderBridgeRoutesCard(props.bridgeRoutes, props.loading)}
      ${renderBridgeTransfersCard(props.bridgeTransfers, props.loading)}
    </section>

    ${props.taskSection ? renderTaskSection(props.taskSection) : nothing}
    ${props.privacySection ? renderPrivacySection(props.privacySection) : nothing}
    ${props.opsSection ? renderOpsSection(props.opsSection) : nothing}
  `;
}

function renderStatusPills(summary?: Record<string, number> | null) {
  const entries = Object.entries(summary ?? {}).filter(([, value]) => value > 0);
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
      ${alerts
        .slice(0, 3)
        .map(
          (alert) =>
            html`<span class="pill">${alert.severity.toUpperCase()} · ${alert.rule}</span>`,
        )}
    </div>
  `;
}

function renderResourceCard(props: MarketProps, resources: MarketResource[]) {
  const emptyLabel =
    props.resources.length === 0
      ? "No resources published yet."
      : "No resources match current filters.";

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
            @change=${(event: Event) =>
              props.onResourceKindChange(
                (event.target as HTMLSelectElement).value as MarketProps["resourceKind"],
              )}
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
                      <span>${clampText(resource.providerActorId, 32)}</span>
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

function renderLeaseCard(props: MarketProps, leases: MarketLease[]) {
  const emptyLabel =
    props.leases.length === 0 ? "No leases yet." : "No leases match current filters.";

  return html`
    <div class="card card--stretch">
      <div class="card-title">Leases</div>
      <div class="card-sub">Consumer/provider bindings with status and window metadata.</div>
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
                      <span>${clampText(lease.consumerActorId, 24)}</span>
                      <span>${clampText(lease.providerActorId, 24)}</span>
                      <span>${formatIsoRelative(lease.issuedAt)} → ${formatIsoRelative(lease.expiresAt)}</span>
                    </div>
                  </article>
                `,
              )
        }
      </div>
    </div>
  `;
}

function renderDisputeCard(props: MarketProps, disputes: MarketDispute[]) {
  const emptyLabel =
    props.disputes.length === 0 ? "No disputes recorded." : "No disputes match current filters.";

  return html`
    <div class="card card--stretch">
      <div class="card-title">Disputes</div>
      <div class="card-sub">Arbitration queue and respondent posture.</div>
      <div class="filters filters--four" style="margin-top: 16px;">
        <label class="field">
          <span class="field__label">Search</span>
          <input
            type="search"
            placeholder="Dispute, order, or actor"
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
                        <div class="muted">${dispute.orderId}</div>
                      </div>
                      <span class="pill">${dispute.status}</span>
                    </div>
                    <div class="list-item__meta">
                      <span>${clampText(dispute.initiatorActorId, 24)}</span>
                      <span>${clampText(dispute.respondentActorId, 24)}</span>
                      <span>${formatIsoRelative(dispute.openedAt)}</span>
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

function renderLedgerCard(props: MarketProps, entries: MarketLedgerEntry[]) {
  const emptyLabel =
    props.ledgerEntries.length === 0
      ? "No ledger entries yet."
      : "No ledger entries match current filters.";

  return html`
    <div class="card card--stretch">
      <div class="card-title">Ledger</div>
      <div class="card-sub">Recent billing and settlement events.</div>
      <div class="filters filters--four" style="margin-top: 16px;">
        <label class="field">
          <span class="field__label">Search</span>
          <input
            type="search"
            placeholder="Ledger, lease, resource, or run"
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
          <div class="field__value">${entries.length}</div>
        </div>
      </div>
      <div class="list list--dense" style="margin-top: 16px;">
        ${
          entries.length === 0
            ? html`<div class="muted">${emptyLabel}</div>`
            : entries.slice(0, 12).map(
                (entry) => html`
                  <article class="list-item list-item--stacked">
                    <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
                      <div>
                        <div class="list-item__title">${entry.ledgerId}</div>
                        <div class="muted">${entry.leaseId ?? entry.resourceId ?? entry.runId ?? "n/a"}</div>
                      </div>
                      <span class="pill">${entry.unit}</span>
                    </div>
                    <div class="list-item__meta">
                      <span>${entry.quantity}</span>
                      <span>${entry.cost} ${entry.currency}</span>
                      <span>${formatIsoRelative(entry.timestamp)}</span>
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
  return copy.toSorted((a, b) =>
    mode === "updated_asc"
      ? compareValues(a.updatedAt, b.updatedAt)
      : compareValues(b.updatedAt, a.updatedAt),
  );
}

function sortLeases(leases: MarketLease[], mode: MarketFilters["leaseSort"]) {
  const copy = [...leases];
  return copy.toSorted((a, b) =>
    mode === "issued_asc"
      ? compareValues(a.issuedAt, b.issuedAt)
      : compareValues(b.issuedAt, a.issuedAt),
  );
}

function sortDisputes(disputes: MarketDispute[], mode: MarketFilters["disputeSort"]) {
  const copy = [...disputes];
  return copy.toSorted((a, b) =>
    mode === "opened_asc"
      ? compareValues(a.openedAt, b.openedAt)
      : compareValues(b.openedAt, a.openedAt),
  );
}

function sortLedgerEntries(entries: MarketLedgerEntry[], mode: MarketFilters["ledgerSort"]) {
  const copy = [...entries];
  return copy.toSorted((a, b) =>
    mode === "time_asc"
      ? compareValues(a.timestamp, b.timestamp)
      : compareValues(b.timestamp, a.timestamp),
  );
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

function formatStatusLabel(label: string) {
  return clampText(label.replaceAll("_", " "), 24);
}

function formatPrice(price: MarketResource["price"]) {
  return `${price.amount} ${price.currency} / ${price.unit}`;
}

function formatIsoRelative(value?: string) {
  if (!value) {
    return "n/a";
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : formatRelativeTimestamp(parsed);
}

function formatLedgerTotal(summary: MarketLedgerSummary | null) {
  if (!summary) {
    return "n/a";
  }
  return `${summary.totalCost} ${summary.currency}`;
}

function formatLedgerUnits(summary: MarketLedgerSummary | null) {
  if (!summary) {
    return "No ledger summary";
  }
  const units = Object.keys(summary.byUnit);
  return units.length > 0 ? `Units: ${units.join(", ")}` : "No unit totals";
}
