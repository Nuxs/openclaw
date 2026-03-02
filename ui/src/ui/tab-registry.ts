/**
 * Tab Registry — single source of truth for all tab definitions.
 *
 * Every tab's id, path, icon, group, render adapter, data loader,
 * and enter/leave side-effects are declared here.
 * `navigation.ts`, `app-render.ts`, and `app-settings.ts` derive
 * their dispatch logic from this registry instead of hand-coded
 * switch/if chains.
 */

import type { TemplateResult } from "lit";
import { nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import type { IconName } from "./icons.js";

export type TabGroup = "chat" | "control" | "agent" | "settings";

export type TabDefinition = {
  /** Unique tab identifier (matches the Tab union type). */
  id: string;
  /** URL path segment (e.g. "/chat"). */
  path: string;
  /** Lucide icon name for sidebar/bottom-tabs. */
  icon: IconName;
  /** Which sidebar group this tab belongs to. */
  group: TabGroup;
  /** Hide the default content-header title/subtitle. */
  hideTitle?: boolean;
  /** Extra content rendered in the content-header (e.g. chat controls). */
  headerExtra?: (state: AppViewState) => TemplateResult | typeof nothing;
  /** Tab content renderer. Receives full AppViewState; returns nothing when inactive. */
  render: (state: AppViewState) => TemplateResult | typeof nothing;
  /** Data loader called by refreshActiveTab(). */
  load?: (host: unknown) => Promise<void>;
  /** Side-effect when entering this tab (e.g. start polling). */
  onEnter?: (host: unknown) => void;
  /** Side-effect when leaving this tab (e.g. stop polling). */
  onLeave?: (host: unknown) => void;
};

// ---------------------------------------------------------------------------
// Lazy imports — render adapters
// ---------------------------------------------------------------------------

import { refreshChat } from "./app-chat.ts";
// Side-effect imports
import {
  startLogsPolling,
  stopLogsPolling,
  startDebugPolling,
  stopDebugPolling,
} from "./app-polling.ts";
import { renderAgentsTab } from "./app-render-agents-tab.ts";
import { renderChannelsTab } from "./app-render-channels-tab.ts";
import { renderChatTab } from "./app-render-chat-tab.ts";
import { renderConfigTab } from "./app-render-config-tab.ts";
import { renderNodesTab } from "./app-render-nodes-tab.ts";
import { renderOverviewTab } from "./app-render-overview-tab.ts";
import { renderUsageTab } from "./app-render-usage-tab.ts";
import { renderChatControls } from "./app-render.helpers.ts";
import { scheduleChatScroll, scheduleLogsScroll } from "./app-scroll.ts";
// Loaders — from extracted module to avoid circular deps with app-settings.ts
import { loadOverview, loadChannelsTabData, loadCronData } from "./app-tab-loaders.ts";
import type { OpenClawApp } from "./app.ts";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity.ts";
import { loadAgentSkills } from "./controllers/agent-skills.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadChannels } from "./controllers/channels.ts";
import { loadConfigSchema, loadConfig } from "./controllers/config.ts";
import {
  loadCronRuns,
  loadMoreCronJobs,
  loadMoreCronRuns,
  reloadCronJobs,
  toggleCronJob,
  runCronJob,
  removeCronJob,
  addCronJob,
  startCronEdit,
  startCronClone,
  cancelCronEdit,
  validateCronForm,
  hasCronFormErrors,
  updateCronJobsFilter,
  updateCronRunsFilter,
  normalizeCronFormState,
} from "./controllers/cron.ts";
import { loadDebug, callDebugMethod } from "./controllers/debug.ts";
import { loadDevices } from "./controllers/devices.ts";
import { loadExecApprovals } from "./controllers/exec-approvals.ts";
import { loadLogs } from "./controllers/logs.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadPresence } from "./controllers/presence.ts";
import { loadSessions, deleteSessionAndRefresh, patchSession } from "./controllers/sessions.ts";
import {
  loadSkills,
  installSkill,
  saveSkillApiKey,
  updateSkillEdit,
  updateSkillEnabled,
} from "./controllers/skills.ts";
// Web3/Market tab entries (overlay)
import { WEB3_TAB_ENTRIES } from "./tab-registry-web3.ts";
import { renderCron } from "./views/cron.ts";
import { renderDebug } from "./views/debug.ts";
import { renderInstances } from "./views/instances.ts";
import { renderLogs } from "./views/logs.ts";
import { renderSessions } from "./views/sessions.ts";
import { renderSkills } from "./views/skills.ts";

// ---------------------------------------------------------------------------
// Registry: ordered array — group order + intra-group order preserved
// ---------------------------------------------------------------------------

const CRON_THINKING_SUGGESTIONS = ["off", "minimal", "low", "medium", "high"];
const CRON_TIMEZONE_SUGGESTIONS = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
];

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function normalizeSuggestionValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

