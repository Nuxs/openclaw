import { describe, expect, it } from "vitest";
import { parseMarketToolCard } from "./market-consent-card.ts";

describe("market consent card", () => {
  it("parses steward approval-required payloads into a compact consent summary", () => {
    const parsed = parseMarketToolCard({
      kind: "result",
      name: "web3.market.steward.buy",
      text: JSON.stringify({
        status: "approval_required",
        executed: false,
        candidatesConsidered: 3,
        selectedCandidate: {
          resourceId: "res-1",
          label: "Secure review",
          providerActorId: "seller-1",
        },
        plan: {
          budget: { status: "approval_required", reason: "approval_required" },
          risk: { status: "approved", reason: "risk_accepted", riskLevel: "medium" },
        },
      }),
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("steward");
    if (!parsed || parsed.kind !== "steward") {
      throw new Error("expected steward card");
    }
    expect(parsed.status).toBe("approval_required");
    expect(parsed.resourceLabel).toBe("Secure review");
    expect(parsed.budgetReason).toBe("approval_required");
    expect(parsed.riskLevel).toBe("medium");
  });

  it("parses execution summaries into a compact delivery snapshot", () => {
    const parsed = parseMarketToolCard({
      kind: "result",
      name: "web3.market.execution.status",
      text: JSON.stringify({
        orderId: "order-1",
        executionStatus: "awaiting_acceptance",
        acceptance: { status: "acceptance_pending" },
        proof: { summary: { type: "tlsnotary" } },
        settlement: { status: "settlement_locked" },
        trace: [{ id: "trace-1" }],
      }),
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("execution");
    if (!parsed || parsed.kind !== "execution") {
      throw new Error("expected execution card");
    }
    expect(parsed.executionStatus).toBe("awaiting_acceptance");
    expect(parsed.acceptanceStatus).toBe("acceptance_pending");
    expect(parsed.proofType).toBe("tlsnotary");
    expect(parsed.traceCount).toBe(1);
  });
});
