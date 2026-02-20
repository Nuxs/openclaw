import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { createWeb3MetricsSnapshotHandler } from "../metrics/metrics.js";
import { Web3StateStore, type ResourceIndexEntry } from "../state/store.js";
import {
  createResourceIndexHeartbeatHandler,
  createResourceIndexListHandler,
  createResourceIndexReportHandler,
  createResourceIndexStatsHandler,
} from "./indexer.js";

type HandlerResult = { ok: boolean; payload: Record<string, unknown> } | undefined;

type TestContext = {
  store: Web3StateStore;
  config: ReturnType<typeof resolveConfig>;
};

function createResponder() {
  let result: HandlerResult;
  return {
    respond: (ok: boolean, payload: Record<string, unknown>) => {
      result = { ok, payload };
    },
    result: () => result,
  };
}

function createTestContext(stateDir: string): TestContext {
  const config = resolveConfig({ resources: { enabled: true } });
  const store = new Web3StateStore(stateDir);
  return { store, config };
}

describe("web3 resource index flow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-web3-index-flow-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("reports, heartbeats, lists, stats, and metrics snapshot", async () => {
    const { store, config } = createTestContext(tempDir);
    const reportHandler = createResourceIndexReportHandler(store, config);
    const heartbeatHandler = createResourceIndexHeartbeatHandler(store, config);
    const listHandler = createResourceIndexListHandler(store, config);
    const statsHandler = createResourceIndexStatsHandler(store, config);
    const metricsHandler = createWeb3MetricsSnapshotHandler(store, config);

    const report = createResponder();
    await reportHandler({
      params: {
        providerId: "provider-1",
        endpoint: "https://index.example",
        ttlMs: 15_000,
        resources: [
          { resourceId: "model-1", kind: "model", label: "Atlas LLM" },
          { resourceId: "storage-1", kind: "storage", label: "ColdStore" },
        ],
      },
      respond: report.respond,
    } as any);
    expect(report.result()?.ok).toBe(true);

    const heartbeat = createResponder();
    await heartbeatHandler({
      params: { providerId: "provider-1", ttlMs: 20_000 },
      respond: heartbeat.respond,
    } as any);
    expect(heartbeat.result()?.ok).toBe(true);
    expect(heartbeat.result()?.payload.lastHeartbeatAt).toBeTruthy();

    const list = createResponder();
    await listHandler({ params: { kind: "model" }, respond: list.respond } as any);
    expect(list.result()?.ok).toBe(true);
    const entries = (list.result()?.payload.entries as ResourceIndexEntry[]) ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.resources?.[0]?.resourceId).toBe("model-1");

    const stats = createResponder();
    await statsHandler({ respond: stats.respond } as any);
    expect(stats.result()?.ok).toBe(true);
    expect(stats.result()?.payload.providers).toBe(1);
    expect(stats.result()?.payload.resources).toBe(2);

    const metrics = createResponder();
    await metricsHandler({ respond: metrics.respond } as any);
    expect(metrics.result()?.ok).toBe(true);
    const metricsPayload = metrics.result()?.payload as {
      resources?: { total?: number; providers?: number };
      alerts?: Array<Record<string, unknown>>;
    };
    expect(metricsPayload.resources?.total ?? 0).toBe(2);
    expect(metricsPayload.resources?.providers ?? 0).toBe(1);
    expect(Array.isArray(metricsPayload.alerts)).toBe(true);
  });
});
