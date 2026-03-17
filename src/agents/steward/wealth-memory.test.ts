import { describe, expect, it } from "vitest";
import {
  deriveStewardGrowthCheckpoint,
  formatStewardGrowthCheckpoint,
  summarizeStewardGrowthCheckpoint,
} from "./wealth-memory.js";

describe("steward wealth memory", () => {
  it("builds a checkpoint for approval-gated sessions", () => {
    const checkpoint = deriveStewardGrowthCheckpoint({
      sessionId: "sess-1",
      updatedAt: Date.now(),
      steward: {
        lastStatus: "approval_required",
        lastOrderId: "order-1",
        lastConsentId: "consent-1",
      },
    });

    expect(checkpoint?.summary).toContain("owner-governance boundary");
    expect(checkpoint?.autonomyPosture).toBe("guarded");
    expect(checkpoint?.cadenceLabel).toBe("30m");
    expect(checkpoint?.memoryAnchors).toContain("Current order anchor: order-1");
    expect(checkpoint?.researchTopics[0]).toContain("approval thresholds");
    expect(checkpoint?.heartbeatActions[0]).toContain("web3.market.consent.grant");
  });

  it("summarizes proof-backed but unsettled loops", () => {
    const summary = summarizeStewardGrowthCheckpoint({
      sessionId: "sess-2",
      updatedAt: Date.now(),
      steward: {
        lastStatus: "executed",
        lastOrderId: "order-2",
        lastProofId: "proof-2",
        budgetPolicy: { maxAmount: "12" },
        riskPolicy: { requireProof: true },
      },
    });

    expect(summary).toContain("proof exists");
    expect(summary).toContain("acceptance");
  });

  it("formats autonomy posture, cadence, and queues for prompt injection", () => {
    const formatted = formatStewardGrowthCheckpoint({
      sessionId: "sess-3",
      updatedAt: Date.now(),
      steward: {
        lastStatus: "acceptance_rejected",
        lastDisputeId: "dispute-3",
        growthJob: {
          nextWakeAt: "2026-03-18T03:00:00.000Z",
        },
      },
      settlement: {
        orderId: "order-3",
      },
    });

    expect(formatted).toContain("## Steward Growth Loop");
    expect(formatted).toContain("Autonomy posture: guarded");
    expect(formatted).toContain("Heartbeat cadence: 30m");
    expect(formatted).toContain("Next wake: 2026-03-18T03:00:00.000Z");
    expect(formatted).toContain("Research queue:");
    expect(formatted).toContain("dispute-3");
  });
});
