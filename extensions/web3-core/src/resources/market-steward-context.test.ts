import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  rememberMarketStewardContext,
  resolveMarketStewardContext,
} from "./market-steward-context.js";

const {
  loadCoreConfigMock,
  loadSessionStoreHelpersMock,
  loadStewardGrowthRuntimeHelpersMock,
  syncStewardGrowthLoopMock,
} = vi.hoisted(() => ({
  loadCoreConfigMock: vi.fn(),
  loadSessionStoreHelpersMock: vi.fn(),
  loadStewardGrowthRuntimeHelpersMock: vi.fn(),
  syncStewardGrowthLoopMock: vi.fn(),
}));

let currentEntry: Record<string, unknown> | null = null;

type UpdateParams = {
  update: (
    entry: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null | Partial<Record<string, unknown>>>;
};

const updateSessionStoreEntryMock = vi.fn(async ({ update }: UpdateParams) => {
  const patch = await update((currentEntry ?? {}) as Record<string, unknown>);
  if (patch) {
    currentEntry = { ...(currentEntry ?? {}), ...patch };
  }
  return currentEntry;
});

vi.mock("../core-imports.js", () => ({
  loadCoreConfig: loadCoreConfigMock,
  loadSessionStoreHelpers: loadSessionStoreHelpersMock,
  loadStewardGrowthRuntimeHelpers: loadStewardGrowthRuntimeHelpersMock,
}));

describe("market steward context", () => {
  beforeEach(() => {
    currentEntry = null;
    updateSessionStoreEntryMock.mockClear();
    loadCoreConfigMock.mockReset();
    loadSessionStoreHelpersMock.mockReset();
    loadStewardGrowthRuntimeHelpersMock.mockReset();
    syncStewardGrowthLoopMock.mockReset();
    loadCoreConfigMock.mockResolvedValue({ session: { store: "file" } });
    loadSessionStoreHelpersMock.mockResolvedValue({
      resolveSessionStoreKey: ({ sessionKey }: { sessionKey: string }) => `canonical:${sessionKey}`,
      resolveSessionAgentId: () => "agent-1",
      resolveStorePath: () => "/tmp/openclaw-session-store.json",
      updateSessionStoreEntry: updateSessionStoreEntryMock,
    });
    loadStewardGrowthRuntimeHelpersMock.mockResolvedValue({
      syncStewardGrowthLoop: syncStewardGrowthLoopMock,
    });
  });

  it("restores stored steward identity and governance policies from the session", async () => {
    currentEntry = {
      settlement: {
        actorId: "0xsettlement-buyer",
        payer: "0xsettlement-consumer",
      },
      steward: {
        actorId: "0xremembered-buyer",
        consumerActorId: "0xremembered-consumer",
        budgetPolicy: {
          currency: "USDC",
          maxAmount: "12",
          requireApprovalAbove: "8",
        },
        riskPolicy: {
          maxRiskLevel: "medium",
          requireProof: true,
          requireProviderActor: true,
        },
        approval: {
          approved: true,
          approvalId: "approve-1",
        },
      },
    };

    const resolved = await resolveMarketStewardContext({ sessionKey: "sess-1" });

    expect(resolved.sessionKey).toBe("canonical:sess-1");
    expect(resolved.actorId).toBe("0xremembered-buyer");
    expect(resolved.consumerActorId).toBe("0xremembered-consumer");
    expect(resolved.budgetPolicy).toMatchObject({
      currency: "USDC",
      maxAmount: "12",
      requireApprovalAbove: "8",
    });
    expect(resolved.riskPolicy).toMatchObject({
      maxRiskLevel: "medium",
      requireProof: true,
      requireProviderActor: true,
    });
    expect(resolved.approval).toMatchObject({
      approved: true,
      approvalId: "approve-1",
    });
    expect(resolved.usedStoredIdentity).toBe(true);
    expect(resolved.usedStoredBudgetPolicy).toBe(true);
    expect(resolved.usedStoredRiskPolicy).toBe(true);
    expect(resolved.usedStoredApproval).toBe(true);
  });

  it("applies conservative default budget and risk policies for execute mode", async () => {
    currentEntry = {};

    const resolved = await resolveMarketStewardContext({
      sessionKey: "sess-2",
      maxCost: "7",
      execute: true,
    });

    expect(resolved.sessionKey).toBe("canonical:sess-2");
    expect(resolved.budgetPolicy).toEqual({
      maxAmount: "7",
      requireApprovalAbove: "7",
      failClosed: true,
    });
    expect(resolved.riskPolicy).toEqual({
      maxRiskLevel: "high",
      requireProof: true,
      requireProviderActor: true,
      requireApprovalForHighRisk: true,
      allowUnpriced: false,
      failClosed: true,
    });
    expect(resolved.usedDefaultBudgetPolicy).toBe(true);
    expect(resolved.usedDefaultRiskPolicy).toBe(true);
  });

  it("persists steward execution state back into the session store and syncs growth runtime", async () => {
    currentEntry = {
      steward: {
        actorId: "0xold-buyer",
      },
    };

    await rememberMarketStewardContext({
      sessionKey: "sess-3",
      actorId: "0xnew-buyer",
      consumerActorId: "0xconsumer",
      budgetPolicy: {
        currency: "USDC",
        maxAmount: "20",
      },
      riskPolicy: {
        maxRiskLevel: "high",
        requireProof: true,
      },
      approval: {
        approved: true,
        approvalId: "approve-2",
      },
      status: "executed",
      orderId: "order-1",
      resourceId: "res-1",
      leaseId: "lease-1",
      settlementId: "settlement-1",
      growthSummary: "Prefer proof-backed providers when available.",
      researchBacklog: ["Compare proof-backed fallback routes before the next quiet cycle."],
      lastResearchedAt: "2026-03-18T01:00:00.000Z",
    });

    expect(updateSessionStoreEntryMock).toHaveBeenCalledTimes(1);
    expect(currentEntry).toMatchObject({
      settlement: {
        orderId: "order-1",
        payer: "0xconsumer",
        actorId: "0xnew-buyer",
      },
      steward: {
        actorId: "0xnew-buyer",
        consumerActorId: "0xconsumer",
        budgetPolicy: {
          currency: "USDC",
          maxAmount: "20",
        },
        riskPolicy: {
          maxRiskLevel: "high",
          requireProof: true,
        },
        approval: {
          approved: true,
          approvalId: "approve-2",
        },
        lastStatus: "executed",
        lastOrderId: "order-1",
        lastResourceId: "res-1",
        lastLeaseId: "lease-1",
        lastSettlementId: "settlement-1",
        growthSummary: "Prefer proof-backed providers when available.",
        researchBacklog: ["Compare proof-backed fallback routes before the next quiet cycle."],
        lastResearchedAt: "2026-03-18T01:00:00.000Z",
        updatedAt: expect.any(Number),
      },
    });
    expect(syncStewardGrowthLoopMock).toHaveBeenCalledWith({
      sessionKey: "canonical:sess-3",
    });
  });
});
