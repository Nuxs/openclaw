import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { subtitleForTab, titleForTab } from "./navigation.ts";
import { TAB_BY_ID } from "./tab-registry.ts";

export function renderActiveTabShell(state: AppViewState) {
  const activeTabDefinition = TAB_BY_ID.get(state.tab);
  const hideTitle = activeTabDefinition?.hideTitle ?? state.tab === "chat";
  const headerExtra = activeTabDefinition?.headerExtra?.(state) ?? nothing;

  return html`
    <section class="content-header">
      <div>
        ${hideTitle ? nothing : html`<div class="page-title">${titleForTab(state.tab)}</div>`}
        ${hideTitle ? nothing : html`<div class="page-sub">${subtitleForTab(state.tab)}</div>`}
      </div>
      <div class="page-meta">
        ${state.lastError ? html`<div class="pill danger">${state.lastError}</div>` : nothing}
        ${headerExtra}
      </div>
    </section>

    ${activeTabDefinition?.render(state) ?? nothing}
  `;
}
