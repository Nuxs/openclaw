import { nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { loadPresence } from "./controllers/presence.ts";
import { renderInstances } from "./views/instances.ts";

export function renderInstancesTab(state: AppViewState) {
  if (state.tab !== "instances") {
    return nothing;
  }

  return renderInstances({
    loading: state.presenceLoading,
    entries: state.presenceEntries,
    lastError: state.presenceError,
    statusMessage: state.presenceStatus,
    streamMode: state.streamMode,
    onRefresh: () => loadPresence(state),
  });
}
