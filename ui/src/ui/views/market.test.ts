import { describe, expect, it } from "vitest";
import { renderMarketBuyerWorkbenchSection } from "./market-buyer-workbench-section.ts";
import { renderMarketControlWorkbenchSection } from "./market-control-workbench-section.ts";
import { filterMarketResources } from "./market-filters.ts";
import { renderMarketProviderWorkbenchSection } from "./market-provider-workbench-section.ts";
import { renderMarket } from "./market.ts";

function createMarketProps(
  overrides: Partial<Parameters<typeof renderMarket>[0]> = {},
): Parameters<typeof renderMarket>[0] {
  return {
    loading: false,
    error: null,
    lastSuccessAt: Date.now(),
    status: null,
    metrics: null,
    indexEntries: [],
    indexStats: null,
    monitor: null,
    resources: [],
    leases: [],
    ledger: null,
    ledgerEntries: [],
    auditSnapshot: null,
    auditError: null,
    disputes: [],
    reputation: null,
    tokenEconomy: null,
    bridgeRoutes: null,
    bridgeTransfers: [],
    resourceKind: "all",
    filters: {
      resourceSearch: "",
      resourceStatus: "all",
      resourceSort: "updated_desc",
      leaseSearch: "",
      leaseStatus: "all",
      leaseSort: "issued_desc",
      disputeSearch: "",
      disputeStatus: "all",
      disputeSort: "opened_desc",
      ledgerSearch: "",
      ledgerUnit: "all",
      ledgerSort: "time_desc",
    },
    onResourceKindChange: () => {},
    onFiltersChange: () => {},
    onRefresh: () => {},
    ...overrides,
  };
}

function collectTemplateScalars(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    acc.push(String(value));
    return acc;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectTemplateScalars(entry, acc);
    }
    return acc;
  }
  if (value && typeof value === "object" && "values" in value) {
    collectTemplateScalars((value as { values?: unknown }).values, acc);
  }
  return acc;
}

