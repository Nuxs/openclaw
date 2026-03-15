import { describe, expect, it } from "vitest";
import { evaluateBudgetPolicy } from "./budget-policy.js";

describe("evaluateBudgetPolicy", () => {
  it("approves when amount stays within budget", () => {
    const decision = evaluateBudgetPolicy({
      quoteAmount: "2",
      currency: "USDC",
      policy: {
        currency: "USDC",
        maxAmount: "5",
        remainingDailyAmount: "10",
      },
    });

    expect(decision.status).toBe("approved");
    expect(decision.reason).toBe("within_budget");
  });

  it("requires approval when quote crosses the approval threshold", () => {
    const decision = evaluateBudgetPolicy({
      quoteAmount: "6",
      currency: "USDC",
      policy: {
        currency: "USDC",
        maxAmount: "10",
        requireApprovalAbove: "5",
      },
    });

    expect(decision.status).toBe("approval_required");
    expect(decision.requiresApproval).toBe(true);
  });

  it("rejects when a required policy is missing", () => {
    const decision = evaluateBudgetPolicy({
      quoteAmount: "3",
      requirePolicy: true,
    });

    expect(decision.status).toBe("rejected");
    expect(decision.reason).toBe("budget_policy_missing");
  });
});
