import { describe, expect, it, vi } from "vitest";
import { MarketAssistant } from "./market-assistant.js";
import type { MarketAssistantRuntime } from "./types.js";

function createRuntime(
  impl: (method: string, params?: Record<string, unknown>) => Promise<unknown>,
): MarketAssistantRuntime {
  return {
    callGatewayMethod: async <T = unknown>(method: string, params?: Record<string, unknown>) => {
      return (await impl(method, params)) as T;
    },
  };
}

describe("MarketAssistant (paste-safe + contract)", () => {
  it("diagnose path only calls market.* methods", async () => {
    const calls: string[] = [];
    const runtime = createRuntime(async (method) => {
      calls.push(method);
      return {};
    });

    const assistant = new MarketAssistant(runtime);
    const actorId = "0x00000000000000000000000000000000000000a1";
    const text = await assistant.handleUserMessage(`有问题 actorId=${actorId}`);

    expect(text).toContain("系统诊断报告");
    expect(calls).toContain("market.status.summary");
    expect(calls).toContain("market.metrics.snapshot");
    expect(calls).toContain("market.reputation.summary");
    expect(calls.some((m) => m.startsWith("web3."))).toBe(false);
  });

  it("does not leak raw error message (path/url/token)", async () => {
    const runtime = createRuntime(async () => {
      throw new Error(
        "E_TIMEOUT: fetch failed https://example.com?token=tok_abc /home/user/secret",
      );
    });

    const assistant = new MarketAssistant(runtime);
    const text = await assistant.handleUserMessage("库存");

    expect(text).toContain("E_TIMEOUT");
    expect(text).not.toContain("https://");
    expect(text).not.toContain("tok_");
    expect(text).not.toContain("/home/");
  });

  it("truncates buyerId addresses in order listing output", async () => {
    const runtime = createRuntime(async (method) => {
      if (method === "market.order.list") {
        return {
          orders: [
            {
              resourceName: "GPU 算力",
              buyerId: "0x1111111111111111111111111111111111111111",
              price: 12,
              unit: "call",
              status: "active",
            },
          ],
        };
      }
      return {};
    });

    const assistant = new MarketAssistant(runtime);
    const text = await assistant.handleUserMessage("订单");

    expect(text).toContain("0x1111…1111");
    expect(text).not.toContain("0x1111111111111111111111111111111111111111");
  });
});
