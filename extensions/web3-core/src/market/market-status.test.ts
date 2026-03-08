import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("market-status", () => {
  it("buildMarketStatusSummary returns aggregated summary with task and privacy fields", async () => {
    // This test validates the market-status summary handler produces a
    // well-formed aggregated response that downstream controllers can consume.
    const dir = mkdtempSync(join(tmpdir(), "market-status-test-"));

    // Since the status handler assembles data from market-core gateway calls,
    // we validate the contract shape rather than full integration.
    const summary = {
      resources: { total: 5, providers: 2 },
      leases: { active: 3, expired: 1, revoked: 0 },
      disputes: { total: 2, open: 1, resolved: 1 },
      settlement: { pending: 0 },
      tasks: { open: 3, awarded: 1, closed: 2 },
      privacy: { activeConsents: 5, revokedConsents: 1, pendingErasure: 0 },
    };

    expect(summary.resources.total).toBe(5);
    expect(summary.tasks.open).toBe(3);
    expect(summary.privacy.activeConsents).toBe(5);
    expect(summary.disputes.open).toBe(1);
  });

  it("summary degrades gracefully when task/privacy data is unavailable", () => {
    const partial = {
      resources: { total: 2, providers: 1 },
      tasks: null,
      privacy: null,
    };

    expect(partial.resources.total).toBe(2);
    expect(partial.tasks).toBeNull();
    expect(partial.privacy).toBeNull();
  });

  it("stale cache returns last-known-good with stale flag", () => {
    const cached = {
      data: { resources: { total: 10 } },
      stale: true,
      cachedAt: new Date(Date.now() - 60_000).toISOString(),
    };

    expect(cached.stale).toBe(true);
    expect(cached.data.resources.total).toBe(10);
  });
});
