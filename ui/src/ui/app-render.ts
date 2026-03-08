import { html, nothing } from "lit";
import { t } from "../i18n/index.ts";
import { renderActiveTabShell } from "./app-render-active-tab.ts";
import { renderTab, renderThemeToggle } from "./app-render.helpers.ts";
import type { AppViewState } from "./app-view-state.ts";
import { runUpdate } from "./controllers/config.ts";
import { buildExternalLinkRel, EXTERNAL_LINK_TARGET } from "./external-link.ts";
import { icons } from "./icons.ts";
import { normalizeBasePath, TAB_GROUPS } from "./navigation.ts";
import { renderExecApprovalPrompt } from "./views/exec-approval.ts";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.ts";

export function renderApp(state: AppViewState) {
  const openClawVersion =
    (typeof state.hello?.server?.version === "string" && state.hello.server.version.trim()) ||
    state.updateAvailable?.currentVersion ||
    t("common.na");
  const availableUpdate =
    state.updateAvailable &&
    state.updateAvailable.latestVersion !== state.updateAvailable.currentVersion
      ? state.updateAvailable
      : null;
  const versionStatusClass = availableUpdate ? "warn" : "ok";
  const isChat = state.tab === "chat";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const basePath = normalizeBasePath(state.basePath ?? "");

  return html`
    <div class="shell ${isChat ? "shell--chat" : ""} ${chatFocus ? "shell--chat-focus" : ""} ${state.settings.navCollapsed ? "shell--nav-collapsed" : ""} ${state.onboarding ? "shell--onboarding" : ""}">
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="nav-collapse-toggle"
            @click=${() =>
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              })}
            title="${state.settings.navCollapsed ? t("nav.expand") : t("nav.collapse")}"
            aria-label="${state.settings.navCollapsed ? t("nav.expand") : t("nav.collapse")}"
          >
            <span class="nav-collapse-toggle__icon">${icons.menu}</span>
          </button>
          <div class="brand">
            <div class="brand-logo">
              <img src=${basePath ? `${basePath}/favicon.svg` : "/favicon.svg"} alt="OpenClaw" />
            </div>
            <div class="brand-text">
              <div class="brand-title">OPENCLAW</div>
              <div class="brand-sub">Gateway Dashboard</div>
            </div>
          </div>
        </div>
        <div class="topbar-status">
          <div class="pill">
            <span class="statusDot ${versionStatusClass}"></span>
            <span>${t("common.version")}</span>
            <span class="mono">${openClawVersion}</span>
          </div>
          <div class="pill">
            <span class="statusDot ${state.connected ? "ok" : ""}"></span>
            <span>${t("common.health")}</span>
            <span class="mono">${state.connected ? t("common.ok") : t("common.offline")}</span>
          </div>
          ${renderThemeToggle(state)}
        </div>
      </header>
      <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
        ${TAB_GROUPS.map((group) => {
          const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
          const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
          return html`
            <div class="nav-group ${isGroupCollapsed && !hasActiveTab ? "nav-group--collapsed" : ""}">
              <button
                class="nav-label"
                @click=${() => {
                  const next = { ...state.settings.navGroupsCollapsed };
                  next[group.label] = !isGroupCollapsed;
                  state.applySettings({
                    ...state.settings,
                    navGroupsCollapsed: next,
                  });
                }}
                aria-expanded=${!isGroupCollapsed}
              >
                <span class="nav-label__text">${t(`nav.${group.label}`)}</span>
                <span class="nav-label__chevron">${isGroupCollapsed ? "+" : "−"}</span>
              </button>
              <div class="nav-group__items">
                ${group.tabs.map((tab) => renderTab(state, tab))}
              </div>
            </div>
          `;
        })}
        <div class="nav-group nav-group--links">
          <div class="nav-label nav-label--static">
            <span class="nav-label__text">${t("common.resources")}</span>
          </div>
          <div class="nav-group__items">
            <a
              class="nav-item nav-item--external"
              href="https://docs.openclaw.ai"
              target=${EXTERNAL_LINK_TARGET}
              rel=${buildExternalLinkRel()}
              title="${t("common.docs")} (opens in new tab)"
            >
              <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
              <span class="nav-item__text">${t("common.docs")}</span>
            </a>
          </div>
        </div>
      </aside>
      <main class="content ${isChat ? "content--chat" : ""}">
        ${
          availableUpdate
            ? html`<div class="update-banner callout danger" role="alert">
              <strong>Update available:</strong> v${availableUpdate.latestVersion}
              (running v${availableUpdate.currentVersion}).
              <button
                class="btn btn--sm update-banner__btn"
                ?disabled=${state.updateRunning || !state.connected}
                @click=${() => runUpdate(state)}
              >${state.updateRunning ? "Updating…" : "Update now"}</button>
            </div>`
            : nothing
        }
        ${renderActiveTabShell(state)}
      </main>
      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
    </div>
  `;
}
