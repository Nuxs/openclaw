import { describe, expect, it } from "vitest";
import { resolveConfig } from "../config.js";
import { resolveBillingFxQuote } from "./fx-quote.js";
import type { PaymentRequiredInvoice } from "./types.js";

function buildInvoice(overrides?: Partial<PaymentRequiredInvoice>): PaymentRequiredInvoice {
  return {
    invoiceId: "inv-fx",
    provider: "provider-fx",
    chain: "ton",
    asset: "TON",
    amount: "2",
    payTo: "EQC_FX_TEST",
    nonce: "nonce-fx",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe("resolveBillingFxQuote", () => {
  it("reuses cached quote ids within TTL for the same pair", () => {
    const config = resolveConfig({
      x402: {
        fxQuote: {
          enabled: true,
          source: "manual",
          settlementAsset: "USDC",
          defaultTtlMs: 60_000,
          manualRates: {
            "TON:USDC": "5",
          },
        },
      },
    });

    const first = resolveBillingFxQuote(buildInvoice(), config);
    const second = resolveBillingFxQuote(buildInvoice({ amount: "3" }), config);

    expect(first?.quoteId).toBe(second?.quoteId);
    expect(first).toMatchObject({ fromAsset: "TON", toAsset: "USDC", rate: "5" });
    expect(first?.chain).toBeUndefined();
    expect(second?.fromAmount).toBe("3");
    expect(second?.toAmount).toBe("15");
  });

  it("supports inverse manual rates", () => {
    const config = resolveConfig({
      x402: {
        fxQuote: {
          enabled: true,
          source: "manual",
          settlementAsset: "USD",
          defaultTtlMs: 60_000,
          manualRates: {
            "USD:ETH": "0.5",
          },
        },
      },
    });

    const quote = resolveBillingFxQuote(
      buildInvoice({ chain: "evm", asset: "ETH", amount: "4" }),
      config,
    );

    expect(quote).toMatchObject({ fromAsset: "ETH", toAsset: "USD", rate: "2" });
    expect(quote?.toAmount).toBe("8");
  });

  it("returns identity quote for same-asset settlement", () => {
    const config = resolveConfig({
      x402: {
        fxQuote: {
          enabled: true,
          settlementAsset: "TON",
        },
      },
    });

    const quote = resolveBillingFxQuote(buildInvoice({ asset: "ton", amount: "9" }), config);
    expect(quote).toMatchObject({
      fromAsset: "TON",
      toAsset: "TON",
      rate: "1",
      source: "identity",
    });
    expect(quote?.toAmount).toBe("9");
  });
});
