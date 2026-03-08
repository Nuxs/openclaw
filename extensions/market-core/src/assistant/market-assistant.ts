// extensions/market-core/src/assistant/market-assistant.ts
// AI 管家：处理用户自然语言指令，能力感知编排市场 / 任务 / 隐私 / 运营 API

import { handleCancelOrders, handleSetAutomation } from "./handlers/automation.js";
import { handleDiagnose } from "./handlers/diagnose.js";
import { handleQueryAlerts, handleQueryOpsStatus } from "./handlers/ops.js";
import { handleEraseData, handleGenerateReplay, handleQueryConsents } from "./handlers/privacy.js";
import { handleQueryEarnings, handleQueryInventory, handleQueryOrders } from "./handlers/query.js";
import { handleSellResource } from "./handlers/sell-resource.js";
import {
  handlePlaceBid,
  handlePublishTask,
  handleQueryTasks,
  handleReviewResult,
  handleSubmitResult,
} from "./handlers/task.js";
import { handleUpdatePrice } from "./handlers/update-price.js";
import { generateHelpMessage } from "./help.js";
import { parseIntent } from "./intent.js";
import { formatAssistantFailure } from "./paste-safe.js";
import { IntentType, type MarketAssistantRuntime } from "./types.js";

/**
 * 市场 AI 管家（能力感知编排）
 *
 * 覆盖四条主线：基础市场、任务市场、隐私合规、运营诊断。
 * 只调用已注册契约，不越权、不承接财务权威。
 */
export class MarketAssistant {
  private openclaw: MarketAssistantRuntime;

  constructor(openclaw: MarketAssistantRuntime) {
    this.openclaw = openclaw;
  }

  async handleUserMessage(message: string): Promise<string> {
    try {
      const intent = await parseIntent(message);

      if (intent.confidence < 0.5) {
        return generateHelpMessage();
      }

      switch (intent.type) {
        // ── 基础市场 ──
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

        // ── 任务市场 ──
        case IntentType.PUBLISH_TASK:
          return await handlePublishTask(this.openclaw, intent.params);
        case IntentType.QUERY_TASKS:
          return await handleQueryTasks(this.openclaw, intent.params);
        case IntentType.PLACE_BID:
          return await handlePlaceBid(this.openclaw, intent.params);
        case IntentType.SUBMIT_RESULT:
          return await handleSubmitResult(this.openclaw, intent.params);
        case IntentType.REVIEW_RESULT:
          return await handleReviewResult(this.openclaw, intent.params);

        // ── 隐私合规 ──
        case IntentType.QUERY_CONSENTS:
          return await handleQueryConsents(this.openclaw, intent.params);
        case IntentType.GENERATE_REPLAY:
          return await handleGenerateReplay(this.openclaw, intent.params);
        case IntentType.ERASE_DATA:
          return await handleEraseData(this.openclaw, intent.params);

        // ── 运营 ──
        case IntentType.QUERY_OPS_STATUS:
          return await handleQueryOpsStatus(this.openclaw, intent.params);
        case IntentType.QUERY_ALERTS:
          return await handleQueryAlerts(this.openclaw, intent.params);

        default:
          return generateHelpMessage();
      }
    } catch (error: unknown) {
      return formatAssistantFailure(error);
    }
  }
}
