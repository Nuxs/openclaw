import type { FXQuote, PaymentChain, TreasuryRoute } from "./payment-types.js";

const STABLE_TREASURY_ASSETS: ReadonlySet<string> = new Set(["USD", "USDC", "USDT", "DAI"]);

function normalizeAsset(asset: string | undefined): string | undefined {
  if (typeof asset !== "string") {
    return undefined;
  }
  const trimmed = asset.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveSettlementChain(input: {
  paymentChain: PaymentChain;
  settlementAsset?: string;
  preferredSettlementChain?: PaymentChain;
  fxQuote?: FXQuote;
}): PaymentChain {
  if (input.preferredSettlementChain) {
    return input.preferredSettlementChain;
  }
  if (input.fxQuote?.chain) {
    return input.fxQuote.chain;
  }
  if (
    input.paymentChain === "ton" &&
    input.settlementAsset &&
    STABLE_TREASURY_ASSETS.has(input.settlementAsset.toUpperCase())
  ) {
    return "evm";
  }
  return input.paymentChain;
}

function buildRouteId(params: {
  sourceChain: PaymentChain;
  settlementChain: PaymentChain;
  sourceAsset: string;
  settlementAsset: string;
}): string {
  return [
    "treasury",
    params.sourceChain,
    params.settlementChain,
    params.sourceAsset.toUpperCase(),
    params.settlementAsset.toUpperCase(),
  ].join(":");
}

export function resolveTreasuryRoute(input: {
  paymentChain: PaymentChain;
  paymentAsset: string;
  settlementAsset?: string;
  preferredSettlementChain?: PaymentChain;
  provider?: string;
  fxQuote?: FXQuote;
}): TreasuryRoute | undefined {
  const sourceAsset = normalizeAsset(input.paymentAsset);
  const settlementAsset =
    normalizeAsset(input.settlementAsset ?? input.fxQuote?.toAsset) ?? sourceAsset;
  if (!sourceAsset || !settlementAsset) {
    return undefined;
  }

  const settlementChain = resolveSettlementChain({
    paymentChain: input.paymentChain,
    settlementAsset,
    preferredSettlementChain: input.preferredSettlementChain,
    fxQuote: input.fxQuote,
  });
  const directRail =
    input.paymentChain === settlementChain &&
    sourceAsset.toUpperCase() === settlementAsset.toUpperCase();
  const strategy: TreasuryRoute["strategy"] = directRail ? "direct" : "bridge";

  return {
    routeId: buildRouteId({
      sourceChain: input.paymentChain,
      settlementChain,
      sourceAsset,
      settlementAsset,
    }),
    sourceChain: input.paymentChain,
    settlementChain,
    sourceAsset,
    settlementAsset,
    strategy,
    bridgeRouteId:
      strategy === "bridge" ? `bridge:${input.paymentChain}:${settlementChain}` : undefined,
    provider: input.provider ?? input.fxQuote?.source,
    reason: directRail
      ? "same_chain_same_asset"
      : input.paymentChain === settlementChain
        ? "same_chain_asset_conversion"
        : "cross_chain_treasury_rebalance",
  };
}
