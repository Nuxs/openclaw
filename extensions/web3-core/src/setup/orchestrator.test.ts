import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { loadCallGateway } from "../market/proxy-utils.js";
import { formatMarketPresetVerification, verifyMarketPresetBaseline } from "./orchestrator.js";

vi.mock("../market/proxy-utils.js", () => ({
  loadCallGateway: vi.fn(),
  normalizeGatewayResult: (value: unknown) => value,
}));

const mockedLoadCallGateway = vi.mocked(loadCallGateway);

describe("orchestrator verifyMarketPresetBaseline", () => {
  beforeEach(() => {
    mockedLoadCallGateway.mockReset();
  });

  it("reports wallet and payment readiness when required capabilities are available", async () => {
    mockedLoadCallGateway.mockResolvedValue(async ({ method, params }) => {
      switch (method) {
        case "market.status.summary":
          return { ok: true, result: { ok: true } };
        case "web3.monitor.health":
          return {
            ok: true,
            result: { healthy: true, status: "healthy", criticalAlerts: 0 },
          };
        case "web3.index.stats":
          return { ok: true, result: { providers: 2 } };
        case "market.resource.list":
          return { ok: true, result: { resources: [{ resourceId: "resource-1" }] } };
        case "market.lease.list":
          return { ok: true, result: { leases: [{ status: "lease_active" }] } };
        case "web3.capabilities.describe":
          return { ok: true, result: { name: (params as { name?: string }).name } };
        default:
          throw new Error(`Unexpected method: ${method}`);
      }
    });

    const config = resolveConfig({});
    config.resources.enabled = true;
    config.resources.consumer.enabled = true;
    config.resources.provider.listen.enabled = true;
    config.resources.advertiseToMarket = true;
    config.discovery.enabled = true;
    config.billing.enabled = true;
    config.x402.autopay.enabled = true;

    const verification = await verifyMarketPresetBaseline({
      config,
      mode: "trusted-circle",
    });

    expect(verification.metrics.walletReady).toBe(true);
    expect(verification.metrics.paymentReady).toBe(true);
    expect(verification.metrics.billingEnabled).toBe(true);
    expect(verification.metrics.autopayEnabled).toBe(true);
    expect(
      verification.readiness.checks.find((check) => check.name === "wallet.readiness")?.status,
    ).toBe("pass");
    expect(
      verification.readiness.checks.find((check) => check.name === "payment.readiness")?.status,
    ).toBe("pass");
    expect(formatMarketPresetVerification(verification)).toContain("钱包=就绪");
    expect(formatMarketPresetVerification(verification)).toContain("支付=就绪");
  });

  it("surfaces wallet and payment actions when capabilities or config are missing", async () => {
    mockedLoadCallGateway.mockResolvedValue(async ({ method, params }) => {
      switch (method) {
        case "market.status.summary":
          return { ok: true, result: { ok: true } };
        case "web3.monitor.health":
          return {
            ok: true,
            result: { healthy: true, status: "healthy", criticalAlerts: 0 },
          };
        case "web3.index.stats":
          return { ok: true, result: { providers: 0 } };
        case "market.resource.list":
          return { ok: true, result: { resources: [] } };
        case "market.lease.list":
          return { ok: true, result: { leases: [] } };
        case "web3.capabilities.describe": {
          const name = (params as { name?: string }).name;
          if (name === "web3.wallet.balance") {
            return { ok: false, error: "wallet capability missing" };
          }
          if (name === "web3.wallet.autopay") {
            return { ok: false, error: "autopay capability missing" };
          }
          if (name === "web3.billing.handlePaymentRequired") {
            return { ok: false, error: "payment-required capability missing" };
          }
          return { ok: true, result: { name } };
        }
        default:
          throw new Error(`Unexpected method: ${method}`);
      }
    });

    const config = resolveConfig({});
    config.resources.enabled = true;
    config.resources.consumer.enabled = true;
    config.resources.provider.listen.enabled = true;
    config.discovery.enabled = true;
    config.billing.enabled = false;
    config.x402.autopay.enabled = false;

    const verification = await verifyMarketPresetBaseline({
      config,
      mode: "trusted-circle",
    });

    expect(verification.metrics.walletReady).toBe(false);
    expect(verification.metrics.paymentReady).toBe(false);
    expect(
      verification.readiness.checks.find((check) => check.name === "wallet.readiness")?.status,
    ).toBe("fail");
    expect(
      verification.readiness.checks.find((check) => check.name === "payment.readiness")?.status,
    ).toBe("fail");
    expect(verification.recommendedActions).toContain(
      "确认 agent-wallet 已启用，并让 `web3.wallet.balance` 保持可用。",
    );
    expect(verification.recommendedActions).toContain(
      "启用 billing 与 x402.autopay，并确认 `web3.wallet.autopay`、`web3.billing.handlePaymentRequired` 已注册。",
    );
  });
});
