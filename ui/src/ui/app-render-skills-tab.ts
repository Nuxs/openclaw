import { nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import {
  installSkill,
  loadSkills,
  saveSkillApiKey,
  updateSkillEdit,
  updateSkillEnabled,
} from "./controllers/skills.ts";
import { renderSkills } from "./views/skills.ts";

export function renderSkillsTab(state: AppViewState) {
  if (state.tab !== "skills") {
    return nothing;
  }

  return renderSkills({
    connected: state.connected,
    loading: state.skillsLoading,
    report: state.skillsReport,
    error: state.skillsError,
    filter: state.skillsFilter,
    edits: state.skillEdits,
    messages: state.skillMessages,
    busyKey: state.skillsBusyKey,
    onFilterChange: (next) => (state.skillsFilter = next),
    onRefresh: () => loadSkills(state, { clearMessages: true }),
    onToggle: (key, enabled) => updateSkillEnabled(state, key, enabled),
    onEdit: (key, value) => updateSkillEdit(state, key, value),
    onSaveKey: (key) => saveSkillApiKey(state, key),
    onInstall: (skillKey, name, installId) => installSkill(state, skillKey, name, installId),
  });
}
