import { nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { deleteSessionAndRefresh, loadSessions, patchSession } from "./controllers/sessions.ts";
import { renderSessions } from "./views/sessions.ts";

export function renderSessionsTab(state: AppViewState) {
  if (state.tab !== "sessions") {
    return nothing;
  }

  return renderSessions({
    loading: state.sessionsLoading,
    result: state.sessionsResult,
    error: state.sessionsError,
    activeMinutes: state.sessionsFilterActive,
    limit: state.sessionsFilterLimit,
    includeGlobal: state.sessionsIncludeGlobal,
    includeUnknown: state.sessionsIncludeUnknown,
    basePath: state.basePath,
    onFiltersChange: (next) => {
      state.sessionsFilterActive = next.activeMinutes;
      state.sessionsFilterLimit = next.limit;
      state.sessionsIncludeGlobal = next.includeGlobal;
      state.sessionsIncludeUnknown = next.includeUnknown;
    },
    onRefresh: () => loadSessions(state),
    onPatch: (key, patch) => patchSession(state, key, patch),
    onDelete: (key) => deleteSessionAndRefresh(state, key),
  });
}
