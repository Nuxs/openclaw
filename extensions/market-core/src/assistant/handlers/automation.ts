// extensions/market-core/src/assistant/handlers/automation.ts

import { formatMaybeAddress, pickArray, pickString } from "../paste-safe.js";
import type { MarketAssistantRuntime } from "../types.js";

export async function handleSetAutomation(
  _runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const action = typeof params.action === "string" ? params.action : undefined;
  const minPrice = typeof params.minPrice === "number" ? params.minPrice : undefined;
  const maxConcurrent = typeof params.maxConcurrent === "number" ? params.maxConcurrent : undefined;

  if (action !== "auto_accept") {
    return "❌ 未知的自动化类型";
  }

  return [
    "⚠️ 当前 market-core 未注册自动化规则写入能力（market.automation.setRule）。",
    "建议改用外部调度（cron/worker）调用 market.order.list + market.order.cancel/settlement.* 组合实现自动化。",
    typeof minPrice === "number" ? `期望最低价格：$${minPrice}` : undefined,
    typeof maxConcurrent === "number" ? `期望最大并发：${maxConcurrent}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function handleCancelOrders(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const cancelAll = params.cancelAll === true;

  if (!cancelAll) {
    return '请明确指定要取消的订单，或输入"取消所有订单"';
  }

  const actorId = typeof params.actorId === "string" ? params.actorId.trim() : undefined;
  if (!actorId) {
    return '❌ 缺少 actorId，请在指令里附带，例如："actorId=0x... 取消所有订单"';
  }

  const response = await runtime.callGatewayMethod<unknown>("market.order.list", {
    status: "active",
    buyerId: actorId,
    limit: 100,
  });
  const orders = pickArray<Record<string, unknown>>(response, "orders");

  let cancelled = 0;
  for (const order of orders) {
    const orderId = pickString(order, "orderId");
    if (!orderId) continue;
    await runtime.callGatewayMethod("market.order.cancel", {
      actorId,
      orderId,
    });
    cancelled += 1;
  }

  return `✅ 已取消 ${cancelled} 个订单（@${formatMaybeAddress(actorId)}）`;
}
