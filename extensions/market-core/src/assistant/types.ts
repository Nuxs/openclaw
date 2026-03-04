// extensions/market-core/src/assistant/types.ts

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
