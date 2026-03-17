import { describe, expect, it } from "vitest";
import {
  deriveStewardGrowthHints,
  deriveStewardResearchBacklog,
  formatStewardGrowthHints,
  resolveStewardAutonomyPosture,
  resolveStewardCadence,
} from "./growth-loop.js";

describe("steward growth loop", () => {
  it("surfaces approval follow-up when execution is blocked on consent", () => {
    const hints = deriveStewardGrowthHints({
      sessionId: "sess-1",
      updatedAt: Date.now(),
      steward: {
        lastStatus: "approval_required",
        lastOrderId: "order-1",
        lastConsentId: "consent-1",
      },
    });

    expect(hints).toContainEqual(
      expect.objectContaining({
        kind: "approval",
        priority: "high",
        nextTools: ["web3.market.consent.grant", "web3.market.consent.revoke"],
      }),
    );
  });

  it("derives a guarded posture and near-term cadence for active approval or dispute lanes", () => {
    const sessionEntry = {
      sessionId: "sess-2",
      updatedAt: Date.now(),
      steward: {
        lastStatus: "approval_required",
        lastOrderId: "order-2",
        lastConsentId: "consent-2",
      },
    };

    expect(resolveStewardAutonomyPosture(sessionEntry)).toBe("guarded");
    expect(resolveStewardCadence(sessionEntry)).toMatchObject({
      everyMs: 30 * 60 * 1000,
      label: "30m",
    });
  });

  it("reuses stored research backlog before synthesizing a new one", () => {
    const backlog = deriveStewardResearchBacklog({
      sessionId: "sess-3",
      updatedAt: Date.now(),
      steward: {
        researchBacklog: [
          "Persist a stronger approval threshold for premium reviews.",
          "Compare proof-backed fallback providers before the next quiet cycle.",
        ],
      },
    });

    expect(backlog).toEqual([
      "Persist a stronger approval threshold for premium reviews.",
      "Compare proof-backed fallback providers before the next quiet cycle.",
    ]);
  });

  it("formats dispute and policy hints into a readable prompt block", () => {
    const formatted = formatStewardGrowthHints({
      sessionId: "sess-4",
      updatedAt: Date.now(),
      settlement: { orderId: "order-4", payer: "buyer-1" },
      steward: {
        lastStatus: "acceptance_rejected",
        lastDisputeId: "dispute-4",
      },
    });

    expect(formatted).toContain("Suggested steward follow-up priorities:");
    expect(formatted).toContain("dispute-4");
    expect(formatted).toContain("Durable spending or risk policy memory is still missing");
  });
});
