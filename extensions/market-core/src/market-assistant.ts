// extensions/market-agent/src/market-assistant.ts
// AI 管家：处理用户自然语言指令，编排市场 API 调用

export type MarketAssistantRuntime = {
  callGatewayMethod: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
};

/**
 * 用户意图类型
 */
export enum IntentType {
  SELL_RESOURCE = "sell_resource", // 发布资源
  UPDATE_PRICE = "update_price", // 调整价格
  QUERY_INVENTORY = "query_inventory", // 查询库存
  QUERY_EARNINGS = "query_earnings", // 查询收入
  QUERY_ORDERS = "query_orders", // 查询订单
  SET_AUTOMATION = "set_automation", // 设置自动化
  CANCEL_ORDERS = "cancel_orders", // 取消订单
  DIAGNOSE = "diagnose", // 诊断
  UNKNOWN = "unknown", // 未知意图
}

/**
 * 解析后的用户意图
 */
export interface ParsedIntent {
  type: IntentType;
  params: Record<string, unknown>;
  confidence: number;
}

/**
 * 市场 AI 管家
 *
 * 功能：
 * 1. 理解用户自然语言指令
 * 2. 映射到市场 API 调用
 * 3. 编排多步骤操作
 * 4. 生成友好的用户反馈
 */
export class MarketAssistant {
  private openclaw: MarketAssistantRuntime;

  constructor(openclaw: MarketAssistantRuntime) {
    this.openclaw = openclaw;
  }

