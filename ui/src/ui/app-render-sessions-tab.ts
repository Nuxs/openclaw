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
    searchQuery: state.sessionsSearchQuery ?? "",
    sortColumn: state.sessionsSortColumn ?? "updated",
    sortDir: state.sessionsSortDir ?? "desc",
    page: state.sessionsPage ?? 0,
    pageSize: state.sessionsPageSize ?? 25,
    actionsOpenKey: state.sessionsActionsOpenKey ?? null,
    onFiltersChange: (next) => {
      state.sessionsFilterActive = next.activeMinutes;
      state.sessionsFilterLimit = next.limit;
      state.sessionsIncludeGlobal = next.includeGlobal;
      state.sessionsIncludeUnknown = next.includeUnknown;
    },
    onSearchChange: (query) => {
      if ("sessionsSearchQuery" in state) {
        (state as Record<string, unknown>).sessionsSearchQuery = query;
      }
    },
    onSortChange: (column, dir) => {
      if ("sessionsSortColumn" in state) {
        (state as Record<string, unknown>).sessionsSortColumn = column;
        (state as Record<string, unknown>).sessionsSortDir = dir;
      }
    },
    onPageChange: (page) => {
      if ("sessionsPage" in state) {
        (state as Record<string, unknown>).sessionsPage = page;
      }
    },
    onPageSizeChange: (size) => {
      if ("sessionsPageSize" in state) {
        (state as Record<string, unknown>).sessionsPageSize = size;
      }
    },
    onActionsOpenChange: (key) => {
      if ("sessionsActionsOpenKey" in state) {
        (state as Record<string, unknown>).sessionsActionsOpenKey = key;
      }
    },
    onRefresh: () => loadSessions(state),
    onPatch: (key, patch) => patchSession(state, key, patch),
    onDelete: (key) => deleteSessionAndRefresh(state, key),
  });
}
