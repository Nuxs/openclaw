// extensions/market-core/src/assistant/handlers/diagnose.ts

import { ErrorCode } from "../../errors/codes.js";
import { formatGatewayError } from "../../market/handlers/_shared.js";
import { formatMaybeAddress, pickRecord, pickString } from "../paste-safe.js";
import type { MarketAssistantRuntime } from "../types.js";

type SafeCallResult = { ok: true; result: unknown } | { ok: false; code: ErrorCode };

async function safeCall(
  runtime: MarketAssistantRuntime,
  method: string,
  params: Record<string, unknown>,
): Promise<SafeCallResult> {
  try {
    const result = await runtime.callGatewayMethod<unknown>(method, params);
    return { ok: true, result };
  } catch (err) {
    const code = formatGatewayError(err, ErrorCode.E_INTERNAL);
    return { ok: false, code };
  }
}

function pickNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sumRecordValues(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;

  let sum = 0;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      sum += entry;
    }
  }
  return sum;
}

export async function handleDiagnose(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const actorId = typeof params.actorId === "string" ? params.actorId.trim() : undefined;

  const [status, metrics, reputation] = await Promise.all([
    safeCall(runtime, "market.status.summary", {}),
    safeCall(runtime, "market.metrics.snapshot", {}),
    actorId ? safeCall(runtime, "market.reputation.summary", { providerActorId: actorId }) : null,
  ]);

  const parts: string[] = ["🏥 **系统诊断报告**"];

  // 1) Market status summary
  if (!status.ok) {
    parts.push(`⚠️ 市场状态不可用（${status.code}）`);
  } else {
    const record = pickRecord(status.result);
    const totals = pickRecord(record.totals);
    const disputes = pickRecord(record.disputes);
    const revocations = pickRecord(record.revocations);
    const repair = pickRecord(record.repair);

    const totalOffers = pickNumber(totals, "offers") ?? 0;
    const totalOrders = pickNumber(totals, "orders") ?? 0;
    const totalSettlements = pickNumber(totals, "settlements") ?? 0;
    const totalDeliveries = pickNumber(totals, "deliveries") ?? 0;

    const openDisputes = pickNumber(disputes, "open") ?? 0;
    const pendingRevocations = pickNumber(revocations, "pending") ?? 0;
    const failedRevocations = pickNumber(revocations, "failed") ?? 0;

    const repairCandidates = pickNumber(repair, "candidates") ?? 0;
    const orphaned = pickNumber(repair, "orphaned") ?? 0;

    parts.push(
      [
        `📊 市场概览：offers ${totalOffers} | orders ${totalOrders} | deliveries ${totalDeliveries} | settlements ${totalSettlements}`,
        `🧯 风险：争议 open ${openDisputes} | 撤销 pending ${pendingRevocations} / failed ${failedRevocations}`,
        `🛠️ 修复候选：${repairCandidates}（orphaned ${orphaned}）`,
      ].join("\n"),
    );
  }

  // 2) Metrics snapshot (alerts)
  if (!metrics.ok) {
    parts.push(`⚠️ 指标快照不可用（${metrics.code}）`);
  } else {
    const record = pickRecord(metrics.result);
    const alerts = Array.isArray(record.alerts) ? (record.alerts as unknown[]) : [];

    let p0 = 0;
    let p1 = 0;
    for (const entry of alerts) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (e.triggered !== true) continue;
      if (e.severity === "p0") p0++;
      if (e.severity === "p1") p1++;
    }

    const orders = pickRecord(record.orders);
    const settlements = pickRecord(record.settlements);
    const disputes = pickRecord(record.disputes);
    const revocations = pickRecord(record.revocations);

    const activeOrders = sumRecordValues(orders.byStatus);
    const failureRate = pickNumber(settlements, "failureRate");
    const openDisputes = pickNumber(disputes, "open");
    const revocationFailed = pickNumber(revocations, "failed");

    parts.push(
      [
        `🚨 告警：P0 ${p0} | P1 ${p1}`,
        `📈 指标：activeOrders ~${activeOrders}`,
        failureRate !== undefined
          ? `• settlementFailureRate ${(failureRate * 100).toFixed(2)}%`
          : undefined,
        openDisputes !== undefined ? `• disputesOpen ${openDisputes}` : undefined,
        revocationFailed !== undefined ? `• revocationFailed ${revocationFailed}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  // 3) Reputation (optional)
  if (reputation === null) {
    parts.push("💡 提示：提供 `actorId` 可查看个人信誉评分");
  } else if (!reputation.ok) {
    parts.push(`⚠️ 信誉查询失败（${reputation.code}）`);
  } else {
    const record = pickRecord(reputation.result);
    const score = pickNumber(record, "score");
    const disputes = pickNumber(record, "disputes");
    const providerActorId = pickString(record, "providerActorId") ?? actorId;
    parts.push(
      `⭐ 信誉：${score ?? "N/A"}（争议 ${disputes ?? 0}） @${formatMaybeAddress(providerActorId)}`,
    );
  }

  return parts.join("\n\n");
}
