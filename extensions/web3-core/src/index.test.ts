import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "./config.js";
import {
  createWeb3StatusSummaryHandler,
  resolveBillingSummary,
  resolveBrainAvailability,
} from "./index.js";
import { AlertCategory, AlertLevel, AlertStatus } from "./monitor/types.js";
import { Web3StateStore } from "./state/store.js";

let tempDir: string;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

function makeStore() {
  tempDir = mkdtempSync(join(tmpdir(), "openclaw-web3-status-test-"));
  return new Web3StateStore(tempDir);
}

type HandlerResult = { ok: boolean; payload: Record<string, unknown> };

function invoke(store: Web3StateStore, config: ReturnType<typeof resolveConfig>): HandlerResult {
  const handler = createWeb3StatusSummaryHandler(store, config);
  let result!: HandlerResult;
  handler({
    params: undefined,
    respond: (ok: boolean, payload: Record<string, unknown>) => {
      result = { ok, payload };
    },
  } as any);
  return result;
}

describe("web3.status.summary handler", () => {
  it("returns correct shape with empty store", () => {
    const store = makeStore();
    const config = resolveConfig();
    const { ok, payload } = invoke(store, config);

    expect(ok).toBe(true);
    expect(payload).toHaveProperty("auditEventsRecent");
    expect(payload).toHaveProperty("brain");
    expect(payload).toHaveProperty("billing");
    expect(payload).toHaveProperty("settlement");
    expect(payload).toHaveProperty("archivePending");
    expect(payload).toHaveProperty("resources");
    expect(payload).toHaveProperty("disputes");
    expect(payload).toHaveProperty("alerts");
    expect(payload).toHaveProperty("queues");
    expect((payload.settlement as any).pending).toBe(0);
    expect((payload.archivePending as any) ?? 0).toBe(0);
    expect((payload.resources as any).total).toBe(0);
    expect((payload.disputes as any).total).toBe(0);
    expect((payload.alerts as any).total).toBe(0);
    expect((payload.queues as any).anchors.pending).toBe(0);
  });

  it("reports settlement.pending count from store", () => {
    const store = makeStore();
    const config = resolveConfig({ billing: { enabled: true } });
    store.upsertPendingSettlement({
      sessionIdHash: "hash1",
      createdAt: new Date().toISOString(),
      orderId: "order-1",
      payer: "0xpayer",
      amount: "100",
    });
    store.upsertPendingSettlement({
      sessionIdHash: "hash2",
      createdAt: new Date().toISOString(),
    });

    const { payload } = invoke(store, config);
    expect((payload.settlement as any).pending).toBe(2);
  });

  it("summarizes queues, resources, disputes, and alerts", () => {
    const store = makeStore();
    const config = resolveConfig();
    const now = new Date().toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();

    store.saveResourceIndex([
      {
        providerId: "provider-1",
        resources: [{ resourceId: "res-1", kind: "model", label: "m1" }],
        updatedAt: now,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      {
        providerId: "provider-2",
        resources: [{ resourceId: "res-2", kind: "search" }],
        updatedAt: now,
        expiresAt: past,
      },
    ]);

    store.upsertPendingTx({
      anchorId: "anchor-1",
      payloadHash: "hash-1",
      createdAt: now,
      attempts: 1,
      lastError: "anchor failed",
    });
    store.upsertPendingArchive({
      event: {
        id: "audit-1",
        kind: "tool_call",
        timestamp: now,
        sessionIdHash: "session-1",
        seq: 1,
        payloadHash: "payload-1",
      },
      createdAt: now,
      attempts: 1,
      lastError: "archive failed",
    });
    store.upsertPendingSettlement({
      sessionIdHash: "session-1",
      createdAt: now,
      attempts: 1,
      lastError: "settlement failed",
    });

    store.upsertDispute({
      disputeId: "dispute-1",
      orderId: "order-1",
      resourceId: "resource-1",
      providerId: "provider-1",
      consumerId: "consumer-1",
      reason: "missing data",
      status: "open",
      evidences: [],
      openedAt: now,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now,
    });
    store.upsertDispute({
      disputeId: "dispute-2",
      orderId: "order-2",
      resourceId: "resource-2",
      providerId: "provider-2",
      consumerId: "consumer-2",
      reason: "timeout",
      status: "resolved",
      evidences: [],
      openedAt: now,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now,
      resolution: {
        ruling: "provider_wins",
        reason: "resolved",
        resolvedAt: now,
        resolvedBy: "system",
      },
    });

    store.appendAlert({
      id: "alert-1",
      level: AlertLevel.P0,
      category: AlertCategory.SECURITY,
      status: AlertStatus.ACTIVE,
      ruleName: "rule-1",
      message: "critical",
      timestamp: now,
    });
    store.appendAlert({
      id: "alert-2",
      level: AlertLevel.P1,
      category: AlertCategory.BILLING,
      status: AlertStatus.RESOLVED,
      ruleName: "rule-2",
      message: "resolved",
      timestamp: now,
    });

    const { payload } = invoke(store, config);
    expect((payload.resources as any).providers).toBe(1);
    expect((payload.resources as any).total).toBe(1);
    expect((payload.queues as any).anchors.failed).toBe(1);
    expect((payload.queues as any).archives.pending).toBe(1);
    expect((payload.queues as any).settlements.failed).toBe(1);
    expect((payload.disputes as any).open).toBe(1);
    expect((payload.disputes as any).resolved).toBe(1);
    expect((payload.alerts as any).total).toBe(2);
    expect((payload.alerts as any).active).toBe(1);
  });

  it("reports billing status as unbound when billing disabled", () => {
    const store = makeStore();
    const config = resolveConfig({ billing: { enabled: false } });
    const { payload } = invoke(store, config);

    expect((payload.billing as any).status).toBe("unbound");
    expect((payload.billing as any).credits).toBe(0);
  });

  it("reports billing status as active with usage records", () => {
    const store = makeStore();
    const config = resolveConfig({
      billing: { enabled: true, quotaPerSession: 100 },
    });
    store.saveUsage({
      sessionIdHash: "s1",
      creditsUsed: 30,
      creditsQuota: 100,
      llmCalls: 5,
      toolCalls: 2,
      lastActivity: new Date().toISOString(),
    });

    const { payload } = invoke(store, config);
    expect((payload.billing as any).status).toBe("active");
    expect((payload.billing as any).credits).toBe(70);
  });

  it("reports billing status as exhausted when credits depleted", () => {
    const store = makeStore();
    const config = resolveConfig({
      billing: { enabled: true, quotaPerSession: 100 },
    });
    store.saveUsage({
      sessionIdHash: "s1",
      creditsUsed: 100,
      creditsQuota: 100,
      llmCalls: 10,
      toolCalls: 5,
      lastActivity: new Date().toISOString(),
    });

    const { payload } = invoke(store, config);
    expect((payload.billing as any).status).toBe("exhausted");
    expect((payload.billing as any).credits).toBe(0);
  });

  it("reports brain availability as null when brain disabled", () => {
    const store = makeStore();
    const config = resolveConfig({ brain: { enabled: false } });
    const { payload } = invoke(store, config);
    expect((payload.brain as any).availability).toBe(null);
  });

  it("reports brain availability as ok with full config", () => {
    const store = makeStore();
    const config = resolveConfig({
      brain: {
        enabled: true,
        providerId: "provider-1",
        defaultModel: "gpt-4",
        endpoint: "https://api.example.com",
        protocol: "openai-compat",
        allowlist: [],
      },
    });
    const { payload } = invoke(store, config);
    expect((payload.brain as any).availability).toBe("ok");
  });

  it("reports brain source as web3/decentralized when enabled", () => {
    const store = makeStore();
    const config = resolveConfig({
      brain: {
        enabled: true,
        providerId: "p1",
        defaultModel: "m1",
        endpoint: "https://api.example.com",
        protocol: "openai-compat",
        allowlist: [],
      },
    });
    const { payload } = invoke(store, config);
    expect((payload.brain as any).source).toBe("web3/decentralized");
  });
});

describe("resolveBrainAvailability", () => {
  it("returns null when brain disabled", () => {
    const config = resolveConfig({ brain: { enabled: false } });
    expect(resolveBrainAvailability(config)).toBe(null);
  });

  it("returns degraded when missing providerId", () => {
    const config = resolveConfig({
      brain: { enabled: true, providerId: "", defaultModel: "m1" },
    });
    expect(resolveBrainAvailability(config)).toBe("degraded");
  });

  it("returns unavailable when endpoint empty", () => {
    const config = resolveConfig({
      brain: {
        enabled: true,
        providerId: "p1",
        defaultModel: "m1",
        protocol: "openai-compat",
        endpoint: "",
        allowlist: [],
      },
    });
    expect(resolveBrainAvailability(config)).toBe("unavailable");
  });

  it("returns ok with full valid config", () => {
    const config = resolveConfig({
      brain: {
        enabled: true,
        providerId: "p1",
        defaultModel: "m1",
        protocol: "openai-compat",
        endpoint: "https://api.example.com",
        allowlist: [],
      },
    });
    expect(resolveBrainAvailability(config)).toBe("ok");
  });
});

describe("resolveBillingSummary", () => {
  it("returns unbound when billing disabled", () => {
    const store = makeStore();
    const config = resolveConfig({ billing: { enabled: false } });
    expect(resolveBillingSummary(store, config)).toEqual({
      status: "unbound",
      credits: 0,
    });
  });

  it("returns active with remaining credits from usage", () => {
    const store = makeStore();
    const config = resolveConfig({
      billing: { enabled: true, quotaPerSession: 100 },
    });
    store.saveUsage({
      sessionIdHash: "s1",
      creditsUsed: 40,
      creditsQuota: 100,
      llmCalls: 3,
      toolCalls: 1,
      lastActivity: new Date().toISOString(),
    });
    expect(resolveBillingSummary(store, config)).toEqual({
      status: "active",
      credits: 60,
    });
  });

  it("returns quota default when no usage records", () => {
    const store = makeStore();
    const config = resolveConfig({
      billing: { enabled: true, quotaPerSession: 200 },
    });
    expect(resolveBillingSummary(store, config)).toEqual({
      status: "active",
      credits: 200,
    });
  });
});
