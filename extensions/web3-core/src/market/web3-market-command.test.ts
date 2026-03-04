import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../config.js";
import { createWeb3MarketCommand } from "./web3-market-command.js";

vi.mock("./market-status.js", () => ({
  buildWeb3MarketStatusSummary: vi.fn(async () => {
    throw new Error("/Users/test/private/token leak");
  }),
  formatWeb3MarketStatusMessage: vi.fn(() => "unused"),
}));

describe("/web3-market command", () => {
  it("returns stable error code output when status probing fails", async () => {
    const handler = createWeb3MarketCommand(resolveConfig({}));

    const result = await handler({
      channel: "test",
      commandBody: "/web3-market status",
      args: "status",
      isAuthorizedSender: true,
      config: { plugins: { entries: {} } },
    } as any);

    expect(result.text).toContain("Web3 Market status failed");
    expect(result.text).toMatch(/E_[A-Z_]+/);
  });
});
