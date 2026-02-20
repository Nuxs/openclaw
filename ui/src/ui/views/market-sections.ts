import { html, nothing } from "lit";
import { clampText, formatRelativeTimestamp } from "../format.ts";
import type {
  MarketMetricsSnapshot,
  Web3Alert,
  Web3IndexEntry,
  Web3IndexStats,
  Web3MetricsSnapshot,
  Web3MonitorSnapshot,
} from "../types.ts";

type IndexOverviewProps = {
  loading: boolean;
  indexEntries: Web3IndexEntry[];
  indexStats: Web3IndexStats | null;
};

type MonitorOverviewProps = {
  loading: boolean;
  monitor: Web3MonitorSnapshot | null;
};

export function renderIndexOverview(props: IndexOverviewProps) {
  const entries = props.indexEntries.slice(0, 6);
  const stats = props.indexStats;
  const byKind = stats?.byKind ?? {};

  return html`
    <div class="card">
      <div class="card-title">Index Health</div>
      <div class="card-sub">Provider registry heartbeat and resource coverage.</div>
      ${
        stats
          ? html`
              <div class="stat-grid" style="margin-top: 16px;">
                <div class="stat">
                  <div class="stat-label">Providers</div>
                  <div class="stat-value">${stats.providers}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Resources</div>
                  <div class="stat-value">${stats.resources}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Models</div>
                  <div class="stat-value">${byKind.model ?? 0}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Search</div>
                  <div class="stat-value">${byKind.search ?? 0}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Storage</div>
                  <div class="stat-value">${byKind.storage ?? 0}</div>
                </div>
              </div>
            `
          : html`
              <div class="muted" style="margin-top: 12px">No index stats yet.</div>
            `
      }
      ${
        entries.length === 0
          ? renderEmptyState(props.loading, "No index entries yet.", "Loading index entries…")
          : html`
              <div class="table" style="margin-top: 16px;">
                <div class="table-head">
                  <div>Provider</div>
                  <div>Resources</div>
                  <div>Heartbeat</div>
                  <div>Updated</div>
                  <div>Expires</div>
                </div>
                ${entries.map((entry) => renderIndexEntryRow(entry))}
              </div>
              ${
                props.indexEntries.length > entries.length
                  ? html`
                      <div class="muted" style="margin-top: 12px;">
                        Showing ${entries.length} of ${props.indexEntries.length} providers.
                      </div>
                    `
                  : nothing
              }
            `
      }
    </div>
  `;
}

export function renderMonitorOverview(props: MonitorOverviewProps) {
  const web3 = props.monitor?.web3 ?? null;
  const market = props.monitor?.market ?? null;
  const marketError = props.monitor?.marketError ?? null;
  const activeWeb3Alerts = web3?.alerts.filter((alert) => alert.triggered) ?? [];

  return html`
    <div class="card">
      <div class="card-title">Web3 Monitor</div>
      <div class="card-sub">System health across web3 registry, anchoring, and billing.</div>
      ${renderWeb3Metrics(web3, props.loading)}
      ${renderWeb3Alerts(activeWeb3Alerts, web3?.alerts ?? [])}
      <div class="divider" style="margin: 16px 0;"></div>
      <div class="card-title" style="font-size: 14px;">Market Metrics</div>
      <div class="card-sub">Snapshot from the market authority layer.</div>
      ${
        marketError
          ? html`<div class="callout warn" style="margin-top: 12px;">
          Market metrics unavailable: ${marketError}
        </div>`
          : nothing
      }
      ${renderMarketMonitor(market, props.loading)}
    </div>
  `;
}

function renderIndexEntryRow(entry: Web3IndexEntry) {
  return html`
    <div class="table-row">
      <div class="mono">${clampText(entry.providerId, 16)}</div>
      <div>${entry.resources.length}</div>
      <div>${formatIsoRelative(entry.lastHeartbeatAt)}</div>
      <div>${formatIsoRelative(entry.updatedAt)}</div>
      <div>${formatIsoRelative(entry.expiresAt)}</div>
    </div>
  `;
}

function renderWeb3Metrics(snapshot: Web3MetricsSnapshot | null, loading: boolean) {
  if (!snapshot) {
    return renderEmptyState(loading, "No web3 metrics yet.", "Loading web3 metrics…");
  }
  return html`
    <div class="stat-grid" style="margin-top: 16px;">
      <div class="stat">
        <div class="stat-label">Audit events</div>
        <div class="stat-value">${snapshot.audit.total}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Anchors pending</div>
        <div class="stat-value">${snapshot.anchoring.pending}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Archive provider</div>
        <div class="stat-value">${snapshot.archive.provider ?? "n/a"}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Billing usage</div>
        <div class="stat-value">${snapshot.billing.creditsUsed}</div>
        <div class="muted">${snapshot.billing.usageRecords} records</div>
      </div>
      <div class="stat">
        <div class="stat-label">Settlement pending</div>
        <div class="stat-value">${snapshot.settlement.pending}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Resources</div>
        <div class="stat-value">${snapshot.resources.total}</div>
      </div>
    </div>
  `;
}

function renderWeb3Alerts(activeAlerts: Web3Alert[], allAlerts: Web3Alert[]) {
  if (allAlerts.length === 0) {
    return html`
      <div class="muted" style="margin-top: 12px">No alert data available.</div>
    `;
  }
  if (activeAlerts.length === 0) {
    return html`
      <div class="callout success" style="margin-top: 12px">
        No active alerts. Web3 systems are within expected thresholds.
      </div>
    `;
  }
  return html`
    <div class="stack" style="margin-top: 12px;">
      ${activeAlerts.map((alert) => renderWeb3AlertRow(alert))}
    </div>
  `;
}

function renderWeb3AlertRow(alert: Web3Alert) {
  const tone = alert.severity === "p0" ? "pill--danger" : "pill--warn";
  return html`
    <div class="row" style="justify-content: space-between;">
      <div>
        <div class="card-title" style="font-size: 13px;">${alert.rule}</div>
        <div class="muted">Rule: ${alert.rule}</div>
      </div>
      <div class="row" style="gap: 8px;">
        <span class="pill pill--sm ${tone}">${alert.severity.toUpperCase()}</span>
        <span class="pill pill--sm">${alert.value}</span>
      </div>
    </div>
  `;
}

function renderMarketMonitor(snapshot: MarketMetricsSnapshot | null, loading: boolean) {
  if (!snapshot) {
    return renderEmptyState(loading, "No market metrics yet.", "Loading market metrics…");
  }
  return html`
    <div class="stat-grid" style="margin-top: 16px;">
      <div class="stat">
        <div class="stat-label">Disputes open</div>
        <div class="stat-value">${snapshot.disputes.open}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Disputes resolved</div>
        <div class="stat-value">${snapshot.disputes.resolved}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Settlement failure</div>
        <div class="stat-value">${formatPercent(snapshot.settlements.failureRate)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Active leases</div>
        <div class="stat-value">${snapshot.leases.active}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Revocations pending</div>
        <div class="stat-value">${snapshot.revocations.pending}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Audit events</div>
        <div class="stat-value">${snapshot.audit.events}</div>
      </div>
    </div>
  `;
}

function renderEmptyState(loading: boolean, emptyLabel: string, loadingLabel: string) {
  return html`
    <div class="muted" style="margin-top: 12px;">
      ${loading ? loadingLabel : emptyLabel}
    </div>
  `;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${(value * 100).toFixed(2)}%`;
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
