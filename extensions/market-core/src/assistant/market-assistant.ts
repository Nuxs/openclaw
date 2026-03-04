// extensions/market-core/src/assistant/market-assistant.ts
// AI 管家：处理用户自然语言指令，编排市场 API 调用

import { handleCancelOrders, handleSetAutomation } from "./handlers/automation.js";
import { handleDiagnose } from "./handlers/diagnose.js";
import { handleQueryEarnings, handleQueryInventory, handleQueryOrders } from "./handlers/query.js";
import { handleSellResource } from "./handlers/sell-resource.js";
import { handleUpdatePrice } from "./handlers/update-price.js";
import { generateHelpMessage } from "./help.js";
import { parseIntent } from "./intent.js";
import { formatAssistantFailure } from "./paste-safe.js";
import { IntentType, type MarketAssistantRuntime } from "./types.js";

/**
 * 市场 AI 管家
 *
 * 功能：
 * 1. 理解用户自然语言指令
 * 2. 映射到 market.* API 调用
 * 3. 编排多步骤操作
 * 4. 生成可粘贴分享的用户反馈（默认不透传异常详情）
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
   * @returns 友好的文本回复（paste-safe）
   */
  async handleUserMessage(message: string): Promise<string> {
    try {
      // 1. 解析用户意图
      const intent = await parseIntent(message);

      if (intent.confidence < 0.5) {
        return generateHelpMessage();
      }

      // 2. 根据意图执行操作
      switch (intent.type) {
        case IntentType.SELL_RESOURCE:
          return await handleSellResource(this.openclaw, intent.params);
        case IntentType.UPDATE_PRICE:
          return await handleUpdatePrice(this.openclaw, intent.params);
        case IntentType.QUERY_INVENTORY:
          return await handleQueryInventory(this.openclaw, intent.params);
        case IntentType.QUERY_EARNINGS:
          return await handleQueryEarnings(this.openclaw, intent.params);
        case IntentType.QUERY_ORDERS:
          return await handleQueryOrders(this.openclaw, intent.params);
        case IntentType.SET_AUTOMATION:
          return await handleSetAutomation(this.openclaw, intent.params);
        case IntentType.CANCEL_ORDERS:
          return await handleCancelOrders(this.openclaw, intent.params);
        case IntentType.DIAGNOSE:
          return await handleDiagnose(this.openclaw, intent.params);
        default:
          return generateHelpMessage();
      }
    } catch (error: unknown) {
      return formatAssistantFailure(error);
    }
  }
}
