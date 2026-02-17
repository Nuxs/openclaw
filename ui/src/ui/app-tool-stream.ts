import { truncateText } from "./format.ts";

const TOOL_STREAM_LIMIT = 50;
const TOOL_STREAM_THROTTLE_MS = 80;
const TOOL_OUTPUT_CHAR_LIMIT = 120_000;

export type AgentEventPayload = {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  sessionKey?: string;
  data: Record<string, unknown>;
};

export type ToolStreamEntry = {
  toolCallId: string;
  runId: string;
  sessionKey?: string;
  name: string;
  args?: unknown;
  output?: string;
  startedAt: number;
  updatedAt: number;
  message: Record<string, unknown>;
};

type ToolStreamHost = {
  sessionKey: string;
  chatRunId: string | null;
  chatProgress?: import("./controllers/chat.ts").ChatProgressState | null;
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];
  chatToolMessages: Record<string, unknown>[];
  toolStreamSyncTimer: number | null;
};

function extractToolOutputText(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  const content = record.content;
  if (!Array.isArray(content)) {
    return null;
  }
  const parts = content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const entry = item as Record<string, unknown>;
      if (entry.type === "text" && typeof entry.text === "string") {
        return entry.text;
      }
      return null;
    })
    .filter((part): part is string => Boolean(part));
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n");
}

function formatToolOutput(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const contentText = extractToolOutputText(value);
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (contentText) {
    text = contentText;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      // oxlint-disable typescript/no-base-to-string
      text = String(value);
    }
  }
  const truncated = truncateText(text, TOOL_OUTPUT_CHAR_LIMIT);
  if (!truncated.truncated) {
    return truncated.text;
  }
  return `${truncated.text}\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`;
}

function buildToolStreamMessage(entry: ToolStreamEntry): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [];
  content.push({
    type: "toolcall",
    name: entry.name,
    arguments: entry.args ?? {},
  });
  if (entry.output) {
    content.push({
      type: "toolresult",
      name: entry.name,
      text: entry.output,
    });
  }
  return {
    role: "assistant",
    toolCallId: entry.toolCallId,
    runId: entry.runId,
    content,
    timestamp: entry.startedAt,
  };
}

function trimToolStream(host: ToolStreamHost) {
  if (host.toolStreamOrder.length <= TOOL_STREAM_LIMIT) {
    return;
  }
  const overflow = host.toolStreamOrder.length - TOOL_STREAM_LIMIT;
  const removed = host.toolStreamOrder.splice(0, overflow);
  for (const id of removed) {
    host.toolStreamById.delete(id);
  }
}

function syncToolStreamMessages(host: ToolStreamHost) {
  host.chatToolMessages = host.toolStreamOrder
    .map((id) => host.toolStreamById.get(id)?.message)
    .filter((msg): msg is Record<string, unknown> => Boolean(msg));
}

export function flushToolStreamSync(host: ToolStreamHost) {
  if (host.toolStreamSyncTimer != null) {
    clearTimeout(host.toolStreamSyncTimer);
    host.toolStreamSyncTimer = null;
  }
  syncToolStreamMessages(host);
}

export function scheduleToolStreamSync(host: ToolStreamHost, force = false) {
  if (force) {
    flushToolStreamSync(host);
    return;
  }
  if (host.toolStreamSyncTimer != null) {
    return;
  }
  host.toolStreamSyncTimer = window.setTimeout(
    () => flushToolStreamSync(host),
    TOOL_STREAM_THROTTLE_MS,
  );
}

export function resetToolStream(host: ToolStreamHost) {
  host.toolStreamById.clear();
  host.toolStreamOrder = [];
  host.chatToolMessages = [];
  flushToolStreamSync(host);
}

export type CompactionStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

type CompactionHost = ToolStreamHost & {
  compactionStatus?: CompactionStatus | null;
  compactionClearTimer?: number | null;
};

const COMPACTION_TOAST_DURATION_MS = 5000;

export function handleCompactionEvent(host: CompactionHost, payload: AgentEventPayload) {
  const data = payload.data ?? {};
  const phase = typeof data.phase === "string" ? data.phase : "";

  // Clear any existing timer
  if (host.compactionClearTimer != null) {
    window.clearTimeout(host.compactionClearTimer);
    host.compactionClearTimer = null;
  }

  if (phase === "start") {
    host.compactionStatus = {
      active: true,
      startedAt: Date.now(),
      completedAt: null,
    };
  } else if (phase === "end") {
    host.compactionStatus = {
      active: false,
      startedAt: host.compactionStatus?.startedAt ?? null,
      completedAt: Date.now(),
    };
    // Auto-clear the toast after duration
    host.compactionClearTimer = window.setTimeout(() => {
      host.compactionStatus = null;
      host.compactionClearTimer = null;
    }, COMPACTION_TOAST_DURATION_MS);
  }
}

