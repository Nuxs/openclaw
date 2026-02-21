// extensions/market-agent/src/market-assistant.ts
// AI 管家：处理用户自然语言指令，编排市场 API 调用

// import { OpenClawRuntime } from "@openclaw/core";

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
  UNKNOWN = "unknown", // 未知意图
}

/**
 * 解析后的用户意图
 */
export interface ParsedIntent {
  type: IntentType;
  params: Record<string, any>;
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
  private openclaw: OpenClawRuntime;

  constructor(openclaw: OpenClawRuntime) {
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
        default:
          return this.generateHelpMessage();
      }
    } catch (error: any) {
      return `❌ 操作失败：${error.message}\n\n请重试或输入"帮助"查看可用指令`;
    }
  }

  /**
   * 解析用户意图（简化版，实际应使用 LLM）
   */
  private async parseIntent(message: string): Promise<ParsedIntent> {
    const msg = message.toLowerCase();

    // 发布资源
    if (msg.includes("卖") || msg.includes("发布") || msg.includes("上架")) {
      return {
        type: IntentType.SELL_RESOURCE,
        params: this.extractSellParams(message),
        confidence: 0.9,
      };
    }

    // 调整价格
    if (msg.includes("改价") || msg.includes("调价") || msg.includes("改成")) {
      return {
        type: IntentType.UPDATE_PRICE,
        params: this.extractPriceParams(message),
        confidence: 0.9,
      };
    }

    // 查询库存
    if (msg.includes("库存") || msg.includes("剩余") || msg.includes("还有多少")) {
      return {
        type: IntentType.QUERY_INVENTORY,
        params: {},
        confidence: 0.9,
      };
    }

    // 查询收入
    if (msg.includes("收入") || msg.includes("赚了") || msg.includes("营收")) {
      return {
        type: IntentType.QUERY_EARNINGS,
        params: this.extractTimeParams(message),
        confidence: 0.9,
      };
    }

    // 查询订单
    if (msg.includes("订单") || msg.includes("有人买") || msg.includes("谁在用")) {
      return {
        type: IntentType.QUERY_ORDERS,
        params: {},
        confidence: 0.9,
      };
    }

    // 设置自动化
    if (msg.includes("自动") || msg.includes("规则") || msg.includes("策略")) {
      return {
        type: IntentType.SET_AUTOMATION,
        params: this.extractAutomationParams(message),
        confidence: 0.8,
      };
    }

    // 取消订单
    if (msg.includes("取消") || msg.includes("停止")) {
      return {
        type: IntentType.CANCEL_ORDERS,
        params: this.extractCancelParams(message),
        confidence: 0.9,
      };
    }

    return {
      type: IntentType.UNKNOWN,
      params: {},
      confidence: 0.0,
    };
  }

  /**
   * 处理发布资源
   */
  private async handleSellResource(params: any): Promise<string> {
    const { resourceName, price } = params;

    if (!resourceName || !price) {
      return '❌ 请提供资源名称和价格，例如：\n"帮我把 GPU 卖掉，价格 $10/小时"';
    }

    // 1. 推断资源类型
    const resourceType = this.inferResourceType(resourceName);

    // 2. 发布资源
    const result = await this.openclaw.callGatewayMethod("market.resource.publish", {
      name: resourceName,
      resourceType,
      basePrice: price,
      pricingModel: {
        strategy: "dynamic",
        constraints: {
          min: price * 0.8,
          max: price * 1.5,
        },
      },
    });

    // 3. 查询市场行情
    const marketStats = await this.openclaw.callGatewayMethod("market.query", {
      type: "marketStats",
      resourceType,
    });

    // 4. 生成建议
    const suggestion = this.generatePricingSuggestion(price, marketStats.avgPrice);

    return `✅ 已发布 ${resourceName} 服务

💰 您的定价：$${price}/小时
📊 市场均价：$${marketStats.avgPrice.toFixed(2)}/小时
📈 智能定价：已开启（范围 $${(price * 0.8).toFixed(2)} - $${(price * 1.5).toFixed(2)}）

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

    // 获取用户的资源列表
    const resources = await this.openclaw.callGatewayMethod("market.resource.list", {
      status: "available",
    });

    if (resources.length === 0) {
      return "❌ 您当前没有在售的服务";
    }

    // 如果只有一个资源，直接调整
    if (resources.length === 1) {
      await this.openclaw.callGatewayMethod("market.pricing.setModel", {
        offerId: resources[0].id,
        basePrice: newPrice,
      });

      return `✅ 已将 ${resources[0].name} 价格调整为 $${newPrice}/小时`;
    }

    // 多个资源，需要用户明确
    const resourceList = resources
      .map((r: any, i: number) => `${i + 1}. ${r.name} (当前 $${r.price}/小时)`)
      .join("\n");

    return `您有多个在售服务：\n${resourceList}\n\n请明确指定，例如：\"把 GPU 改成 $15\"`;
  }

  /**
   * 处理查询库存
   */
  private async handleQueryInventory(params: any): Promise<string> {
    // 1. 获取资源列表
    const resources = await this.openclaw.callGatewayMethod("market.resource.list", {
      status: "available",
    });

    if (resources.length === 0) {
      return '📦 您当前没有在售的资源\n\n输入"帮我卖 GPU，价格 $10"来发布服务';
    }

    // 2. 获取活跃订单
    const orders = await this.openclaw.callGatewayMethod("market.order.list", { status: "active" });

    // 3. 计算每个资源的剩余量
    const inventory = resources.map((resource: any) => {
      const resourceOrders = orders.filter((o: any) => o.resourceId === resource.id);
      const used = resourceOrders.reduce((sum: number, o: any) => sum + o.quantity, 0);
      const remaining = resource.totalCapacity - used;

      return {
        name: resource.name,
        total: resource.totalCapacity,
        used,
        remaining,
        unit: resource.unit,
        utilization: ((used / resource.totalCapacity) * 100).toFixed(1),
      };
    });

    // 4. 生成报告
    const inventoryText = inventory
      .map(
        (item: any) =>
          `• ${item.name}: 剩余 ${item.remaining} ${item.unit} (利用率 ${item.utilization}%)`,
      )
      .join("\n");

    const ordersText = orders
      .map((o) => `• ${o.resourceName} → @${o.buyerId} ($${o.price}/${o.unit})`)
      .join("\n");

    return `📦 当前库存：\n${inventoryText}\n\n🔥 活跃订单：${orders.length} 个\n${ordersText || "暂无订单"}`;
  }

  /**
   * 处理查询收入
   */
  private async handleQueryEarnings(params: any): Promise<string> {
    const { timeRange = "today" } = params;

    const earnings = await this.openclaw.callGatewayMethod("market.settlement.query", {
      timeRange,
    });

    const timeRangeMap: Record<string, string> = {
      today: "今天",
      week: "本周",
      month: "本月",
    };
    const timeText = timeRangeMap[timeRange as string] || "今天";

    return `💰 ${timeText}收入：$${earnings.total.toFixed(2)}

📊 详细：
• 已结算：$${earnings.settled.toFixed(2)}
• 待结算：$${earnings.pending.toFixed(2)}
• 订单数：${earnings.orderCount} 个

📈 趋势：${earnings.trend > 0 ? "↑" : "↓"} ${Math.abs(earnings.trend).toFixed(1)}%`;
  }

  /**
   * 处理查询订单
   */
  private async handleQueryOrders(params: any): Promise<string> {
    const orders = await this.openclaw.callGatewayMethod("market.order.list", { status: "active" });

    if (orders.length === 0) {
      return "📋 当前没有活跃订单";
    }

    const orderText = orders
      .map(
        (o: any, i: number) =>
          `${i + 1}. ${o.resourceName} → @${o.buyerId}
   💰 $${o.price}/${o.unit} | ⏱ 已运行 ${o.duration}h | 预计结束 ${o.estimatedEnd}`,
      )
      .join("\n\n");

    return `🔥 活跃订单：${orders.length} 个\n\n${orderText}`;
  }

  /**
   * 处理设置自动化
   */
  private async handleSetAutomation(params: any): Promise<string> {
    const { action, minPrice, maxConcurrent } = params;

    if (action === "auto_accept") {
      await this.openclaw.callGatewayMethod("market.automation.setRule", {
        trigger: "new_order",
        action: "auto_accept",
        conditions: {
          minPrice,
          maxConcurrent,
        },
      });

      let msg = "✅ 已设置自动接单";
      if (minPrice) msg += `\n• 最低价格：$${minPrice}`;
      if (maxConcurrent) msg += `\n• 最大并发：${maxConcurrent} 个订单`;

      return msg;
    }

    return "❌ 未知的自动化类型";
  }

  /**
   * 处理取消订单
   */
  private async handleCancelOrders(params: any): Promise<string> {
    const { cancelAll } = params;

    if (cancelAll) {
      const result = await this.openclaw.callGatewayMethod("market.order.cancel", {
        cancelAll: true,
      });

      return `✅ 已取消 ${result.count} 个订单`;
    }

    return '请明确指定要取消的订单，或输入"取消所有订单"';
  }

  // ========== 辅助方法 ==========

  private inferResourceType(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("gpu")) return "compute_gpu";
    if (n.includes("cpu")) return "compute_cpu";
    if (n.includes("存储") || n.includes("storage")) return "storage";
    if (n.includes("带宽") || n.includes("bandwidth")) return "bandwidth";
    return "compute_generic";
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

  private generatePricingSuggestion(myPrice: number, marketAvg: number): string {
    const diff = ((myPrice - marketAvg) / marketAvg) * 100;

    if (diff > 20) {
      return "💡 建议：您的定价比市场均价高 20%+，可能影响成交率";
    } else if (diff < -20) {
      return "💡 建议：您的定价比市场均价低 20%+，考虑提高价格增加收入";
    } else {
      return "💡 定价合理，与市场均价接近";
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
