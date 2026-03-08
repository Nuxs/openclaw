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
import { renderCronTab } from "./app-render-cron-tab.ts";
import { renderDebugTab } from "./app-render-debug-tab.ts";
import { renderInstancesTab } from "./app-render-instances-tab.ts";
import { renderLogsTab } from "./app-render-logs-tab.ts";
import { renderNodesTab } from "./app-render-nodes-tab.ts";
import { renderOverviewTab } from "./app-render-overview-tab.ts";
import { renderSessionsTab } from "./app-render-sessions-tab.ts";
import { renderSkillsTab } from "./app-render-skills-tab.ts";
import { renderUsageTab } from "./app-render-usage-tab.ts";
import { renderChatControls } from "./app-render.helpers.ts";
import { scheduleChatScroll, scheduleLogsScroll } from "./app-scroll.ts";
// Loaders — from extracted module to avoid circular deps with app-settings.ts
import { loadOverview, loadChannelsTabData, loadCronData } from "./app-tab-loaders.ts";
import type { OpenClawApp } from "./app.ts";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity.ts";
import { loadAgentSkills } from "./controllers/agent-skills.ts";
import { loadAgents, loadToolsCatalog } from "./controllers/agents.ts";
import { loadChannels } from "./controllers/channels.ts";
import { loadConfigSchema, loadConfig } from "./controllers/config.ts";
import { loadDebug } from "./controllers/debug.ts";
import { loadDevices } from "./controllers/devices.ts";
import { loadExecApprovals } from "./controllers/exec-approvals.ts";
import { loadLogs } from "./controllers/logs.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadPresence } from "./controllers/presence.ts";
import { loadSessions } from "./controllers/sessions.ts";
import { loadSkills } from "./controllers/skills.ts";
// Web3/Market tab entries (overlay)
import { WEB3_TAB_ENTRIES } from "./tab-registry-web3.ts";

// ---------------------------------------------------------------------------
// Registry: ordered array — group order + intra-group order preserved
// ---------------------------------------------------------------------------

export const TAB_REGISTRY: TabDefinition[] = [
  // ── chat ──────────────────────────────────────────────────────────────
  {
    id: "chat",
    path: "/chat",
    icon: "messageSquare",
    group: "chat",
    hideTitle: true,
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
    render: renderInstancesTab,
    load: async (host) => {
      await loadPresence(host as OpenClawApp);
    },
  },
  {
    id: "sessions",
    path: "/sessions",
    icon: "fileText",
    group: "control",
    render: renderSessionsTab,
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
    render: renderCronTab,
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
        if (h.agentsPanel === "tools") {
          void loadToolsCatalog(h, agentId);
        }
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
    render: renderSkillsTab,
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
    render: renderDebugTab,
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
    render: renderLogsTab,
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
