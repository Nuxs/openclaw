// extensions/market-core/src/assistant/handlers/query.ts

import { formatMaybeAddress, pickArray, pickString, toFiniteNumber } from "../paste-safe.js";
import type { MarketAssistantRuntime } from "../types.js";

export async function handleQueryInventory(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const actorId = typeof params.actorId === "string" ? params.actorId.trim() : undefined;

  const resourcesRaw = await runtime.callGatewayMethod<unknown>("market.resource.list", {
    providerActorId: actorId,
    status: "resource_published",
    limit: 50,
  });
  const resources = pickArray<Record<string, unknown>>(resourcesRaw, "resources");

  if (resources.length === 0) {
    return '📦 您当前没有在售的资源\n\n输入"帮我卖 GPU，价格 $10"来发布服务';
  }

  const ordersRaw = await runtime.callGatewayMethod<unknown>("market.order.list", {
    status: "active",
    sellerId: actorId,
    limit: 100,
  });
  const orders = pickArray<Record<string, unknown>>(ordersRaw, "orders");

  const inventoryText = resources
    .map((resource) => {
      const resourceId = pickString(resource, "resourceId") ?? "unknown";
      const resourceName = pickString(resource, "label") ?? resourceId;
      const used = orders
        .filter((order) => pickString(order, "resourceId") === resourceId)
        .reduce((sum, order) => sum + toFiniteNumber(order.quantity), 0);
      return `• ${resourceName}: 活跃订单占用 ${used}`;
    })
    .join("\n");

  const ordersText = orders
    .map((order) => {
      const resourceName =
        pickString(order, "resourceName") ?? String(order.resourceId ?? "unknown");
      const buyerId = pickString(order, "buyerId") ?? "unknown";
      const price = toFiniteNumber(order.price);
      const unit = pickString(order, "unit") ?? "unit";
      return `• ${resourceName} → @${formatMaybeAddress(buyerId)} ($${price}/${unit})`;
    })
    .join("\n");

  return `📦 当前库存（@${formatMaybeAddress(actorId)}）：\n${inventoryText}\n\n🔥 活跃订单：${orders.length} 个\n${ordersText || "暂无订单"}`;
}

export async function handleQueryEarnings(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const timeRange =
    params.timeRange === "week" || params.timeRange === "month"
      ? (params.timeRange as string)
      : "today";
  const actorId = typeof params.actorId === "string" ? params.actorId.trim() : undefined;

  const earnings = await runtime.callGatewayMethod<Record<string, unknown>>(
    "market.settlement.query",
    {
      actorId,
      timeRange,
      limit: 200,
    },
  );

  const total = toFiniteNumber(earnings.total);
  const settled = toFiniteNumber(earnings.settled);
  const pending = toFiniteNumber(earnings.pending);
  const orderCount = toFiniteNumber(earnings.orderCount);
  const trend = toFiniteNumber(earnings.trend);

  const timeRangeMap: Record<string, string> = { today: "今天", week: "本周", month: "本月" };
  const timeText = timeRangeMap[timeRange] || "今天";

  return `💰 ${timeText}收入：$${total.toFixed(2)}\n\n📊 详细：\n• 已结算：$${settled.toFixed(2)}\n• 待结算：$${pending.toFixed(2)}\n• 订单数：${orderCount} 个\n\n📈 趋势：${trend >= 0 ? "↑" : "↓"} ${Math.abs(trend).toFixed(1)}%`;
}

export async function handleQueryOrders(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const actorId = typeof params.actorId === "string" ? params.actorId.trim() : undefined;
  const response = await runtime.callGatewayMethod<unknown>("market.order.list", {
    status: "active",
    sellerId: actorId,
    limit: 100,
  });
  const orders = pickArray<Record<string, unknown>>(response, "orders");

  if (orders.length === 0) {
    return "📋 当前没有活跃订单";
  }

  const orderText = orders
    .map((order, i) => {
      const resourceName =
        pickString(order, "resourceName") ?? String(order.resourceId ?? "unknown");
      const buyerId = pickString(order, "buyerId") ?? "unknown";
      const price = toFiniteNumber(order.price);
      const unit = pickString(order, "unit") ?? "unit";
      const status = pickString(order, "status") ?? "unknown";
      return `${i + 1}. ${resourceName} → @${formatMaybeAddress(buyerId)}\n  💰 $${price}/${unit} | 状态 ${status}`;
    })
    .join("\n\n");

  return `🔥 活跃订单：${orders.length} 个（@${formatMaybeAddress(actorId)}）\n\n${orderText}`;
}
