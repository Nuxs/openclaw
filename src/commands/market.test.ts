import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callGatewayCliMock } = vi.hoisted(() => ({
  callGatewayCliMock: vi.fn(),
}));

vi.mock("../gateway/call.js", () => ({
  callGatewayCli: (options: unknown) => callGatewayCliMock(options),
}));

vi.mock("../terminal/table.js", () => ({
  getTerminalTableWidth: () => 120,
  renderTable: () => "[table]",
}));

async function loadMarketCommand() {
  vi.resetModules();
  const { marketCommand } = await import("./market.js");
  return marketCommand;
}

function captureConsoleOutput(logSpy: ReturnType<typeof vi.spyOn>) {
  return logSpy.mock.calls.map((call: unknown[]) => call.map(String).join(" ")).join("\n");
}

describe("market CLI", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    callGatewayCliMock.mockReset();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("prints numeric reputation totals from the normalized provider summary", async () => {
    callGatewayCliMock.mockImplementation(async ({ method }: { method: string }) => {
      switch (method) {
        case "web3.market.resource.list":
          return {
            resources: [
              {
                resourceId: "resource-1",
                label: "Secure review",
                kind: "service",
                providerActorId: "provider-1",
                price: { amount: "2.5", currency: "USDC", unit: "call" },
              },
            ],
          };
        case "web3.market.reputation.summary":
          return {
            identity: { ensName: "provider.eth" },
            score: 88,
            leases: { total: 7, byStatus: {} },
            disputes: { total: 2, byStatus: {} },
          };
        default:
          throw new Error(`Unexpected method: ${method}`);
      }
    });

    const marketCommand = await loadMarketCommand();
    await marketCommand.parseAsync(["provider", "show", "provider-1"], { from: "user" });

    const output = captureConsoleOutput(logSpy);
    expect(output).toContain("ENS: provider.eth");
    expect(output).toContain("Score: 88");
    expect(output).toContain("Leases: 7");
    expect(output).toContain("Disputes: 2");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("prints numeric market totals instead of falling back to zero", async () => {
    callGatewayCliMock.mockImplementation(async ({ method }: { method: string }) => {
      switch (method) {
        case "web3.market.status.summary":
          return {
            totals: { offers: 3, orders: 2, deliveries: 1, settlements: 4 },
          };
        case "web3.monitor.health":
          return { status: "degraded", healthy: false };
        case "web3.monitor.alerts.list":
          return {
            alerts: [
              {
                status: "active",
                level: "P1",
                category: "billing",
                timestamp: "2026-03-16T00:00:00.000Z",
              },
              {
                status: "resolved",
                level: "P2",
                category: "discovery",
                timestamp: "2026-03-16T00:00:00.000Z",
              },
              {
                status: "active",
                level: "P0",
                category: "settlement",
                timestamp: "2026-03-16T00:00:00.000Z",
              },
            ],
          };
        default:
          throw new Error(`Unexpected method: ${method}`);
      }
    });

    const marketCommand = await loadMarketCommand();
    await marketCommand.parseAsync(["status"], { from: "user" });

    const output = captureConsoleOutput(logSpy);
    expect(output).toContain("Offers: 3");
    expect(output).toContain("Orders: 2");
    expect(output).toContain("Deliveries: 1");
    expect(output).toContain("Settlements: 4");
    expect(output).toContain("Monitor: degraded");
    expect(output).toContain("Active alerts: 2");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("prints numeric order quantity in order status", async () => {
    callGatewayCliMock.mockImplementation(async ({ method }: { method: string }) => {
      switch (method) {
        case "web3.market.order.list":
          return {
            orders: [
              {
                orderId: "order-1",
                status: "delivery_completed",
                resourceName: "Secure review",
                buyerId: "buyer-1",
                sellerId: "seller-1",
                quantity: 3,
                createdAt: "2026-03-16T00:00:00.000Z",
                updatedAt: "2026-03-16T01:00:00.000Z",
              },
            ],
          };
        case "web3.market.execution.status":
          return {
            executionStatus: "execution_completed",
            acceptance: { status: "acceptance_signed" },
            delivery: { status: "delivery_completed" },
            proof: { status: "proof_submitted" },
            settlement: { status: "settlement_released" },
            dispute: { status: "none" },
          };
        default:
          throw new Error(`Unexpected method: ${method}`);
      }
    });

    const marketCommand = await loadMarketCommand();
    await marketCommand.parseAsync(["order", "status", "order-1"], { from: "user" });

    const output = captureConsoleOutput(logSpy);
    expect(output).toContain("Quantity: 3");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
