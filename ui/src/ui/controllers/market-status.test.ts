import { describe, expect, it, vi } from "vitest";
import type { GatewayBrowserClient } from "../gateway.ts";
import {
  loadMarketOps,
  loadMarketPresetPreview,
  loadMarketPrivacy,
  loadMarketTasks,
  type MarketOpsState,
  type MarketPresetState,
} from "./market-status.ts";

function createClient(
  resolver: (method: string, params: Record<string, unknown>) => unknown,
): GatewayBrowserClient {
  return {
    request: vi.fn((method: string, params: Record<string, unknown> = {}) =>
      resolver(method, params),
    ),
  } as unknown as GatewayBrowserClient;
}

describe("market-status controller", () => {
  it("loadMarketTasks uses the formal result list method and derives summary fields", async () => {
    const methods: string[] = [];
    const client = createClient(async (method) => {
      methods.push(method);
      switch (method) {
        case "web3.market.task.list":
          return {
            result: {
              tasks: [
                {
                  taskId: "task-open",
                  title: "Open task",
                  status: "task_open",
                  creatorActorId: "creator-1",
                  budget: { amount: "100", currency: "USDC" },
                  requirements: ["one"],
                  expiryAt: "2026-03-20T00:00:00.000Z",
                  createdAt: "2026-03-13T00:00:00.000Z",
                },
                {
                  taskId: "task-awarded",
                  title: "Awarded task",
                  status: "task_awarded",
                  creatorActorId: "creator-1",
                  budget: { amount: "150", currency: "USDC" },
                  requirements: ["two"],
                  expiryAt: "2026-03-21T00:00:00.000Z",
                  createdAt: "2026-03-13T01:00:00.000Z",
                },
                {
                  taskId: "task-closed",
                  title: "Closed task",
                  status: "task_closed",
                  creatorActorId: "creator-1",
                  budget: { amount: "200", currency: "USDC" },
                  requirements: ["three"],
                  expiryAt: "2026-03-22T00:00:00.000Z",
                  createdAt: "2026-03-13T02:00:00.000Z",
                },
              ],
            },
          };
        case "web3.market.task.bid.list":
          return {
            result: {
              bids: [
                {
                  bidId: "bid-1",
                  taskId: "task-awarded",
                  bidderActorId: "bidder-1",
                  price: "120",
                  currency: "USDC",
                  status: "bid_accepted",
                  createdAt: "2026-03-13T03:00:00.000Z",
                },
                {
                  bidId: "bid-2",
                  taskId: "task-open",
                  bidderActorId: "bidder-2",
                  price: "90",
                  currency: "USDC",
                  status: "bid_submitted",
                  createdAt: "2026-03-13T04:00:00.000Z",
                },
              ],
            },
          };
        case "web3.market.task.result.list":
          return {
            result: {
              results: [
                {
                  resultId: "result-1",
                  taskId: "task-awarded",
                  bidId: "bid-1",
                  delivererActorId: "bidder-1",
                  status: "result_submitted",
                  artifacts: ["artifact-1"],
                  submittedAt: "2026-03-13T05:00:00.000Z",
                },
              ],
            },
          };
        case "web3.market.task.receipt.list":
          return {
            result: {
              receipts: [
                {
                  receiptId: "receipt-1",
                  taskId: "task-closed",
                  amount: "200",
                  currency: "USDC",
                  status: "receipt_settled",
                },
                {
                  receiptId: "receipt-2",
                  taskId: "task-awarded",
                  amount: "120",
                  currency: "USDC",
                  status: "receipt_disputed",
                },
              ],
            },
          };
        default:
          throw new Error(`Unexpected method: ${method}`);
      }
    });

    const state = {
      client,
      connected: true,
      hello: {
        features: {
          methods: [
            "web3.market.task.list",
            "web3.market.task.bid.list",
            "web3.market.task.result.list",
            "web3.market.task.receipt.list",
          ],
        },
      },
      taskLoading: false,
      taskError: null,
      taskSummary: null,
      taskOrders: [],
      taskBids: [],
      taskResults: [],
      taskReceipts: [],
    };

    await loadMarketTasks(state);

    expect(methods).toContain("web3.market.task.result.list");
    expect(methods).not.toContain("web3.market.task.result.submit");
    expect(state.taskError).toBeNull();
    expect(state.taskSummary).toEqual({
      openTasks: 1,
      awardedTasks: 1,
      closedTasks: 1,
      totalBids: 2,
      pendingResults: 1,
      settledReceipts: 1,
      disputedReceipts: 1,
    });
  });

  it("loadMarketTasks fails fast with an actionable error when task methods are missing", async () => {
    const request = vi.fn();
    const client = { request } as unknown as GatewayBrowserClient;
    const state = {
      client,
      connected: true,
      hello: {
        features: {
          methods: [
            "web3.market.task.list",
            "web3.market.task.bid.list",
            "web3.market.task.receipt.list",
          ],
        },
      },
      taskLoading: false,
      taskError: null,
      taskSummary: null,
      taskOrders: [],
      taskBids: [],
      taskResults: [],
      taskReceipts: [],
    };

    await loadMarketTasks(state);

    expect(request).not.toHaveBeenCalled();
    expect(state.taskError).toContain("web3.market.task.result.list");
    expect(state.taskSummary).toEqual({
      openTasks: 0,
      awardedTasks: 0,
      closedTasks: 0,
      totalBids: 0,
      pendingResults: 0,
      settledReceipts: 0,
      disputedReceipts: 0,
    });
  });

  it("loadMarketTasks surfaces partial endpoint failures instead of silently treating them as empty data", async () => {
    const client = createClient(async (method) => {
      switch (method) {
        case "web3.market.task.list":
          return {
            result: {
              tasks: [
                {
                  taskId: "task-awarded",
                  title: "Awarded task",
                  status: "task_awarded",
                  creatorActorId: "creator-1",
                  budget: { amount: "150", currency: "USDC" },
                  requirements: ["two"],
                  expiryAt: "2026-03-21T00:00:00.000Z",
                  createdAt: "2026-03-13T01:00:00.000Z",
                },
              ],
            },
          };
        case "web3.market.task.bid.list":
          return {
            result: {
              bids: [
                {
                  bidId: "bid-1",
                  taskId: "task-awarded",
                  bidderActorId: "bidder-1",
                  price: "120",
                  currency: "USDC",
                  status: "bid_accepted",
                  createdAt: "2026-03-13T03:00:00.000Z",
                },
              ],
            },
          };
        case "web3.market.task.result.list":
          throw new Error("unknown method web3.market.task.result.list");
        case "web3.market.task.receipt.list":
          return {
            result: {
              receipts: [
                {
                  receiptId: "receipt-1",
                  taskId: "task-awarded",
                  amount: "120",
                  currency: "USDC",
                  status: "receipt_pending",
                },
              ],
            },
          };
        default:
          throw new Error(`Unexpected method: ${method}`);
      }
    });

    const state = {
      client,
      connected: true,
      hello: {
        features: {
          methods: [
            "web3.market.task.list",
            "web3.market.task.bid.list",
            "web3.market.task.result.list",
            "web3.market.task.receipt.list",
          ],
        },
      },
      taskLoading: false,
      taskError: null,
      taskSummary: null,
      taskOrders: [],
      taskBids: [],
      taskResults: [],
      taskReceipts: [],
    };

    await loadMarketTasks(state);

    expect(state.taskResults).toEqual([]);
    expect(state.taskError).toContain("web3.market.task.result.list");
    expect(state.taskSummary).toEqual({
      openTasks: 0,
      awardedTasks: 1,
      closedTasks: 0,
      totalBids: 1,
      pendingResults: 0,
      settledReceipts: 0,
      disputedReceipts: 0,
    });
  });

  it("loadMarketPrivacy aggregates consent, asset and replay counts", async () => {
    const client = createClient(async (method) => {
      switch (method) {
        case "web3.market.consent.list":
          return {
            result: {
              consents: [
                {
                  consentId: "consent-1",
                  orderId: "order-1",
                  status: "consent_granted",
                  purpose: "training",
                  grantedAt: "2026-03-13T00:00:00.000Z",
                },
                {
                  consentId: "consent-2",
                  orderId: "order-2",
                  status: "consent_revoked",
                  purpose: "evaluation",
                  grantedAt: "2026-03-12T00:00:00.000Z",
                },
              ],
            },
          };
        case "web3.market.privacy.assets":
          return {
            result: {
              assets: [
                {
                  consentId: "consent-1",
                  assetId: "asset-1",
                  title: "Knowledge Pack",
                  purpose: "training",
                  status: "consent_granted",
                },
              ],
            },
          };
        case "web3.market.privacy.replay.list":
          return {
            result: {
              replays: [
                {
                  replayId: "replay-1",
                  consentId: "consent-2",
                  status: "replay_generated",
                  retentionAction: "delete_on_revoke",
                  generatedAt: "2026-03-13T00:00:00.000Z",
                },
              ],
            },
          };
        default:
          throw new Error(`Unexpected method: ${method}`);
      }
    });

    const state = {
      client,
      connected: true,
      privacyLoading: false,
      privacySummary: null,
      privacyConsents: [],
      privacyAssets: [],
      privacyReplays: [],
    };

    await loadMarketPrivacy(state);

    expect(state.privacySummary).toEqual({
      activeConsents: 1,
      revokedConsents: 1,
      pendingErasure: 1,
      totalReplays: 1,
      assetCount: 1,
    });
  });

  it("loadMarketOps builds health probes from alerts and health endpoints", async () => {
    let verifyParams: Record<string, unknown> | null = null;
    const client = createClient(async (method, params) => {
      switch (method) {
        case "web3.monitor.alerts.list":
          return {
            result: {
              alerts: [
                {
                  id: "alert-1",
                  level: "P0",
                  category: "settlement",
                  status: "active",
                  message: "Settlement queue stalled",
                  timestamp: "2026-03-13T06:00:00.000Z",
                },
                {
                  id: "alert-2",
                  level: "P1",
                  category: "billing",
                  status: "active",
                  message: "Billing quota nearing cap",
                  timestamp: "2026-03-13T06:05:00.000Z",
                },
                {
                  id: "alert-3",
                  level: "P2",
                  category: "discovery",
                  status: "resolved",
                  message: "Peer recovered",
                  timestamp: "2026-03-13T06:10:00.000Z",
                },
              ],
            },
          };
        case "web3.monitor.health":
          return {
            result: {
              healthy: false,
              status: "degraded",
              criticalAlerts: 1,
              lastActivity: "2026-03-13T06:15:00.000Z",
              timestamp: "2026-03-13T06:20:00.000Z",
            },
          };
        case "web3.market.preset.verify":
          verifyParams = params;
          return {
            result: {
              mode: "trusted-circle",
              healthy: false,
              summary: "可信圈：3 项通过 / 1 项告警 / 1 项失败。",
              readiness: {
                ready: false,
                passCount: 3,
                warnCount: 1,
                failCount: 1,
                checks: [
                  { name: "wallet.readiness", status: "pass", detail: "wallet connected" },
                  { name: "payment.readiness", status: "warn", detail: "autopay disabled" },
                  { name: "discovery.enabled", status: "pass", detail: "discovery active" },
                  { name: "market.status.summary", status: "fail", detail: "settlement stalled" },
                  { name: "lease.flow", status: "pass", detail: "lease checks ok" },
                ],
              },
              metrics: {
                publishedResources: 0,
                activeLeases: 0,
                activeAlerts: 1,
                discoveryEnabled: true,
                consumerEnabled: true,
                advertiseToMarket: true,
                providerListenEnabled: true,
                providerBind: "lan",
                walletReady: true,
                paymentReady: false,
                billingEnabled: true,
                autopayEnabled: false,
              },
              recommendedActions: ["启用 autopay 后重新执行验证。"],
            },
          };
        default:
          throw new Error(`Unexpected method: ${method}`);
      }
    });

    const state: MarketOpsState = {
      client,
      connected: true,
      opsLoading: false,
      opsSummary: null,
      opsAlerts: [],
      marketPresetMode: "trusted-circle",
    };

    await loadMarketOps(state);

    expect(verifyParams).toEqual({ mode: "trusted-circle" });
    expect(state.opsAlerts).toHaveLength(3);
    expect(state.opsSummary).not.toBeNull();
    const opsSummary = state.opsSummary;
    if (!opsSummary) {
      throw new Error("opsSummary should be populated");
    }
    expect(opsSummary.activeAlerts).toBe(2);
    expect(opsSummary.alertsByLevel).toEqual({ P0: 1, P1: 1 });
    expect(opsSummary.walletHealthy).toBe(true);
    expect(opsSummary.discoveryHealthy).toBe(true);
    expect(opsSummary.paymentHealthy).toBe(false);
    expect(opsSummary.settlementHealthy).toBe(false);
    expect(opsSummary.healthProbes.map((probe) => probe.name)).toEqual([
      "monitor",
      "wallet",
      "payment",
      "discovery",
      "settlement",
    ]);
    expect(opsSummary.healthProbes[0]?.status).toBe("degraded");
    expect(opsSummary.preset?.mode).toBe("trusted-circle");
    expect(opsSummary.preset?.readiness.warnCount).toBe(1);
  });

  it("loadMarketPresetPreview uses the selected mode and intent", async () => {
    let previewParams: Record<string, unknown> | null = null;
    const client = createClient(async (method, params) => {
      expect(method).toBe("web3.market.preset.preview");
      previewParams = params;
      return {
        result: {
          mode: "hybrid-cloud-edge",
          intent: "provider",
          summary: "Hybrid provider preview",
          detectedProviders: [
            {
              label: "Local Ollama",
              kind: "ollama",
              healthy: true,
            },
          ],
          operations: [],
          checks: [],
          nextSteps: ["Review missing secrets before publish."],
        },
      };
    });

    const state: MarketPresetState = {
      client,
      connected: true,
      marketPresetLoading: false,
      marketPresetError: null,
      marketPresetPreview: null,
      marketPresetMode: "hybrid-cloud-edge",
      marketPresetIntent: "provider",
    };

    await loadMarketPresetPreview(state);

    expect(previewParams).toEqual({
      mode: "hybrid-cloud-edge",
      intent: "provider",
    });
    expect(state.marketPresetError).toBeNull();
    expect(state.marketPresetPreview?.summary).toBe("Hybrid provider preview");
    expect(state.marketPresetPreview?.detectedProviders[0]?.label).toBe("Local Ollama");
  });
});
