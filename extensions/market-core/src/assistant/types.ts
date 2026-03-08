// extensions/market-core/src/assistant/types.ts

export type MarketAssistantRuntime = {
  callGatewayMethod: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
};

/**
 * 用户意图类型
 *
 * 覆盖基础市场、任务市场、隐私合规、运营诊断四条主线。
 */
export enum IntentType {
  // ── 基础市场 ──
  SELL_RESOURCE = "sell_resource",
  UPDATE_PRICE = "update_price",
  QUERY_INVENTORY = "query_inventory",
  QUERY_EARNINGS = "query_earnings",
  QUERY_ORDERS = "query_orders",
  SET_AUTOMATION = "set_automation",
  CANCEL_ORDERS = "cancel_orders",
  DIAGNOSE = "diagnose",

  // ── 任务市场 ──
  PUBLISH_TASK = "publish_task",
  QUERY_TASKS = "query_tasks",
  PLACE_BID = "place_bid",
  SUBMIT_RESULT = "submit_result",
  REVIEW_RESULT = "review_result",

  // ── 隐私合规 ──
  QUERY_CONSENTS = "query_consents",
  GENERATE_REPLAY = "generate_replay",
  ERASE_DATA = "erase_data",

  // ── 运营 ──
  QUERY_OPS_STATUS = "query_ops_status",
  QUERY_ALERTS = "query_alerts",

  UNKNOWN = "unknown",
}

/**
 * 解析后的用户意图
 */
export interface ParsedIntent {
  type: IntentType;
  params: Record<string, unknown>;
  confidence: number;
}
