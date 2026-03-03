import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { Web3StateStore } from "../state/store.js";
import {
  createWeb3MetricsSnapshotHandler,
  createWeb3RecordX402AutopayMetricHandler,
} from "./metrics.js";

type HandlerResult = { ok: boolean; payload: Record<string, unknown> } | undefined;

function createResponder() {
  let result: HandlerResult;
  return {
    respond: (ok: boolean, payload: Record<string, unknown>) => {
      result = { ok, payload };
    },
    result: () => result,
  };
}

describe("web3 metrics snapshot", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-web3-metrics-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("does not trigger autopay failure rate alert when there are no attempts", () => {
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const handler = createWeb3MetricsSnapshotHandler(store, config);
    const responder = createResponder();

    handler({ respond: responder.respond } as any);

    expect(responder.result()?.ok).toBe(true);
    const payload = responder.result()?.payload as Record<string, any>;
    expect(payload.x402.autopay.success.rate).toBeNull();
    const alerts = payload.alerts as Array<Record<string, any>>;
    const failureRateAlert = alerts.find((entry) => entry.rule === "x402_autopay_failure_rate");
    expect(failureRateAlert?.triggered).toBe(false);
    expect(failureRateAlert?.value).toBe(0);
  });

  it("records retry and circuit breaker metrics via gateway handler", () => {
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const recordHandler = createWeb3RecordX402AutopayMetricHandler(store);
    const snapshotHandler = createWeb3MetricsSnapshotHandler(store, config);

    const recordResponder = createResponder();
    recordHandler({ params: { event: "attempt" }, respond: recordResponder.respond } as any);
    recordHandler({ params: { event: "failure" }, respond: recordResponder.respond } as any);
    recordHandler({
      params: { event: "retry", count: 2 },
      respond: recordResponder.respond,
    } as any);
    recordHandler({
      params: { event: "circuit_breaker_trip" },
      respond: recordResponder.respond,
    } as any);

    const snapshotResponder = createResponder();
    snapshotHandler({ respond: snapshotResponder.respond } as any);

    expect(snapshotResponder.result()?.ok).toBe(true);
    const payload = snapshotResponder.result()?.payload as Record<string, any>;
    expect(payload.x402.autopay.retry.count).toBe(2);
    expect(payload.x402.autopay.circuitBreaker.trips).toBe(1);
    expect(payload.x402.autopay.circuitBreaker.lastTripAt).toBeTypeOf("string");
    expect(payload.x402.autopay.failure.count).toBe(1);
  });

  it("does not keep circuit-breaker alert active outside cooldown window", () => {
    const store = new Web3StateStore(tempDir);
    const config = resolveConfig({});
    const snapshotHandler = createWeb3MetricsSnapshotHandler(store, config);

    const staleTripAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    store.saveX402AutopayStats({
      attempts: 20,
      successes: 10,
      failures: 10,
      retryCount: 5,
      circuitBreakerTrips: 5,
      lastCircuitBreakerTripAt: staleTripAt,
      updatedAt: new Date().toISOString(),
    });

    const responder = createResponder();
    snapshotHandler({ respond: responder.respond } as any);

    expect(responder.result()?.ok).toBe(true);
    const payload = responder.result()?.payload as Record<string, any>;
    const alerts = payload.alerts as Array<Record<string, any>>;
    const breakerAlert = alerts.find(
      (entry) => entry.rule === "x402_autopay_circuit_breaker_trips",
    );
    expect(breakerAlert?.triggered).toBe(false);
  });
});
