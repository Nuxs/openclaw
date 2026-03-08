// extensions/market-core/src/assistant/intent.ts

import { IntentType, type ParsedIntent } from "./types.js";

/**
 * 解析用户意图（L1 确定性反射层 — 关键词匹配）
 *
 * ⚠️ 架构过渡注释：此逻辑属于 Policy 层，按 "Extension = Mechanism, AI = Policy" 原则
 *（见 skills/web3-market/SKILL.md），它不应长期存在于 Extension 中。
 */
export async function parseIntent(message: string): Promise<ParsedIntent> {
  const msg = message.toLowerCase();
  const commonParams = extractCommonParams(message);

  // 发布资源
  if (msg.includes("卖") || msg.includes("发布") || msg.includes("上架")) {
    return {
      type: IntentType.SELL_RESOURCE,
      params: { ...commonParams, ...extractSellParams(message) },
      confidence: 0.9,
    };
  }

  // 调整价格
  if (msg.includes("改价") || msg.includes("调价") || msg.includes("改成")) {
    return {
      type: IntentType.UPDATE_PRICE,
      params: { ...commonParams, ...extractPriceParams(message) },
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
      params: { ...commonParams, ...extractTimeParams(message) },
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
      params: { ...commonParams, ...extractAutomationParams(message) },
      confidence: 0.8,
    };
  }

  // 取消订单
  if (msg.includes("取消") || msg.includes("停止")) {
    return {
      type: IntentType.CANCEL_ORDERS,
      params: { ...commonParams, ...extractCancelParams(message) },
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

  // ── 任务市场 ──

  if (msg.includes("发任务") || msg.includes("发布任务") || msg.includes("publish task")) {
    return {
      type: IntentType.PUBLISH_TASK,
      params: { ...commonParams, ...extractTaskParams(message) },
      confidence: 0.9,
    };
  }

  if (msg.includes("任务列表") || msg.includes("查看任务") || msg.includes("我的任务")) {
    return {
      type: IntentType.QUERY_TASKS,
      params: commonParams,
      confidence: 0.9,
    };
  }

  if (msg.includes("投标") || msg.includes("竞标") || msg.includes("bid")) {
    return {
      type: IntentType.PLACE_BID,
      params: { ...commonParams, ...extractBidParams(message) },
      confidence: 0.85,
    };
  }

  if (msg.includes("提交成果") || msg.includes("交付") || msg.includes("submit result")) {
    return {
      type: IntentType.SUBMIT_RESULT,
      params: commonParams,
      confidence: 0.85,
    };
  }

  if (msg.includes("验收") || msg.includes("审查") || msg.includes("review result")) {
    return {
      type: IntentType.REVIEW_RESULT,
      params: commonParams,
      confidence: 0.85,
    };
  }

  // ── 隐私合规 ──

  if (msg.includes("授权") || msg.includes("consent") || msg.includes("隐私授权")) {
    return {
      type: IntentType.QUERY_CONSENTS,
      params: commonParams,
      confidence: 0.85,
    };
  }

  if (msg.includes("回放") || msg.includes("replay") || msg.includes("合规回放")) {
    return {
      type: IntentType.GENERATE_REPLAY,
      params: commonParams,
      confidence: 0.85,
    };
  }

  if (msg.includes("删除数据") || msg.includes("擦除") || msg.includes("erase")) {
    return {
      type: IntentType.ERASE_DATA,
      params: commonParams,
      confidence: 0.85,
    };
  }

  // ── 运营 ──

  if (msg.includes("运营") || msg.includes("ops") || msg.includes("运行状态")) {
    return {
      type: IntentType.QUERY_OPS_STATUS,
      params: commonParams,
      confidence: 0.85,
    };
  }

  if (msg.includes("告警") || msg.includes("alert") || msg.includes("报警")) {
    return {
      type: IntentType.QUERY_ALERTS,
      params: commonParams,
      confidence: 0.85,
    };
  }

  return {
    type: IntentType.UNKNOWN,
    params: commonParams,
    confidence: 0.0,
  };
}

function extractTaskParams(message: string): Record<string, unknown> {
  const budgetMatch = message.match(/\$?(\d+(?:\.\d+)?)/);
  const budget = budgetMatch ? Number(budgetMatch[1]) : undefined;
  const titleMatch = message.match(/[""「](.+?)[""」]/);
  const title = titleMatch ? titleMatch[1] : undefined;
  return { budget, title };
}

function extractBidParams(message: string): Record<string, unknown> {
  const taskIdMatch = message.match(/taskId\s*[=:]\s*([\w-]+)/);
  const priceMatch = message.match(/\$?(\d+(?:\.\d+)?)/);
  return {
    taskId: taskIdMatch ? taskIdMatch[1] : undefined,
    bidAmount: priceMatch ? Number(priceMatch[1]) : undefined,
  };
}

function extractCommonParams(message: string): Record<string, unknown> {
  const actorIdMatch = message.match(/actorId\s*[=:]\s*(0x[a-fA-F0-9]{40})/);
  const offerIdMatch = message.match(/offerId\s*[=:]\s*([\w-]+)/);
  const orderIdMatch = message.match(/orderId\s*[=:]\s*([\w-]+)/);

  const out: Record<string, unknown> = {};
  if (actorIdMatch) out.actorId = actorIdMatch[1];
  if (offerIdMatch) out.offerId = offerIdMatch[1];
  if (orderIdMatch) out.orderId = orderIdMatch[1];
  return out;
}

function extractSellParams(message: string): { resourceName: string; price?: number } {
  const priceMatch = message.match(/\$?(\d+(?:\.\d+)?)/);
  const price = priceMatch ? Number(priceMatch[1]) : undefined;

  // 简化的资源名称提取
  let resourceName = "计算服务";
  if (message.includes("GPU")) resourceName = "GPU 算力";
  if (message.includes("CPU")) resourceName = "CPU 算力";
  if (message.includes("存储")) resourceName = "存储空间";

  return { resourceName, price };
}

function extractPriceParams(message: string): { newPrice?: number } {
  const priceMatch = message.match(/\$?(\d+(?:\.\d+)?)/);
  const newPrice = priceMatch ? Number(priceMatch[1]) : undefined;
  return { newPrice };
}

function extractTimeParams(message: string): { timeRange: "today" | "week" | "month" } {
  if (message.includes("今天") || message.includes("今日")) return { timeRange: "today" };
  if (message.includes("本周") || message.includes("这周")) return { timeRange: "week" };
  if (message.includes("本月") || message.includes("这月")) return { timeRange: "month" };
  return { timeRange: "today" };
}

function extractAutomationParams(message: string): Record<string, unknown> {
  const params: Record<string, unknown> = { action: "auto_accept" };

  const priceMatch = message.match(/不能低于\s*\$?(\d+(?:\.\d+)?)/);
  if (priceMatch) {
    params.minPrice = Number(priceMatch[1]);
  }

  const concurrentMatch = message.match(/最多\s*(\d+)\s*个/);
  if (concurrentMatch) {
    params.maxConcurrent = Number(concurrentMatch[1]);
  }

  return params;
}

function extractCancelParams(message: string): { cancelAll?: true } {
  if (message.includes("所有") || message.includes("全部")) {
    return { cancelAll: true };
  }
  return {};
}
