// extensions/market-core/src/assistant/handlers/update-price.ts

import { formatMaybeAddress, pickArray, pickString, toFiniteNumber } from "../paste-safe.js";
import type { MarketAssistantRuntime } from "../types.js";

export async function handleUpdatePrice(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const newPrice = toFiniteNumber(params.newPrice);

  if (newPrice <= 0) {
    return '❌ 请提供新价格，例如："改成 $15"';
  }

  const actorId = typeof params.actorId === "string" ? params.actorId.trim() : undefined;
  if (!actorId) {
    return '❌ 缺少 actorId，请在指令里附带，例如："actorId=0x... 改成 $15"';
  }

  const resourcesRaw = await runtime.callGatewayMethod<unknown>("market.resource.list", {
    providerActorId: actorId,
    status: "resource_published",
    limit: 50,
  });
  const resources = pickArray<Record<string, unknown>>(resourcesRaw, "resources");

  if (resources.length === 0) {
    return "❌ 您当前没有在售的服务";
  }

  const offerIdParam = typeof params.offerId === "string" ? params.offerId.trim() : "";
  const fallbackOfferId = pickString(resources[0] ?? {}, "offerId") ?? "";
  const targetOfferId = offerIdParam.length > 0 ? offerIdParam : fallbackOfferId;
  if (!targetOfferId) {
    return "❌ 未找到可更新的 offerId，请在指令中提供 offerId";
  }

  await runtime.callGatewayMethod("market.offer.update", {
    actorId,
    offerId: targetOfferId,
    price: newPrice,
  });

  const targetLabel =
    pickString(
      resources.find((entry) => pickString(entry, "offerId") === targetOfferId) ?? {},
      "label",
    ) ?? targetOfferId;

  return `✅ 已将 ${targetLabel} 价格调整为 $${newPrice}（@${formatMaybeAddress(actorId)}）`;
}
