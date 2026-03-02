import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDailySpent, buildDailyBudgetKey, readDailySpent } from "./state.js";

let tmpDir: string;
let statePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-wallet-state-test-"));
  statePath = path.join(tmpDir, "policy-state.json");
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("policy budget state", () => {
  it("builds daily budget key with date and chain", () => {
    expect(buildDailyBudgetKey(new Date("2026-03-02T12:34:56.000Z"), "base")).toBe(
      "budget:daily:2026-03-02:base",
    );
  });

  it("reads zero when state file is missing", async () => {
    const spent = await readDailySpent({
      config: { enabled: true, statePath },
      chainKey: "base",
      now: new Date("2026-03-02T00:00:00.000Z"),
    });

    expect(spent).toBe(0n);
  });

  it("adds and reads daily spent for same day", async () => {
    await addDailySpent({
      config: { enabled: true, statePath },
      chainKey: "base",
      amount: 100n,
      now: new Date("2026-03-02T10:00:00.000Z"),
    });

    await addDailySpent({
      config: { enabled: true, statePath },
      chainKey: "base",
      amount: 20n,
      now: new Date("2026-03-02T18:00:00.000Z"),
    });

    const spent = await readDailySpent({
      config: { enabled: true, statePath },
      chainKey: "base",
      now: new Date("2026-03-02T23:00:00.000Z"),
    });

    expect(spent).toBe(120n);
  });

  it("isolates totals by day", async () => {
    await addDailySpent({
      config: { enabled: true, statePath },
      chainKey: "base",
      amount: 50n,
      now: new Date("2026-03-02T20:00:00.000Z"),
    });

    const nextDaySpent = await readDailySpent({
      config: { enabled: true, statePath },
      chainKey: "base",
      now: new Date("2026-03-03T00:00:00.000Z"),
    });

    expect(nextDaySpent).toBe(0n);
  });
});
