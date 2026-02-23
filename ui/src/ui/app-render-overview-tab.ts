import { nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import type { Tab } from "./navigation.ts";
import { renderOverview } from "./views/overview.ts";

export function renderOverviewTab(state: AppViewState) {
  if (state.tab !== "overview") {
    return nothing;
  }

  const presenceCount = state.presenceEntries.length;
  const sessionsCount = state.sessionsResult?.count ?? null;
  const cronNext = state.cronStatus?.nextWakeAtMs ?? null;

  return renderOverview({
    connected: state.connected,
    hello: state.hello,
    settings: state.settings,
    password: state.password,
    lastError: state.lastError,
    presenceCount,
    sessionsCount,
    cronEnabled: state.cronStatus?.enabled ?? null,
    cronNext,
    lastChannelsRefresh: state.channelsLastSuccess,
    usageResult: state.usageResult,
    sessionsResult: state.sessionsResult,
    skillsReport: state.skillsReport,
    cronJobs: state.cronJobs,
    cronStatus: state.cronStatus,
    attentionItems: state.attentionItems,
    eventLog: state.eventLog,
    overviewLogLines: state.overviewLogLines,
    streamMode: state.streamMode,
    web3Status: state.overviewWeb3Status,
    web3Error: state.overviewWeb3Error,
    onSettingsChange: (next) => state.applySettings(next),
    onPasswordChange: (next) => (state.password = next),
    onSessionKeyChange: (next) => {
      state.sessionKey = next;
      state.chatMessage = "";
      state.resetToolStream();
      state.applySettings({
        ...state.settings,
        sessionKey: next,
        lastActiveSessionKey: next,
      });
      void state.loadAssistantIdentity();
    },
    onConnect: () => state.connect(),
    onRefresh: () => state.loadOverview(),
    onNavigate: (tab) => state.setTab(tab as Tab),
    onRefreshLogs: () => state.loadOverview(),
    onToggleStreamMode: () => {
      state.streamMode = !state.streamMode;
      try {
        localStorage.setItem("openclaw:stream-mode", String(state.streamMode));
      } catch {
        /* */
      }
    },
  });
}
