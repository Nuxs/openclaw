// extensions/market-core/src/assistant/handlers/privacy.ts
// Privacy & consent intent handlers — query consents, generate replay, erase data.

import { pickArray, pickRecord, pickString, toFiniteNumber } from "../paste-safe.js";
import type { MarketAssistantRuntime } from "../types.js";

export async function handleQueryConsents(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const result = await runtime.callGatewayMethod<unknown>("market.consent.list", {
    limit: 20,
  });
  const data = pickRecord(result);
  const consents = pickArray<Record<string, unknown>>(data, "consents");

  if (consents.length === 0) {
    return "🔒 当前没有授权记录";
  }

  const active = consents.filter((c) => pickString(c, "status") === "consent_granted");
  const revoked = consents.filter((c) => pickString(c, "status") === "consent_revoked");
  const erased = consents.filter((c) => pickString(c, "erasedAt"));

  const lines: string[] = [];
  lines.push(`🔒 授权记录（共 ${consents.length} 项）`);
  lines.push(
    `  ✅ 有效：${active.length}  ❌ 已撤销：${revoked.length}  🗑️ 已擦除：${erased.length}`,
  );
  lines.push("");

  for (const c of consents.slice(0, 8)) {
    const scope = pickRecord(c.scope);
    const purpose = pickString(scope, "purpose") ?? pickString(c, "purpose") ?? "unknown";
    const status = pickString(c, "status") ?? "unknown";
    const consentId = pickString(c, "consentId") ?? "";
    const orderId = pickString(c, "orderId") ?? "";
    const erasedAt = pickString(c, "erasedAt");

    let line = `• ${purpose} [${status.replace("consent_", "")}]`;
    if (erasedAt) {
      line += " 🗑️";
    }
    line += ` (${consentId.slice(0, 8)}…)`;
    if (orderId) {
      line += ` → order:${orderId.slice(0, 8)}…`;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

export async function handleGenerateReplay(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const consentId = typeof params.consentId === "string" ? params.consentId.trim() : undefined;
  const orderId = typeof params.orderId === "string" ? params.orderId.trim() : undefined;

  if (!consentId && !orderId) {
    return "❌ 请提供 consentId 或 orderId，例如：回放 consentId=xxx";
  }

  const result = await runtime.callGatewayMethod<unknown>("market.privacy.replay.generate", {
    consentId,
    orderId,
  });

  const record = pickRecord(result);
  const replayId = pickString(record, "replayId") ?? "unknown";
  const status = pickString(record, "status") ?? "replay_generated";
  const replayHash = pickString(record, "replayHash");

  const lines: string[] = [
    "✅ 合规回放已生成",
    "",
    `🔑 回放 ID：${replayId}`,
    `📊 状态：${status}`,
  ];

  if (replayHash) {
    lines.push(`🔒 哈希：${replayHash.slice(0, 18)}…`);
  }

  lines.push("", "回放内容已脱敏，可安全分享。");

  return lines.join("\n");
}

export async function handleEraseData(
  runtime: MarketAssistantRuntime,
  params: Record<string, unknown>,
): Promise<string> {
  const consentId = typeof params.consentId === "string" ? params.consentId.trim() : undefined;

  if (!consentId) {
    return "❌ 请提供已撤销的 consentId，例如：删除数据 consentId=xxx";
  }

  const result = await runtime.callGatewayMethod<unknown>("market.privacy.erase", {
    consentId,
  });

  const record = pickRecord(result);
  const erased = toFiniteNumber(record.replayCount);
  const erasedAt = pickString(record, "erasedAt");

  const lines: string[] = [
    "✅ 数据删除已执行",
    "",
    `🔑 授权 ID：${consentId.slice(0, 8)}…`,
    `🗑️ 已擦除回放：${erased} 条`,
  ];

  if (erasedAt) {
    lines.push(`📅 擦除时间：${erasedAt}`);
  }

  lines.push("", "仅删除已撤销授权范围内的数据，保留策略内数据不受影响。");

  return lines.join("\n");
}
