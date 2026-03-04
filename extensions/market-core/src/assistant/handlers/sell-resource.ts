// extensions/market-core/src/assistant/handlers/sell-resource.ts

import {
  formatMaybeAddress,
  pickArray,
  pickRecord,
  pickString,
  toFiniteNumber,
} from "../paste-safe.js";
import type { MarketAssistantRuntime } from "../types.js";

type PublishResult = {
  resourceId?: string;
  offerId?: string;
  status?: string;
};

function inferResourceKind(name: string): "model" | "search" | "storage" | "service" {
  const n = name.toLowerCase();
  if (n.includes("存储") || n.includes("storage")) return "storage";
  if (n.includes("搜索") || n.includes("search")) return "search";
  if (n.includes("api") || n.includes("服务") || n.includes("service")) return "service";
  return "model";
}

function defaultUnitByKind(kind: "model" | "search" | "storage" | "service"): string {
  if (kind === "search") return "query";
  if (kind === "storage") return "gb_day";
  return "call";
}

function readPriceAmount(entry: Record<string, unknown>): number | undefined {
  const price = entry.price;
  if (!price || typeof price !== "object" || Array.isArray(price)) return undefined;
  const amount = (price as Record<string, unknown>).amount;
  const n = toFiniteNumber(amount);
  return n > 0 ? n : undefined;
}

export async function handleSellResource(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const resourceName = typeof params.resourceName === "string" ? params.resourceName : undefined;
  const price = toFiniteNumber(params.price);

  if (!resourceName || price <= 0) {
    return '❌ 请提供资源名称和价格，例如：\n"帮我把 GPU 卖掉，价格 $10/小时"';
  }

  const actorId = typeof params.actorId === "string" ? params.actorId.trim() : undefined;
  if (!actorId) {
    return '❌ 缺少 actorId，请在指令里附带，例如："actorId=0x... 帮我发布 GPU，价格 $10"';
  }

  const resourceKind = inferResourceKind(resourceName);
  const unit = defaultUnitByKind(resourceKind);

  const result = await runtime.callGatewayMethod<PublishResult>("market.resource.publish", {
    actorId,
    resource: {
      kind: resourceKind,
      label: resourceName,
      price: { unit, amount: String(Math.max(1, Math.floor(price))), currency: "USDT" },
      offer: {
        assetId: `assistant:${resourceKind}:${Date.now()}`,
        assetType: resourceKind === "storage" ? "service" : "api",
        currency: "USDT",
        usageScope: { purpose: "assistant_publish" },
        deliveryType: resourceKind === "storage" ? "service" : "api",
      },
    },
  });

  // 可选：返回“同类均价”的原始数据（不做策略判断）
  let marketAvgText = "";
  try {
    const marketResourcesRaw = await runtime.callGatewayMethod<unknown>("market.resource.list", {
      limit: 20,
      status: "resource_published",
    });
    const marketResources = pickArray<Record<string, unknown>>(marketResourcesRaw, "resources");
    const peers = marketResources.filter((r) => {
      const rLabel = String(r.label || "").toLowerCase();
      return rLabel.includes(resourceKind) || rLabel.includes(resourceName.toLowerCase());
    });

    if (peers.length > 0) {
      let total = 0;
      let count = 0;
      for (const p of peers) {
        const pPrice = readPriceAmount(p);
        if (pPrice) {
          total += pPrice;
          count++;
        }
      }
      if (count > 0) {
        marketAvgText = `\n\n📌 参考：同类均价约 $${(total / count).toFixed(2)} / ${unit}`;
      }
    }
  } catch {
    // ignore
  }

  const resourceId = typeof result.resourceId === "string" ? result.resourceId : "unknown";
  const offerId = typeof result.offerId === "string" ? result.offerId : "unknown";
  const status = typeof result.status === "string" ? result.status : "resource_published";

  return `✅ 已发布 ${resourceName} 服务\n\n🆔 Resource: ${resourceId}\n📦 Offer: ${offerId}\n👤 Provider: @${formatMaybeAddress(actorId)}\n💰 标价：${price} USDT/${unit}\n📌 状态：${status}${marketAvgText}`;
}
