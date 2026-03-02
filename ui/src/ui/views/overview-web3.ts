import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import type { Web3StatusSummary } from "../types.ts";

function toWeb3StatusSummary(value: unknown): Web3StatusSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Web3StatusSummary;
}

function formatPrimaryAddress(status: Web3StatusSummary | null): string {
  const address = status?.identity?.primary?.address;
  if (!address) {
    return t("common.na");
  }
  return address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export function renderWeb3Overview(web3Status: unknown, web3Error: string | null | undefined) {
  const status = toWeb3StatusSummary(web3Status);
  const bindings = status?.identity?.bindingsCount ?? status?.identity?.bindings?.length ?? 0;
  const billingStatus = status?.billing?.status ?? t("common.na");
  const credits = status?.billing?.credits ?? t("common.na");
  const resourceProviders = status?.resources?.providers ?? 0;
  const resourceTotal = status?.resources?.total ?? 0;
  const auditEvents = status?.auditEventsRecent ?? 0;
  const pendingAnchors = status?.queues?.anchors?.pending ?? status?.pendingAnchors ?? 0;
  const brainProvider = status?.brain?.provider ?? t("common.na");
  const brainAvailability = status?.brain?.availability ?? t("common.na");

  return html`
    <section class="card" style="margin-top: 18px;">
      <div class="card-title">Web3</div>
      <div class="card-sub">Identity, billing, brain and audit snapshot.</div>
      <div class="stat-grid" style="margin-top: 16px;">
        <div class="stat">
          <div class="stat-label">Bindings</div>
          <div class="stat-value">${bindings}</div>
          <div class="muted">Primary ${formatPrimaryAddress(status)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Billing</div>
          <div class="stat-value">${billingStatus}</div>
          <div class="muted">Credits ${credits}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Resources</div>
          <div class="stat-value">${resourceTotal}</div>
          <div class="muted">Providers ${resourceProviders}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Audit</div>
          <div class="stat-value">${auditEvents}</div>
          <div class="muted">Pending anchors ${pendingAnchors}</div>
        </div>
      </div>
      <div class="muted" style="margin-top: 12px;">
        Brain: ${brainProvider} · ${brainAvailability}
      </div>
      ${web3Error ? html`<div class="callout danger" style="margin-top: 12px;">${web3Error}</div>` : nothing}
    </section>
  `;
}
