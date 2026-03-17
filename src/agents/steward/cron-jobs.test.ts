import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadConfigMock,
  resolveStorePathMock,
  updateSessionStoreEntryMock,
  resolveSessionStoreKeyMock,
  resolveSessionAgentIdMock,
} = vi.hoisted(() => ({
  loadConfigMock: vi.fn(),
  resolveStorePathMock: vi.fn(),
  updateSessionStoreEntryMock: vi.fn(),
  resolveSessionStoreKeyMock: vi.fn(),
  resolveSessionAgentIdMock: vi.fn(),
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: loadConfigMock,
}));

vi.mock("../../config/sessions/paths.js", () => ({
  resolveStorePath: resolveStorePathMock,
}));

vi.mock("../../config/sessions/store.js", () => ({
  updateSessionStoreEntry: updateSessionStoreEntryMock,
}));

vi.mock("../../gateway/session-utils.js", () => ({
  resolveSessionStoreKey: resolveSessionStoreKeyMock,
}));

vi.mock("../agent-scope.js", () => ({
  resolveSessionAgentId: resolveSessionAgentIdMock,
}));

import type { SessionEntry } from "../../config/sessions/types.js";
import { loadCronStore } from "../../cron/store.js";
import { syncStewardGrowthLoop } from "./cron-jobs.js";

let tempDir = "";
let cronStorePath = "";
let sessionStorePath = "";
let currentEntry: SessionEntry | null = null;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-steward-cron-"));
  cronStorePath = path.join(tempDir, "cron", "jobs.json");
  sessionStorePath = path.join(tempDir, "sessions", "store.json");
  currentEntry = null;

  loadConfigMock.mockReset();
  resolveStorePathMock.mockReset();
  updateSessionStoreEntryMock.mockReset();
  resolveSessionStoreKeyMock.mockReset();
  resolveSessionAgentIdMock.mockReset();

  loadConfigMock.mockReturnValue({
    cron: { enabled: true, store: cronStorePath },
    session: { store: sessionStorePath },
  });
  resolveStorePathMock.mockReturnValue(sessionStorePath);
  resolveSessionStoreKeyMock.mockImplementation(
    ({ sessionKey }: { sessionKey: string }) => `canonical:${sessionKey}`,
  );
  resolveSessionAgentIdMock.mockReturnValue("agent-1");
  updateSessionStoreEntryMock.mockImplementation(
    async ({
      update,
    }: {
      update: (entry: SessionEntry) => Promise<Partial<SessionEntry> | null>;
    }) => {
      if (!currentEntry) {
        return null;
      }
      const patch = await update(currentEntry);
      if (!patch) {
        return currentEntry;
      }
      currentEntry = {
        ...currentEntry,
        ...patch,
        settlement: {
          ...currentEntry.settlement,
          ...patch.settlement,
        },
        steward: {
          ...currentEntry.steward,
          ...patch.steward,
        },
      };
      return currentEntry;
    },
  );
});

afterEach(async () => {
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe("steward cron jobs", () => {
  it("creates a session-scoped growth job and persists derived backlog metadata", async () => {
    currentEntry = {
      sessionId: "sess-1",
      updatedAt: Date.now(),
      steward: {
        lastStatus: "approval_required",
        lastOrderId: "order-1",
        lastConsentId: "consent-1",
      },
    };

    const patch = await syncStewardGrowthLoop({ sessionKey: "sess-1" });

    expect(patch).toMatchObject({
      autonomyPosture: "guarded",
      cadence: { everyMs: 30 * 60 * 1000, label: "30m" },
      growthJob: {
        enabled: true,
        target: "session:canonical:sess-1",
      },
    });
    expect((currentEntry?.steward as Record<string, unknown>)?.heartbeatBacklog).toEqual(
      expect.arrayContaining([expect.stringContaining("web3.market.consent.grant")]),
    );
    expect((currentEntry?.steward as Record<string, unknown>)?.growthJob).toMatchObject({
      jobId: expect.any(String),
      enabled: true,
      target: "session:canonical:sess-1",
      nextWakeAt: expect.any(String),
    });

    const store = await loadCronStore(cronStorePath);
    expect(store.jobs).toHaveLength(1);
    expect(store.jobs[0]?.payload.kind).toBe("agentTurn");
    if (store.jobs[0]?.payload.kind === "agentTurn") {
      expect(store.jobs[0].payload.message).toContain("Steward Heartbeat Lane");
      expect(store.jobs[0].payload.message).toContain("HEARTBEAT_OK");
    }
  });

  it("keeps a single growth job and disables it when cron is turned off", async () => {
    currentEntry = {
      sessionId: "sess-2",
      updatedAt: Date.now(),
      steward: {
        lastStatus: "executed",
        lastOrderId: "order-2",
        lastProofId: "proof-2",
        budgetPolicy: { maxAmount: "10" },
        riskPolicy: { requireProof: true },
      },
    };

    await syncStewardGrowthLoop({ sessionKey: "sess-2" });
    loadConfigMock.mockReturnValueOnce({
      cron: { enabled: false, store: cronStorePath },
      session: { store: sessionStorePath },
    });

    await syncStewardGrowthLoop({ sessionKey: "sess-2" });

    const store = await loadCronStore(cronStorePath);
    expect(store.jobs).toHaveLength(1);
    expect(store.jobs[0]?.enabled).toBe(false);
    expect((currentEntry?.steward as Record<string, unknown>)?.growthJob).toMatchObject({
      enabled: false,
      jobId: store.jobs[0]?.id,
    });
  });
});