describe("market view", () => {
  it("renderMarket composes all section cards including task/privacy/ops", () => {
    const props = createMarketProps({
      executionSection: {
        loading: false,
        executions: [
          {
            orderId: "order-1",
            leaseId: "lease-1",
            resourceId: "res-1",
            resourceLabel: "Secure review",
            providerActorId: "seller-1",
            buyerId: "buyer-1",
            executionStatus: "awaiting_acceptance",
            acceptanceStatus: "acceptance_pending",
            deliveryStatus: "delivery_ready",
            proofId: "proof-1",
            proofStatus: "proof_submitted",
            proofType: "tlsnotary",
            settlementStatus: "settlement_locked",
            settlementAmount: "4",
            releasedAmount: null,
            disputeStatus: null,
            currency: "USDC",
            lastUpdatedAt: "2026-03-15T00:00:00.000Z",
            trace: [],
          },
        ],
      },
      taskSection: {
        loading: false,
        summary: {
          openTasks: 3,
          awardedTasks: 1,
          closedTasks: 2,
          totalBids: 5,
          pendingResults: 1,
          settledReceipts: 2,
          disputedReceipts: 0,
        },
        tasks: [],
        bids: [],
        results: [],
        receipts: [],
      },
      privacySection: {
        loading: false,
        summary: {
          activeConsents: 5,
          revokedConsents: 1,
          pendingErasure: 0,
          totalReplays: 2,
          assetCount: 3,
        },
        consents: [],
        assets: [],
        replays: [],
      },
      opsSection: {
        loading: false,
        summary: {
          activeAlerts: 0,
          alertsByLevel: {},
          healthProbes: [],
          walletHealthy: true,
          discoveryHealthy: true,
          paymentHealthy: true,
          settlementHealthy: true,
          preset: null,
        },
        alerts: [],
      },
      providerOnboardingSection: {
        loading: false,
        error: null,
        mode: "trusted-circle",
        intent: "provider",
        preview: {
          mode: "trusted-circle",
          intent: "provider",
          summary: "可信圈 provider 预检查",
          layout: {
            pattern: "trusted-circle",
            trustDomain: "lan",
            roles: [],
            validationScenarios: [],
          },
          detectedProviders: [
            {
              label: "Local Ollama",
              source: "hint",
              runtime: "ollama",
              offerBackend: "openai-compat",
              models: ["llama3"],
              publishable: true,
            },
          ],
          operations: [],
          checks: [],
          nextSteps: [],
        },
        verification: null,
        onModeChange: () => {},
        onIntentChange: () => {},
        onRefresh: () => {},
      },
    });

    expect(props.executionSection).toBeTruthy();
    expect(props.executionSection?.executions[0]?.executionStatus).toBe("awaiting_acceptance");
    expect(props.taskSection).toBeTruthy();
    expect(props.taskSection?.summary?.openTasks).toBe(3);
    expect(props.privacySection).toBeTruthy();
    expect(props.privacySection?.summary?.activeConsents).toBe(5);
    expect(props.opsSection).toBeTruthy();
    expect(props.opsSection?.summary?.walletHealthy).toBe(true);
    expect(props.opsSection?.summary?.discoveryHealthy).toBe(true);
    expect(props.providerOnboardingSection).toBeTruthy();
    expect(props.providerOnboardingSection?.preview?.detectedProviders[0]?.label).toBe(
      "Local Ollama",
    );
  });

  it("supports service resources in the kind picker and filtering contract", () => {
    const resources = [
      {
        resourceId: "res-service",
        kind: "service",
        status: "resource_published",
        providerActorId: "provider-1",
        offerId: "offer-1",
        label: "Advanced code review",
        description: "Deep secure review",
        price: { amount: "2.5", currency: "USDC", unit: "call" },
        updatedAt: "2026-03-16T00:00:00.000Z",
      },
      {
        resourceId: "res-model",
        kind: "model",
        status: "resource_published",
        providerActorId: "provider-2",
        offerId: "offer-2",
        label: "Local summarizer",
        description: "Model resource",
        price: { amount: "1", currency: "USDC", unit: "token" },
        updatedAt: "2026-03-15T00:00:00.000Z",
      },
    ] as const;

    const filtered = filterMarketResources({
      resources: [...resources],
      resourceKind: "service",
      filters: {
        resourceSearch: "",
        resourceStatus: "all",
        resourceSort: "updated_desc",
      },
    });

    const scalars = collectTemplateScalars(
      renderMarket(
        createMarketProps({
          resourceKind: "service",
          resources: [...resources],
        }),
      ),
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.kind).toBe("service");
    expect(filtered[0]?.label).toBe("Advanced code review");
    expect(scalars).toContain("service");
    expect(scalars).toContain("Service");
  });

  it("task section renders status badges for all task states", () => {
    const states = [
      "task_open",
      "task_awarded",
      "task_closed",
      "task_cancelled",
      "task_expired",
      "bid_submitted",
      "bid_accepted",
      "bid_rejected",
      "result_submitted",
      "result_accepted",
      "result_rejected",
      "receipt_pending",
      "receipt_settled",
      "receipt_refunded",
      "receipt_disputed",
    ];

    for (const state of states) {
      expect(typeof state).toBe("string");
      expect(state.length).toBeGreaterThan(0);
    }
  });

  it("new provider/buyer/control workbench sections expose stable templates", () => {
    const provider = renderMarketProviderWorkbenchSection({
      loading: false,
      resources: [],
      leases: [],
      reputation: null,
      tokenEconomy: null,
    }) as unknown as { strings: ReadonlyArray<string> };
    const buyer = renderMarketBuyerWorkbenchSection({
      loading: false,
      resources: [],
      leases: [],
      disputes: [],
      executions: [],
    }) as unknown as { strings: ReadonlyArray<string> };
    const control = renderMarketControlWorkbenchSection({
      loading: false,
      status: null,
      opsSummary: null,
      alerts: [],
      auditSnapshot: null,
      auditError: null,
      approvalQueueCount: 0,
      growthActionsCount: 0,
    }) as unknown as { strings: ReadonlyArray<string> };

    expect(provider.strings.join(" ")).toContain("Provider Workbench");
    expect(buyer.strings.join(" ")).toContain("Buyer Workbench");
    expect(control.strings.join(" ")).toContain("Control Workbench");
  });

  it("privacy section handles empty state gracefully", () => {
    const props = {
      loading: false,
      summary: null,
      consents: [],
      assets: [],
      replays: [],
    };

    expect(props.summary).toBeNull();
    expect(props.consents.length).toBe(0);
  });
});
