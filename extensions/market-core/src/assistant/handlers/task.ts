// extensions/market-core/src/assistant/handlers/task.ts
// Task market intent handlers — publish, query, bid, submit, review.

import { pickArray, pickRecord, pickString, toFiniteNumber } from "../paste-safe.js";
import type { MarketAssistantRuntime } from "../types.js";

export async function handlePublishTask(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const title = typeof params.title === "string" ? params.title.trim() : "新任务";
  const budget = toFiniteNumber(params.budget);
  const actorId = typeof params.actorId === "string" ? params.actorId.trim() : undefined;

  if (budget <= 0) {
    return "❌ 请提供有效的任务预算，例如：发布任务「翻译报告」$50";
  }

  const expiryAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const result = await runtime.callGatewayMethod<unknown>("market.task.publish", {
    title,
    summary: title,
    requirements: ["完成交付"],
    budget: { amount: String(Math.max(1, Math.floor(budget))), currency: "USD" },
    expiryAt,
    publisherActorId: actorId,
  });

  const record = pickRecord(result);
  const taskId = pickString(record, "taskId") ?? "unknown";
  const taskHash = pickString(record, "taskHash");

  const lines: string[] = [
    "✅ 任务已发布",
    "",
    `📋 标题：${title}`,
    `💰 预算：$${budget}`,
    `🔑 ID：${taskId}`,
  ];

  if (taskHash) {
    lines.push(`🔒 哈希：${taskHash.slice(0, 18)}…`);
  }

  lines.push("", "等待竞标中…");

  return lines.join("\n");
}

export async function handleQueryTasks(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const result = await runtime.callGatewayMethod<unknown>("market.task.list", {
    limit: 20,
  });
  const data = pickRecord(result);
  const tasks = pickArray<Record<string, unknown>>(data, "tasks");
  const total = toFiniteNumber(data.count);

  if (tasks.length === 0) {
    return '📋 当前没有任务\n\n输入"发布任务「标题」$预算"来创建';
  }

  const byStatus: Record<string, number> = {};
  for (const t of tasks) {
    const s = pickString(t, "status") ?? "unknown";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  const lines: string[] = [];
  lines.push(`📋 任务列表（${total || tasks.length} 项）`);

  const statusParts = Object.entries(byStatus)
    .map(([k, v]) => `${k.replace("task_", "")}: ${v}`)
    .join(" | ");
  lines.push(`  ${statusParts}`);
  lines.push("");

  for (const t of tasks.slice(0, 10)) {
    const title = pickString(t, "title") ?? "无标题";
    const status = pickString(t, "status") ?? "unknown";
    const taskId = pickString(t, "taskId") ?? "";
    const budgetObj = pickRecord(t.budget);
    const budgetAmount = pickString(budgetObj, "amount");
    const budgetCurrency = pickString(budgetObj, "currency") ?? "USD";
    const budgetText = budgetAmount ? ` $${budgetAmount} ${budgetCurrency}` : "";

    lines.push(`• ${title} [${status.replace("task_", "")}]${budgetText} (${taskId.slice(0, 8)}…)`);
  }

  return lines.join("\n");
}

export async function handlePlaceBid(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const taskId = typeof params.taskId === "string" ? params.taskId.trim() : undefined;
  const bidAmount = toFiniteNumber(params.bidAmount);

  if (!taskId) {
    return "❌ 请提供任务 ID，例如：投标 taskId=xxx $30";
  }
  if (bidAmount <= 0) {
    return "❌ 请提供有效的竞标金额";
  }

  const result = await runtime.callGatewayMethod<unknown>("market.task.bid.place", {
    taskId,
    price: String(Math.max(1, Math.floor(bidAmount))),
    currency: "USD",
  });

  const record = pickRecord(result);
  const bidId = pickString(record, "bidId") ?? "unknown";
  const bidHash = pickString(record, "bidHash");

  const lines: string[] = [
    "✅ 竞标已提交",
    "",
    `📋 任务：${taskId.slice(0, 8)}…`,
    `💰 报价：$${bidAmount}`,
    `🔑 投标 ID：${bidId}`,
  ];

  if (bidHash) {
    lines.push(`🔒 哈希：${bidHash.slice(0, 18)}…`);
  }

  return lines.join("\n");
}

export async function handleSubmitResult(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const taskId = typeof params.taskId === "string" ? params.taskId.trim() : undefined;
  const orderId = typeof params.orderId === "string" ? params.orderId.trim() : undefined;

  if (!taskId && !orderId) {
    return "❌ 请提供 taskId 或 orderId，例如：提交成果 taskId=xxx";
  }

  const result = await runtime.callGatewayMethod<unknown>("market.task.result.submit", {
    taskId,
    orderId,
    summary: "交付成果",
    artifacts: ["delivery"],
  });

  const record = pickRecord(result);
  const resultId = pickString(record, "resultId") ?? "unknown";
  const resultHash = pickString(record, "resultHash");

  const lines: string[] = ["✅ 成果已提交，等待验收", "", `🔑 结果 ID：${resultId}`];

  if (resultHash) {
    lines.push(`🔒 哈希：${resultHash.slice(0, 18)}…`);
  }

  return lines.join("\n");
}

export async function handleReviewResult(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const resultId = typeof params.resultId === "string" ? params.resultId.trim() : undefined;
  const decision = typeof params.decision === "string" ? params.decision.trim() : "accept";

  if (!resultId) {
    return "❌ 请提供结果 ID，例如：验收 resultId=xxx";
  }

  const note = typeof params.note === "string" ? params.note.trim() : undefined;

  const result = await runtime.callGatewayMethod<unknown>("market.task.result.review", {
    resultId,
    decision,
    note,
  });

  const record = pickRecord(result);
  const receiptId = pickString(record, "receiptId");
  const disputeId = pickString(record, "disputeId");
  const receiptStatus = pickString(record, "receiptStatus");

  if (decision === "reject") {
    const lines: string[] = ["⚠️ 成果已拒绝", "", `🔑 结果 ID：${resultId}`];

    if (disputeId) {
      lines.push(`⚖️ 争议已开启：${disputeId.slice(0, 8)}…`);
    }

    return lines.join("\n");
  }

  const lines: string[] = ["✅ 验收完成", "", `🔑 结果 ID：${resultId}`, "✓ 状态：已通过"];

  if (receiptId) {
    lines.push(`🧾 回执：${receiptId.slice(0, 8)}… [${receiptStatus ?? "settled"}]`);
  }

  return lines.join("\n");
}
