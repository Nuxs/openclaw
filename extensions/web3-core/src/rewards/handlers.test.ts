import { describe, expect, it, vi } from "vitest";
import type { Web3PluginConfig } from "../config.js";

// Mock the proxy-utils module before importing handlers
vi.mock("../market/proxy-utils.js", () => ({
  loadCallGateway: vi.fn(),
  normalizeGatewayResult: vi.fn(),
}));

vi.mock("../errors.js", () => ({
  formatWeb3GatewayErrorResponse: vi.fn((err: unknown) => ({
    error: "E_INTERNAL",
    message: err instanceof Error ? err.message : String(err),
  })),
}));

import { formatWeb3GatewayErrorResponse } from "../errors.js";
import { loadCallGateway, normalizeGatewayResult } from "../market/proxy-utils.js";
import {
  createWeb3RewardGetHandler,
  createWeb3RewardListHandler,
  createWeb3RewardClaimHandler,
} from "./handlers.js";

const mockLoadCallGateway = vi.mocked(loadCallGateway);
const mockNormalize = vi.mocked(normalizeGatewayResult);
const mockFormatError = vi.mocked(formatWeb3GatewayErrorResponse);

function makeConfig(): Web3PluginConfig {
  return {
    brain: { timeoutMs: 5000 },
    chain: { network: "base" },
  } as unknown as Web3PluginConfig;
}

function createResponder() {
  let captured: { ok: boolean; data: unknown } | undefined;
  return {
    respond: (ok: boolean, data: unknown) => {
      captured = { ok, data };
    },
    result: () => captured,
  };
}

describe("web3.reward.get proxy", () => {
  it("forwards params to market.reward.get and returns result", async () => {
    const callGw = vi.fn().mockResolvedValue({ ok: true, result: { rewardId: "r1" } });
    mockLoadCallGateway.mockResolvedValue(callGw);
    mockNormalize.mockReturnValue({ ok: true, result: { rewardId: "r1" } });

    const handler = createWeb3RewardGetHandler(makeConfig());
    const r = createResponder();
    await handler({ params: { rewardId: "r1" }, respond: r.respond } as any);

    expect(callGw).toHaveBeenCalledWith({
      method: "market.reward.get",
      params: { rewardId: "r1" },
      timeoutMs: 5000,
    });
    expect(r.result()!.ok).toBe(true);
    expect(r.result()!.data).toEqual({ rewardId: "r1" });
  });

  it("returns formatted error when gateway call fails", async () => {
    const callGw = vi.fn().mockResolvedValue({ ok: false, error: "not found" });
    mockLoadCallGateway.mockResolvedValue(callGw);
    mockNormalize.mockReturnValue({ ok: false, error: "not found" });
    mockFormatError.mockReturnValue({ error: "E_NOT_FOUND", message: "not found" } as any);

    const handler = createWeb3RewardGetHandler(makeConfig());
    const r = createResponder();
    await handler({ params: { rewardId: "missing" }, respond: r.respond } as any);

    expect(r.result()!.ok).toBe(false);
  });
});

describe("web3.reward.list proxy", () => {
  it("delegates to market.reward.list", async () => {
    const callGw = vi.fn().mockResolvedValue({ ok: true, result: { rewards: [], count: 0 } });
    mockLoadCallGateway.mockResolvedValue(callGw);
    mockNormalize.mockReturnValue({ ok: true, result: { rewards: [], count: 0 } });

    const handler = createWeb3RewardListHandler(makeConfig());
    const r = createResponder();
    await handler({ params: { recipient: "0xabc" }, respond: r.respond } as any);

    expect(callGw).toHaveBeenCalledWith({
      method: "market.reward.list",
      params: { recipient: "0xabc" },
      timeoutMs: 5000,
    });
    expect(r.result()!.ok).toBe(true);
  });
});

describe("web3.reward.claim proxy", () => {
  it("delegates to market.reward.issueClaim", async () => {
    const callGw = vi.fn().mockResolvedValue({ ok: true, result: { status: "claim_issued" } });
    mockLoadCallGateway.mockResolvedValue(callGw);
    mockNormalize.mockReturnValue({ ok: true, result: { status: "claim_issued" } });

    const handler = createWeb3RewardClaimHandler(makeConfig());
    const r = createResponder();
    await handler({ params: { rewardId: "r1" }, respond: r.respond } as any);

    expect(callGw).toHaveBeenCalledWith({
      method: "market.reward.issueClaim",
      params: { rewardId: "r1" },
      timeoutMs: 5000,
    });
    expect(r.result()!.ok).toBe(true);
    expect(r.result()!.data).toEqual({ status: "claim_issued" });
  });

  it("catches thrown errors and formats them", async () => {
    mockLoadCallGateway.mockRejectedValue(new Error("callGateway not available"));
    mockFormatError.mockReturnValue({ error: "E_INTERNAL", message: "internal" } as any);

    const handler = createWeb3RewardClaimHandler(makeConfig());
    const r = createResponder();
    await handler({ params: { rewardId: "r1" }, respond: r.respond } as any);

    expect(r.result()!.ok).toBe(false);
    expect(mockFormatError).toHaveBeenCalled();
  });
});