function bumpProgressStep(
  host: ToolStreamHost,
  step: Omit<import("./controllers/chat.ts").ChatProgressStep, "index">,
) {
  const current = host.chatProgress;
  const runId = host.chatRunId;
  if (!runId || !current || current.runId !== runId) {
    return;
  }

  const last = current.steps[current.steps.length - 1];
  const now = Date.now();
  // Avoid spamming identical steps (common with partial tool updates).
  if (
    last &&
    last.kind === step.kind &&
    last.toolName === step.toolName &&
    last.note === step.note &&
    last.status === step.status
  ) {
    host.chatProgress = { ...current, updatedAt: now };
    return;
  }

  const normalizedSteps = current.steps.map((s) =>
    s.status === "active" ? { ...s, status: "done" as const } : s,
  );
  const nextIndex = (normalizedSteps[normalizedSteps.length - 1]?.index ?? 0) + 1;
  const trimmed = normalizedSteps.length >= 12 ? normalizedSteps.slice(-11) : normalizedSteps;
  host.chatProgress = {
    ...current,
    updatedAt: now,
    steps: [...trimmed, { ...step, index: nextIndex }],
  };
}

export function handleAgentEvent(host: ToolStreamHost, payload?: AgentEventPayload) {
  if (!payload) {
    return;
  }

  // Progress updates: lifecycle/tool/assistant/seq gap
  if (
    host.chatProgress &&
    host.chatRunId &&
    payload.runId === host.chatRunId &&
    (!payload.sessionKey || payload.sessionKey === host.sessionKey)
  ) {
    const data = payload.data ?? {};
    if (payload.stream === "lifecycle") {
      const phase = typeof data.phase === "string" ? data.phase : "";
      if (phase === "start") {
        bumpProgressStep(host, { kind: "model", status: "active", ts: payload.ts });
      } else if (phase === "error") {
        bumpProgressStep(host, { kind: "error", status: "error", ts: payload.ts });
      } else if (phase === "end") {
        bumpProgressStep(host, { kind: "output", status: "done", ts: payload.ts, note: "done" });
      }
    } else if (payload.stream === "assistant") {
      bumpProgressStep(host, { kind: "output", status: "active", ts: payload.ts });
    } else if (payload.stream === "error") {
      const reason = typeof data.reason === "string" ? data.reason : "";
      if (reason) {
        bumpProgressStep(host, { kind: "warning", status: "error", ts: payload.ts, note: reason });
      }
    }
  }

  // Handle compaction events
  if (payload.stream === "compaction") {
    handleCompactionEvent(host as CompactionHost, payload);
    if (host.chatProgress && host.chatRunId && payload.runId === host.chatRunId) {
      const phase = typeof payload.data?.phase === "string" ? payload.data.phase : "";
      if (phase === "start") {
        bumpProgressStep(host, { kind: "compaction", status: "active", ts: payload.ts });
      } else if (phase === "end") {
        bumpProgressStep(host, { kind: "model", status: "active", ts: payload.ts });
      }
    }
    return;
  }

  if (payload.stream !== "tool") {
    return;
  }
  const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : undefined;
  if (sessionKey && sessionKey !== host.sessionKey) {
    return;
  }
  // Fallback: only accept session-less events for the active run.
  if (!sessionKey && host.chatRunId && payload.runId !== host.chatRunId) {
    return;
  }
  if (host.chatRunId && payload.runId !== host.chatRunId) {
    return;
  }
  if (!host.chatRunId) {
    return;
  }

  const data = payload.data ?? {};
  const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
  if (!toolCallId) {
    return;
  }
  const name = typeof data.name === "string" ? data.name : "tool";
  const phase = typeof data.phase === "string" ? data.phase : "";
  const isError = phase === "result" && Boolean(data.isError);
  const args = phase === "start" ? data.args : undefined;
  const output =
    phase === "update"
      ? formatToolOutput(data.partialResult)
      : phase === "result"
        ? formatToolOutput(data.result)
        : undefined;

  if (
    host.chatProgress &&
    host.chatRunId &&
    payload.runId === host.chatRunId &&
    (!payload.sessionKey || payload.sessionKey === host.sessionKey)
  ) {
    if (phase === "start") {
      bumpProgressStep(host, { kind: "tool", status: "active", ts: payload.ts, toolName: name });
    } else if (phase === "result") {
      if (isError) {
        bumpProgressStep(host, { kind: "tool", status: "error", ts: payload.ts, toolName: name });
      } else {
        bumpProgressStep(host, { kind: "model", status: "active", ts: payload.ts });
      }
    }
  }

  const now = Date.now();
  let entry = host.toolStreamById.get(toolCallId);
  if (!entry) {
    entry = {
      toolCallId,
      runId: payload.runId,
      sessionKey,
      name,
      args,
      output: output || undefined,
      startedAt: typeof payload.ts === "number" ? payload.ts : now,
      updatedAt: now,
      message: {},
    };
    host.toolStreamById.set(toolCallId, entry);
    host.toolStreamOrder.push(toolCallId);
  } else {
    entry.name = name;
    if (args !== undefined) {
      entry.args = args;
    }
    if (output !== undefined) {
      entry.output = output || undefined;
    }
    entry.updatedAt = now;
  }

  entry.message = buildToolStreamMessage(entry);
  trimToolStream(host);
  scheduleToolStreamSync(host, phase === "result");
}
