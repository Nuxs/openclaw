import { html, nothing } from "lit";
import { clampText, formatRelativeTimestamp } from "../format.ts";
import type {
  BridgeRoutesSnapshot,
  BridgeTransfer,
  MarketReputationSummary,
  TokenEconomyState,
} from "../types.ts";

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

function renderEmptyState(loading: boolean, emptyLabel: string, loadingLabel: string) {
  return html`
    <div class="muted" style="margin-top: 12px;">
      ${loading ? loadingLabel : emptyLabel}
    </div>
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

function resolveStatusTone(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes("failed") || lower.includes("rejected") || lower.includes("revoked")) {
    return "pill--danger";
  }
  if (
    lower.includes("pending") ||
    lower.includes("open") ||
    lower.includes("evidence") ||
    lower.includes("requested") ||
    lower.includes("in_flight")
  ) {
    return "pill--warn";
  }
  return "pill--ok";
}

function renderStatusBadge(status: string) {
  const tone = resolveStatusTone(status);
  return html`<span class="pill pill--sm ${tone}">${status}</span>`;
}

function sortByTime<T>(
  items: T[],
  getValue: (item: T) => string | undefined,
  direction: "asc" | "desc",
) {
  return items.toSorted((a, b) => {
    const aTime = parseTimestamp(getValue(a));
    const bTime = parseTimestamp(getValue(b));
    return direction === "desc" ? bTime - aTime : aTime - bTime;
  });
}

function parseTimestamp(value?: string) {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatSeconds(value: number) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (value < 60) {
    return `${Math.round(value)}s`;
  }
  if (value < 3600) {
    return `${Math.round(value / 60)}m`;
  }
  return `${(value / 3600).toFixed(1)}h`;
}

export function renderReputationCard(summary: MarketReputationSummary | null, loading: boolean) {
  if (!summary) {
    return html`
      <div class="card">
        <div class="card-title">Reputation & Anti-cheat</div>
        <div class="card-sub">Signals derived from leases, disputes, and ledger totals.</div>
        ${renderEmptyState(loading, "No reputation snapshot yet.", "Loading reputation signals…")}
      </div>
    `;
  }

  const signalLabels = summary.signals.length > 0 ? summary.signals : ["stable"];
  return html`
    <div class="card">
      <div class="card-title">Reputation & Anti-cheat</div>
      <div class="card-sub">Signals derived from leases, disputes, and ledger totals.</div>
      <div class="stat-grid" style="margin-top: 16px;">
        <div class="stat">
          <div class="stat-label">Score</div>
          <div class="stat-value">${summary.score}</div>
          <div class="muted">out of 100</div>
        </div>
        <div class="stat">
          <div class="stat-label">Leases</div>
          <div class="stat-value">${summary.leases.total}</div>
          ${renderStatusPills(summary.leases.byStatus)}
        </div>
        <div class="stat">
          <div class="stat-label">Disputes</div>
          <div class="stat-value">${summary.disputes.total}</div>
          ${renderStatusPills(summary.disputes.byStatus)}
        </div>
        <div class="stat">
          <div class="stat-label">Ledger total</div>
          <div class="stat-value">${summary.ledger.totalCost}</div>
          <div class="muted">${summary.ledger.currency || "n/a"}</div>
        </div>
      </div>
      <div class="row" style="margin-top: 12px; gap: 6px; flex-wrap: wrap;">
        ${signalLabels.map((signal) => html`<span class="pill pill--sm">${signal}</span>`)}
      </div>
    </div>
  `;
}

export function renderTokenEconomyCard(state: TokenEconomyState | null, loading: boolean) {
  if (!state) {
    return html`
      <div class="card">
        <div class="card-title">Token Economy</div>
        <div class="card-sub">Supply, governance, and emission configuration.</div>
        ${renderEmptyState(loading, "Token economy not configured yet.", "Loading token economy…")}
      </div>
    `;
  }

  return html`
    <div class="card">
      <div class="card-title">Token Economy</div>
      <div class="card-sub">Supply, governance, and emission configuration.</div>
      <div class="stat-grid" style="margin-top: 16px;">
        <div class="stat">
          <div class="stat-label">Status</div>
          <div class="stat-value">${state.status.replace("token_", "")}</div>
          <div class="muted">${state.policy.symbol}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Circulating</div>
          <div class="stat-value">${state.totals.circulating}</div>
          <div class="muted">Total ${state.totals.totalSupply}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Minted</div>
          <div class="stat-value">${state.totals.minted}</div>
          <div class="muted">Burned ${state.totals.burned}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Emission</div>
          <div class="stat-value">${state.policy.emission?.rate ?? "n/a"}</div>
          <div class="muted">${state.policy.emission?.period ?? "n/a"}</div>
        </div>
      </div>
      <div class="muted" style="margin-top: 12px;">
        Updated ${formatIsoRelative(state.updatedAt)}
      </div>
    </div>
  `;
}

export function renderBridgeRoutesCard(snapshot: BridgeRoutesSnapshot | null, loading: boolean) {
  const routes = snapshot?.routes ?? [];
  return html`
    <div class="card">
      <div class="card-title">Cross-chain Bridge Routes</div>
      <div class="card-sub">Available transfer paths and estimated settlement time.</div>
      ${
        routes.length === 0
          ? renderEmptyState(loading, "No bridge routes available.", "Loading bridge routes…")
          : html`
              <div class="table" style="margin-top: 16px;">
                <div class="table-head">
                  <div>Route</div>
                  <div>Asset</div>
                  <div>Fee</div>
                  <div>ETA</div>
                </div>
                ${routes.slice(0, 6).map((route) => renderBridgeRouteRow(route))}
              </div>
              ${
                routes.length > 6
                  ? html`
                      <div class="muted" style="margin-top: 12px;">
                        Showing 6 of ${routes.length} routes.
                      </div>
                    `
                  : nothing
              }
            `
      }
    </div>
  `;
}

export function renderBridgeTransfersCard(transfers: BridgeTransfer[], loading: boolean) {
  const sortedTransfers = sortByTime(transfers, (entry) => entry.updatedAt, "desc");
  return html`
    <div class="card">
      <div class="card-title">Bridge Transfers</div>
      <div class="card-sub">Latest cross-chain settlement handoffs.</div>
      ${
        sortedTransfers.length === 0
          ? renderEmptyState(loading, "No bridge transfers yet.", "Loading bridge transfers…")
          : html`
              <div class="table" style="margin-top: 16px;">
                <div class="table-head">
                  <div>Bridge ID</div>
                  <div>Asset</div>
                  <div>Status</div>
                  <div>Amount</div>
                  <div>Updated</div>
                </div>
                ${sortedTransfers.slice(0, 6).map((transfer) => renderBridgeTransferRow(transfer))}
              </div>
              ${
                sortedTransfers.length > 6
                  ? html`
                      <div class="muted" style="margin-top: 12px;">
                        Showing 6 of ${sortedTransfers.length} transfers.
                      </div>
                    `
                  : nothing
              }
            `
      }
    </div>
  `;
}

function renderBridgeRouteRow(route: BridgeRoutesSnapshot["routes"][number]) {
  return html`
    <div class="table-row">
      <div class="mono">${route.fromChain} → ${route.toChain}</div>
      <div>${route.assetSymbol}</div>
      <div>${route.feeBps !== undefined ? `${route.feeBps} bps` : "n/a"}</div>
      <div>${route.estimatedSeconds ? formatSeconds(route.estimatedSeconds) : "n/a"}</div>
    </div>
  `;
}

function renderBridgeTransferRow(transfer: BridgeTransfer) {
  return html`
    <div class="table-row">
      <div class="mono">${clampText(transfer.bridgeId, 14)}</div>
      <div>${transfer.assetSymbol}</div>
      <div>${renderStatusBadge(transfer.status)}</div>
      <div>${transfer.amount}</div>
      <div>${formatIsoRelative(transfer.updatedAt)}</div>
    </div>
  `;
}
