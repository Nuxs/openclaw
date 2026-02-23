import { html, nothing } from "lit";
import { t } from "../i18n/index.ts";
import { renderTab, renderThemeToggle } from "./app-render.helpers.ts";
import type { AppViewState } from "./app-view-state.ts";
import { runUpdate } from "./controllers/config.ts";
import "./components/dashboard-header.ts";
import { icons } from "./icons.ts";
import { normalizeBasePath, TAB_GROUPS, subtitleForTab, titleForTab } from "./navigation.ts";
import { TAB_BY_ID } from "./tab-registry.ts";
import { renderBottomTabs } from "./views/bottom-tabs.ts";
import { renderCommandPalette } from "./views/command-palette.ts";
import { renderExecApprovalPrompt } from "./views/exec-approval.ts";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.ts";
import { renderLoginGate } from "./views/login-gate.ts";

export function renderApp(state: AppViewState) {
  // Gate: require successful gateway connection before showing the dashboard.
  // The gateway URL confirmation overlay is always rendered so URL-param flows still work.
  if (!state.connected) {
    return html`
      ${renderLoginGate(state)}
      ${renderGatewayUrlConfirmation(state)}
    `;
  }

  const isChat = state.tab === "chat";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const basePath = normalizeBasePath(state.basePath ?? "");
  const tabDef = TAB_BY_ID.get(state.tab);

  return html`
    ${renderCommandPalette({
      open: state.paletteOpen,
      query: (state as unknown as { paletteQuery?: string }).paletteQuery ?? "",
      activeIndex: (state as unknown as { paletteActiveIndex?: number }).paletteActiveIndex ?? 0,
      onToggle: () => {
        state.paletteOpen = !state.paletteOpen;
      },
      onQueryChange: (q) => {
        (state as unknown as { paletteQuery: string }).paletteQuery = q;
      },
      onActiveIndexChange: (i) => {
        (state as unknown as { paletteActiveIndex: number }).paletteActiveIndex = i;
      },
      onNavigate: (tab) => {
        state.setTab(tab as import("./navigation.ts").Tab);
      },
      onSlashCommand: (_cmd) => {
        state.setTab("chat" as import("./navigation.ts").Tab);
      },
    })}
    <div class="shell ${isChat ? "shell--chat" : ""} ${chatFocus ? "shell--chat-focus" : ""} ${state.settings.navCollapsed ? "shell--nav-collapsed" : ""} ${state.onboarding ? "shell--onboarding" : ""}">
      <header class="topbar">
        <dashboard-header .tab=${state.tab}></dashboard-header>
        <button
          class="topbar-search"
          @click=${() => {
            state.paletteOpen = !state.paletteOpen;
          }}
          title="Search or jump to… (⌘K)"
          aria-label="Open command palette"
        >
          <span class="topbar-search__label">${t("common.search")}</span>
          <kbd class="topbar-search__kbd">⌘K</kbd>
        </button>
        <div class="topbar-status">
          <button
            class="topbar-redact ${state.streamMode ? "topbar-redact--active" : ""}"
            @click=${() => {
              state.streamMode = !state.streamMode;
              try {
                localStorage.setItem("openclaw:stream-mode", String(state.streamMode));
              } catch {
                /* */
              }
            }}
            title="${state.streamMode ? "Sensitive data hidden — click to reveal" : "Sensitive data visible — click to hide"}"
            aria-label="Toggle redaction"
            aria-pressed=${state.streamMode}
          >
            ${state.streamMode ? icons.eye : icons.eyeOff}
          </button>
          <span class="topbar-divider"></span>
          <div class="topbar-connection ${state.connected ? "topbar-connection--ok" : ""}">
            <span class="topbar-connection__dot"></span>
            <span class="topbar-connection__label">${state.connected ? t("common.ok") : t("common.offline")}</span>
          </div>
          <span class="topbar-divider"></span>
          ${renderThemeToggle(state)}
        </div>
      </header>
      <aside class="sidebar ${state.settings.navCollapsed ? "sidebar--collapsed" : ""}">
      <div class="sidebar-header">
        ${
          state.settings.navCollapsed
            ? nothing
            : html`
          <div class="sidebar-brand">
            <img class="sidebar-brand__logo" src="${basePath ? `${basePath}/favicon.svg` : "/favicon.svg"}" alt="OpenClaw" />
            <span class="sidebar-brand__title">OpenClaw</span>
          </div>
        `
        }
        <button
          class="sidebar-collapse-btn"
          @click=${() =>
            state.applySettings({
              ...state.settings,
              navCollapsed: !state.settings.navCollapsed,
            })}
          title="${state.settings.navCollapsed ? t("nav.expand") : t("nav.collapse")}"
          aria-label="${state.settings.navCollapsed ? t("nav.expand") : t("nav.collapse")}"
        >
          ${state.settings.navCollapsed ? icons.panelLeftOpen : icons.panelLeftClose}
        </button>
      </div>
 
          
          <nav class="sidebar-nav">
          ${TAB_GROUPS.map((group) => {
            const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
            const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
            const showItems = hasActiveTab || !isGroupCollapsed;

            return html`
              <div class="nav-group ${!showItems ? "nav-group--collapsed" : ""}">
                ${
                  !state.settings.navCollapsed
                    ? html`
                  <button
                    class="nav-group__label"
                    @click=${() => {
                      const next = { ...state.settings.navGroupsCollapsed };
                      next[group.label] = !isGroupCollapsed;
                      state.applySettings({
                        ...state.settings,
                        navGroupsCollapsed: next,
                      });
                    }}
                    aria-expanded=${showItems}
                  >
                    <span class="nav-group__label-text">${t(`nav.${group.label}`)}</span>
                    <span class="nav-group__chevron">${showItems ? icons.chevronDown : icons.chevronRight}</span>
                  </button>
                `
                    : nothing
                }
                <div class="nav-group__items">
                  ${group.tabs.map((tab) => renderTab(state, tab))}
                </div>
              </div>
            `;
          })}
        </nav>

        <div class="sidebar-footer">
          <a
            class="nav-item nav-item--external"
            href="https://docs.openclaw.ai"
            target="_blank"
            rel="noreferrer"
            title="${t("common.docs")} (opens in new tab)"
          >
            <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
            ${
              !state.settings.navCollapsed
                ? html`
              <span class="nav-item__text">${t("common.docs")}</span>
              <span class="nav-item__external-icon">${icons.externalLink}</span>
            `
                : nothing
            }
          </a>
          ${(() => {
            const snapshot = state.hello?.snapshot as { server?: { version?: string } } | undefined;
            const version = snapshot?.server?.version ?? "";
            return version
              ? html`
                <div class="sidebar-version" title=${`v${version}`}>
                  ${
                    !state.settings.navCollapsed
                      ? html`<span class="sidebar-version__text">v${version}</span>`
                      : html`
                          <span class="sidebar-version__dot"></span>
                        `
                  }
                </div>
              `
              : nothing;
          })()}
        </div>
      </aside>
      <main class="content ${isChat ? "content--chat" : ""}">
        ${
          state.updateAvailable
            ? html`<div class="update-banner callout danger" role="alert">
              <strong>Update available:</strong> v${state.updateAvailable.latestVersion}
              (running v${state.updateAvailable.currentVersion}).
              <button
                class="btn btn--sm update-banner__btn"
                ?disabled=${state.updateRunning || !state.connected}
                @click=${() => runUpdate(state)}
              >${state.updateRunning ? "Updating…" : "Update now"}</button>
            </div>`
            : nothing
        }
        <section class="content-header">
          <div>
            ${tabDef?.hideTitle ? nothing : html`<div class="page-title">${titleForTab(state.tab)}</div>`}
            ${tabDef?.hideTitle ? nothing : html`<div class="page-sub">${subtitleForTab(state.tab)}</div>`}
          </div>
          <div class="page-meta">
            ${state.lastError ? html`<div class="pill danger">${state.lastError}</div>` : nothing}
            ${tabDef?.headerExtra?.(state) ?? nothing}
          </div>
        </section>

        ${tabDef?.render(state) ?? nothing}
      </main>
      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
      ${renderBottomTabs({
        activeTab: state.tab,
        onTabChange: (tab) => state.setTab(tab),
      })}
    </div>
  `;
}
