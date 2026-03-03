/**
 * withSettlementLock unit tests — verifies per-orderId serialization.
 */

import { describe, expect, it } from "vitest";
import { withSettlementLock } from "./settlement-lock.js";

describe("withSettlementLock", () => {
  it("serializes concurrent calls for the same orderId", async () => {
    const timeline: string[] = [];

    const first = withSettlementLock("order-A", async () => {
      timeline.push("A1-start");
      await new Promise((r) => setTimeout(r, 50));
      timeline.push("A1-end");
      return "result-A1";
    });

    const second = withSettlementLock("order-A", async () => {
      timeline.push("A2-start");
      await new Promise((r) => setTimeout(r, 10));
      timeline.push("A2-end");
      return "result-A2";
    });

    const [r1, r2] = await Promise.all([first, second]);

    expect(r1).toBe("result-A1");
    expect(r2).toBe("result-A2");

    // A1 must finish before A2 starts (serialized).
    expect(timeline).toEqual(["A1-start", "A1-end", "A2-start", "A2-end"]);
  });

  it("runs different orderIds in parallel", async () => {
    const timeline: string[] = [];

    const first = withSettlementLock("order-X", async () => {
      timeline.push("X-start");
      await new Promise((r) => setTimeout(r, 50));
      timeline.push("X-end");
    });

    const second = withSettlementLock("order-Y", async () => {
      timeline.push("Y-start");
      await new Promise((r) => setTimeout(r, 50));
      timeline.push("Y-end");
    });

    await Promise.all([first, second]);

    // Both should start before either finishes (parallel).
    expect(timeline.indexOf("X-start")).toBeLessThan(timeline.indexOf("X-end"));
    expect(timeline.indexOf("Y-start")).toBeLessThan(timeline.indexOf("Y-end"));
    // Y-start should come before X-end (parallel execution).
    expect(timeline.indexOf("Y-start")).toBeLessThan(timeline.indexOf("X-end"));
  });

  it("releases lock on error so subsequent calls proceed", async () => {
    await expect(
      withSettlementLock("order-err", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // Lock is released — next call should proceed immediately.
    const result = await withSettlementLock("order-err", async () => "recovered");
    expect(result).toBe("recovered");
  });

  it("serializes 3+ concurrent calls in FIFO order", async () => {
    const timeline: string[] = [];

    const tasks = [1, 2, 3].map((n) =>
      withSettlementLock("order-fifo", async () => {
        timeline.push(`${n}-start`);
        await new Promise((r) => setTimeout(r, 20));
        timeline.push(`${n}-end`);
        return n;
      }),
    );

    const results = await Promise.all(tasks);
    expect(results).toEqual([1, 2, 3]);
    expect(timeline).toEqual(["1-start", "1-end", "2-start", "2-end", "3-start", "3-end"]);
  });
});