export const TAB_REGISTRY: TabDefinition[] = [
  // ── chat ──────────────────────────────────────────────────────────────
  {
    id: "chat",
    path: "/chat",
    icon: "messageSquare",
    group: "chat",
    hideTitle: false,
    headerExtra: (state) => renderChatControls(state),
    render: renderChatTab,
    load: async (host) => {
      const h = host as OpenClawApp;
      await refreshChat(h as Parameters<typeof refreshChat>[0]);
      scheduleChatScroll(
        h as unknown as Parameters<typeof scheduleChatScroll>[0],
        !(h as unknown as { chatHasAutoScrolled: boolean }).chatHasAutoScrolled,
      );
    },
    onEnter: (host) => {
      (host as { chatHasAutoScrolled: boolean }).chatHasAutoScrolled = false;
    },
  },

  // ── control ──────────────────────────────────────────────────────────
  {
    id: "overview",
    path: "/overview",
    icon: "barChart",
    group: "control",
    render: renderOverviewTab,
    load: async (host) => {
      await loadOverview(host as Parameters<typeof loadOverview>[0]);
    },
  },
  // Web3 / Market tabs (from overlay)
  ...WEB3_TAB_ENTRIES,
  {
    id: "channels",
    path: "/channels",
    icon: "link",
    group: "control",
    render: renderChannelsTab,
    load: async (host) => {
      await loadChannelsTabData(host as Parameters<typeof loadChannelsTabData>[0]);
    },
  },
  {
    id: "instances",
    path: "/instances",
    icon: "radio",
    group: "control",
    render: (state) => {
      if (state.tab !== "instances") {
        return nothing;
      }
      return renderInstances({
        loading: state.presenceLoading,
        entries: state.presenceEntries,
        lastError: state.presenceError,
        statusMessage: state.presenceStatus,
        streamMode: state.streamMode,
        onRefresh: () => loadPresence(state as unknown as OpenClawApp),
      });
    },
    load: async (host) => {
      await loadPresence(host as OpenClawApp);
    },
  },
  {
    id: "sessions",
    path: "/sessions",
    icon: "fileText",
    group: "control",
    render: (state) => {
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
        onRefresh: () => loadSessions(state as unknown as OpenClawApp),
        onPatch: (key, patch) => patchSession(state as unknown as OpenClawApp, key, patch),
        onDelete: (key) => deleteSessionAndRefresh(state as unknown as OpenClawApp, key),
      });
    },
    load: async (host) => {
      await loadSessions(host as OpenClawApp);
    },
  },
  {
    id: "usage",
    path: "/usage",
    icon: "barChart",
    group: "control",
    hideTitle: true,
    render: renderUsageTab,
  },
  {
    id: "cron",
    path: "/cron",
    icon: "loader",
    group: "control",
    render: (state) => {
      if (state.tab !== "cron") {
        return nothing;
      }
      const cronAgentSuggestions = Array.from(
        new Set(
          [
            ...(state.agentsList?.agents?.map((entry) => entry.id.trim()) ?? []),
            ...state.cronJobs
              .map((job) => (typeof job.agentId === "string" ? job.agentId.trim() : ""))
              .filter(Boolean),
          ].filter(Boolean),
        ),
      ).toSorted((a, b) => a.localeCompare(b));

      const cronModelSuggestions = Array.from(
        new Set(
          [
            ...state.cronModelSuggestions,
            ...state.cronJobs
              .map((job) => {
                if (job.payload.kind !== "agentTurn" || typeof job.payload.model !== "string") {
                  return "";
                }
                return job.payload.model.trim();
              })
              .filter(Boolean),
          ].filter(Boolean),
        ),
      ).toSorted((a, b) => a.localeCompare(b));

      const selectedDeliveryChannel =
        state.cronForm.deliveryChannel && state.cronForm.deliveryChannel.trim()
          ? state.cronForm.deliveryChannel.trim()
          : "last";

      const jobToSuggestions = state.cronJobs
        .map((job) => normalizeSuggestionValue(job.delivery?.to))
        .filter(Boolean);

      const accountToSuggestions = (
        selectedDeliveryChannel === "last"
          ? Object.values(state.channelsSnapshot?.channelAccounts ?? {}).flat()
          : (state.channelsSnapshot?.channelAccounts?.[selectedDeliveryChannel] ?? [])
      )
        .flatMap((account) => [
          normalizeSuggestionValue(account.accountId),
          normalizeSuggestionValue(account.name),
        ])
        .filter(Boolean);

      const rawDeliveryToSuggestions = uniquePreserveOrder([
        ...jobToSuggestions,
        ...accountToSuggestions,
      ]);

      const deliveryToSuggestions =
        state.cronForm.deliveryMode === "webhook"
          ? rawDeliveryToSuggestions.filter((value) => isHttpUrl(value))
          : rawDeliveryToSuggestions;

      return renderCron({
        basePath: state.basePath,
        loading: state.cronLoading,
        jobsLoadingMore: state.cronJobsLoadingMore,
        status: state.cronStatus,
        jobs: state.cronJobs,
        jobsTotal: state.cronJobsTotal,
        jobsHasMore: state.cronJobsHasMore,
        jobsQuery: state.cronJobsQuery,
        jobsEnabledFilter: state.cronJobsEnabledFilter,
        jobsScheduleKindFilter: state.cronJobsScheduleKindFilter,
        jobsLastStatusFilter: state.cronJobsLastStatusFilter,
        jobsSortBy: state.cronJobsSortBy,
        jobsSortDir: state.cronJobsSortDir,
        error: state.cronError,
        busy: state.cronBusy,
        form: state.cronForm,
        fieldErrors: state.cronFieldErrors,
        canSubmit: !hasCronFormErrors(state.cronFieldErrors),
        editingJobId: state.cronEditingJobId,
        channels: state.channelsSnapshot?.channelMeta?.length
          ? state.channelsSnapshot.channelMeta.map((entry) => entry.id)
          : (state.channelsSnapshot?.channelOrder ?? []),
        channelLabels: state.channelsSnapshot?.channelLabels ?? {},
        channelMeta: state.channelsSnapshot?.channelMeta ?? [],
        runsJobId: state.cronRunsJobId,
        runs: state.cronRuns,
        runsTotal: state.cronRunsTotal,
        runsHasMore: state.cronRunsHasMore,
        runsLoadingMore: state.cronRunsLoadingMore,
        runsScope: state.cronRunsScope,
        runsStatuses: state.cronRunsStatuses,
        runsDeliveryStatuses: state.cronRunsDeliveryStatuses,
        runsStatusFilter: state.cronRunsStatusFilter,
        runsQuery: state.cronRunsQuery,
        runsSortDir: state.cronRunsSortDir,
        agentSuggestions: cronAgentSuggestions,
        modelSuggestions: cronModelSuggestions,
        thinkingSuggestions: CRON_THINKING_SUGGESTIONS,
        timezoneSuggestions: CRON_TIMEZONE_SUGGESTIONS,
        deliveryToSuggestions,
        onFormChange: (patch) => {
          state.cronForm = normalizeCronFormState({ ...state.cronForm, ...patch });
          state.cronFieldErrors = validateCronForm(state.cronForm);
        },
        onRefresh: () => state.loadCron(),
        onAdd: () => addCronJob(state as unknown as OpenClawApp),
        onEdit: (job) => startCronEdit(state as unknown as OpenClawApp, job),
        onClone: (job) => startCronClone(state as unknown as OpenClawApp, job),
        onCancelEdit: () => cancelCronEdit(state as unknown as OpenClawApp),
        onToggle: (job, enabled) => toggleCronJob(state as unknown as OpenClawApp, job, enabled),
        onRun: (job) => runCronJob(state as unknown as OpenClawApp, job),
        onRemove: (job) => removeCronJob(state as unknown as OpenClawApp, job),
        onLoadRuns: async (jobId) => {
          updateCronRunsFilter(state as unknown as OpenClawApp, { cronRunsScope: "job" });
          await loadCronRuns(state as unknown as OpenClawApp, jobId);
        },
        onLoadMoreJobs: () => loadMoreCronJobs(state as unknown as OpenClawApp),
        onJobsFiltersChange: async (patch) => {
          updateCronJobsFilter(state as unknown as OpenClawApp, patch);
          const shouldReload =
            typeof patch.cronJobsQuery === "string" ||
            Boolean(patch.cronJobsEnabledFilter) ||
            Boolean(patch.cronJobsSortBy) ||
            Boolean(patch.cronJobsSortDir);
          if (shouldReload) {
            await reloadCronJobs(state as unknown as OpenClawApp);
          }
        },
        onJobsFiltersReset: async () => {
          updateCronJobsFilter(state as unknown as OpenClawApp, {
            cronJobsQuery: "",
            cronJobsEnabledFilter: "all",
            cronJobsScheduleKindFilter: "all",
            cronJobsLastStatusFilter: "all",
            cronJobsSortBy: "nextRunAtMs",
            cronJobsSortDir: "asc",
          });
          await reloadCronJobs(state as unknown as OpenClawApp);
        },
        onLoadMoreRuns: () => loadMoreCronRuns(state as unknown as OpenClawApp),
        onRunsFiltersChange: async (patch) => {
          updateCronRunsFilter(state as unknown as OpenClawApp, patch);
          if (state.cronRunsScope === "all") {
            await loadCronRuns(state as unknown as OpenClawApp, null);
            return;
          }
          await loadCronRuns(state as unknown as OpenClawApp, state.cronRunsJobId);
        },
      });
    },
    load: async (host) => {
      await loadCronData(host as Parameters<typeof loadCronData>[0]);
    },
  },

  // ── agent ────────────────────────────────────────────────────────────
  {
    id: "agents",
    path: "/agents",
    icon: "folder",
    group: "agent",
    render: renderAgentsTab,
    load: async (host) => {
      const h = host as OpenClawApp;
      await loadAgents(h);
      await loadConfig(h);
      const agentIds = h.agentsList?.agents?.map((entry) => entry.id) ?? [];
      if (agentIds.length > 0) {
        void loadAgentIdentities(h, agentIds);
      }
      const agentId =
        h.agentsSelectedId ?? h.agentsList?.defaultId ?? h.agentsList?.agents?.[0]?.id;
      if (agentId) {
        void loadAgentIdentity(h, agentId);
        if (h.agentsPanel === "skills") {
          void loadAgentSkills(h, agentId);
        }
        if (h.agentsPanel === "channels") {
          void loadChannels(h, false);
        }
        if (h.agentsPanel === "cron") {
          void loadCronData(host as Parameters<typeof loadCronData>[0]);
        }
      }
    },
  },
  {
    id: "skills",
    path: "/skills",
    icon: "zap",
    group: "agent",
    render: (state) => {
      if (state.tab !== "skills") {
        return nothing;
      }
      return renderSkills({
        loading: state.skillsLoading,
        report: state.skillsReport,
        error: state.skillsError,
        filter: state.skillsFilter,
        edits: state.skillEdits,
        messages: state.skillMessages,
        busyKey: state.skillsBusyKey,
        onFilterChange: (next) => (state.skillsFilter = next),
        onRefresh: () => loadSkills(state as unknown as OpenClawApp, { clearMessages: true }),
        onToggle: (key, enabled) =>
          updateSkillEnabled(state as unknown as OpenClawApp, key, enabled),
        onEdit: (key, value) => updateSkillEdit(state as unknown as OpenClawApp, key, value),
        onSaveKey: (key) => saveSkillApiKey(state as unknown as OpenClawApp, key),
        onInstall: (skillKey, name, installId) =>
          installSkill(state as unknown as OpenClawApp, skillKey, name, installId),
      });
    },
    load: async (host) => {
      await loadSkills(host as OpenClawApp);
    },
  },
  {
    id: "nodes",
    path: "/nodes",
    icon: "monitor",
    group: "agent",
    render: renderNodesTab,
    load: async (host) => {
      const h = host as OpenClawApp;
      await loadNodes(h);
      await loadDevices(h);
      await loadConfig(h);
      await loadExecApprovals(h);
    },
  },

  // ── settings ─────────────────────────────────────────────────────────
  {
    id: "config",
    path: "/config",
    icon: "settings",
    group: "settings",
    render: renderConfigTab,
    load: async (host) => {
      const h = host as OpenClawApp;
      await loadConfigSchema(h);
      await loadConfig(h);
    },
  },
  {
    id: "debug",
    path: "/debug",
    icon: "bug",
    group: "settings",
    render: (state) => {
      if (state.tab !== "debug") {
        return nothing;
      }
      return renderDebug({
        loading: state.debugLoading,
        status: state.debugStatus,
        health: state.debugHealth,
        models: state.debugModels,
        heartbeat: state.debugHeartbeat,
        web3Audit: state.debugWeb3Audit,
        web3AuditError: state.debugWeb3AuditError,
        eventLog: state.eventLog,
        callMethod: state.debugCallMethod,
        callParams: state.debugCallParams,
        callResult: state.debugCallResult,
        callError: state.debugCallError,
        onCallMethodChange: (next) => (state.debugCallMethod = next),
        onCallParamsChange: (next) => (state.debugCallParams = next),
        onRefresh: () => loadDebug(state as unknown as OpenClawApp),
        onCall: () => callDebugMethod(state as unknown as OpenClawApp),
      });
    },
    load: async (host) => {
      const h = host as OpenClawApp;
      await loadDebug(h);
      (h as unknown as { eventLog: unknown[]; eventLogBuffer: unknown[] }).eventLog = (
        h as unknown as { eventLogBuffer: unknown[] }
      ).eventLogBuffer;
    },
    onEnter: (host) => {
      startDebugPolling(host as Parameters<typeof startDebugPolling>[0]);
    },
    onLeave: (host) => {
      stopDebugPolling(host as Parameters<typeof stopDebugPolling>[0]);
    },
  },
  {
    id: "logs",
    path: "/logs",
    icon: "scrollText",
    group: "settings",
    render: (state) => {
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
        onRefresh: () => loadLogs(state as unknown as OpenClawApp, { reset: true }),
        onExport: (lines, label) => state.exportLogs(lines, label),
        onScroll: (event) => state.handleLogsScroll(event),
      });
    },
    load: async (host) => {
      const h = host as OpenClawApp;
      (h as { logsAtBottom: boolean }).logsAtBottom = true;
      await loadLogs(h, { reset: true });
      scheduleLogsScroll(h as unknown as Parameters<typeof scheduleLogsScroll>[0], true);
    },
    onEnter: (host) => {
      startLogsPolling(host as Parameters<typeof startLogsPolling>[0]);
    },
    onLeave: (host) => {
      stopLogsPolling(host as Parameters<typeof stopLogsPolling>[0]);
    },
  },
];

