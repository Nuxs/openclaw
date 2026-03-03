import type { UsageTotals } from "./usageTypes.ts";

type TotalsLike = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  inputCost?: number;
  outputCost?: number;
  cacheReadCost?: number;
  cacheWriteCost?: number;
  missingCostEntries?: number;
};

export function createEmptyUsageTotals(): UsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    missingCostEntries: 0,
  };
}

export function addUsageTotals(acc: UsageTotals, usage: TotalsLike): UsageTotals {
  acc.input += usage.input;
  acc.output += usage.output;
  acc.cacheRead += usage.cacheRead;
  acc.cacheWrite += usage.cacheWrite;
  acc.totalTokens += usage.totalTokens;
  acc.totalCost += usage.totalCost;
  acc.inputCost += usage.inputCost ?? 0;
  acc.outputCost += usage.outputCost ?? 0;
  acc.cacheReadCost += usage.cacheReadCost ?? 0;
  acc.cacheWriteCost += usage.cacheWriteCost ?? 0;
  acc.missingCostEntries += usage.missingCostEntries ?? 0;
  return acc;
}