  /**
   * 处理用户消息
   *
   * @param message 用户输入的自然语言指令
   * @returns 友好的文本回复
   */
  async handleUserMessage(message: string): Promise<string> {
    try {
      // 1. 解析用户意图
      const intent = await this.parseIntent(message);

      if (intent.confidence < 0.5) {
        return this.generateHelpMessage();
      }

      // 2. 根据意图执行操作
      switch (intent.type) {
        case IntentType.SELL_RESOURCE:
          return await this.handleSellResource(intent.params);
        case IntentType.UPDATE_PRICE:
          return await this.handleUpdatePrice(intent.params);
        case IntentType.QUERY_INVENTORY:
          return await this.handleQueryInventory(intent.params);
        case IntentType.QUERY_EARNINGS:
          return await this.handleQueryEarnings(intent.params);
        case IntentType.QUERY_ORDERS:
          return await this.handleQueryOrders(intent.params);
        case IntentType.SET_AUTOMATION:
          return await this.handleSetAutomation(intent.params);
        case IntentType.CANCEL_ORDERS:
          return await this.handleCancelOrders(intent.params);
        case IntentType.DIAGNOSE:
          return await this.handleDiagnose(intent.params);
        default:
          return this.generateHelpMessage();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
      return `❌ 操作失败：${message}\n\n请重试或输入"帮助"查看可用指令`;
    }
  }

  /**
   * 解析用户意图（L1 确定性反射层 — 关键词匹配）
   *
   * ⚠️ 架构过渡注释：此方法属于 Policy 层逻辑，按 "Extension = Mechanism, AI = Policy"
   * 原则（见 skills/web3-market/SKILL.md），它不应长期存在于 Extension 中。
   *
   * 当前保留原因：在 LLM Function Calling 接管前，提供保底 CLI 交互。
   * 升级路径（L2）：用 Capability Catalog（describeWeb3Capabilities）作为 LLM tools 定义，
   * 将意图解析完全移交给 AI Agent 层。届时此方法应被移除或降级为 fallback。
   */
  private async parseIntent(message: string): Promise<ParsedIntent> {
    const msg = message.toLowerCase();
    const commonParams = this.extractCommonParams(message);

    // 发布资源
    if (msg.includes("卖") || msg.includes("发布") || msg.includes("上架")) {
      return {
        type: IntentType.SELL_RESOURCE,
        params: { ...commonParams, ...this.extractSellParams(message) },
        confidence: 0.9,
      };
    }

    // 调整价格
    if (msg.includes("改价") || msg.includes("调价") || msg.includes("改成")) {
      return {
        type: IntentType.UPDATE_PRICE,
        params: { ...commonParams, ...this.extractPriceParams(message) },
        confidence: 0.9,
      };
    }

    // 查询库存
    if (msg.includes("库存") || msg.includes("剩余") || msg.includes("还有多少")) {
      return {
        type: IntentType.QUERY_INVENTORY,
        params: commonParams,
        confidence: 0.9,
      };
    }

    // 查询收入
    if (msg.includes("收入") || msg.includes("赚了") || msg.includes("营收")) {
      return {
        type: IntentType.QUERY_EARNINGS,
        params: { ...commonParams, ...this.extractTimeParams(message) },
        confidence: 0.9,
      };
    }

    // 查询订单
    if (msg.includes("订单") || msg.includes("有人买") || msg.includes("谁在用")) {
      return {
        type: IntentType.QUERY_ORDERS,
        params: commonParams,
        confidence: 0.9,
      };
    }

    // 设置自动化
    if (msg.includes("自动") || msg.includes("规则") || msg.includes("策略")) {
      return {
        type: IntentType.SET_AUTOMATION,
        params: { ...commonParams, ...this.extractAutomationParams(message) },
        confidence: 0.8,
      };
    }

    // 取消订单
    if (msg.includes("取消") || msg.includes("停止")) {
      return {
        type: IntentType.CANCEL_ORDERS,
        params: { ...commonParams, ...this.extractCancelParams(message) },
        confidence: 0.9,
      };
    }

    // 诊断
    if (
      msg.includes("出问题") ||
      msg.includes("帮我查") ||
      msg.includes("怎么了") ||
      msg.includes("有问题")
    ) {
      return {
        type: IntentType.DIAGNOSE,
        params: commonParams,
        confidence: 0.9,
      };
    }

    return {
      type: IntentType.UNKNOWN,
      params: commonParams,
      confidence: 0.0,
    };
  }

  /**
   * 处理诊断
   */
  private async handleDiagnose(params: any): Promise<string> {
    const actorId = this.resolveActorId(params);

    const [marketStatus, monitorHealth, reputation] = await Promise.all([
      this.openclaw
        .callGatewayMethod<any>("web3.market.status.summary", {})
        .catch((e) => ({ error: e.message })),
      this.openclaw
        .callGatewayMethod<any>("web3.monitor.health", {})
        .catch((e) => ({ error: e.message })),
      actorId
        ? this.openclaw
            .callGatewayMethod<any>("market.reputation.summary", { providerActorId: actorId })
            .catch((e) => ({ error: e.message }))
        : Promise.resolve(null),
    ]);

    const parts = ["🏥 **系统诊断报告**"];

    // 1. 系统健康
    if (monitorHealth.error) {
      parts.push(`⚠️ 监控服务不可用: ${monitorHealth.error}`);
    } else {
      const statusIcon = monitorHealth.status === "healthy" ? "✅" : "⚠️";
      parts.push(
        `${statusIcon} 系统状态: ${monitorHealth.status} (Alerts: ${monitorHealth.criticalAlerts ?? 0})`,
      );
    }

    // 2. 市场状态
    if (marketStatus.error) {
      parts.push(`⚠️ 市场状态不可用: ${marketStatus.error}`);
    } else {
      parts.push(
        `📊 市场概览: 活跃订单 ${marketStatus.activeOrders ?? "?"}, 总成交 $${marketStatus.totalVolume ?? "?"}`,
      );
    }

    // 3. 个人信誉 (如果提供了 actorId)
    if (reputation) {
      if (reputation.error) {
        parts.push(`⚠️ 信誉查询失败: ${reputation.error}`);
      } else {
        parts.push(
          `⭐ 您的信誉: ${reputation.score ?? "N/A"} 分 (争议: ${reputation.disputes ?? 0})`,
        );
      }
    } else {
      parts.push("💡 提示: 提供 `actorId` 可查看个人信誉评分");
    }

    return parts.join("\n\n");
  }

  /**
   * 处理发布资源
   */
  private async handleSellResource(params: any): Promise<string> {
    const { resourceName, price } = params;

    if (!resourceName || !price) {
      return '❌ 请提供资源名称和价格，例如：\n"帮我把 GPU 卖掉，价格 $10/小时"';
    }

    const actorId = this.resolveActorId(params);
    if (!actorId) {
      return '❌ 缺少 actorId，请在指令里附带，例如："actorId=0x... 帮我发布 GPU，价格 $10"';
    }

    const resourceKind = this.inferResourceKind(resourceName);
    const unit = this.defaultUnitByKind(resourceKind);

    const result = await this.openclaw.callGatewayMethod<{
      resourceId?: string;
      offerId?: string;
      status?: string;
    }>("market.resource.publish", {
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

    // P1: 定价建议
    let suggestion = "";
    try {
      const marketResourcesRaw = await this.openclaw.callGatewayMethod<unknown>(
        "market.resource.list",
        {
          limit: 20,
          status: "resource_published",
        },
      );
      const marketResources = this.pickArray<Record<string, unknown>>(
        marketResourcesRaw,
        "resources",
      );
      // 简单筛选同类 (Label match or Kind match if we had kind)
      const peers = marketResources.filter((r) => {
        const rLabel = String(r.label || "").toLowerCase();
        return rLabel.includes(resourceKind) || rLabel.includes(resourceName.toLowerCase());
      });

      if (peers.length > 0) {
        let total = 0;
        let count = 0;
        for (const p of peers) {
          const pPrice = this.toNumber((p.price as any)?.amount);
          if (pPrice > 0) {
            total += pPrice;
            count++;
          }
        }
        if (count > 0) {
          suggestion = this.generatePricingSuggestion(price, total / count);
        }
      }
    } catch {
      // ignore
    }

    return `✅ 已发布 ${resourceName} 服务

🆔 Resource: ${result?.resourceId ?? "unknown"}
📦 Offer: ${result?.offerId ?? "unknown"}
💰 标价：${price} USDT/${unit}
📌 状态：${result?.status ?? "resource_published"}

${suggestion}`;
  }

  /**
   * 处理调整价格
   */
  private async handleUpdatePrice(params: any): Promise<string> {
    const { newPrice } = params;

    if (!newPrice) {
      return '❌ 请提供新价格，例如："改成 $15"';
    }

    const actorId = this.resolveActorId(params);
    if (!actorId) {
      return '❌ 缺少 actorId，请在指令里附带，例如："actorId=0x... 改成 $15"';
    }

    const resourcesRaw = await this.openclaw.callGatewayMethod<unknown>("market.resource.list", {
      providerActorId: actorId,
      status: "resource_published",
      limit: 50,
    });
    const resources = this.pickArray<Record<string, unknown>>(resourcesRaw, "resources");

    if (resources.length === 0) {
      return "❌ 您当前没有在售的服务";
    }

    const targetOfferId =
      typeof params.offerId === "string" && params.offerId.trim().length > 0
        ? params.offerId.trim()
        : typeof resources[0]?.offerId === "string"
          ? resources[0].offerId
          : undefined;
    if (!targetOfferId) {
      return "❌ 未找到可更新的 offerId，请在指令中提供 offerId";
    }

    await this.openclaw.callGatewayMethod("market.offer.update", {
      actorId,
      offerId: targetOfferId,
      price: newPrice,
    });

    const targetLabel =
      (resources.find((entry) => entry.offerId === targetOfferId)?.label as string | undefined) ??
      targetOfferId;
    return `✅ 已将 ${targetLabel} 价格调整为 $${newPrice}`;
  }

  /**
   * 处理查询库存
   */
  private async handleQueryInventory(params: any): Promise<string> {
    const actorId = this.resolveActorId(params);
    const resourcesRaw = await this.openclaw.callGatewayMethod<unknown>("market.resource.list", {
      providerActorId: actorId,
      status: "resource_published",
      limit: 50,
    });
    const resources = this.pickArray<Record<string, unknown>>(resourcesRaw, "resources");

    if (resources.length === 0) {
      return '📦 您当前没有在售的资源\n\n输入"帮我卖 GPU，价格 $10"来发布服务';
    }

    const ordersRaw = await this.openclaw.callGatewayMethod<unknown>("market.order.list", {
      status: "active",
      sellerId: actorId,
      limit: 100,
    });
    const orders = this.pickArray<Record<string, unknown>>(ordersRaw, "orders");

    const inventoryText = resources
      .map((resource) => {
        const resourceId =
          typeof resource.resourceId === "string" ? resource.resourceId : "unknown";
        const resourceName = typeof resource.label === "string" ? resource.label : resourceId;
        const used = orders
          .filter((order) => order.resourceId === resourceId)
          .reduce((sum, order) => sum + this.toNumber(order.quantity), 0);
        return `• ${resourceName}: 活跃订单占用 ${used}`;
      })
      .join("\n");

    const ordersText = orders
      .map((order) => {
        const resourceName =
          typeof order.resourceName === "string"
            ? order.resourceName
            : String(order.resourceId ?? "unknown");
        const buyerId = typeof order.buyerId === "string" ? order.buyerId : "unknown";
        const price = this.toNumber(order.price);
        const unit = typeof order.unit === "string" ? order.unit : "unit";
        return `• ${resourceName} → @${buyerId} ($${price}/${unit})`;
      })
      .join("\n");

    return `📦 当前库存：\n${inventoryText}\n\n🔥 活跃订单：${orders.length} 个\n${ordersText || "暂无订单"}`;
  }

  /**
   * 处理查询收入
   */
  private async handleQueryEarnings(params: any): Promise<string> {
    const { timeRange = "today" } = params;
    const actorId = this.resolveActorId(params);

    const earnings = await this.openclaw.callGatewayMethod<{
      total?: number;
      settled?: number;
      pending?: number;
      orderCount?: number;
      trend?: number;
    }>("market.settlement.query", {
      actorId,
      timeRange,
      limit: 200,
    });

    const total = this.toNumber(earnings?.total);
    const settled = this.toNumber(earnings?.settled);
    const pending = this.toNumber(earnings?.pending);
    const orderCount = this.toNumber(earnings?.orderCount);
    const trend = this.toNumber(earnings?.trend);

    const timeRangeMap: Record<string, string> = {
      today: "今天",
      week: "本周",
      month: "本月",
    };
    const timeText = timeRangeMap[timeRange as string] || "今天";

    // P1: 增加对趋势的建议
    let advice = "";
    if (trend < -20) {
      advice = "\n💡 收入下降显著，建议检查服务可用性或适当降价促销";
    } else if (trend > 20) {
      advice = "\n💡 收入增长强劲，可考虑增加资源供给";
    }

    return `💰 ${timeText}收入：$${total.toFixed(2)}

📊 详细：
• 已结算：$${settled.toFixed(2)}
• 待结算：$${pending.toFixed(2)}
• 订单数：${orderCount} 个

📈 趋势：${trend > 0 ? "↑" : "↓"} ${Math.abs(trend).toFixed(1)}%${advice}`;
  }

  /**
   * 处理查询订单
   */
  private async handleQueryOrders(params: any): Promise<string> {
    const actorId = this.resolveActorId(params);
    const response = await this.openclaw.callGatewayMethod<unknown>("market.order.list", {
      status: "active",
      sellerId: actorId,
      limit: 100,
    });
    const orders = this.pickArray<Record<string, unknown>>(response, "orders");

    if (orders.length === 0) {
      return "📋 当前没有活跃订单";
    }

    const orderText = orders
      .map((order, i) => {
        const resourceName =
          typeof order.resourceName === "string"
            ? order.resourceName
            : String(order.resourceId ?? "unknown");
        const buyerId = typeof order.buyerId === "string" ? order.buyerId : "unknown";
        const price = this.toNumber(order.price);
        const unit = typeof order.unit === "string" ? order.unit : "unit";
        return `${i + 1}. ${resourceName} → @${buyerId}\n  💰 $${price}/${unit} | 状态 ${String(order.status ?? "unknown")}`;
      })
      .join("\n\n");

    return `🔥 活跃订单：${orders.length} 个\n\n${orderText}`;
  }

  /**
   * 处理设置自动化
   */
  private async handleSetAutomation(params: any): Promise<string> {
    const { action, minPrice, maxConcurrent } = params;

    if (action !== "auto_accept") {
      return "❌ 未知的自动化类型";
    }

    return [
      "⚠️ 当前 market-core 未注册自动化规则写入能力（market.automation.setRule）。",
      "建议改用外部调度（cron/worker）调用 market.order.list + market.order.cancel/settlement.* 组合实现自动化。",
      minPrice ? `期望最低价格：$${minPrice}` : undefined,
      maxConcurrent ? `期望最大并发：${maxConcurrent}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * 处理取消订单
   */
  private async handleCancelOrders(params: any): Promise<string> {
    const { cancelAll } = params;

    if (!cancelAll) {
      return '请明确指定要取消的订单，或输入"取消所有订单"';
    }

    const actorId = this.resolveActorId(params);
    if (!actorId) {
      return '❌ 缺少 actorId，请在指令里附带，例如："actorId=0x... 取消所有订单"';
    }

    const response = await this.openclaw.callGatewayMethod<unknown>("market.order.list", {
      status: "active",
      buyerId: actorId,
      limit: 100,
    });
    const orders = this.pickArray<Record<string, unknown>>(response, "orders");

    let cancelled = 0;
    for (const order of orders) {
      const orderId = typeof order.orderId === "string" ? order.orderId : undefined;
      if (!orderId) continue;
      await this.openclaw.callGatewayMethod("market.order.cancel", {
        actorId,
        orderId,
      });
      cancelled += 1;
    }

    return `✅ 已取消 ${cancelled} 个订单`;
  }

  // ========== 辅助方法 ==========

  private resolveActorId(params: Record<string, unknown>): string | undefined {
    const raw = params.actorId;
    if (typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private pickArray<T>(payload: unknown, key: string): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (!payload || typeof payload !== "object") return [];
    const value = (payload as Record<string, unknown>)[key];
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private toNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  private inferResourceKind(name: string): "model" | "search" | "storage" | "service" {
    const n = name.toLowerCase();
    if (n.includes("存储") || n.includes("storage")) return "storage";
    if (n.includes("搜索") || n.includes("search")) return "search";
    if (n.includes("api") || n.includes("服务") || n.includes("service")) return "service";
    return "model";
  }

  private defaultUnitByKind(kind: "model" | "search" | "storage" | "service"): string {
    if (kind === "search") return "query";
    if (kind === "storage") return "gb_day";
    return "call";
  }

  private extractCommonParams(message: string): Record<string, unknown> {
    const actorIdMatch = message.match(/actorId\s*[=:]\s*(0x[a-fA-F0-9]{40})/);
    const offerIdMatch = message.match(/offerId\s*[=:]\s*([\w-]+)/);
    const orderIdMatch = message.match(/orderId\s*[=:]\s*([\w-]+)/);

    const out: Record<string, unknown> = {};
    if (actorIdMatch) out.actorId = actorIdMatch[1];
    if (offerIdMatch) out.offerId = offerIdMatch[1];
    if (orderIdMatch) out.orderId = orderIdMatch[1];
    return out;
  }

  private extractSellParams(message: string): any {
    const priceMatch = message.match(/\$?(\d+(\.\d+)?)/);
    const price = priceMatch ? parseFloat(priceMatch[1]) : null;

    // 简化的资源名称提取
    let resourceName = "计算服务";
    if (message.includes("GPU")) resourceName = "GPU 算力";
    if (message.includes("CPU")) resourceName = "CPU 算力";
    if (message.includes("存储")) resourceName = "存储空间";

    return { resourceName, price };
  }

  private extractPriceParams(message: string): any {
    const priceMatch = message.match(/\$?(\d+(\.\d+)?)/);
    const newPrice = priceMatch ? parseFloat(priceMatch[1]) : null;
    return { newPrice };
  }

  private extractTimeParams(message: string): any {
    if (message.includes("今天") || message.includes("今日")) return { timeRange: "today" };
    if (message.includes("本周") || message.includes("这周")) return { timeRange: "week" };
    if (message.includes("本月") || message.includes("这月")) return { timeRange: "month" };
    return { timeRange: "today" };
  }

  private extractAutomationParams(message: string): any {
    const params: any = { action: "auto_accept" };

    const priceMatch = message.match(/不能低于\s*\$?(\d+(\.\d+)?)/);
    if (priceMatch) {
      params.minPrice = parseFloat(priceMatch[1]);
    }

    const concurrentMatch = message.match(/最多\s*(\d+)\s*个/);
    if (concurrentMatch) {
      params.maxConcurrent = parseInt(concurrentMatch[1]);
    }

    return params;
  }

  private extractCancelParams(message: string): any {
    if (message.includes("所有") || message.includes("全部")) {
      return { cancelAll: true };
    }
    return {};
  }

  /**
   * 生成定价建议（L1 确定性反射层 — 简单阈值比较）
   *
   * ⚠️ 架构过渡注释：定价建议属于 Policy 层逻辑。按 "Extension = Mechanism, AI = Policy"
   * 原则，Extension 只应返回市场均价等结构化数据，"该不该降价"的判断应由 AI Agent 做。
   *
   * 升级路径（L2）：Extension 提供 market.stats.price API 返回原始数据，
   * LLM 基于 context（竞争力、独家资源、供需比）自行判断定价策略。
   */
  private generatePricingSuggestion(myPrice: number, marketAvg: number): string {
    if (marketAvg <= 0) return "";
    const diff = ((myPrice - marketAvg) / marketAvg) * 100;

    if (diff > 20) {
      return `💡 建议：您的定价 ($${myPrice}) 比市场均价 ($${marketAvg.toFixed(2)}) 高 ${diff.toFixed(0)}%，可能影响成交率`;
    } else if (diff < -20) {
      return `💡 建议：您的定价 ($${myPrice}) 比市场均价 ($${marketAvg.toFixed(2)}) 低 ${Math.abs(diff).toFixed(0)}%，考虑提高价格增加收入`;
    } else {
      return `💡 定价合理，与市场均价 ($${marketAvg.toFixed(2)}) 接近`;
    }
  }

  private generateHelpMessage(): string {
    return `🤖 我是您的市场管家，可以帮您：

📦 发布服务：
• "帮我把 GPU 卖掉，价格 $10/小时"
• "上架我的存储空间，$5/GB"

💰 调整价格：
• "改成 $15"
• "把 GPU 价格调到 $12"

📊 查询状态：
• "库存还剩多少？"
• "今天赚了多少？"
• "有人买吗？"

⚙️ 自动化：
• "自动接单，但价格不能低于 $8"
• "最多同时 5 个订单"

❌ 取消订单：
• "取消所有订单"

输入您的指令，我会帮您处理！`;
  }
}
