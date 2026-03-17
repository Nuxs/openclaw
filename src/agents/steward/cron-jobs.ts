import { loadConfig } from "../../config/config.js";
import { resolveStorePath } from "../../config/sessions/paths.js";
import { updateSessionStoreEntry } from "../../config/sessions/store.js";
import type { SessionEntry, SessionStewardState } from "../../config/sessions/types.js";
import { CronService } from "../../cron/service.js";
import { resolveCronStorePath } from "../../cron/store.js";
import type { CronJob, CronJobCreate } from "../../cron/types.js";
import { resolveSessionStoreKey } from "../../gateway/session-utils.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import {
  deriveStewardHeartbeatBacklog,
  deriveStewardReflectionBacklog,
  deriveStewardResearchBacklog,
  resolveStewardAutonomyPosture,
  resolveStewardCadence,
} from "./growth-loop.js";
import { buildStewardHeartbeatContext } from "./heartbeat-context.js";
import { deriveStewardGrowthCheckpoint } from "./wealth-memory.js";

const NOOP_LOGGER = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

function asIso(ms?: number): string | undefined {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function trimStringArray(values: string[]): string[] {
  const next: string[] = [];
  for (const entry of values) {
    const trimmed = entry.trim();
    if (trimmed && !next.includes(trimmed)) {
      next.push(trimmed);
    }
  }
  return next;
}

function buildGrowthPatch(sessionEntry: SessionEntry): Partial<SessionStewardState> {
  const checkpoint = deriveStewardGrowthCheckpoint(sessionEntry);
  const cadence = resolveStewardCadence(sessionEntry);
  return {
    growthSummary: checkpoint?.summary,
    reflectionBacklog: trimStringArray(deriveStewardReflectionBacklog(sessionEntry)),
    researchBacklog: trimStringArray(deriveStewardResearchBacklog(sessionEntry)),
    heartbeatBacklog: trimStringArray(deriveStewardHeartbeatBacklog(sessionEntry)),
    autonomyPosture: resolveStewardAutonomyPosture(sessionEntry),
    cadence: {
      everyMs: cadence.everyMs,
      label: cadence.label,
      reason: cadence.reason,
    },
  };
}

function buildSessionTarget(sessionKey: string): `session:${string}` {
  return `session:${sessionKey}`;
}

function buildJobName(sessionKey: string): string {
  return `Steward growth · ${sessionKey.slice(-18)}`;
}

function buildJobMessage(sessionEntry: SessionEntry): string {
  const heartbeatContext = buildStewardHeartbeatContext(sessionEntry);
  return ["Run the private steward growth loop for this session.", heartbeatContext]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

function buildGrowthJobPatch(params: {
  sessionKey: string;
  agentId: string;
  sessionEntry: SessionEntry;
  existing?: CronJob;
  enabled: boolean;
}): Omit<CronJobCreate, "state"> {
  const cadence = resolveStewardCadence(params.sessionEntry);
  const anchorMs =
    params.existing?.schedule.kind === "every" &&
    typeof params.existing.schedule.anchorMs === "number"
      ? params.existing.schedule.anchorMs
      : Date.now();
  return {
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    name: buildJobName(params.sessionKey),
    description: "Session-scoped private steward growth loop.",
    enabled: params.enabled,
    deleteAfterRun: false,
    schedule: {
      kind: "every",
      everyMs: cadence.everyMs,
      anchorMs,
    },
    sessionTarget: buildSessionTarget(params.sessionKey),
    wakeMode: "next-heartbeat",
    payload: {
      kind: "agentTurn",
      message: buildJobMessage(params.sessionEntry),
      thinking: "low",
      timeoutSeconds: 120,
      lightContext: true,
      deliver: false,
    },
    delivery: { mode: "none" },
  };
}

function findExistingGrowthJob(
  jobs: CronJob[],
  sessionKey: string,
  jobId?: string,
): CronJob | undefined {
  if (jobId) {
    const byId = jobs.find((job) => job.id === jobId);
    if (byId) {
      return byId;
    }
  }
  return jobs.find(
    (job) =>
      job.sessionKey === sessionKey &&
      job.payload.kind === "agentTurn" &&
      job.sessionTarget === buildSessionTarget(sessionKey),
  );
}

function isSameJob(existing: CronJob, expected: Omit<CronJobCreate, "state">): boolean {
  if (existing.enabled !== expected.enabled) {
    return false;
  }
  if (existing.name !== expected.name || existing.description !== expected.description) {
    return false;
  }
  if (
    existing.sessionKey !== expected.sessionKey ||
    existing.sessionTarget !== expected.sessionTarget
  ) {
    return false;
  }
  if (
    existing.wakeMode !== expected.wakeMode ||
    existing.delivery?.mode !== expected.delivery?.mode
  ) {
    return false;
  }
  if (existing.schedule.kind !== "every" || expected.schedule.kind !== "every") {
    return false;
  }
  if (existing.schedule.everyMs !== expected.schedule.everyMs) {
    return false;
  }
  if (existing.payload.kind !== "agentTurn" || expected.payload.kind !== "agentTurn") {
    return false;
  }
  return (
    existing.payload.message === expected.payload.message &&
    existing.payload.thinking === expected.payload.thinking &&
    existing.payload.timeoutSeconds === expected.payload.timeoutSeconds &&
    existing.payload.lightContext === expected.payload.lightContext &&
    existing.payload.deliver === expected.payload.deliver
  );
}

function hasPatchDiff(
  current: SessionStewardState | undefined,
  patch: Partial<SessionStewardState>,
): boolean {
  return Object.entries(patch).some(
    ([key, value]) =>
      JSON.stringify((current as Record<string, unknown> | undefined)?.[key]) !==
      JSON.stringify(value),
  );
}

async function readSessionEntry(params: {
  storePath: string;
  sessionKey: string;
}): Promise<SessionEntry | null> {
  let current: SessionEntry | null = null;
  await updateSessionStoreEntry({
    storePath: params.storePath,
    sessionKey: params.sessionKey,
    update: async (entry) => {
      current = entry;
      return null;
    },
  });
  return current;
}

export async function syncStewardGrowthLoop(params: {
  sessionKey: string;
}): Promise<Partial<SessionStewardState> | null> {
  const rawSessionKey = params.sessionKey.trim();
  if (!rawSessionKey) {
    return null;
  }

  const cfg = loadConfig();
  const canonicalKey = resolveSessionStoreKey({ cfg, sessionKey: rawSessionKey });
  const agentId = resolveSessionAgentId({ sessionKey: canonicalKey, config: cfg });
  const sessionStorePath = resolveStorePath(cfg.session?.store, { agentId });
  const currentEntry = await readSessionEntry({
    storePath: sessionStorePath,
    sessionKey: canonicalKey,
  });
  if (!currentEntry?.steward) {
    return null;
  }

  const basePatch = buildGrowthPatch(currentEntry);
  const nextEntry: SessionEntry = {
    ...currentEntry,
    steward: {
      ...currentEntry.steward,
      ...basePatch,
    },
  };

  const cronStorePath = resolveCronStorePath(cfg.cron?.store);
  const cronEnabled = cfg.cron?.enabled !== false;
  const cron = new CronService({
    storePath: cronStorePath,
    cronEnabled,
    log: NOOP_LOGGER,
    defaultAgentId: agentId,
    resolveSessionStorePath: (resolvedAgentId) =>
      resolveStorePath(cfg.session?.store, { agentId: resolvedAgentId ?? agentId }),
    sessionStorePath,
    enqueueSystemEvent: () => {},
    requestHeartbeatNow: () => {},
    runIsolatedAgentJob: async () => ({ status: "skipped", summary: "sync-only" }),
  });

  const jobs = await cron.list({ includeDisabled: true });
  const existing = findExistingGrowthJob(jobs, canonicalKey, currentEntry.steward.growthJob?.jobId);
  const expectedJob = buildGrowthJobPatch({
    sessionKey: canonicalKey,
    agentId,
    sessionEntry: nextEntry,
    existing,
    enabled: cronEnabled,
  });
  const savedJob = existing
    ? isSameJob(existing, expectedJob)
      ? existing
      : await cron.update(existing.id, expectedJob)
    : await cron.add(expectedJob);

  const patch: Partial<SessionStewardState> = {
    ...basePatch,
    growthJob: {
      jobId: savedJob.id,
      enabled: savedJob.enabled,
      target: buildSessionTarget(canonicalKey),
      nextWakeAt: savedJob.enabled ? asIso(savedJob.state.nextRunAtMs) : undefined,
    },
  };

  if (!hasPatchDiff(currentEntry.steward, patch)) {
    return patch;
  }

  await updateSessionStoreEntry({
    storePath: sessionStorePath,
    sessionKey: canonicalKey,
    update: async (entry) => {
      const currentSteward = entry.steward ?? {};
      if (!hasPatchDiff(currentSteward, patch)) {
        return null;
      }
      return {
        steward: {
          ...currentSteward,
          ...patch,
          updatedAt: Date.now(),
        },
      } satisfies Partial<SessionEntry>;
    },
  });

  return patch;
}
