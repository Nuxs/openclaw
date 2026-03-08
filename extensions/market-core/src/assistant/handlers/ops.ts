// extensions/market-core/src/assistant/handlers/ops.ts
// Operations intent handlers — status overview, alerts query.

import { pickArray, pickRecord, pickString, toFiniteNumber } from "../paste-safe.js";
import type { MarketAssistantRuntime } from "../types.js";

export async function handleQueryOpsStatus(
  runtime: MarketAssistantRuntime,
  _params: Record<string, unknown>,
): Promise<string> {
  const [statusResult, taskResult, consentResult] = await Promise.all([
    runtime.callGatewayMethod<unknown>("market.status.summary", {}),
    runtime.callGatewayMethod<unknown>("market.task.list", { limit: 200 }).catch(() => null),
    runtime.callGatewayMethod<unknown>("market.consent.list", { limit: 200 }).catch(() => null),
  ]);

  const record = pickRecord(statusResult);

  const lines: string[] = [];
  lines.push("📊 运营状态总览\n");

  const resources = pickRecord(record.resources as Record<string, unknown> | undefined);
  const disputes = pickRecord(record.disputes as Record<string, unknown> | undefined);
  const settlement = pickRecord(record.settlement as Record<string, unknown> | undefined);

  lines.push(
    `📦 资源：${toFiniteNumber(resources.total)} 个（${toFiniteNumber(resources.providers)} 提供商）`,
  );
  lines.push(
    `⚖️ 争议：${toFiniteNumber(disputes.open)} 进行中 / ${toFiniteNumber(disputes.total)} 总计`,
  );
  lines.push(`💰 结算：${toFiniteNumber(settlement.pending)} 待处理`);

  // Task market stats
  if (taskResult) {
    const taskData = pickRecord(taskResult);
    const tasks = pickArray<Record<string, unknown>>(taskData, "tasks");
    const open = tasks.filter((t) => pickString(t, "status") === "task_open").length;
    const awarded = tasks.filter((t) => pickString(t, "status") === "task_awarded").length;
    const closed = tasks.filter((t) => pickString(t, "status") === "task_closed").length;
    lines.push(
      `📋 任务：open ${open} | awarded ${awarded} | closed ${closed} / ${tasks.length} 总计`,
    );
  }

  // Privacy stats
  if (consentResult) {
    const consentData = pickRecord(consentResult);
    const consents = pickArray<Record<string, unknown>>(consentData, "consents");
    const active = consents.filter((c) => pickString(c, "status") === "consent_granted").length;
    const revoked = consents.filter((c) => pickString(c, "status") === "consent_revoked").length;
    lines.push(`🔒 授权：active ${active} | revoked ${revoked} / ${consents.length} 总计`);
  }

  const alertsData = pickRecord(record.alerts as Record<string, unknown> | undefined);
  const activeAlerts = toFiniteNumber(alertsData.active);
  lines.push(`🔔 告警：${activeAlerts} 条活跃`);

  if (activeAlerts > 0) {
    lines.push("\n⚠\uFE0F 有活跃告警，输入「告警」查看详情");
  }

  return lines.join("\n");
}

export async function handleQueryAlerts(
  runtime: MarketAssistantRuntime,
  _params: Record<string, unknown>,
): Promise<string> {
  const result = await runtime.callGatewayMethod<unknown>("market.status.summary", {});
  const record = pickRecord(result);
  const alertsData = pickRecord(record.alerts as Record<string, unknown> | undefined);
  const recent = pickArray<Record<string, unknown>>(alertsData, "recent");

  if (recent.length === 0) {
    return "✅ 当前没有活跃告警";
  }

  const lines: string[] = [];
  lines.push(`🔔 告警列表（${recent.length} 条）\n`);

  for (const alert of recent.slice(0, 10)) {
    const level = pickString(alert, "level") ?? "P2";
    const rule = pickString(alert, "rule") ?? "unknown";
    const message = pickString(alert, "message") ?? "";
    const time = pickString(alert, "timestamp");
    const timeText = time ? ` (${time.slice(11, 19)})` : "";
    lines.push(`[${level}] ${rule}: ${message}${timeText}`);
  }

  return lines.join("\n");
}
