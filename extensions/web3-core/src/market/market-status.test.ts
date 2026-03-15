import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Web3PluginConfig } from "../config.js";
import { loadCallGateway } from "../core-imports.js";
import {
  buildWeb3MarketStatusSummary,
  formatWeb3MarketStatusMessage,
  resetWeb3MarketStatusCacheForTests,
} from "./market-status.ts";

vi.mock("../core-imports.js", () => ({
  loadCallGateway: vi.fn(),
  normalizeGatewayResult: (payload: unknown) => payload,
}));

function createConfig(): Web3PluginConfig {
  return {
    brain: { timeoutMs: 1_500 },
  } as unknown as Web3PluginConfig;
}

function installGatewayResponses(responses: Record<string, unknown>) {
  const gateway = vi.fn(async ({ method }: { method: string }) => {
    if (!(method in responses)) {
      return { ok: false, error: `unexpected method ${method}` };
    }
    return responses[method];
  });
  vi.mocked(loadCallGateway).mockResolvedValue(gateway as never);
  return gateway;
}

describe("market-status", () => {
  beforeEach(() => {
    resetWeb3MarketStatusCacheForTests();
    vi.clearAllMocks();
  });

  it("buildWeb3MarketStatusSummary aggregates task and privacy probes into the runtime summary", async () => {
    const gateway = installGatewayResponses({
      "web3.status.summary": { ok: true, result: { connected: true } },
      "web3.market.status.summary": { ok: true, result: { enabled: true } },
      "web3.market.ledger.summary": { ok: true, result: { pending: 0 } },
      "market.task.list": {
        ok: true,
        result: {
          tasks: [
            { taskId: "task-1", status: "task_open" },
            { taskId: "task-2", status: "task_awarded" },
            { taskId: "task-3", status: "task_closed" },
          ],
        },
      },
      "market.consent.list": {
        ok: true,
        result: {
          consents: [
            { consentId: "consent-1", status: "consent_granted" },
            { consentId: "consent-2", status: "consent_revoked" },
          ],
        },
      },
    });

    const summary = await buildWeb3MarketStatusSummary({
      config: createConfig(),
      profile: "fast",
    });

    expect(gateway).toHaveBeenCalled();
    expect(summary.meta).toEqual({ profile: "fast" });
    expect(summary.runtime.tasks).toEqual({
      total: 3,
      byStatus: {
        task_open: 1,
        task_awarded: 1,
        task_closed: 1,
      },
      openTasks: 1,
      awardedTasks: 1,
      closedTasks: 1,
    });
    expect(summary.runtime.privacy).toEqual({
      total: 2,
      activeConsents: 1,
      revokedConsents: 1,
      pendingErasure: 1,
    });
    expect(formatWeb3MarketStatusMessage(summary)).toContain(
      "📋 Tasks: total=3 · open=1 · awarded=1 · closed=1",
    );
  });

  it("returns a stale last-known-good runtime when later task probes fail", async () => {
    installGatewayResponses({
      "web3.status.summary": { ok: true, result: { connected: true } },
      "web3.market.status.summary": { ok: true, result: { enabled: true } },
      "web3.market.ledger.summary": { ok: true, result: { pending: 0 } },
      "market.task.list": {
        ok: true,
        result: {
          tasks: [{ taskId: "task-1", status: "task_open" }],
        },
      },
      "market.consent.list": {
        ok: true,
        result: {
          consents: [{ consentId: "consent-1", status: "consent_granted" }],
        },
      },
    });

    await buildWeb3MarketStatusSummary({ config: createConfig(), profile: "fast" });

    installGatewayResponses({
      "web3.status.summary": { ok: true, result: { connected: true } },
      "web3.market.status.summary": { ok: true, result: { enabled: true } },
      "web3.market.ledger.summary": { ok: true, result: { pending: 0 } },
      "market.task.list": { ok: false, error: "unknown method market.task.list" },
      "market.consent.list": {
        ok: true,
        result: {
          consents: [{ consentId: "consent-1", status: "consent_granted" }],
        },
      },
    });

    const summary = await buildWeb3MarketStatusSummary({
      config: createConfig(),
      profile: "fast",
    });

    expect(summary.meta.stale).toBe(true);
    expect(summary.runtime.tasks).toEqual({
      total: 1,
      byStatus: { task_open: 1 },
      openTasks: 1,
      awardedTasks: 0,
      closedTasks: 0,
    });
    expect(summary.runtime.errors).toContain("market.task.list: unknown method market.task.list");
    expect(formatWeb3MarketStatusMessage(summary)).toContain("⚠️ Some probes failed:");
  });

  it("redacts endpoints, tokens, and local paths from share-safe market status", async () => {
    installGatewayResponses({
      "web3.status.summary": {
        ok: true,
        result: {
          connected: true,
          providerEndpoint: "https://provider.example.com",
          accessToken: "tok_secret_123",
          cwd: "/Users/test/private",
        },
      },
      "web3.market.status.summary": {
        ok: true,
        result: {
          enabled: true,
          nested: {
            endpoint: "https://operator.example.com",
            storePath: "/Users/test/market-state",
            token: "tok_inner_456",
          },
        },
      },
      "web3.market.ledger.summary": {
        ok: true,
        result: {
          pending: 0,
          rpcUrl: "https://rpc.example.com",
        },
      },
      "market.task.list": { ok: true, result: { tasks: [] } },
      "market.consent.list": { ok: true, result: { consents: [] } },
    });

    const summary = await buildWeb3MarketStatusSummary({
      config: createConfig(),
      profile: "fast",
    });
    const serialized = JSON.stringify(summary);

    expect(serialized).not.toContain("provider.example.com");
    expect(serialized).not.toContain("operator.example.com");
    expect(serialized).not.toContain("rpc.example.com");
    expect(serialized).not.toContain("tok_secret_123");
    expect(serialized).not.toContain("tok_inner_456");
    expect(serialized).not.toContain("/Users/test");
  });
});
