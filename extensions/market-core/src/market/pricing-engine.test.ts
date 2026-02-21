/**
 * 动态定价引擎测试（Vitest）
 */

import { describe, it, expect } from "vitest";
import {
  calculateDynamicPrice,
  calculateTieredPrice,
  collectMarketMetrics,
  calculateVolatility,
} from "./pricing-engine.js";
import type { PricingModel, MarketMetrics } from "./pricing-types.js";

function baseMetrics(overrides: Partial<MarketMetrics> = {}): MarketMetrics {
  return {
    timestamp: new Date().toISOString(),
    resourceType: "service",
    offerId: "offer-1",

    totalProviders: 10,
    activeProviders: 8,
    totalCapacity: 1000,
    availableCapacity: 200,
    utilizationRate: 0.8,

    totalOrders24h: 100,
    pendingOrders: 20,
    completedOrders24h: 80,
    orderRate: 15,

    avgPrice24h: 12,
    priceChange24h: 0,

    similarOffers: 5,
    avgCompetitorPrice: 12,
    priceRank: 1,

    ...overrides,
  };
}

describe("pricing-engine", () => {
  it("calculateDynamicPrice should increase price under high demand/low supply", () => {
    const model: PricingModel = {
      strategy: "dynamic",
      basePrice: 10,
      dynamic: {
        enabled: true,
        demandWeight: 0.6,
        supplyWeight: 0.4,
        elasticity: 0.3,
        updateInterval: 300,
        lookbackWindow: 3600,
      },
    };

    const metrics = baseMetrics({ orderRate: 20, availableCapacity: 100, utilizationRate: 0.9 });
    const result = calculateDynamicPrice(model, metrics);

    expect(result.finalPrice).toBeGreaterThan(model.basePrice);
    expect(result.adjustments.length).toBeGreaterThan(0);
  });

  it("calculateTieredPrice should apply tier discount", () => {
    const model: PricingModel = {
      strategy: "tiered",
      basePrice: 10,
      tiered: {
        enabled: true,
        tiers: [
          { minQuantity: 1, maxQuantity: 9, pricePerUnit: 10 },
          { minQuantity: 10, pricePerUnit: 8 },
        ],
      },
    };

    const result = calculateTieredPrice(model, 10);
    expect(result.finalPrice).toBe(80);
    expect(result.adjustments.length).toBeGreaterThan(0);
  });

  it("collectMarketMetrics should return stable shape", () => {
    const metrics = collectMarketMetrics({
      offerId: "offer-1",
      resourceType: "service",
      orders: [
        { status: "order_created", createdAt: new Date().toISOString() },
        { status: "settlement_completed", createdAt: new Date().toISOString() },
      ],
      providers: [
        { active: true, capacity: 100, available: 50 },
        { active: false, capacity: 100, available: 100 },
      ],
      competitorOffers: [{ price: 10 }, { price: 12 }],
    });

    expect(metrics.offerId).toBe("offer-1");
    expect(metrics.resourceType).toBe("service");
    expect(metrics.totalProviders).toBe(2);
  });

  it("calculateVolatility should be 0 for constant prices", () => {
    const v = calculateVolatility([
      { price: 10, timestamp: new Date().toISOString() },
      { price: 10, timestamp: new Date().toISOString() },
      { price: 10, timestamp: new Date().toISOString() },
    ]);

    expect(v).toBe(0);
  });
});
