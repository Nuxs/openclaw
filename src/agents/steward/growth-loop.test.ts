import { describe, expect, it } from "vitest";
import { deriveStewardGrowthHints, formatStewardGrowthHints } from "./growth-loop.js";

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

  it("surfaces acceptance follow-up once proof exists but settlement is still open", () => {
    const hints = deriveStewardGrowthHints({
      sessionId: "sess-2",
      updatedAt: Date.now(),
      steward: {
        lastStatus: "executed",
        lastOrderId: "order-2",
        lastProofId: "proof-2",
        budgetPolicy: { maxAmount: "10" },
      },
    });

    expect(hints).toContainEqual(
      expect.objectContaining({
        kind: "acceptance",
        priority: "high",
        refs: ["orderId=order-2", "proofId=proof-2"],
      }),
    );
  });

  it("formats dispute and policy hints into a readable prompt block", () => {
    const formatted = formatStewardGrowthHints({
      sessionId: "sess-3",
      updatedAt: Date.now(),
      settlement: { orderId: "order-3", payer: "buyer-1" },
      steward: {
        lastStatus: "acceptance_rejected",
        lastDisputeId: "dispute-3",
      },
    });

    expect(formatted).toContain("Suggested steward follow-up priorities:");
    expect(formatted).toContain("dispute-3");
    expect(formatted).toContain("No remembered budget policy is stored yet");
  });
});
