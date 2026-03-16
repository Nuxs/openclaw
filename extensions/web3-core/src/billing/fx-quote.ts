import { randomUUID } from "node:crypto";
import type { FXQuote } from "@openclaw/market-core";
import type { Web3PluginConfig } from "../config.js";
import type { PaymentRequiredInvoice } from "./types.js";

const fxQuoteCache = new Map<string, FXQuote>();

function nowIso(): string {
  return new Date().toISOString();
}

function buildExpiresAt(ttlMs: number): string {
  return new Date(Date.now() + ttlMs).toISOString();
}

function isFxQuote(value: unknown): value is FXQuote {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.quoteId === "string" &&
    typeof record.fromAsset === "string" &&
    typeof record.toAsset === "string" &&
    typeof record.rate === "string" &&
    typeof record.source === "string" &&
    typeof record.expiresAt === "string"
  );
}

function normalizeProvidedQuote(quote: FXQuote): FXQuote {
  return {
    ...quote,
    quoteId: quote.quoteId || randomUUID(),
    quotedAt: quote.quotedAt ?? nowIso(),
  };
}

function normalizeAsset(value: string): string {
  return value.trim().toUpperCase();
}

function computeConvertedAmount(amount: string, rate: string): string | undefined {
  const numericAmount = Number(amount);
  const numericRate = Number(rate);
  if (!Number.isFinite(numericAmount) || !Number.isFinite(numericRate)) {
    return undefined;
  }
  return (numericAmount * numericRate).toString();
}

function buildCacheKey(params: {
  fromAsset: string;
  toAsset: string;
  rate: string;
  source: string;
}): string {
  return [params.fromAsset, params.toAsset, params.rate, params.source].join(":");
}

function getCachedQuote(cacheKey: string): FXQuote | undefined {
  const cached = fxQuoteCache.get(cacheKey);
  if (!cached) {
    return undefined;
  }
  if (Date.parse(cached.expiresAt) <= Date.now()) {
    fxQuoteCache.delete(cacheKey);
    return undefined;
  }
  return cached;
}

function cacheQuote(cacheKey: string, quote: FXQuote): FXQuote {
  fxQuoteCache.set(cacheKey, quote);
  return quote;
}

function materializeQuote(baseQuote: FXQuote, invoice: PaymentRequiredInvoice): FXQuote {
  return {
    ...baseQuote,
    fromAmount: invoice.amount,
    toAmount: computeConvertedAmount(invoice.amount, baseQuote.rate),
    quotedAt: baseQuote.quotedAt ?? nowIso(),
  };
}

function buildCachedQuote(params: {
  invoice: PaymentRequiredInvoice;
  fromAsset: string;
  toAsset: string;
  rate: string;
  source: string;
  reference: string;
  ttlMs: number;
}): FXQuote {
  const cacheKey = buildCacheKey(params);
  const cached = getCachedQuote(cacheKey);
  if (cached) {
    return materializeQuote(cached, params.invoice);
  }

  const quote = cacheQuote(cacheKey, {
    quoteId: randomUUID(),
    fromAsset: params.fromAsset,
    toAsset: params.toAsset,
    rate: params.rate,
    source: params.source,
    expiresAt: buildExpiresAt(params.ttlMs),
    quotedAt: nowIso(),
    reference: params.reference,
  });
  return materializeQuote(quote, params.invoice);
}

export function resolveBillingFxQuote(
  invoice: PaymentRequiredInvoice,
  config: Web3PluginConfig,
): FXQuote | undefined {
  if (config.x402.fxQuote.enabled === false) {
    return undefined;
  }

  if (isFxQuote(invoice.quote)) {
    return normalizeProvidedQuote(invoice.quote);
  }

  const targetAsset = normalizeAsset(config.x402.fxQuote.settlementAsset);
  const sourceAsset = normalizeAsset(invoice.asset);
  const pairKey = `${sourceAsset}:${targetAsset}`;
  const inversePairKey = `${targetAsset}:${sourceAsset}`;
  const configuredRate = config.x402.fxQuote.manualRates?.[pairKey];
  const inverseRate = config.x402.fxQuote.manualRates?.[inversePairKey];

  if (configuredRate && /^\d+(\.\d+)?$/.test(configuredRate)) {
    return buildCachedQuote({
      invoice,
      fromAsset: sourceAsset,
      toAsset: targetAsset,
      rate: configuredRate,
      source: config.x402.fxQuote.source,
      reference: pairKey,
      ttlMs: config.x402.fxQuote.defaultTtlMs,
    });
  }

  if (inverseRate && /^\d+(\.\d+)?$/.test(inverseRate)) {
    const numericInverse = Number(inverseRate);
    if (numericInverse > 0) {
      return buildCachedQuote({
        invoice,
        fromAsset: sourceAsset,
        toAsset: targetAsset,
        rate: (1 / numericInverse).toString(),
        source: config.x402.fxQuote.source,
        reference: inversePairKey,
        ttlMs: config.x402.fxQuote.defaultTtlMs,
      });
    }
  }

  if (sourceAsset === targetAsset) {
    return buildCachedQuote({
      invoice,
      fromAsset: sourceAsset,
      toAsset: targetAsset,
      rate: "1",
      source: "identity",
      reference: pairKey,
      ttlMs: config.x402.fxQuote.defaultTtlMs,
    });
  }

  return undefined;
}