// ---------------------------------------------------------------------------
// Derived lookup structures
// ---------------------------------------------------------------------------

/** O(1) lookup by tab id */
export const TAB_BY_ID = new Map<string, TabDefinition>(TAB_REGISTRY.map((def) => [def.id, def]));

/** Grouped definitions preserving order (used by navigation sidebar) */
export const TAB_GROUPS_FROM_REGISTRY = (() => {
  const order: TabGroup[] = ["chat", "control", "agent", "settings"];
  const grouped = new Map<TabGroup, TabDefinition[]>();
  for (const def of TAB_REGISTRY) {
    let list = grouped.get(def.group);
    if (!list) {
      list = [];
      grouped.set(def.group, list);
    }
    list.push(def);
  }
  return order
    .filter((g) => grouped.has(g))
    .map((g) => ({ label: g, tabs: grouped.get(g)!.map((d) => d.id) }));
})();

/** path → tab id (for routing) */
export const PATH_TO_TAB_FROM_REGISTRY = new Map<string, string>(
  TAB_REGISTRY.map((def) => [def.path, def.id]),
);

/** tab id → path */
export const TAB_PATHS_FROM_REGISTRY: Record<string, string> = Object.fromEntries(
  TAB_REGISTRY.map((def) => [def.id, def.path]),
);

/** tab id → icon */
export const TAB_ICONS: Record<string, IconName> = Object.fromEntries(
  TAB_REGISTRY.map((def) => [def.id, def.icon]),
);
