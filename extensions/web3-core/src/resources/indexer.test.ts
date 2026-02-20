import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { Web3StateStore, type IndexedResource, type ResourceIndexEntry } from "../state/store.js";
import { createResourceIndexListHandler, createResourceIndexReportHandler } from "./indexer.js";

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

describe("web3 resource index", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-web3-index-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("stores resource index reports and lists entries", async () => {
    const { store, config } = createTestContext(tempDir);
    const reportHandler = createResourceIndexReportHandler(store, config);
    const listHandler = createResourceIndexListHandler(store, config);

    const resources: IndexedResource[] = [
      {
        resourceId: "res-model",
        kind: "model",
        label: "LLM",
        tags: ["llm", "gpu"],
        metadata: { endpoint: "https://sensitive.local" },
      },
      { resourceId: "res-search", kind: "search", label: "Search", tags: ["search"] },
    ];

    const report = createResponder();
    await reportHandler({
      params: {
        providerId: "provider-1",
        endpoint: "https://example.test",
        resources,
        ttlMs: 5_000,
      },
      respond: report.respond,
    } as any);

    expect(report.result()?.ok).toBe(true);

    const list = createResponder();
    await listHandler({
      params: { kind: "model" },
      respond: list.respond,
    } as any);

    expect(list.result()?.ok).toBe(true);
    const entries = (list.result()?.payload.entries as ResourceIndexEntry[]) ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.providerId).toBe("provider-1");
    expect(entries[0]?.endpoint).toBeUndefined();
    expect(entries[0]?.meta).toBeUndefined();
    expect(entries[0]?.resources).toHaveLength(1);
    expect(entries[0]?.resources[0]?.resourceId).toBe("res-model");
    expect(entries[0]?.resources[0]?.metadata).toBeUndefined();
  });

  it("filters out expired index entries", async () => {
    const { store, config } = createTestContext(tempDir);
    const listHandler = createResourceIndexListHandler(store, config);

    const expiredEntry: ResourceIndexEntry = {
      providerId: "provider-expired",
      endpoint: "https://expired.test",
      resources: [{ resourceId: "expired", kind: "storage" }],
      updatedAt: new Date(Date.now() - 10_000).toISOString(),
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    };

    store.saveResourceIndex([expiredEntry]);

    const list = createResponder();
    await listHandler({ respond: list.respond } as any);

    expect(list.result()?.ok).toBe(true);
    const entries = (list.result()?.payload.entries as ResourceIndexEntry[]) ?? [];
    expect(entries).toHaveLength(0);
  });
});
