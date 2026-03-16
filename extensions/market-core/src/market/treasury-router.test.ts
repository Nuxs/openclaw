import { describe, expect, it } from "vitest";
import { resolveTreasuryRoute } from "./treasury-router.js";

describe("resolveTreasuryRoute", () => {
  it("returns direct route when payment and settlement stay on the same rail", () => {
    expect(
      resolveTreasuryRoute({
        paymentChain: "evm",
        paymentAsset: "USDC",
        settlementAsset: "USDC",
      }),
    ).toMatchObject({
      sourceChain: "evm",
      settlementChain: "evm",
      sourceAsset: "USDC",
      settlementAsset: "USDC",
      strategy: "direct",
      reason: "same_chain_same_asset",
    });
  });

  it("prefers EVM treasury settlement for TON stable-value receipts", () => {
    expect(
      resolveTreasuryRoute({
        paymentChain: "ton",
        paymentAsset: "TON",
        settlementAsset: "USDC",
        provider: "manual",
      }),
    ).toMatchObject({
      sourceChain: "ton",
      settlementChain: "evm",
      sourceAsset: "TON",
      settlementAsset: "USDC",
      strategy: "bridge",
      bridgeRouteId: "bridge:ton:evm",
      provider: "manual",
      reason: "cross_chain_treasury_rebalance",
    });
  });

  it("honors explicit preferred settlement chain overrides", () => {
    expect(
      resolveTreasuryRoute({
        paymentChain: "ton",
        paymentAsset: "USDT",
        settlementAsset: "USDT",
        preferredSettlementChain: "ton",
      }),
    ).toMatchObject({
      sourceChain: "ton",
      settlementChain: "ton",
      strategy: "direct",
    });
  });
});
