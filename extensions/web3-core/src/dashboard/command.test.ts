import { describe, expect, it, vi } from "vitest";
import type { Web3PluginConfig } from "../config.js";
import { AlertLevel, AlertStatus, AlertCategory } from "../monitor/types.js";
import { createWeb3DashboardCommand } from "./command.js";

function makeConfig(overrides: Partial<Web3PluginConfig> = {}): Web3PluginConfig {
  return {
    identity: { allowSiwe: true },
    billing: { enabled: true, quotaPerSession: 1000 },
    resources: {
      enabled: true,
      advertiseToMarket: false,
      consumer: { enabled: false },
      provider: { listen: { enabled: false } },
    },
    brain: {
      enabled: false,
      providerId: "",
      defaultModel: "",
      allowlist: [],
      protocol: "openai-compat",
      endpoint: "",
    },
    storage: { provider: "ipfs" },
    chain: { network: "ethereum", privateKey: "" },
    ...overrides,
  } as Web3PluginConfig;
}

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    getBindings: vi.fn().mockReturnValue([]),
    getUsage: vi.fn().mockReturnValue(null),
    listUsageRecords: vi.fn().mockReturnValue([]),
    readAuditEvents: vi.fn().mockReturnValue([]),
    getAlerts: vi.fn().mockReturnValue([]),
    getPendingTxs: vi.fn().mockReturnValue([]),
    getPendingArchives: vi.fn().mockReturnValue([]),
    ...overrides,
  } as any;
}

describe("createWeb3DashboardCommand", () => {
  it("renders dashboard with empty state", async () => {
    const store = makeStore();
    const config = makeConfig();
    const handler = createWeb3DashboardCommand(store, config);
    const result = await handler({} as any);
    expect(result.text).toContain("Web3 Dashboard");
    expect(result.text).toContain("Identity");
    expect(result.text).toContain("Billing");
    expect(result.text).toContain("Audit");
    expect(result.text).toContain("Market");
  });

  it("shows wallet info when bindings exist", async () => {
    const store = makeStore({
      getBindings: vi.fn().mockReturnValue([
        {
          address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
          chainId: 1,
          verifiedAt: "2026-01-01",
          ensName: "alice.eth",
        },
      ]),
    });
    const config = makeConfig();
    const handler = createWeb3DashboardCommand(store, config);
    const result = await handler({} as any);
    expect(result.text).toContain("Wallets");
    expect(result.text).toContain("alice.eth");
    expect(result.text).toContain("0x742d…bEb1");
  });

  it("shows SIWE enabled when configured", async () => {
    const store = makeStore();
    const config = makeConfig({ identity: { allowSiwe: true } } as any);
    const handler = createWeb3DashboardCommand(store, config);
    const result = await handler({} as any);
    expect(result.text).toContain("SIWE: enabled");
  });

  it("shows credit info", async () => {
    const store = makeStore({
      getUsage: vi.fn().mockReturnValue({ creditsUsed: 200, creditsQuota: 1000 }),
    });
    const config = makeConfig();
    const handler = createWeb3DashboardCommand(store, config);
    const result = await handler({} as any);
    expect(result.text).toContain("Credits");
    expect(result.text).toContain("800");
    expect(result.text).toContain("1,000");
  });

  it("shows low credits warning", async () => {
    const store = makeStore({
      getUsage: vi.fn().mockReturnValue({ creditsUsed: 950, creditsQuota: 1000 }),
    });
    const config = makeConfig();
    const handler = createWeb3DashboardCommand(store, config);
    const result = await handler({} as any);
    expect(result.text).toContain("Low credits");
  });

  it("shows alerts when present", async () => {
    const store = makeStore({
      getAlerts: vi.fn().mockReturnValue([
        {
          level: AlertLevel.P0,
          message: "Critical issue",
          status: AlertStatus.ACTIVE,
          category: AlertCategory.SECURITY,
          ruleName: "rule-1",
        },
      ]),
    });
    const config = makeConfig();
    const handler = createWeb3DashboardCommand(store, config);
    const result = await handler({} as any);
    expect(result.text).toContain("Alerts");
    expect(result.text).toContain("🔴");
    expect(result.text).toContain("Critical issue");
  });

  it("shows provider/consumer mode when market enabled", async () => {
    const store = makeStore();
    const config = makeConfig({
      resources: {
        enabled: true,
        advertiseToMarket: true,
        consumer: { enabled: true },
        provider: { listen: { enabled: true } },
      },
    } as any);
    const handler = createWeb3DashboardCommand(store, config);
    const result = await handler({} as any);
    expect(result.text).toContain("Provider: on");
    expect(result.text).toContain("Consumer: on");
  });

  it("suggests /bind_wallet when no bindings", async () => {
    const store = makeStore();
    const config = makeConfig();
    const handler = createWeb3DashboardCommand(store, config);
    const result = await handler({} as any);
    expect(result.text).toContain("/bind_wallet");
  });

  it("suggests /alerts when critical alerts exist", async () => {
    const store = makeStore({
      getAlerts: vi.fn().mockReturnValue([
        {
          level: AlertLevel.P0,
          message: "Critical",
          status: AlertStatus.ACTIVE,
          category: AlertCategory.SECURITY,
          ruleName: "r",
        },
      ]),
    });
    const config = makeConfig();
    const handler = createWeb3DashboardCommand(store, config);
    const result = await handler({} as any);
    expect(result.text).toContain("/alerts");
  });
});
