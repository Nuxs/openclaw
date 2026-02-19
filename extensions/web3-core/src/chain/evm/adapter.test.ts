import { describe, expect, it } from "vitest";
import { EvmChainAdapter } from "./adapter.js";

describe("EvmChainAdapter", () => {
  it("throws when anchoring without private key", async () => {
    const adapter = new EvmChainAdapter({ network: "base" });
    await expect(adapter.anchorHash({ anchorId: "a1", payloadHash: "b2" })).rejects.toThrow(
      "chain.privateKey is required",
    );
  });

  it("returns zero balance when no private key", async () => {
    const adapter = new EvmChainAdapter({ network: "base" });
    const result = await adapter.getBalance();
    expect(result.balance).toBe("0");
    expect(result.symbol).toBe("ETH");
  });
});
