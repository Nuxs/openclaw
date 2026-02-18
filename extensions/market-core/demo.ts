#!/usr/bin/env node --import tsx
/**
 * Market Core Plugin Demo
 *
 * 演示插件的核心流程:
 * 1. 发布报价（Offer）
 * 2. 创建订单（Order）
 * 3. 授权同意（Consent）
 * 4. 交付（Delivery）
 * 5. 结算（Settlement）
 * 6. 审计记录（Audit）
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "./src/config.js";
import { hashCanonical } from "./src/market/hash.js";
import type {
  AuditEvent,
  Consent,
  Delivery,
  Offer,
  Order,
  Settlement,
} from "./src/market/types.js";
import { MarketStateStore } from "./src/state/store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEMO_STATE_DIR = join(__dirname, ".demo-state");
rmSync(DEMO_STATE_DIR, { recursive: true, force: true });
mkdirSync(DEMO_STATE_DIR, { recursive: true });

const nowIso = () => new Date().toISOString();

console.log("🧭 Market Core Plugin Demo\n");
console.log(`📁 State directory: ${DEMO_STATE_DIR}\n`);

// 1️⃣ 配置演示
console.log("1️⃣  配置系统");
console.log("━".repeat(60));

const config = resolveConfig({
  chain: { network: "base" },
  settlement: { mode: "contract", tokenAddress: "0xToken", treasuryAddress: "0xTreasury" },
  store: { mode: "sqlite" },
  access: { mode: "open" },
  credentials: { mode: "inline" },
});

console.log("✅ 结算模式:", config.settlement.mode);
console.log("✅ 存储模式:", config.store.mode);
console.log("✅ 访问模式:", config.access.mode);
console.log();

// 2️⃣ 初始化状态存储
console.log("2️⃣  状态存储初始化");
console.log("━".repeat(60));

const store = new MarketStateStore(DEMO_STATE_DIR, config);
console.log("✅ MarketStateStore 已初始化");
console.log();

// 3️⃣ 发布报价（Offer）
console.log("3️⃣  报价发布（Offer）");
console.log("━".repeat(60));

const offerId = `offer_${randomUUID()}`;
const offer: Offer = {
  offerId,
  sellerId: "seller_demo",
  assetId: "asset_demo",
  assetType: "data",
  assetMeta: {
    title: "OpenClaw 数据集",
    description: "示例数据集，用于演示交易流程",
    tags: ["demo", "market"],
  },
  price: 100,
  currency: "USDC",
  usageScope: { purpose: "analytics", region: "global", durationDays: 30 },
  deliveryType: "download",
  status: "offer_published",
  offerHash: hashCanonical({ offerId, sellerId: "seller_demo", assetId: "asset_demo" }),
  createdAt: nowIso(),
  updatedAt: nowIso(),
};

store.saveOffer(offer);
console.log("✅ 已保存报价:", offer.offerId);
console.log("✅ 报价状态:", offer.status);
console.log();

// 4️⃣ 创建订单（Order）
console.log("4️⃣  订单创建（Order）");
console.log("━".repeat(60));

const orderId = `order_${randomUUID()}`;
const order: Order = {
  orderId,
  offerId: offer.offerId,
  buyerId: "buyer_demo",
  quantity: 1,
  status: "payment_locked",
  orderHash: hashCanonical({ orderId, offerId: offer.offerId, buyerId: "buyer_demo" }),
  createdAt: nowIso(),
  updatedAt: nowIso(),
  paymentTxHash: "0xpaymenttx",
};

store.saveOrder(order);
console.log("✅ 已创建订单:", order.orderId);
console.log("✅ 订单状态:", order.status);
console.log();

// 5️⃣ 授权同意（Consent）
console.log("5️⃣  同意授权（Consent）");
console.log("━".repeat(60));

const consentId = `consent_${randomUUID()}`;
const consent: Consent = {
  consentId,
  orderId: order.orderId,
  scope: { purpose: "analytics", durationDays: 30, scopeHash: "0xscope" },
  signature: "0xconsent_signature",
  status: "consent_granted",
  consentHash: hashCanonical({ consentId, orderId: order.orderId }),
  grantedAt: nowIso(),
};

store.saveConsent(consent);
console.log("✅ 已记录授权:", consent.consentId);
console.log("✅ 授权状态:", consent.status);
console.log();

// 6️⃣ 交付（Delivery）
console.log("6️⃣  数据交付（Delivery）");
console.log("━".repeat(60));

const deliveryId = `delivery_${randomUUID()}`;
const delivery: Delivery = {
  deliveryId,
  orderId: order.orderId,
  deliveryType: "download",
  status: "delivery_completed",
  deliveryHash: hashCanonical({ deliveryId, orderId: order.orderId }),
  issuedAt: nowIso(),
  payload: { type: "download", downloadUrl: "https://example.com/demo.zip" },
};

store.saveDelivery(delivery);
console.log("✅ 已交付:", delivery.deliveryId);
console.log("✅ 交付状态:", delivery.status);
console.log();

// 7️⃣ 结算（Settlement）
console.log("7️⃣  结算完成（Settlement）");
console.log("━".repeat(60));

const settlementId = `settlement_${randomUUID()}`;
const settlement: Settlement = {
  settlementId,
  orderId: order.orderId,
  status: "settlement_released",
  amount: "100",
  tokenAddress: config.settlement.tokenAddress,
  lockedAt: nowIso(),
  releasedAt: nowIso(),
  lockTxHash: "0xlocktx",
  releaseTxHash: "0xreleasetx",
  settlementHash: hashCanonical({ settlementId, orderId: order.orderId }),
};

store.saveSettlement(settlement);
console.log("✅ 已结算:", settlement.settlementId);
console.log("✅ 结算状态:", settlement.status);
console.log();

// 8️⃣ 审计记录（Audit）
console.log("8️⃣  审计记录（Audit）");
console.log("━".repeat(60));

const auditEvents: AuditEvent[] = [
  {
    id: `audit_${randomUUID()}`,
    kind: "offer_published",
    refId: offer.offerId,
    hash: offer.offerHash,
    actor: offer.sellerId,
    timestamp: nowIso(),
  },
  {
    id: `audit_${randomUUID()}`,
    kind: "payment_locked",
    refId: order.orderId,
    hash: order.orderHash,
    actor: order.buyerId,
    timestamp: nowIso(),
  },
  {
    id: `audit_${randomUUID()}`,
    kind: "consent_granted",
    refId: consent.consentId,
    hash: consent.consentHash,
    actor: order.buyerId,
    timestamp: nowIso(),
  },
  {
    id: `audit_${randomUUID()}`,
    kind: "delivery_completed",
    refId: delivery.deliveryId,
    hash: delivery.deliveryHash,
    actor: offer.sellerId,
    timestamp: nowIso(),
  },
  {
    id: `audit_${randomUUID()}`,
    kind: "settlement_released",
    refId: settlement.settlementId,
    hash: settlement.settlementHash,
    actor: offer.sellerId,
    timestamp: nowIso(),
  },
];

auditEvents.forEach((event) => {
  store.appendAuditEvent(event);
  console.log(`✅ 审计事件: ${event.kind} → ${event.refId}`);
});

const recent = store.readAuditEvents(20);
console.log(`✅ 审计日志条数: ${recent.length}`);
console.log();

// 9️⃣ 汇总
console.log("📊 流程概览");
console.log("━".repeat(60));
console.log("报价:", store.listOffers().length);
console.log("订单:", store.listOrders().length);
console.log("授权:", store.listConsents().length);
console.log("交付:", store.listDeliveries().length);
console.log("结算:", store.listSettlements().length);
console.log("审计:", store.readAuditEvents().length);
console.log();

console.log("✅ Demo 完成! 清理临时文件...");
rmSync(DEMO_STATE_DIR, { recursive: true, force: true });
console.log("🧹 已清理临时状态目录");
