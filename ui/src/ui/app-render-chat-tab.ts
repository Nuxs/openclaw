import { nothing } from "lit";
import {
  buildAgentMainSessionKey,
  parseAgentSessionKey,
} from "../../../src/routing/session-key.js";
import { t } from "../i18n/index.ts";
import { refreshChatAvatar } from "./app-chat.ts";
import type { AppViewState } from "./app-view-state.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import type { Tab } from "./navigation.ts";
import { renderChat } from "./views/chat.ts";

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const AVATAR_DATA_RE = /^data:/i;
  const AVATAR_HTTP_RE = /^https?:\/\//i;
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

export function renderChatTab(state: AppViewState) {
  if (state.tab !== "chat") {
    return nothing;
  }

  const chatDisabledReason = state.connected ? null : t("chat.disconnected");
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const resolvedAgentId =
    state.agentsSelectedId ??
    state.agentsList?.defaultId ??
    state.agentsList?.agents?.[0]?.id ??
    null;

  return renderChat({
    sessionKey: state.sessionKey,
    onSessionKeyChange: (next) => {
      state.sessionKey = next;
      state.chatMessage = "";
      state.chatAttachments = [];
      state.chatStream = null;
      state.chatStreamStartedAt = null;
      state.chatRunId = null;
      state.chatProgress = null;
      state.chatQueue = [];
      state.resetToolStream();
      state.resetChatScroll();
      state.applySettings({
        ...state.settings,
        sessionKey: next,
        lastActiveSessionKey: next,
      });
      void state.loadAssistantIdentity();
      void loadChatHistory(state);
      void refreshChatAvatar(state);
    },
    thinkingLevel: state.chatThinkingLevel,
    showThinking,
    loading: state.chatLoading,
    sending: state.chatSending,
    compactionStatus: state.compactionStatus,
    fallbackStatus: state.fallbackStatus,
    assistantAvatarUrl: chatAvatarUrl,
    messages: state.chatMessages,
    toolMessages: state.chatToolMessages,
    stream: state.chatStream,
    streamStartedAt: state.chatStreamStartedAt,
    progress: state.chatProgress,
    draft: state.chatMessage,
    queue: state.chatQueue,
    connected: state.connected,
    canSend: state.connected,
    disabledReason: chatDisabledReason,
    error: state.lastError,
    sessions: state.sessionsResult,
    focusMode: state.tab === "chat" && (state.settings.chatFocusMode || state.onboarding),
    onRefresh: () => {
      state.resetToolStream();
      return Promise.all([loadChatHistory(state), refreshChatAvatar(state)]);
    },
    onToggleFocusMode: () => {
      if (state.onboarding) {
        return;
      }
      state.applySettings({
        ...state.settings,
        chatFocusMode: !state.settings.chatFocusMode,
      });
    },
    onChatScroll: (event) => state.handleChatScroll(event),
    onDraftChange: (next) => (state.chatMessage = next),
    attachments: state.chatAttachments,
    onAttachmentsChange: (next) => (state.chatAttachments = next),
    onSend: () => state.handleSendChat(),
    canAbort: Boolean(state.chatRunId),
    onAbort: () => void state.handleAbortChat(),
    onQueueRemove: (id) => state.removeQueuedMessage(id),
    onNewSession: () => state.handleSendChat("/new", { restoreDraft: true }),
    onClearHistory: async () => {
      if (!state.client || !state.connected) {
        return;
      }
      try {
        await state.client.request("sessions.reset", { key: state.sessionKey });
        state.chatMessages = [];
        state.chatStream = null;
        state.chatRunId = null;
        await loadChatHistory(state);
      } catch (err) {
        state.lastError = String(err);
      }
    },
    agentsList: state.agentsList,
    currentAgentId: resolvedAgentId ?? "main",
    onAgentChange: (agentId: string) => {
      state.sessionKey = buildAgentMainSessionKey({ agentId });
      state.chatMessages = [];
      state.chatStream = null;
      state.chatRunId = null;
      state.applySettings({
        ...state.settings,
        sessionKey: state.sessionKey,
        lastActiveSessionKey: state.sessionKey,
      });
      void loadChatHistory(state);
      void state.loadAssistantIdentity();
    },
    onNavigateToAgent: () => {
      state.agentsSelectedId = resolvedAgentId;
      state.setTab("agents" as Tab);
    },
    onSessionSelect: (key: string) => {
      state.setSessionKey(key);
      state.chatMessages = [];
      void loadChatHistory(state);
      void state.loadAssistantIdentity();
    },
    showNewMessages: state.chatNewMessagesBelow && !state.chatManualRefreshInFlight,
    onScrollToBottom: () => state.scrollToBottom(),
    sidebarOpen: state.sidebarOpen,
    sidebarContent: state.sidebarContent,
    sidebarError: state.sidebarError,
    splitRatio: state.splitRatio,
    onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
    onCloseSidebar: () => state.handleCloseSidebar(),
    onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
    assistantName: state.assistantName,
    assistantAvatar: state.assistantAvatar,
  });
}
