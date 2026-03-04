// extensions/market-core/src/assistant/paste-safe.ts

import { ErrorCode } from "../errors/codes.js";
import { formatGatewayError } from "../market/handlers/_shared.js";

const SHORT_ERROR_MESSAGE: Record<ErrorCode, string> = {
  [ErrorCode.E_INVALID_ARGUMENT]: "输入参数不合法，请检查后重试。",
  [ErrorCode.E_AUTH_REQUIRED]: "需要身份信息（例如 actorId）。",
  [ErrorCode.E_FORBIDDEN]: "无权限执行该操作。",
  [ErrorCode.E_NOT_FOUND]: "未找到目标资源或记录。",
  [ErrorCode.E_CONFLICT]: "当前状态冲突，操作无法完成。",
  [ErrorCode.E_QUOTA_EXCEEDED]: "触发限额或频率限制，请稍后重试。",
  [ErrorCode.E_EXPIRED]: "目标已过期。",
  [ErrorCode.E_REVOKED]: "目标已撤销。",
  [ErrorCode.E_INTERNAL]: "内部错误，请稍后重试。",
  [ErrorCode.E_UNAVAILABLE]: "服务暂不可用，请稍后重试。",
  [ErrorCode.E_TIMEOUT]: "请求超时，请稍后重试。",
};

export function formatAssistantFailure(err: unknown): string {
  const code = formatGatewayError(err, ErrorCode.E_INTERNAL);
  const msg = SHORT_ERROR_MESSAGE[code] ?? SHORT_ERROR_MESSAGE[ErrorCode.E_INTERNAL];
  return `❌ 操作失败（${code}）\n${msg}`;
}

export function truncateHexAddress(value: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatMaybeAddress(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  return truncateHexAddress(value);
}

export function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function pickArray<T>(payload: unknown, key: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export function pickRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

export function pickString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
