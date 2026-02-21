/**
 * 动态定价功能测试
 * Dynamic Pricing Tests
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  calculateDynamicPrice,
  calculateTieredPrice,
  collectMarketMetrics,
  calculateVolatility,
} from "../pricing-engine.js";
import type { PricingModel, MarketMetrics, PriceHistory } from "../pricing-types.js";

describe("Dynamic Pricing Engine", () => {
  describe("供需定价", () => {
    it("应在高需求低供给时提高价格", () => {
      const model: PricingModel = {
        strategy: "dynamic",
        basePrice: 10.0,
        currency: "USD",
        dynamicConfig: {
          enabled: true,
          demandWeight: 0.6,
          supplyWeight: 0.4,
          elasticity: 0.3,
          updateInterval: 300,
          lookbackWindow: 3600,
        },
      };

      const metrics: MarketMetrics = {
        timestamp: new Date().toISOString(),
        offerId: "test-offer-1",
        totalProviders: 10,
        activeProviders: 8,
        totalCapacity: 1000,
        availableCapacity: 200, // 80% 利用率
        utilizationRate: 0.8,
        totalOrders: 100,
        pendingOrders: 20,
        completedOrders: 80,
        orderRate: 15, // 高需求：15单/小时
        similarOffers: 5,
        avgCompetitorPrice: 12.0,
        priceRank: 1,
      };

      const result = calculateDynamicPrice(model, metrics);

      expect(result.calculatedPrice).toBeGreaterThan(model.basePrice);
      expect(result.adjustments.length).toBeGreaterThan(0);
      expect(result.adjustments.some((a) => a.type === "supply_demand")).toBe(true);
    });

    it("应在低需求高供给时降低价格", () => {
      const model: PricingModel = {
        strategy: "dynamic",
        basePrice: 10.0,
        currency: "USD",
        dynamicConfig: {
          enabled: true,
          demandWeight: 0.6,
          supplyWeight: 0.4,
          elasticity: 0.3,
          updateInterval: 300,
          lookbackWindow: 3600,
        },
      };

      const metrics: MarketMetrics = {
        timestamp: new Date().toISOString(),
        offerId: "test-offer-2",
        totalProviders: 10,
        activeProviders: 10,
        totalCapacity: 1000,
        availableCapacity: 900, // 10% 利用率
        utilizationRate: 0.1,
        totalOrders: 50,
        pendingOrders: 5,
        completedOrders: 45,
        orderRate: 2, // 低需求：2单/小时
        similarOffers: 5,
        avgCompetitorPrice: 9.0,
        priceRank: 3,
      };

      const result = calculateDynamicPrice(model, metrics);

      expect(result.calculatedPrice).toBeLessThanOrEqual(model.basePrice);
    });
  });

  describe("高峰定价", () => {
    it("应在利用率超过阈值时应用高峰倍数", () => {
      const model: PricingModel = {
        strategy: "dynamic",
        basePrice: 10.0,
        currency: "USD",
        surgeConfig: {
          enabled: true,
          surgeMultiplier: 1.5,
          thresholdUtilization: 0.8,
          cooldownPeriod: 1800,
        },
      };

      const metrics: MarketMetrics = {
        timestamp: new Date().toISOString(),
        offerId: "test-offer-3",
        totalProviders: 10,
        activeProviders: 10,
        totalCapacity: 1000,
        availableCapacity: 100, // 90% 利用率
        utilizationRate: 0.9,
        totalOrders: 100,
        pendingOrders: 30,
        completedOrders: 70,
        orderRate: 20,
        similarOffers: 5,
        avgCompetitorPrice: 12.0,
        priceRank: 1,
      };

      const result = calculateDynamicPrice(model, metrics);

      expect(result.adjustments.some((a) => a.type === "surge")).toBe(true);
      const surgeAdjustment = result.adjustments.find((a) => a.type === "surge");
      expect(surgeAdjustment?.percentage).toBe(50); // (1.5 - 1) * 100
    });

    it("利用率低于阈值时不应应用高峰定价", () => {
      const model: PricingModel = {
        strategy: "dynamic",
        basePrice: 10.0,
        currency: "USD",
        surgeConfig: {
          enabled: true,
          surgeMultiplier: 1.5,
          thresholdUtilization: 0.8,
          cooldownPeriod: 1800,
        },
      };

      const metrics: MarketMetrics = {
        timestamp: new Date().toISOString(),
        offerId: "test-offer-4",
        totalProviders: 10,
        activeProviders: 10,
        totalCapacity: 1000,
        availableCapacity: 500, // 50% 利用率
        utilizationRate: 0.5,
        totalOrders: 50,
        pendingOrders: 10,
        completedOrders: 40,
        orderRate: 8,
        similarOffers: 5,
        avgCompetitorPrice: 10.0,
        priceRank: 2,
      };

      const result = calculateDynamicPrice(model, metrics);

      expect(result.adjustments.some((a) => a.type === "surge")).toBe(false);
    });
  });

  describe("价格约束", () => {
    it("应遵守最低价格限制", () => {
      const model: PricingModel = {
        strategy: "dynamic",
        basePrice: 10.0,
        currency: "USD",
        dynamicConfig: {
          enabled: true,
          demandWeight: 0.6,
          supplyWeight: 0.4,
          elasticity: 0.5, // 高弹性
          updateInterval: 300,
          lookbackWindow: 3600,
        },
        constraints: {
          minPrice: 8.0,
          maxPrice: 20.0,
        },
      };

      const metrics: MarketMetrics = {
        timestamp: new Date().toISOString(),
        offerId: "test-offer-5",
        totalProviders: 20,
        activeProviders: 20,
        totalCapacity: 2000,
        availableCapacity: 1900, // 极低利用率
        utilizationRate: 0.05,
        totalOrders: 10,
        pendingOrders: 1,
        completedOrders: 9,
        orderRate: 1, // 极低需求
        similarOffers: 10,
        avgCompetitorPrice: 8.5,
        priceRank: 5,
      };

      const result = calculateDynamicPrice(model, metrics);

      expect(result.calculatedPrice).toBeGreaterThanOrEqual(8.0);
      expect(result.adjustments.some((a) => a.type === "constraint")).toBe(true);
    });

    it("应遵守最高价格限制", () => {
      const model: PricingModel = {
        strategy: "dynamic",
        basePrice: 10.0,
        currency: "USD",
        dynamicConfig: {
          enabled: true,
          demandWeight: 0.6,
          supplyWeight: 0.4,
          elasticity: 0.5,
          updateInterval: 300,
          lookbackWindow: 3600,
        },
        constraints: {
          minPrice: 5.0,
          maxPrice: 15.0,
        },
      };

      const metrics: MarketMetrics = {
        timestamp: new Date().toISOString(),
        offerId: "test-offer-6",
        totalProviders: 2,
        activeProviders: 1,
        totalCapacity: 100,
        availableCapacity: 0, // 100% 利用率
        utilizationRate: 1.0,
        totalOrders: 200,
        pendingOrders: 50,
        completedOrders: 150,
        orderRate: 50, // 极高需求
        similarOffers: 2,
        avgCompetitorPrice: 18.0,
        priceRank: 1,
      };

      const result = calculateDynamicPrice(model, metrics);

      expect(result.calculatedPrice).toBeLessThanOrEqual(15.0);
    });

    it("应遵守价格变动限制", () => {
      const model: PricingModel = {
        strategy: "dynamic",
        basePrice: 10.0,
        currency: "USD",
        dynamicConfig: {
          enabled: true,
          demandWeight: 0.6,
          supplyWeight: 0.4,
          elasticity: 0.8, // 极高弹性
          updateInterval: 300,
          lookbackWindow: 3600,
        },
        constraints: {
          priceChangeLimit: 20, // 最多变动20%
        },
      };

      const metrics: MarketMetrics = {
        timestamp: new Date().toISOString(),
        offerId: "test-offer-7",
        totalProviders: 3,
        activeProviders: 2,
        totalCapacity: 150,
        availableCapacity: 10,
        utilizationRate: 0.93,
        totalOrders: 150,
        pendingOrders: 40,
        completedOrders: 110,
        orderRate: 40,
        similarOffers: 3,
        avgCompetitorPrice: 15.0,
        priceRank: 1,
      };

      const result = calculateDynamicPrice(model, metrics);

      expect(result.calculatedPrice).toBeLessThanOrEqual(12.0); // 10 * 1.2
      expect(result.calculatedPrice).toBeGreaterThanOrEqual(8.0); // 10 * 0.8
    });
  });

  describe("分级定价", () => {
    it("应根据数量应用正确的价格梯度", () => {
      const model: PricingModel = {
        strategy: "tiered",
        basePrice: 100.0,
        currency: "USD",
        tierConfig: {
          enabled: true,
          tiers: [
            { minQuantity: 1, maxQuantity: 10, pricePerUnit: 100.0 },
            { minQuantity: 11, maxQuantity: 50, pricePerUnit: 90.0, discount: 10 },
            { minQuantity: 51, maxQuantity: 100, pricePerUnit: 80.0, discount: 20 },
            { minQuantity: 101, pricePerUnit: 70.0, discount: 30 },
          ],
        },
      };

      // 小批量
      const smallOrder = calculateTieredPrice(model, 5);
      expect(smallOrder.calculatedPrice).toBe(500.0); // 5 * 100

      // 中批量
      const mediumOrder = calculateTieredPrice(model, 25);
      expect(mediumOrder.calculatedPrice).toBe(2250.0); // 25 * 90

      // 大批量
      const largeOrder = calculateTieredPrice(model, 60);
      expect(largeOrder.calculatedPrice).toBe(4800.0); // 60 * 80

      // 超大批量
      const extraLargeOrder = calculateTieredPrice(model, 150);
      expect(extraLargeOrder.calculatedPrice).toBe(10500.0); // 150 * 70
    });

    it("应计算正确的折扣金额", () => {
      const model: PricingModel = {
        strategy: "tiered",
        basePrice: 100.0,
        currency: "USD",
        tierConfig: {
          enabled: true,
          tiers: [
            { minQuantity: 1, maxQuantity: 10, pricePerUnit: 100.0 },
            { minQuantity: 11, pricePerUnit: 80.0, discount: 20 },
          ],
        },
      };

      const result = calculateTieredPrice(model, 50);

      expect(result.originalPrice).toBe(5000.0); // 50 * 100
      expect(result.calculatedPrice).toBe(4000.0); // 50 * 80
      expect(result.adjustments.length).toBeGreaterThan(0);
      expect(result.adjustments[0].type).toBe("tier_discount");
      expect(result.adjustments[0].amount).toBe(-1000.0);
    });
  });

  describe("市场指标收集", () => {
    it("应正确计算利用率", () => {
      const orders = [
        { status: "order_created", createdAt: new Date(Date.now() - 1800000).toISOString() },
        { status: "settlement_completed", createdAt: new Date(Date.now() - 3000000).toISOString() },
      ];

      const providers = [
        { active: true, capacity: 100, available: 30 },
        { active: true, capacity: 150, available: 50 },
        { active: false, capacity: 200, available: 200 },
      ];

      const competitorOffers = [{ price: 10.0 }, { price: 12.0 }, { price: 11.0 }];

      const metrics = collectMarketMetrics("test-offer", orders, providers, competitorOffers);

      expect(metrics.totalProviders).toBe(3);
      expect(metrics.activeProviders).toBe(2);
      expect(metrics.totalCapacity).toBe(450);
      expect(metrics.availableCapacity).toBe(280);
      expect(metrics.utilizationRate).toBeCloseTo(0.378, 2); // (450-280)/450
      expect(metrics.completedOrders).toBe(1);
      expect(metrics.avgCompetitorPrice).toBeCloseTo(11.0, 2);
    });
  });

  describe("价格波动率计算", () => {
    it("应计算正确的波动率", () => {
      const priceHistory: PriceHistory[] = [
        {
          historyId: "1",
          offerId: "test",
          price: 10.0,
          volume: 1,
          timestamp: "2026-02-20T00:00:00Z",
          source: "system",
        },
        {
          historyId: "2",
          offerId: "test",
          price: 10.5,
          volume: 1,
          timestamp: "2026-02-20T01:00:00Z",
          source: "system",
        },
        {
          historyId: "3",
          offerId: "test",
          price: 10.2,
          volume: 1,
          timestamp: "2026-02-20T02:00:00Z",
          source: "system",
        },
        {
          historyId: "4",
          offerId: "test",
          price: 11.0,
          volume: 1,
          timestamp: "2026-02-20T03:00:00Z",
          source: "system",
        },
        {
          historyId: "5",
          offerId: "test",
          price: 10.8,
          volume: 1,
          timestamp: "2026-02-20T04:00:00Z",
          source: "system",
        },
      ];

      const volatility = calculateVolatility(priceHistory);

      expect(volatility).toBeGreaterThan(0);
      expect(volatility).toBeLessThan(1);
    });

    it("单个价格点应返回0波动率", () => {
      const priceHistory: PriceHistory[] = [
        {
          historyId: "1",
          offerId: "test",
          price: 10.0,
          volume: 1,
          timestamp: "2026-02-20T00:00:00Z",
          source: "system",
        },
      ];

      const volatility = calculateVolatility(priceHistory);

      expect(volatility).toBe(0);
    });

    it("价格不变应返回0波动率", () => {
      const priceHistory: PriceHistory[] = [
        {
          historyId: "1",
          offerId: "test",
          price: 10.0,
          volume: 1,
          timestamp: "2026-02-20T00:00:00Z",
          source: "system",
        },
        {
          historyId: "2",
          offerId: "test",
          price: 10.0,
          volume: 1,
          timestamp: "2026-02-20T01:00:00Z",
          source: "system",
        },
        {
          historyId: "3",
          offerId: "test",
          price: 10.0,
          volume: 1,
          timestamp: "2026-02-20T02:00:00Z",
          source: "system",
        },
      ];

      const volatility = calculateVolatility(priceHistory);

      expect(volatility).toBe(0);
    });
  });

  describe("竞争定价", () => {
    it("当价格远高于市场平均时应降价", () => {
      const model: PricingModel = {
        strategy: "dynamic",
        basePrice: 20.0, // 高价
        currency: "USD",
        dynamicConfig: {
          enabled: true,
          demandWeight: 0.5,
          supplyWeight: 0.5,
          elasticity: 0.2,
          updateInterval: 300,
          lookbackWindow: 3600,
        },
      };

      const metrics: MarketMetrics = {
        timestamp: new Date().toISOString(),
        offerId: "test-offer-8",
        totalProviders: 10,
        activeProviders: 10,
        totalCapacity: 1000,
        availableCapacity: 500,
        utilizationRate: 0.5,
        totalOrders: 50,
        pendingOrders: 10,
        completedOrders: 40,
        orderRate: 10,
        similarOffers: 10,
        avgCompetitorPrice: 12.0, // 市场均价远低于basePrice
        priceRank: 8, // 排名靠后
      };

      const result = calculateDynamicPrice(model, metrics);

      expect(result.adjustments.some((a) => a.type === "competitive")).toBe(true);
      const competitiveAdj = result.adjustments.find((a) => a.type === "competitive");
      expect(competitiveAdj?.amount).toBeLessThan(0); // 降价
    });

    it("当价格排名靠前且远低于市场时可适度涨价", () => {
      const model: PricingModel = {
        strategy: "dynamic",
        basePrice: 8.0, // 低价
        currency: "USD",
        dynamicConfig: {
          enabled: true,
          demandWeight: 0.5,
          supplyWeight: 0.5,
          elasticity: 0.2,
          updateInterval: 300,
          lookbackWindow: 3600,
        },
      };

      const metrics: MarketMetrics = {
        timestamp: new Date().toISOString(),
        offerId: "test-offer-9",
        totalProviders: 10,
        activeProviders: 10,
        totalCapacity: 1000,
        availableCapacity: 500,
        utilizationRate: 0.5,
        totalOrders: 50,
        pendingOrders: 10,
        completedOrders: 40,
        orderRate: 10,
        similarOffers: 10,
        avgCompetitorPrice: 15.0, // 市场均价远高于basePrice
        priceRank: 1, // 排名第一
      };

      const result = calculateDynamicPrice(model, metrics);

      // 可能会有竞争调价
      const competitiveAdj = result.adjustments.find((a) => a.type === "competitive");
      if (competitiveAdj) {
        expect(competitiveAdj.amount).toBeGreaterThan(0); // 涨价
      }
    });
  });
});
