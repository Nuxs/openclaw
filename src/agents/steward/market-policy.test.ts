import { describe, expect, it } from "vitest";
import { planMarketStewardPurchase } from "./market-policy.js";

describe("planMarketStewardPurchase", () => {
  it("selects the strongest candidate by default", () => {
    const plan = planMarketStewardPurchase({
      candidates: [
        {
          resourceId: "res-low",
          score: 4,
          proofRequired: false,
          estimatedTotal: "3",
          currency: "USDC",
        },
        {
          resourceId: "res-high",
          score: 9,
          proofRequired: true,
          estimatedTotal: "4",
          currency: "USDC",
        },
      ],
    });

    expect(plan.status).toBe("approved");
    expect(plan.selectedCandidate?.resourceId).toBe("res-high");
  });

  it("fails closed in execute mode when policy inputs are missing", () => {
    const plan = planMarketStewardPurchase({
      candidates: [
        {
          resourceId: "res-1",
          score: 10,
          proofRequired: true,
          estimatedTotal: "2",
          currency: "USDC",
          providerActorId: "0xprovider",
        },
      ],
      requireBudgetPolicy: true,
      requireRiskPolicy: true,
    });

    expect(plan.status).toBe("rejected");
    expect(plan.budget?.reason).toBe("budget_policy_missing");
    expect(plan.risk?.reason).toBe("risk_policy_missing");
  });

  it("returns approval_required when a valid candidate crosses the approval threshold", () => {
    const plan = planMarketStewardPurchase({
      candidates: [
        {
          resourceId: "res-1",
          score: 11,
          proofRequired: true,
          estimatedTotal: "6",
          currency: "USDC",
          providerActorId: "0xprovider",
        },
      ],
      budgetPolicy: {
        currency: "USDC",
        maxAmount: "10",
        requireApprovalAbove: "5",
      },
      riskPolicy: {
        maxRiskLevel: "high",
        requireProof: true,
        requireProviderActor: true,
      },
    });

    expect(plan.status).toBe("approval_required");
    expect(plan.requiresApproval).toBe(true);
  });
});
