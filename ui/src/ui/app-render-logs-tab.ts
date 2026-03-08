import { nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { loadLogs } from "./controllers/logs.ts";
import { renderLogs } from "./views/logs.ts";

export function renderLogsTab(state: AppViewState) {
  if (state.tab !== "logs") {
    return nothing;
  }

  return renderLogs({
    loading: state.logsLoading,
    error: state.logsError,
    file: state.logsFile,
    entries: state.logsEntries,
    filterText: state.logsFilterText,
    levelFilters: state.logsLevelFilters,
    autoFollow: state.logsAutoFollow,
    truncated: state.logsTruncated,
    onFilterTextChange: (next) => (state.logsFilterText = next),
    onLevelToggle: (level, enabled) => {
      state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
    },
    onToggleAutoFollow: (next) => (state.logsAutoFollow = next),
    onRefresh: () => loadLogs(state, { reset: true }),
    onExport: (lines, label) => state.exportLogs(lines, label),
    onScroll: (event) => state.handleLogsScroll(event),
  });
}
